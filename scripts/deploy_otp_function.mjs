// Deploys functions/otp_send.js to the InsForge backend (admin REST).
// Usage: set -a; source ~/.secrets/insforge.env; set +a; node scripts/deploy_otp_function.mjs
import fs from 'node:fs';

const BASE = process.env.INSFORGE_BASE_URL;
const ADMIN = process.env.INSFORGE_ADMIN_KEY;
// Prefer the local copy with real credentials (gitignored); the committed
// functions/otp_send.js is a safe template with empty placeholders.
const _local = new URL('../functions/otp_send.js.local', import.meta.url);
const _tpl = new URL('../functions/otp_send.js', import.meta.url);
const code = fs.readFileSync(fs.existsSync(_local) ? _local : _tpl, 'utf8');

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: 'Bearer ' + ADMIN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: r.status, json, text };
}

const list = await api('GET', '/api/functions');
const fns = list.json?.functions ?? [];
const exists = fns.some((f) => f.slug === 'otp_send');
// remove the temporary env probe if present
if (fns.some((f) => f.slug === 'env_probe')) {
  const d = await api('DELETE', '/api/functions/env_probe');
  console.log('env_probe removed:', d.status);
}
const r = exists
  ? await api('PUT', '/api/functions/otp_send', { code, status: 'active', name: 'OTP send (SMS login)' })
  : await api('POST', '/api/functions', { code, slug: 'otp_send', status: 'active', name: 'OTP send (SMS login)' });
console.log(exists ? 'update' : 'create', ':', r.status, r.status < 300 ? 'OK' : r.text.slice(0, 300));
if (r.status >= 300) process.exit(1);
