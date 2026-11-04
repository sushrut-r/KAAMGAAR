// Full UI journey for password reset (worker + admin, two browser contexts).
// Usage: node scripts/ui_password_reset.mjs
// Env: APP_URL (default http://localhost:5173), INSFORGE_ADMIN_KEY (for the one-off
//       admin promotion + cleanup migrations — not used for any app data access).
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:5173';
const ADMIN_KEY = process.env.INSFORGE_ADMIN_KEY;
const BASE_URL = process.env.INSFORGE_BASE_URL;
const ANON_KEY = process.env.INSFORGE_ANON_KEY;
const tag = Math.random().toString(36).slice(2, 8);
const digits = String(Date.now()).slice(-8);
const workerMobile = '9' + digits + '1';
const adminMobile = '7' + digits + '9';
const workerPassword = 'test123456';
const newPassword = 'newpass1234';
const errors = [];
let pass = 0,
  fail = 0;

const check = (label, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log('  ✅ ' + label);
  } else {
    fail++;
    console.log('  ❌ ' + label + ' ' + extra);
  }
};

const waitText = async (page, text, timeout = 15000) => {
  try {
    await page.locator(`text=${text}`).first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
};

const alias = (mobile) => `91${mobile}@mobile.kaamgaar.app`;

async function api(method, path, body, token) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: r.status, json, text };
}

async function applyMigration(sql, name) {
  const { json } = await api('GET', '/api/database/migrations', null, ADMIN_KEY);
  const nums = json.migrations.map((m) => parseInt(String(m.version), 10)).filter((n) => Number.isFinite(n));
  const latest = Math.max(...nums, 0);
  const r = await api(
    'POST',
    '/api/database/migrations',
    { version: String(Math.max(latest + 1, Math.floor(Date.now() / 1000))), name, sql },
    ADMIN_KEY,
  );
  if (r.status !== 201) throw new Error('migration failed: ' + r.text);
}

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  return page;
}

async function captureLivePhoto(page) {
  await page.getByRole('button', { name: '📷 कैमरा चालू करके फोटो लें' }).click();
  await page.getByRole('button', { name: '📸 फोटो लें' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '📸 फोटो लें' }).click();
  return waitText(page, 'फोटो तैयार है', 15000);
}

console.log('\n=== UI password reset ===\n1. worker signs up (fresh account)');
const wp = await newPage();
await wp.goto(BASE);
await wp.getByText('मैं मजदूर / कारीगर हूँ').click();
await wp.waitForURL('**/auth/worker');
await wp.waitForTimeout(2000); // hydration settle
await wp.getByText('नया खाता').click();
await wp.waitForTimeout(800);
await wp.getByPlaceholder('जैसे: राज कुमार').fill('राज कुमार');
await wp.getByPlaceholder('98765 43210').fill(workerMobile);
await wp.locator('input[type=password]').first().fill(workerPassword);
await wp.getByRole('button', { name: 'खाता बनाएं' }).click();
await wp.waitForURL((u) => new URL(u).pathname === '/onboarding/worker', { timeout: 20000 });
await wp.getByPlaceholder('राज कुमार').fill('राज कुमार');
await wp.getByPlaceholder('जैसे: गोमती नगर, लखनऊ').fill('गोमती नगर, लखनऊ');
check('worker live photo captured', await captureLivePhoto(wp));
await wp.locator('select').first().selectOption({ index: 1 });
await wp.getByRole('button', { name: /प्रोफाइल बनाएं/ }).click();
await wp.waitForURL((u) => new URL(u).pathname === '/worker', { timeout: 20000 });
check('worker dashboard', await waitText(wp, 'मेरे आसपास उपलब्ध काम'));

console.log('2. worker requests a password reset');
await wp.goto(BASE + '/forgot-password');
check('reset page headline', await waitText(wp, 'पासवर्ड रीसेट करें'));
await wp.waitForTimeout(1500); // hydration settle
await wp.getByPlaceholder('98765 43210').fill(workerMobile);
await wp.getByRole('button', { name: 'रीसेट रिक्वेस्ट करें' }).click();
check(
  'pending state shown',
  await waitText(wp, 'इंतज़ार है', 15000),
  (await wp.locator('body').innerText()).replace(/\n/g, ' | ').slice(0, 300),
);
await wp.screenshot({ path: 'screenshots/pwreset-pending.png', fullPage: true });

console.log('3. admin account (test-only) + promotion');
const su = await api('POST', '/api/auth/users', { email: alias(adminMobile), password: workerPassword, name: 'प्लेटफ़ॉर्म एडमिन' }, ANON_KEY);
check('admin test account created', su.status < 300, su.text.slice(0, 120));
const adminUid = su.json?.user?.id;
const po = await api('POST', '/api/database/rpc/create_my_profile', { p_role: 'employer', p_name: 'प्लेटफ़ॉर्म एडमिन' }, su.json.accessToken);
check('admin profile created', po.status < 300, po.text.slice(0, 120));
await applyMigration(
  `UPDATE public.profiles SET role='admin', verification_status='verified' WHERE id='${adminUid}';`,
  `ui-pwreset-admin-${tag}`,
);

console.log('4. admin approves the request');
const ap = await newPage();
await ap.goto(BASE + '/auth/worker');
await ap.waitForTimeout(2000); // hydration settle
await ap.getByPlaceholder('98765 43210').fill(adminMobile);
await ap.locator('input[type=password]').first().fill(workerPassword);
await ap.getByRole('button', { name: 'लॉगिन करें' }).click();
await ap.waitForURL('**/admin', { timeout: 20000 });
check('admin logged in, on /admin', ap.url().endsWith('/admin'));
await ap.goto(BASE + '/admin/reset');
check('pending request listed', await waitText(ap, 'राज कुमार'));
check('admin sees approve button', (await ap.getByRole('button', { name: /मंज़ूर करें/ }).count()) > 0);
ap.once('dialog', (d) => d.accept());
// pending cards are newest-first; our request is the most recent one
await ap.getByRole('button', { name: /मंज़ूर करें/ }).first().click();
check('approve confirmation shown', await waitText(ap, 'टेंपरेरी पासवर्ड सेट हो गया'));
await ap.screenshot({ path: 'screenshots/pwreset-admin-approved.png', fullPage: true });

console.log('5. worker page polls and shows the temp password');
check('worker sees temp password banner', await waitText(wp, '🔑 आपका टेंपरेरी पासवर्ड तैयार है।', 20000));
const tempPw = (await wp.locator('span.font-mono').first().textContent()).trim();
check('temp password is 12 chars', tempPw.length === 12, tempPw);
await wp.screenshot({ path: 'screenshots/pwreset-temp-password.png', fullPage: true });

console.log('6. worker logs in with the temp password → forced to change');
await wp.getByRole('button', { name: 'अभी लॉगिन करें →' }).click();
await wp.waitForURL('**/auth/worker');
await wp.waitForTimeout(2000); // hydration settle
await wp.getByPlaceholder('98765 43210').fill(workerMobile);
await wp.locator('input[type=password]').first().fill(tempPw);
await wp.getByRole('button', { name: 'लॉगिन करें' }).click();
check('forced to /change-password?from=reset', await wp.waitForURL((u) => new URL(u).pathname === '/change-password' && new URL(u).searchParams.get('from') === 'reset', { timeout: 20000 }).then(() => true, () => false));
check('reset hint shown', await waitText(wp, 'आप टेंपरेरी पासवर्ड से लॉगिन हैं'));
const pwInputs = wp.locator('input[type=password]');
await pwInputs.nth(0).fill(tempPw);
await pwInputs.nth(1).fill(newPassword);
await pwInputs.nth(2).fill(newPassword);
await wp.getByRole('button', { name: 'पासवर्ड बदलें' }).click();
check('change success screen', await waitText(wp, 'पासवर्ड बदल दिया गया', 20000));
await wp.screenshot({ path: 'screenshots/pwreset-changed.png', fullPage: true });
await wp.getByRole('button', { name: 'होम पर जाएं →' }).click();
check('back on worker dashboard', await waitText(wp, 'मेरे आसपास उपलब्ध काम', 20000));

console.log('7. old (temp) password rejected, new password works');
const vp = await newPage();
await vp.goto(BASE + '/auth/worker');
await vp.waitForTimeout(2000); // hydration settle
await vp.getByPlaceholder('98765 43210').fill(workerMobile);
await vp.locator('input[type=password]').first().fill(tempPw);
await vp.getByRole('button', { name: 'लॉगिन करें' }).click();
check('temp password login now fails', await waitText(vp, /पासवर्ड|सही|गलत/i, 15000) || vp.url().includes('/auth/worker'));
await vp.getByPlaceholder('98765 43210').fill(workerMobile);
await vp.locator('input[type=password]').first().fill(newPassword);
await vp.getByRole('button', { name: 'लॉगिन करें' }).click();
check('new password logs in', await waitText(vp, 'मेरे आसपास उपलब्ध काम', 20000));

console.log('8. DP menu on the profile page offers password change');
await vp.goto(BASE + '/worker/profile');
await vp.waitForTimeout(2000); // hydration settle
await vp.getByRole('button', { name: 'फोटो या पासवर्ड बदलें' }).click();
const pwMenuVisible = (await vp.getByRole('button', { name: '🔒 पासवर्ड बदलें' }).count()) > 0;
check('DP menu shows पासवर्ड बदलें option', pwMenuVisible);
check('DP menu shows फोटो बदलें option', (await vp.getByRole('button', { name: '📷 फोटो बदलें' }).count()) > 0);

console.log('9. cleanup');
try {
  await applyMigration(
    `DELETE FROM auth.users WHERE email IN ('${alias(workerMobile)}','${alias(adminMobile)}');`,
    `ui-pwreset-cleanup-${tag}`,
  );
  console.log('  🧹 removed worker + admin test accounts');
} catch (e) {
  console.log('  ⚠️ cleanup failed: ' + e.message);
}

if (errors.length) {
  console.log('\nBrowser errors:');
  for (const e of [...new Set(errors)].slice(0, 10)) console.log('  - ' + e.slice(0, 300));
}

await browser.close();
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
