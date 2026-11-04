// Focused test for the floating WhatsApp-style chat widget.
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:5173';
const digits = String(Date.now()).slice(-8);
const wMobile = '9' + digits + '1';
const eMobile = '8' + digits + '2';
let pass = 0,
  fail = 0;
const check = (l, c, x = '') => (c ? (pass++, console.log('  ✅ ' + l)) : (fail++, console.log('  ❌ ' + l + ' ' + x)));
const waitText = async (p, t, timeout = 15000) => {
  try {
    await p.locator(`text=${t}`).first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
};

const browser = await chromium.launch();
const errors = [];
async function signup(role, mobile, name, extra) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/auth/${role}?mode=signup`, { waitUntil: 'networkidle' });
  await p.getByPlaceholder('जैसे: राज कुमार').fill(name);
  await p.getByPlaceholder('98765 43210').fill(mobile);
  await p.locator('input[type=password]').fill('test123456');
  await p.getByRole('button', { name: 'खाता बनाएं' }).click();
  await p.waitForURL((u) => new URL(u).pathname === `/onboarding/${role}`, { timeout: 20000 });
  await p.getByPlaceholder('राज कुमार').fill(name);
  await p.getByPlaceholder('जैसे: गोमती नगर, लखनऊ').fill('गोमती नगर, लखनऊ');
  if (extra) await extra(p);
  await p.getByRole('button', { name: /प्रोफाइल बनाएं/ }).click();
  await p.waitForURL((u) => new URL(u).pathname === `/${role}`, { timeout: 20000 });
  return p;
}

console.log('\n=== floating chat ===\n1. two users + a shared job');
const wp = await signup('worker', wMobile, 'राज कुमार', async (p) => {
  await p.locator('select').first().selectOption({ index: 1 });
});
const ep = await signup('employer', eMobile, 'शर्मा कंस्ट्रक्शन');

console.log('2. chat is no longer in the sidebar');
check('sidebar has no संदेश link', (await wp.locator('nav a:has-text("संदेश")').count()) === 0);
check('chat bubble button exists', await wp.locator('button[aria-label="संदेश"]').isVisible());
await wp.screenshot({ path: 'screenshots/chat-bubble.png' });

console.log('3. empty state before any engagement');
await wp.locator('button[aria-label="संदेश"]').click();
check('panel opens', await waitText(wp, 'आपकी सभी बातचीत'));
check('empty state shown', await waitText(wp, 'अभी कोई बातचीत नहीं है'));
await wp.locator('button[aria-label="बंद करें"]').click();

console.log('4. worker applies -> both sides get a contact');
await ep.goto(BASE + '/employer/post', { waitUntil: 'networkidle' });
await ep.getByPlaceholder('जैसे: मिस्त्री चाहिए').fill('मिस्त्री चाहिए');
await ep.locator('select').first().selectOption({ index: 1 });
await ep.getByRole('button', { name: 'काम पोस्ट करें' }).click();
await ep.waitForURL('**/employer/jobs', { timeout: 20000 });

await wp.goto(BASE + '/worker/jobs', { waitUntil: 'networkidle' });
await wp.getByRole('button', { name: 'Apply करें' }).first().click();
await waitText(wp, 'आवेदन भेज दिया गया');

await wp.reload({ waitUntil: 'networkidle' });
await wp.locator('button[aria-label="संदेश"]').click();
check('employer appears in the conversation list', await waitText(wp, 'शर्मा कंस्ट्रक्शन'));

console.log('5. worker sends a message');
await wp.locator('button:has-text("शर्मा कंस्ट्रक्शन")').first().click();
check('thread opened', await waitText(wp, 'बातचीत शुरू करें'));
await wp.locator('input[placeholder="संदेश लिखें..."]').fill('नमस्ते, मैं कल सुबह 8 बजे आ जाऊंगा।');
await wp.locator('button[aria-label="भेजें"]').click();
check('message appears in the thread', await waitText(wp, 'कल सुबह 8 बजे'));
await wp.screenshot({ path: 'screenshots/chat-thread.png' });

console.log('6. employer receives it with an unread badge');
await ep.goto(BASE + '/employer', { waitUntil: 'networkidle' });
const badge = ep.locator('button[aria-label="संदेश"] span').first();
check('unread badge on the bubble', await badge.isVisible({ timeout: 20000 }).catch(() => false));
await ep.screenshot({ path: 'screenshots/chat-unread-badge.png' });

await ep.locator('button[aria-label="संदेश"]').click();
check('message visible to employer', await waitText(ep, 'कल सुबह 8 बजे'));
await ep.locator('button:has-text("राज कुमार")').first().click();
await ep.locator('input[placeholder="संदेश लिखें..."]').fill('ठीक है, साइट पर मिलते हैं।');
await ep.locator('button[aria-label="भेजें"]').click();
check('reply sent', await waitText(ep, 'साइट पर मिलते हैं'));

await ep.waitForTimeout(1500);
await ep.reload({ waitUntil: 'networkidle' });
await ep.locator('button[aria-label="संदेश"]').click();
check('badge cleared after reading', (await ep.locator('button[aria-label="संदेश"] span').count()) === 0);

console.log('7. worker sees the reply');
await wp.waitForTimeout(9000);
check('reply arrives by polling', await waitText(wp, 'साइट पर मिलते हैं', 20000));

console.log('8. mobile view + legacy /chat link');
const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mp = await mob.newPage();
await mp.goto(`${BASE}/auth/worker`, { waitUntil: 'networkidle' });
await mp.getByPlaceholder('98765 43210').fill(wMobile);
await mp.locator('input[type=password]').fill('test123456');
await mp.getByRole('button', { name: 'लॉगिन करें' }).click();
await waitText(mp, 'मेरे आसपास उपलब्ध काम');
check('bubble sits above the bottom nav on mobile', await mp.locator('button[aria-label="संदेश"]').isVisible());
await mp.locator('button[aria-label="संदेश"]').click();
check('full-screen panel on mobile', await waitText(mp, 'आपकी सभी बातचीत'));
await mp.screenshot({ path: 'screenshots/chat-mobile.png' });
await mp.locator('button[aria-label="बंद करें"]').click();

await mp.goto(BASE + '/chat', { waitUntil: 'networkidle' });
check('legacy /chat opens the panel and redirects', !mp.url().endsWith('/chat') && (await waitText(mp, 'आपकी सभी बातचीत')));

await browser.close();

try {
  const base = process.env.INSFORGE_BASE_URL, key = process.env.INSFORGE_ADMIN_KEY;
  const list = await (await fetch(base + '/api/database/migrations', { headers: { Authorization: 'Bearer ' + key } })).json();
  const latest = Math.max(0, ...list.migrations.map((m) => Number(m.version)));
  const emails = [wMobile, eMobile].map((m) => `'91${m}@mobile.kaamgaar.app'`).join(',');
  await fetch(base + '/api/database/migrations', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: String(latest + 1), name: 'chat-test-cleanup-' + digits, sql: `DELETE FROM auth.users WHERE email IN (${emails});` }),
  });
  console.log('  🧹 test accounts removed');
} catch (e) {
  console.log('  ⚠️  cleanup skipped: ' + e.message);
}

console.log(`\npage errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log('   ⚠️  ' + e.slice(0, 200)));
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
