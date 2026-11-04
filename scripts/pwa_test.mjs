// PWA checks: manifest, icons, service worker, offline fallback.
// Run against the production build:  npm run preview  →  node scripts/pwa_test.mjs
import { chromium } from 'playwright';

const BASE = process.env.PWA_URL || 'http://localhost:4173';
let pass = 0,
  fail = 0;
const check = (l, c, x = '') => (c ? (pass++, console.log('  ✅ ' + l)) : (fail++, console.log('  ❌ ' + l + ' ' + x)));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

console.log('\n=== PWA ===\n1. manifest');
const res = await page.goto(BASE + '/manifest.webmanifest');
check('manifest served', res.status() === 200);
const mf = await res.json();
check('short_name = कामगार', mf.short_name === 'कामगार', mf.short_name);
check('display standalone', mf.display === 'standalone');
check('start_url set', mf.start_url === '/');
check('has 192 + 512 icons', ['192x192', '512x512'].every((s) => mf.icons.some((i) => i.sizes === s)));
check('has maskable icon', mf.icons.some((i) => i.purpose === 'maskable'));
check('theme matches the app cream', mf.theme_color === '#faf6f0');
check('app shortcuts present', (mf.shortcuts || []).length >= 2);

console.log('2. icons actually exist');
for (const i of mf.icons) {
  const r = await page.request.get(BASE + i.src);
  check(`${i.src} (${i.purpose})`, r.status() === 200 && Number(r.headers()['content-length']) > 1000);
}
const apple = await page.request.get(BASE + '/apple-touch-icon.png');
check('apple-touch-icon', apple.status() === 200);

console.log('3. head tags');
await page.goto(BASE, { waitUntil: 'networkidle' });
check('manifest linked', (await page.locator('link[rel=manifest]').count()) === 1);
check('theme-color meta', (await page.locator('meta[name=theme-color]').getAttribute('content')) === '#faf6f0');
check('apple web-app meta', (await page.locator('meta[name=apple-mobile-web-app-capable]').count()) === 1);
check('lang = hi', (await page.locator('html').getAttribute('lang')) === 'hi');

console.log('4. service worker');
const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return { active: !!reg.active, scope: reg.scope, controller: !!navigator.serviceWorker.controller };
});
check('service worker active', swState.active);
check('scope is the whole app', swState.scope.endsWith('/'), swState.scope);

console.log('5. offline behaviour');
await page.waitForTimeout(1500); // let the shell cache settle
await ctx.setOffline(true);
await page.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
const bodyOffline = await page.locator('body').innerText();
const servedShell = bodyOffline.includes('कामगार');
check('app still opens offline (cached shell)', servedShell, bodyOffline.slice(0, 80));
await page.screenshot({ path: 'screenshots/pwa-offline.png', fullPage: true });

const offlinePage = await page.goto(BASE + '/offline.html', { waitUntil: 'domcontentloaded' }).catch(() => null);
check('offline fallback page cached', !!offlinePage);
if (offlinePage)
  check('offline page is in Hindi', (await page.locator('body').innerText()).includes('इंटरनेट कनेक्शन नहीं है'));

console.log('6. back online');
await ctx.setOffline(false);
await page.goto(BASE, { waitUntil: 'networkidle' });
check('live stats load again', (await page.locator('text=पंजीकृत कामगार').count()) > 0);

console.log('7. backend calls are never cached by the SW');
const swSource = await (await page.request.get(BASE + '/sw.js')).text();
check('cross-origin requests bypass the cache', swSource.includes('url.origin !== self.location.origin'));
check('non-GET requests bypass the cache', swSource.includes("request.method !== 'GET'"));

await page.screenshot({ path: 'screenshots/pwa-installable.png', fullPage: true });
await browser.close();
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
