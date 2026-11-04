// EN-mode dashboard sweep: signs up a fresh worker + employer (Hindi onboarding),
// switches each to English, and checks the dashboard pages render English UI.
// Usage: APP_URL=https://zrv4vvg9.insforge.site node scripts/ui_en_sweep_test.mjs
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:5173';
const BASE_URL = process.env.INSFORGE_BASE_URL;
const ADMIN_KEY = process.env.INSFORGE_ADMIN_KEY;
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

const waitText = async (page, text, timeout = 12000) => {
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

async function signUp(role, mobile, name) {
  const p = await newPage();
  await p.goto(BASE);
  await p.waitForTimeout(1500);
  await p.getByText(role === 'worker' ? 'मैं मजदूर / कारीगर हूँ' : 'मुझे कारीगर चाहिए').click();
  await p.waitForURL(`**/auth/${role}`);
  await p.waitForTimeout(2000);
  await p.getByText('नया खाता').click();
  await p.waitForTimeout(800);
  await p.getByPlaceholder('जैसे: राज कुमार').fill(name);
  await p.getByPlaceholder('98765 43210').fill(mobile);
  await p.locator('input[type=password]').first().fill('test123456');
  await p.getByRole('button', { name: 'खाता बनाएं' }).click();
  await p.waitForURL((u) => new URL(u).pathname === `/onboarding/${role}`, { timeout: 20000 });
  await p.waitForTimeout(1500);
  await p.getByPlaceholder('राज कुमार').fill(name);
  await p.getByPlaceholder('जैसे: गोमती नगर, लखनऊ').fill('गोमती नगर, लखनऊ');
  await captureLivePhoto(p);
  await p.locator('select').first().selectOption({ index: 1 });
  await p.getByRole('button', { name: /प्रोफाइल बनाएं/ }).click();
  await p.waitForURL((u) => new URL(u).pathname === `/${role}`, { timeout: 20000 });
  return p;
}

const toggle = (page) => page.getByRole('button', { name: /Switch to English|हिंदी में पढ़ें/ });

console.log('\n=== EN dashboard sweep ===\n1. worker dashboards in English');
const wp = await signUp('worker', workerMobile, 'Test Worker');
check('worker dashboard (Hindi default)', await waitText(wp, 'मेरे आसपास उपलब्ध काम'));
await toggle(wp).click();
await wp.waitForTimeout(800);
check('EN: near-me jobs heading', await waitText(wp, 'Jobs available near me'));
for (const [path, text] of [
  ['/worker/jobs', 'Find Work'],
  ['/worker/availability', "I'm Available"],
  ['/worker/applications', 'My Applications'],
  ['/worker/my-jobs', 'My Work'],
  ['/worker/hajri', 'Attendance'],
  ['/worker/earnings', 'My Earnings'],
  ['/worker/ratings', 'My Ratings'],
  ['/worker/portfolio', 'Portfolio'],
]) {
  await wp.goto(BASE + path);
  check(`EN ${path}`, await waitText(wp, text));
}
await wp.goto(BASE + '/worker/profile');
check('EN profile edit button', await waitText(wp, '✏️ Edit profile'));
await wp.close();

console.log('2. employer dashboards in English');
const ep = await signUp('employer', employerMobile, 'Test Employer');
check('employer dashboard (Hindi default)', await waitText(ep, 'होम'));
await toggle(ep).click();
await ep.waitForTimeout(800);
for (const [path, text] of [
  ['/employer', 'Home'],
  ['/employer/post', 'Post a Job'],
  ['/employer/workers', 'Available Tradesmen'],
  ['/employer/applications', 'Applications'],
  ['/employer/jobs', 'My Jobs'],
  ['/employer/payments', 'Payments'],
]) {
  await ep.goto(BASE + path);
  check(`EN ${path}`, await waitText(ep, text));
}
await ep.close();

console.log('3. cleanup');
try {
  await applyMigration(
    `DELETE FROM auth.users WHERE email IN ('${alias(workerMobile)}','${alias(employerMobile)}');
     DELETE FROM public.worker_skills WHERE worker_id NOT IN (SELECT id FROM auth.users);
     DELETE FROM public.worker_profiles WHERE user_id NOT IN (SELECT id FROM auth.users);
     DELETE FROM public.employer_profiles WHERE user_id NOT IN (SELECT id FROM auth.users);
     DELETE FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users);`,
    'ui-en-sweep-cleanup',
  );
  console.log('  🧹 test accounts removed');
} catch (e) {
  console.log('  ⚠️ cleanup failed: ' + e.message);
}

console.log('\nconsole/page errors: ' + errors.length);
for (const e of errors.slice(0, 8)) console.log('   ⚠️ ' + e.slice(0, 160));
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
await browser.close();
process.exit(fail ? 1 : 0);
