// One-off housekeeping: check live users + drop tmp_users_audit + remove orphan profile rows.
// Usage: set -a; source ~/.secrets/insforge.env; set +a; node scripts/db_housekeeping.mjs
const BASE = process.env.INSFORGE_BASE_URL;
const ADMIN = process.env.INSFORGE_ADMIN_KEY;

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: 'Bearer ' + ADMIN,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: r.status, json, text };
}

const { json: users } = await api('GET', '/api/auth/users');
const list = users?.data ?? [];
console.log('live auth users:', list.length);
for (const u of list) console.log('  -', u.email ?? u.user_metadata?.phone ?? '?', '| created', String(u.created_at).slice(0, 10));

const { json: mig } = await api('GET', '/api/database/migrations');
const nums = mig.migrations.map((m) => parseInt(String(m.version), 10)).filter((n) => Number.isFinite(n));
const latest = Math.max(...nums, 0);
const sql = `
DROP TABLE IF EXISTS public.tmp_users_audit;
DELETE FROM public.worker_skills WHERE worker_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.worker_profiles WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.employer_profiles WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users);
`;
const r = await api('POST', '/api/database/migrations', {
  version: String(Math.max(latest + 1, Math.floor(Date.now() / 1000))),
  name: 'housekeeping-orphan-cleanup',
  sql,
});
console.log('cleanup migration:', r.status, r.status === 201 ? 'OK' : r.text);
