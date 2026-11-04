// UI smoke test: drives the real app in a headless browser through both journeys.
// Usage: node scripts/ui_smoke.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.APP_URL || 'http://localhost:5173';
const tag = Math.random().toString(36).slice(2, 8);
const digits = String(Date.now()).slice(-8);
const workerMobile = '9' + digits + '1';
const employerMobile = '8' + digits + '2';
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

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

// capture the onboarding live photo with the (fake) camera
async function captureLivePhoto(page) {
  await page.getByRole('button', { name: '📷 कैमरा चालू करके फोटो लें' }).click();
  await page.getByRole('button', { name: '📸 फोटो लें' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200); // let the (fake) video frame render
  await page.getByRole('button', { name: '📸 फोटो लें' }).click();
  return waitText(page, 'फोटो तैयार है', 15000);
}

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  return page;
}

console.log('\n=== UI smoke ===\n1. landing');
const landing = await newPage();
await landing.goto(BASE, { waitUntil: 'networkidle' });
check('logo कामगार visible', await landing.getByText('कामगार').first().isVisible());
check('hero headline', (await landing.locator('text=अब एक ही जगह').count()) > 0);
check('worker card', (await landing.locator('text=मैं मजदूर / कारीगर हूँ').count()) > 0);
check('employer card', (await landing.locator('text=मुझे कारीगर चाहिए').count()) > 0);
check('stats rendered from DB', (await landing.locator('text=पंजीकृत कामगार').count()) > 0);
await landing.screenshot({ path: 'screenshots/landing.png', fullPage: true });

console.log('2. worker signup + availability');
const wp = await newPage();
await wp.goto(BASE);
await wp.getByText('मैं मजदूर / कारीगर हूँ').click();
await wp.waitForURL('**/auth/worker');
// new: role selection is two buttons above the login box
check(
  'role buttons above login box',
  await wp.getByRole('tab', { name: '👷 कामगार' }).waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false),
);
await wp.getByRole('tab', { name: '🏗️ नियोजक' }).click();
await wp.waitForURL('**/auth/employer');
check('role switch to employer', wp.url().includes('/auth/employer'));
await wp.getByRole('tab', { name: '👷 कामगार' }).click();
await wp.waitForURL('**/auth/worker');
await wp.getByText('नया खाता').click();
await wp.getByPlaceholder('जैसे: राज कुमार').fill('राज कुमार');
await wp.getByPlaceholder('98765 43210').fill(workerMobile);
await wp.locator('input[type=password]').fill('test123456');
await wp.getByRole('button', { name: 'खाता बनाएं' }).click();
await wp.waitForURL((u) => new URL(u).pathname === '/onboarding/worker', { timeout: 20000 });
check('worker reached onboarding', wp.url().includes('/onboarding/worker'));
check('login mobile shown on onboarding', await waitText(wp, workerMobile.slice(0, 5)));
check('gps button present', (await wp.getByRole('button', { name: '📍 GPS से लोकेशन लें' }).count()) > 0);
await wp.getByPlaceholder('राज कुमार').fill('राज कुमार');
await wp.getByPlaceholder('जैसे: गोमती नगर, लखनऊ').fill('गोमती नगर, लखनऊ');
check('worker live photo captured', await captureLivePhoto(wp));
await wp.locator('select').first().selectOption({ index: 1 });
await wp.getByRole('button', { name: /प्रोफाइल बनाएं/ }).click();
await wp.waitForURL((u) => new URL(u).pathname === '/worker', { timeout: 20000 });
check('worker dashboard', await waitText(wp, 'मेरे आसपास उपलब्ध काम'));
await wp.getByRole('button', { name: /मैं काम के लिए उपलब्ध हूँ/ }).first().click();
check('availability toggled on', await waitText(wp, 'आप अभी काम के लिए उपलब्ध हैं'));
await wp.screenshot({ path: 'screenshots/worker-dashboard.png', fullPage: true });

console.log('3. employer signup + post job');
const ep = await newPage();
await ep.goto(BASE);
await ep.getByText('मुझे कारीगर चाहिए').click();
await ep.waitForURL('**/auth/employer');
await ep.getByText('नया खाता').click();
await ep.getByPlaceholder('जैसे: राज कुमार').fill('शर्मा कंस्ट्रक्शन');
await ep.getByPlaceholder('98765 43210').fill(employerMobile);
await ep.locator('input[type=password]').fill('test123456');
await ep.getByRole('button', { name: 'खाता बनाएं' }).click();
await ep.waitForURL((u) => new URL(u).pathname === '/onboarding/employer', { timeout: 20000 });
await ep.getByPlaceholder('राज कुमार').fill('शर्मा कंस्ट्रक्शन');
await ep.getByPlaceholder('जैसे: गोमती नगर, लखनऊ').fill('गोमती नगर, लखनऊ');
check('employer live photo captured', await captureLivePhoto(ep));
await ep.getByRole('button', { name: /प्रोफाइल बनाएं/ }).click();
await ep.waitForURL((u) => new URL(u).pathname === '/employer', { timeout: 20000 });
check('employer dashboard', await waitText(ep, 'काम के लिए उपलब्ध कारीगर'));

await ep.goto(BASE + '/employer/workers', { waitUntil: 'networkidle' });
check('employer sees the available worker', await waitText(ep, 'राज कुमार'));
await ep.screenshot({ path: 'screenshots/employer-workers.png', fullPage: true });

await ep.goto(BASE + '/employer/post', { waitUntil: 'networkidle' });
await ep.getByPlaceholder('जैसे: मिस्त्री चाहिए').fill('मिस्त्री चाहिए');
await ep.locator('select').first().selectOption({ index: 1 });
await ep.getByRole('button', { name: 'काम पोस्ट करें' }).click();
await ep.waitForURL('**/employer/jobs', { timeout: 20000 });
check('job posted and listed', await waitText(ep, 'मिस्त्री चाहिए'));
await ep.screenshot({ path: 'screenshots/employer-jobs.png', fullPage: true });

console.log('4. worker applies');
await wp.goto(BASE + '/worker/jobs', { waitUntil: 'networkidle' });
check('worker sees the posted job', await waitText(wp, 'मिस्त्री चाहिए'));
await wp.screenshot({ path: 'screenshots/worker-jobs.png', fullPage: true });
await wp.getByRole('button', { name: 'Apply करें' }).first().click();
check('application submitted', await waitText(wp, 'आवेदन भेज दिया गया'));

console.log('5. employer hires');
await ep.goto(BASE + '/employer/applications', { waitUntil: 'networkidle' });
check('application visible to employer', await waitText(ep, 'राज कुमार'));
await ep.getByRole('button', { name: /स्वीकार करें/ }).first().click();
check('hire confirmed', await waitText(ep, 'काम पक्का हो गया'));

console.log('6. two-sided hajri');
await wp.goto(BASE + '/worker/hajri', { waitUntil: 'networkidle' });
check('worker hajri card', await waitText(wp, 'Check IN'));
await wp.getByRole('button', { name: /Check IN/ }).first().click();
check('worker IN pending confirmation', await waitText(wp, 'पुष्टि बाकी'));
await wp.screenshot({ path: 'screenshots/worker-hajri.png', fullPage: true });

await ep.goto(BASE + '/employer/hajri', { waitUntil: 'networkidle' });
await ep.getByRole('button', { name: /Confirm IN/ }).first().click();
check('attendance confirmed both sides', await waitText(ep, 'हाजिरी पक्की'));
await ep.screenshot({ path: 'screenshots/employer-hajri.png', fullPage: true });

console.log('6b. logout + login again by mobile');
await wp.getByRole('button', { name: 'लॉगआउट' }).click();
await wp.waitForURL(BASE + '/', { timeout: 15000 });
await wp.goto(BASE + '/auth/worker', { waitUntil: 'networkidle' });
await wp.getByPlaceholder('98765 43210').fill(workerMobile);
await wp.locator('input[type=password]').fill('test123456');
await wp.getByRole('button', { name: 'लॉगिन करें' }).click();
check('re-login with mobile number', await waitText(wp, 'मेरे आसपास उपलब्ध काम'));
await wp.screenshot({ path: 'screenshots/login-mobile.png' });

await wp.goto(BASE + '/auth/worker', { waitUntil: 'networkidle' });
await wp.getByPlaceholder('98765 43210').fill('12345');
await wp.locator('input[type=password]').fill('test123456');
await wp.getByRole('button', { name: 'लॉगिन करें' }).click();
check('invalid mobile rejected client-side', await waitText(wp, '10 अंकों का'));

await wp.getByPlaceholder('98765 43210').fill(workerMobile);
await wp.locator('input[type=password]').fill('wrongpass');
await wp.getByRole('button', { name: 'लॉगिन करें' }).click();
check('wrong password message hides the alias', await waitText(wp, 'मोबाइल नंबर या पासवर्ड गलत है'));
await wp.goto(BASE + '/redirect', { waitUntil: 'networkidle' });

console.log('7. role isolation');
await wp.goto(BASE + '/employer/payments');
check('worker blocked from employer page', await waitText(wp, 'यह पेज आपके लिए नहीं है'));
await wp.screenshot({ path: 'screenshots/unauthorized.png' });

console.log('8. mobile layout');
const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mp = await mob.newPage();
await mp.goto(BASE, { waitUntil: 'networkidle' });
await mp.screenshot({ path: 'screenshots/mobile-landing.png', fullPage: true });
check('mobile landing renders', (await mp.locator('text=कामगार').count()) > 0);

await browser.close();

// remove the throwaway accounts this run created
try {
  const base = process.env.INSFORGE_BASE_URL, key = process.env.INSFORGE_ADMIN_KEY;
  if (base && key) {
    const list = await (await fetch(base + '/api/database/migrations', {
      headers: { Authorization: 'Bearer ' + key },
    })).json();
    const latest = Math.max(0, ...list.migrations.map((m) => Number(m.version)));
    const emails = [workerMobile, employerMobile].map((m) => `'91${m}@mobile.kaamgaar.app'`).join(',');
    await fetch(base + '/api/database/migrations', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: String(latest + 1),
        name: 'ui-smoke-cleanup-' + tag,
        sql: `DELETE FROM auth.users WHERE email IN (${emails});`,
      }),
    });
    console.log('  🧹 test accounts removed');
  }
} catch (e) {
  console.log('  ⚠️  cleanup skipped: ' + e.message);
}

const realErrors = errors.filter((e) => !/favicon|Download the React DevTools|geolocation/i.test(e));
console.log(`\nconsole errors: ${realErrors.length}`);
realErrors.slice(0, 8).forEach((e) => console.log('   ⚠️  ' + e.slice(0, 220)));
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
fs.writeFileSync('/tmp/ui_result.txt', `${pass} passed ${fail} failed`);
process.exit(fail ? 1 : 0);
