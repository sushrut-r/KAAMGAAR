// Full journey: two accounts → job → hire → haijri complete → both-side rating modals.
// Captures screenshots of the new rating features (worker-side rating + work photo).
// Usage: node scripts/ui_ratings_journey.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.APP_URL || 'https://zrv4vvg9.insforge.site';
const digits = String(Date.now()).slice(-8);
const workerMobile = '9' + digits + '7';
const employerMobile = '8' + digits + '8';

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  return page;
}

async function captureLivePhoto(page) {
  await page.getByRole('button', { name: '📷 कैमरा चालू करके फोटो लें' }).click();
  await page.getByRole('button', { name: '📸 फोटो लें' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '📸 फोटो लें' }).click();
  await page.waitForSelector('text=फोटो तैयार है', { timeout: 15000 });
}

async function signup(page, role, name, mobile) {
  await page.goto(BASE + `/auth/${role}?mode=signup`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('जैसे: राज कुमार').fill(name);
  await page.getByPlaceholder('98765 43210').fill(mobile);
  await page.locator('input[type=password]').fill('test123456');
  await page.getByRole('button', { name: 'खाता बनाएं' }).click();
  await page.waitForURL((u) => new URL(u).pathname === `/onboarding/${role}`, { timeout: 20000 });
  await page.getByPlaceholder('राज कुमार').fill(name);
  await page.getByPlaceholder('जैसे: गोमती नगर, लखनऊ').fill('गोमती नगर, लखनऊ');
  await captureLivePhoto(page);
  await page.getByRole('button', { name: /प्रोफाइल बनाएं/ }).click();
  await page.waitForURL((u) => new URL(u).pathname === `/${role}`, { timeout: 20000 });
  await page.waitForTimeout(1500); // let the dashboard hydrate
}

console.log('1. accounts + onboarding (live photo)');
const wp = await newPage();
const ep = await newPage();
await signup(wp, 'worker', 'रेटिंग टेस्ट कामगार', workerMobile);
await signup(ep, 'employer', 'रेटिंग टेस्ट इंडस्ट्रीज', employerMobile);
console.log('   both onboarded ✔');

console.log('2. employer posts job');
await ep.goto(BASE + '/employer/post', { waitUntil: 'networkidle' });
await ep.getByPlaceholder('जैसे: मिस्त्री चाहिए').fill('रेटिंग टेस्ट — मिस्त्री');
await ep.locator('select').first().selectOption({ index: 1 });
await ep.getByRole('button', { name: 'काम पोस्ट करें' }).click();
await ep.waitForURL('**/employer/jobs', { timeout: 20000 });

console.log('3. worker applies, employer accepts');
await wp.goto(BASE + '/worker/jobs', { waitUntil: 'networkidle' });
await wp.getByRole('button', { name: 'Apply करें' }).first().click();
await wp.waitForSelector('text=आवेदन भेज दिया गया', { timeout: 15000 });
await ep.goto(BASE + '/employer/applications', { waitUntil: 'networkidle' });
await ep.getByRole('button', { name: /स्वीकार करें/ }).first().click();
await ep.waitForSelector('text=काम पक्का हो गया', { timeout: 15000 });

console.log('4. haijri: IN + OUT both sides → hire completed');
await wp.goto(BASE + '/worker/hajri', { waitUntil: 'networkidle' });
await wp.getByRole('button', { name: /Check IN/ }).first().click();
await ep.goto(BASE + '/employer/hajri', { waitUntil: 'networkidle' });
await ep.getByRole('button', { name: /Confirm IN/ }).first().click();
await ep.waitForSelector('text=हाजिरी पक्की', { timeout: 15000 });

await wp.reload({ waitUntil: 'networkidle' });
await wp.getByRole('button', { name: /Check OUT/ }).first().click();
await ep.reload({ waitUntil: 'networkidle' });
await ep.getByRole('button', { name: /Confirm OUT/ }).first().click();
await ep.waitForSelector('text=कुल मजदूरी', { timeout: 20000 });
console.log('   hire completed ✔');

console.log('5. worker-side rating (कामगार → नियोक्ता)');
await wp.goto(BASE + '/worker/my-jobs', { waitUntil: 'networkidle' });
await wp.waitForSelector('text=नियोक्ता को रेटिंग दें', { timeout: 15000 });
await fs.mkdirSync('screenshots', { recursive: true });
await wp.screenshot({ path: 'screenshots/worker-rate-employer-btn.png' });
await wp.getByRole('button', { name: 'नियोक्ता को रेटिंग दें' }).first().click();
await wp.waitForSelector('text=रेटिंग भेजें', { timeout: 10000 });
await wp.waitForTimeout(400);
await wp.screenshot({ path: 'screenshots/worker-rating-modal.png' });
console.log('   worker rating modal captured ✔');
// keep the modal open; stars + submit happen in step 7

console.log('6. employer-side rating with work photo');
await ep.goto(BASE + '/employer/jobs', { waitUntil: 'networkidle' });
await ep.waitForSelector('text=कामगार को रेटिंग दें', { timeout: 30000 });
await ep.screenshot({ path: 'screenshots/employer-rate-worker-btn.png' });
await ep.getByRole('button', { name: 'कामगार को रेटिंग दें' }).first().click();
await ep.waitForSelector('text=पूरे हुए काम की फोटो', { timeout: 10000 });
await ep.getByRole('button', { name: 'काम की गुणवत्ता 5 स्टार' }).click();
await ep.waitForTimeout(400);
await ep.screenshot({ path: 'screenshots/employer-rating-workphoto.png' });
// open the live camera inside the rating modal
await ep.getByRole('button', { name: '📷 लाइव कैमरा' }).click();
await ep.getByRole('button', { name: '📸 फोटो लें' }).waitFor({ timeout: 15000 });
await ep.waitForTimeout(1500);
await ep.getByRole('button', { name: '📸 फोटो लें' }).click();
await ep.waitForSelector('text=फोटो जोड़ी गई', { timeout: 15000 });
await ep.waitForTimeout(300);
await ep.screenshot({ path: 'screenshots/employer-rating-workphoto-captured.png' });
console.log('   employer rating + work photo captured ✔');

console.log('7. submit employer rating with photo, then worker rating');
await ep.getByRole('button', { name: 'रेटिंग भेजें' }).click();
await ep.waitForSelector('text=रेटिंग दर्ज हो गई', { timeout: 30000 });
await wp.getByRole('button', { name: 'भुगतान समय पर 5 स्टार' }).click();
await wp.getByRole('button', { name: 'रेटिंग भेजें' }).click();
await wp.waitForSelector('text=धन्यवाद', { timeout: 30000 });
console.log('   both ratings submitted ✔');

// worker's rating page should show the employer review with the work photo
await wp.goto(BASE + '/worker/ratings', { waitUntil: 'networkidle' });
await wp.waitForSelector('img[alt="पूरे हुए काम की फोटो"]', { timeout: 15000 });
await wp.screenshot({ path: 'screenshots/worker-sees-workphoto-review.png', fullPage: true });
console.log('   worker sees work photo in review ✔');

await browser.close();

// cleanup
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
        name: 'ui-ratings-cleanup',
        sql: `DELETE FROM auth.users WHERE email IN (${emails});`,
      }),
    });
    console.log('  🧹 test accounts removed');
  }
} catch (e) {
  console.log('  ⚠️  cleanup skipped:', e.message);
}
console.log('=== ratings journey done ===');
