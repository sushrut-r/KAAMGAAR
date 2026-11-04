// OTP PAUSED-state test: the "OTP से लॉगिन" tab must show a coming-soon panel
// (no OTP form) until MSG91 keys are deployed and OTP_LOGIN_LIVE is flipped.
// Usage: APP_URL=https://zrv4vvg9.insforge.site node scripts/ui_otp_test.mjs
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:5173';
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

const waitText = async (page, text, timeout = 10000) => {
  try {
    await page.locator(`text=${text}`).first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
p.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

console.log('\n=== OTP paused-state test ===');
await p.goto(BASE);
await p.waitForTimeout(1500);
await p.getByText('मैं मजदूर / कारीगर हूँ').click();
await p.waitForURL('**/auth/worker');
await p.waitForTimeout(2000);

// default = password method
check('password form is default', (await p.locator('input[type=password]').count()) > 0);

// click OTP tab
await p.getByRole('button', { name: 'OTP से लॉगिन' }).click();
await p.waitForTimeout(500);

check('coming-soon heading shown', await waitText(p, 'जल्द ही शुरू होगा'));
check('coming-soon body shown', await waitText(p, 'SMS OTP से लॉगिन की सुविधा तैयार हो रही है। तब तक कृपया पासवर्ड से लॉगिन करें।'));
check('no OTP send button', (await p.getByRole('button', { name: '📩 OTP भेजें' }).count()) === 0);
check('no OTP code input', (await p.locator('input[autocomplete="one-time-code"]').count()) === 0);

// back to password
await p.getByRole('button', { name: 'पासवर्ड से लॉगिन करें' }).click();
await p.waitForTimeout(400);
check('back to password form', (await p.locator('input[type=password]').count()) > 0);

// employer side too
await p.goto(BASE + '/auth/employer');
await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'OTP से लॉगिन' }).click();
await p.waitForTimeout(500);
check('employer coming-soon shown', await waitText(p, 'जल्द ही शुरू होगा'));

console.log('\nconsole/page errors: ' + errors.length);
for (const e of errors.slice(0, 6)) console.log('   ⚠️ ' + e.slice(0, 160));
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
await browser.close();
process.exit(fail ? 1 : 0);
