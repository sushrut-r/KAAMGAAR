// i18n + profile revamp test:
//  - default language is Hindi everywhere
//  - EN toggle on landing + app header switches the whole UI and persists
//  - profile page: discoverable "edit profile" button opens the edit modal
//  - avatar (DP) click opens a menu with photo update + password change
// Usage: APP_URL=https://zrv4vvg9.insforge.site node scripts/ui_i18n_profile_test.mjs
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:5173';
const BASE_URL = process.env.INSFORGE_BASE_URL;
const ADMIN_KEY = process.env.INSFORGE_ADMIN_KEY;
const tag = Math.random().toString(36).slice(2, 8);
const digits = String(Date.now()).slice(-8);
const workerMobile = '9' + digits + '1';
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

const toggle = (page) => page.getByRole('button', { name: /Switch to English|हिंदी में पढ़ें/ });
const saysEn = (page) => page.getByRole('button', { name: 'Switch to English' }).getByText('EN', { exact: true });
const saysHi = (page) => page.getByRole('button', { name: 'हिंदी में पढ़ें' }).getByText('हिं', { exact: true });

console.log('\n=== i18n + profile test ===\n1. default is Hindi on the landing page');
const landing = await newPage();
await landing.goto(BASE, { waitUntil: 'networkidle' });
check('Hindi logo visible', await waitText(landing, 'कामगार'));
check('Hindi register button', (await landing.getByRole('button', { name: 'रजिस्टर करें' }).count()) > 0);
check('EN toggle present on landing', (await toggle(landing).count()) > 0);
check('toggle says EN (Hindi is active)', (await saysEn(landing).count()) > 0);

console.log('2. switch to English');
await toggle(landing).click();
check('English Login button', await waitText(landing, 'Login', 8000));
check('English Register button', (await landing.getByRole('button', { name: 'Register' }).count()) > 0);
await landing.reload({ waitUntil: 'networkidle' });
check('English persists after reload', await waitText(landing, 'Login', 8000));
check('toggle now says हिं', (await saysHi(landing).count()) > 0);

console.log('3. switch back to Hindi');
await toggle(landing).click();
check('Hindi register button again', await waitText(landing, 'रजिस्टर करें', 8000));
await landing.close();

console.log('4. worker sign-up in Hindi');
const wp = await newPage();
await wp.goto(BASE);
await wp.waitForTimeout(1500);
await wp.getByText('मैं मजदूर / कारीगर हूँ').click();
await wp.waitForURL('**/auth/worker');
await wp.waitForTimeout(2000);
await wp.getByText('नया खाता').click();
await wp.waitForTimeout(800);
await wp.getByPlaceholder('जैसे: राज कुमार').fill('राज कुमार');
await wp.getByPlaceholder('98765 43210').fill(workerMobile);
await wp.locator('input[type=password]').first().fill('test123456');
await wp.getByRole('button', { name: 'खाता बनाएं' }).click();
await wp.waitForURL((u) => new URL(u).pathname === '/onboarding/worker', { timeout: 20000 });
await wp.getByPlaceholder('राज कुमार').fill('राज कुमार');
await wp.getByPlaceholder('जैसे: गोमती नगर, लखनऊ').fill('गोमती नगर, लखनऊ');
check('worker live photo captured', await captureLivePhoto(wp));
await wp.locator('select').first().selectOption({ index: 1 });
await wp.getByRole('button', { name: /प्रोफाइल बनाएं/ }).click();
await wp.waitForURL((u) => new URL(u).pathname === '/worker', { timeout: 20000 });
check('worker dashboard (Hindi)', await waitText(wp, 'मेरे आसपास उपलब्ध काम'));

console.log('5. app header has the language toggle');
check('EN toggle in app header', (await toggle(wp).count()) > 0);

console.log('6. profile page: edit button + modal');
await wp.goto(BASE + '/worker/profile');
await wp.waitForTimeout(2000);
const editBtn = wp.getByRole('button', { name: '✏️ प्रोफाइल एडिट करें' });
check('edit profile button visible', await editBtn.isVisible({ timeout: 8000 }).catch(() => false));
await editBtn.click();
check('edit modal opens (title)', await waitText(wp, '✏️ प्रोफाइल एडिट करें'));
check('modal has save button', (await wp.getByRole('button', { name: 'सेव करें' }).count()) > 0);
await wp.getByRole('button', { name: 'बंद करें' }).click();
check('modal closes', (await wp.getByRole('button', { name: 'सेव करें' }).count()) === 0);

console.log('7. avatar click opens photo/password menu');
const dpBtn = wp.getByRole('button', { name: 'फोटो या पासवर्ड बदलें' });
check('avatar button present', (await dpBtn.count()) > 0);
await dpBtn.click();
check('menu: फोटो बदलें option', (await wp.getByRole('button', { name: '📷 फोटो बदलें' }).count()) > 0);
check('menu: पासवर्ड बदलें option', (await wp.getByRole('button', { name: '🔒 पासवर्ड बदलें' }).count()) > 0);
await wp.getByRole('button', { name: '🔒 पासवर्ड बदलें' }).click();
check('password option goes to /change-password', (await wp.waitForURL('**/change-password', { timeout: 8000 }).then(() => true, () => false)));

console.log('8. English mode on the profile page');
await wp.goto(BASE + '/worker/profile');
await wp.waitForTimeout(1500);
await toggle(wp).click(); // header toggle -> English
await wp.waitForTimeout(500);
check('English edit button', await waitText(wp, '✏️ Edit profile', 8000));
await wp.getByRole('button', { name: '✏️ Edit profile' }).click();
check('English modal title', await waitText(wp, 'Edit profile'));
await wp.getByRole('button', { name: 'Close' }).click().catch(() => undefined);
await wp.getByRole('button', { name: 'Change photo or password' }).click();
check('English menu: Change photo', (await wp.getByRole('button', { name: '📷 Change photo' }).count()) > 0);
check('English menu: Change password', (await wp.getByRole('button', { name: '🔒 Change password' }).count()) > 0);
await wp.keyboard.press('Escape');
check('toggle now says हिं in header', (await saysHi(wp).count()) > 0);

console.log('9. cleanup');
try {
  await applyMigration(
    `DELETE FROM auth.users WHERE email = '${alias(workerMobile)}';`,
    `ui-i18n-cleanup-${tag}`,
  );
  console.log('  🧹 test account removed');
} catch (e) {
  console.log('  ⚠️ cleanup failed: ' + e.message);
}

console.log('\nconsole/page errors: ' + errors.length);
for (const e of errors.slice(0, 8)) console.log('   ⚠️ ' + e.slice(0, 160));
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
await browser.close();
process.exit(fail ? 1 : 0);
