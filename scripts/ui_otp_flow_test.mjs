// OTP login UI test (dev mode — no SMS provider yet, code shown in a banner):
//  worker signs up, logs out, logs back in via OTP (incl. a wrong-code attempt);
//  employer signs up and logs in via OTP.
// Usage: APP_URL=https://zrv4vvg9.insforge.site node scripts/ui_otp_test.mjs
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
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
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
  let latest = 0;
  for (let i = 0; i < 5; i++) {
    const { json: mig } = await api('GET', '/api/database/migrations', null, ADMIN_KEY);
    const list = mig?.migrations ?? [];
    if (Array.isArray(list) && list.length) {
      latest = Math.max(...list.map((m) => parseInt(String(m.version), 10)).filter((n) => Number.isFinite(n)), 0);
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
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
  await p.waitForURL((u) => new URL(String(u)).pathname === `/onboarding/${role}`, { timeout: 20000 });
  await p.waitForTimeout(1500);
  await p.getByPlaceholder('राज कुमार').fill(name);
  await p.getByPlaceholder('जैसे: गोमती नगर, लखनऊ').fill('गोमती नगर, लखनऊ');
  await captureLivePhoto(p);
  await p.locator('select').first().selectOption({ index: 1 });
  await p.getByRole('button', { name: /प्रोफाइल बनाएं/ }).click();
  await p.waitForURL((u) => new URL(String(u)).pathname === `/${role}`, { timeout: 20000 });
  await p.waitForTimeout(2500);
  return p;
}

async function otpLogin(p, mobile, expectDevCode) {
  // open the OTP method
  await p.getByRole('button', { name: 'OTP से लॉगिन' }).click();
  await p.getByPlaceholder('98765 43210').fill(mobile);
  await p.getByRole('button', { name: '📩 OTP भेजें' }).click();
  let code = null;
  if (expectDevCode) {
    const banner = p.getByText('Dev OTP (test): ').first();
    await banner.waitFor({ state: 'visible', timeout: 15000 });
    code = (await p.locator('span.font-mono').first().innerText()).trim();
    if (!/^[0-9]{6}$/.test(code)) return { ok: false, why: 'dev code not 6 digits: ' + code };
  }
  await p.locator('input[inputmode="numeric"][autocomplete="one-time-code"]').fill(code);
  await p.getByRole('button', { name: 'लॉगिन करें' }).click();
  await p.waitForURL((u) => !String(u).includes('/auth/'), { timeout: 25000 });
  await p.waitForTimeout(2000);
  return { ok: true };
}

console.log('\n=== OTP login test ===\n1. worker sign-up + OTP login');
const wp = await signUp('worker', workerMobile, 'OTP Worker');
check('worker on dashboard after signup', (await wp.locator('text=मेरे आसपास उपलब्ध काम').count()) > 0);
await wp.getByRole('button', { name: 'लॉगआउट' }).click();
await wp.waitForURL('**/', { timeout: 15000 });

await wp.goto(BASE + '/auth/worker');
await wp.waitForTimeout(2000);
check('OTP tab visible on login', (await wp.getByRole('button', { name: 'OTP से लॉगिन' }).count()) > 0);
check('password method is default', (await wp.locator('input[type=password]').count()) > 0);

// wrong code attempt first
await wp.getByRole('button', { name: 'OTP से लॉगिन' }).click();
await wp.getByPlaceholder('98765 43210').fill(workerMobile);
await wp.getByRole('button', { name: '📩 OTP भेजें' }).click();
await wp.getByText('Dev OTP (test): ').first().waitFor({ state: 'visible', timeout: 15000 });
const dev1 = (await wp.locator('span.font-mono').first().innerText()).trim();
const wrong = String((parseInt(dev1, 10) + 1) % 1000000).padStart(6, '0');
await wp.locator('input[inputmode="numeric"][autocomplete="one-time-code"]').fill(wrong);
await wp.getByRole('button', { name: 'लॉगिन करें' }).click();
check('wrong OTP rejected', await waitText(wp, 'OTP गलत है या समय खत्म हो गया। दोबारा भेजें।'));

// correct code (resend for a fresh one)
await wp.getByRole('button', { name: 'पुनः भेजें' }).click();
await wp.waitForTimeout(400);
await wp.getByRole('button', { name: '📩 OTP भेजें' }).click();
await wp.getByText('Dev OTP (test): ').first().waitFor({ state: 'visible', timeout: 15000 });
const dev2 = (await wp.locator('span.font-mono').first().innerText()).trim();
await wp.locator('input[inputmode="numeric"][autocomplete="one-time-code"]').fill(dev2);
await wp.getByRole('button', { name: 'लॉगिन करें' }).click();
check('worker OTP login reaches dashboard', await waitText(wp, 'मेरे आसपास उपलब्ध काम', 25000));
await wp.close();

console.log('2. employer OTP login');
const ep = await signUp('employer', employerMobile, 'OTP Employer');
check('employer on dashboard after signup', (await ep.locator('header').count()) > 0);
await ep.getByRole('button', { name: 'लॉगआउट' }).click();
await ep.waitForURL('**/', { timeout: 15000 });
await ep.goto(BASE + '/auth/employer');
await ep.waitForTimeout(2000);
const o = await otpLogin(ep, employerMobile, true);
check('employer OTP login reaches dashboard', o.ok ? (await ep.locator('header').count()) > 0 : false, o.why ?? '');
await ep.close();

console.log('3. unregistered number rejected');
const up = await newPage();
await up.goto(BASE + '/auth/worker');
await up.waitForTimeout(2000);
await up.getByRole('button', { name: 'OTP से लॉगिन' }).click();
await up.getByPlaceholder('98765 43210').fill('9' + digits + '9');
await up.getByRole('button', { name: '📩 OTP भेजें' }).click();
check('unregistered number error', await waitText(up, 'यह मोबाइल नंबर पंजीकृत नहीं है। पहले रजिस्टर करें।'));
await up.close();

console.log('4. cleanup');
try {
  await applyMigration(
    `DELETE FROM auth.users WHERE email IN ('${alias(workerMobile)}','${alias(employerMobile)}');
     DELETE FROM public.worker_skills WHERE worker_id NOT IN (SELECT id FROM auth.users);
     DELETE FROM public.worker_profiles WHERE user_id NOT IN (SELECT id FROM auth.users);
     DELETE FROM public.employer_profiles WHERE user_id NOT IN (SELECT id FROM auth.users);
     DELETE FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users);`,
    'ui-otp-cleanup',
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
