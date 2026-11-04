import { chromium } from 'playwright';
const BASE = process.env.APP_URL || 'http://localhost:5173';
const tag = Math.random().toString(36).slice(2, 8);
const digits = String(Date.now()).slice(-8);
const aMobile = '7' + digits + '1';
const wMobile = '9' + digits + '2';
let pass = 0, fail = 0;
const check = (label, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label + ' ' + extra); } };
const alias = (m) => `91${m}@mobile.kaamgaar.app`;
async function api(method, path, body, token) {
  const r = await fetch(`${process.env.INSFORGE_BASE_URL}${path}`, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t };
}
async function applyMigration(sql, name) {
  const { json } = await api('GET', '/api/database/migrations', null, process.env.INSFORGE_ADMIN_KEY);
  const nums = json.migrations.map((m) => parseInt(String(m.version), 10)).filter(Number.isFinite);
  const latest = Math.max(...nums, 0);
  const r = await api('POST', '/api/database/migrations', { version: String(latest + 1), name, sql }, process.env.INSFORGE_ADMIN_KEY);
  if (r.status !== 201) throw new Error('migration: ' + r.text);
}
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
console.log('=== admin role card UI test ===');
// setup: test admin + test worker
await api('POST', '/api/auth/users', { email: alias(aMobile), password: 'test123456', name: 'Role Test Admin' }, process.env.INSFORGE_ANON_KEY);
const sa = await api('POST', '/api/auth/sessions', { email: alias(aMobile), password: 'test123456' }, process.env.INSFORGE_ANON_KEY);
await api('POST', '/api/database/rpc/create_my_profile', { p_role: 'employer', p_name: 'Role Test Admin' }, sa.json.accessToken);
await applyMigration(`UPDATE public.profiles SET role='admin', verification_status='verified' WHERE phone='${aMobile}';`, `role-ui-admin-${tag}`);
await api('POST', '/api/auth/users', { email: alias(wMobile), password: 'test123456', name: 'Role Test Worker' }, process.env.INSFORGE_ANON_KEY);
const sw = await api('POST', '/api/auth/sessions', { email: alias(wMobile), password: 'test123456' }, process.env.INSFORGE_ANON_KEY);
await api('POST', '/api/database/rpc/create_my_profile', { p_role: 'worker', p_name: 'Role Test Worker' }, sw.json.accessToken);
// login as admin
await page.goto(BASE + '/auth/worker');
await page.waitForTimeout(2000);
await page.getByPlaceholder('98765 43210').fill(aMobile);
await page.locator('input[type=password]').first().fill('test123456');
await page.getByRole('button', { name: 'लॉगिन करें' }).click();
await page.waitForURL('**/admin', { timeout: 20000 });
check('admin logged in', page.url().endsWith('/admin'));
await page.goto(BASE + '/admin/users');
await page.waitForTimeout(2500);
check('role card visible', await page.locator('text=🔑 रोल बदलें — एडमिन बनाएं / हटाएं').first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false));
await page.getByPlaceholder('10 अंकों का मोबाइल').fill(wMobile);
await page.locator('select').first().selectOption('admin');
await page.getByRole('button', { name: 'अपडेट करें' }).click();
check('promote success banner', await page.locator('text=Role Test Worker — कामगार से एडमिन बन गए').first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false));
await page.screenshot({ path: 'screenshots/admin-role-promoted.png', fullPage: true });
// demote back
await page.getByPlaceholder('10 अंकों का मोबाइल').fill(wMobile);
await page.locator('select').first().selectOption('worker');
await page.getByRole('button', { name: 'अपडेट करें' }).click();
check('demote success banner', await page.locator('text=Role Test Worker — एडमिन से कामगार बन गए').first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false));
// error case: unknown number
await page.getByPlaceholder('10 अंकों का मोबाइल').fill('9000000000');
await page.getByRole('button', { name: 'अपडेट करें' }).click();
check('unknown number error shown', await page.locator('text=मोबाइल नंबर हमारे रिकॉर्ड में नहीं मिला').first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false));
// cleanup
await applyMigration(`DELETE FROM auth.users WHERE email IN ('${alias(aMobile)}','${alias(wMobile)}');`, `role-ui-cleanup-${tag}`);
console.log('  🧹 test accounts removed');
await browser.close();
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
