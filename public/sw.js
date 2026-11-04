/* कामगार service worker
 *
 * Deliberately conservative: only the app shell and hashed build assets are cached.
 * Every backend call goes to insforge.app (cross-origin) and is never touched here —
 * a worker must never see a stale हाजिरी, wage or payment out of a cache.
 */
const VERSION = 'kaamgaar-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

const SHELL_URLS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Backend / any other origin: always straight to the network, never cached.
  if (url.origin !== self.location.origin) return;

  // The offline page itself must come straight from the cache, not through the
  // navigation handler below (which would hand back the app shell instead).
  if (url.pathname === '/offline.html') {
    event.respondWith(caches.match('/offline.html').then((hit) => hit || fetch(request)));
    return;
  }

  // Page loads: network first so a fresh build is picked up, cached shell as a fallback.
  // Offline with a cached shell we still serve the real app — it renders its own Hindi
  // "इंटरनेट नहीं है" states, which beats a dead-end page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match('/', { ignoreSearch: true });
          return cached || caches.match('/offline.html');
        }),
    );
    return;
  }

  // Hashed build output: safe to serve from cache first, filename changes on every deploy.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Icons, manifest and friends: serve fast, refresh quietly in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
