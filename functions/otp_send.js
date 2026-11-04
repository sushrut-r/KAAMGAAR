// कामगार — `otp_send` edge function
// Generates a 6-digit login OTP, stores its bcrypt hash in InsForge's
// auth.email_otps table (via the protected otp_store_code RPC), and delivers it
// by SMS through MSG91. While MSG91 credentials are not configured, the code is
// returned to the caller as `dev_code` (no SMS) so the flow can be tested.
//
// Deploy:  node scripts/deploy_otp_function.mjs
//
// NOTE: this environment does not inject custom env vars into edge functions,
// so backend/MSG91 credentials are embedded here. They are admin-key-level
// secrets (only visible through the admin functions API), same trust level as
// the admin API key already used by the deploy tooling.

import bcrypt from 'npm:bcryptjs@3.0.2';

const BASE = 'https://zrv4vvg9.us-east.insforge.app';
const ADMIN_KEY = ''; // ← REAL VALUE: functions/otp_send.js.local (gitignored) se lo — GitHub pe secret kabhi commit mat karo
const OTP_SECRET = ''; // ← REAL VALUE: functions/otp_send.js.local (gitignored) se lo

// ── MSG91 (fill when credentials are provided) ──────────────────────────────
const MSG91_AUTHKEY = '';
const MSG91_SENDER_ID = '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function rpc(name, args) {
  const r = await fetch(`${BASE}/api/database/rpc/${name}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + ADMIN_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (r.status >= 400) {
    const msg = (body && (body.message || body.error)) || text.slice(0, 200);
    const e = new Error(msg);
    e.status = r.status;
    e.body = body;
    throw e;
  }
  return body;
}

export default async function (req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  let mobile;
  try {
    mobile = String((await req.json()).mobile ?? '').replace(/\D/g, '');
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  if (mobile.length !== 10) return json({ error: 'गलत मोबाइल नंबर' }, 400);

  let user;
  try {
    user = await rpc('otp_lookup_user', { p_mobile: mobile });
  } catch {
    return json({ error: 'server error' }, 502);
  }
  if (!user || !user.exists) return json({ error: 'यह नंबर पंजीकृत नहीं है' }, 404);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  let hash;
  try {
    hash = await bcrypt.hash(code, 10);
  } catch {
    return json({ error: 'server error' }, 500);
  }

  try {
    await rpc('otp_store_code', { p_email: user.email, p_hash: hash, p_secret: OTP_SECRET });
  } catch (e) {
    const msg = e.message || 'server error';
    return json({ error: msg }, e.status >= 400 && e.status < 500 ? 429 : 502);
  }

  if (!MSG91_AUTHKEY) {
    // dev mode — no SMS provider configured yet
    return json({ sent: false, dev_code: code, email: user.email });
  }

  const message = `Kamaagar login OTP: ${code}. Sirf 5 minute valid hai. Ise kisiko mat batayein.`;
  const s = await fetch('https://control.msg91.com/api/v5/message/text', {
    method: 'POST',
    headers: { 'control-panel': MSG91_AUTHKEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: MSG91_SENDER_ID, message, contact: ['+91' + mobile] }),
  });
  const sb = await s.json().catch(() => ({}));
  if (s.status !== 200 || sb.type !== 'Success') {
    return json({ error: 'SMS भेजने में दिक्कत आई, दोबारा कोशिश करें' }, 502);
  }
  return json({ sent: true, email: user.email });
}
