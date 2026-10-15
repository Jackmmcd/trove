/* Trove service worker.
 *
 * Scope is deliberately narrow. This app shows account balances, live quotes
 * and positions, so the one rule that outranks every offline nicety is:
 *
 *     NEVER serve a cached API response.
 *
 * A stale number here is not a degraded experience, it is a wrong one — a
 * portfolio value from an hour ago is indistinguishable from a current one on
 * screen. So /api/* is passed straight through to the network, always, and the
 * cache only ever holds content-hashed build assets and the offline page.
 */

const VERSION = 'trove-v1';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll([OFFLINE_URL]))
      // A failed precache must not wedge the install; the app still works
      // online without an offline page.
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Build output is content-hashed, so it can be cached permanently and safely. */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/_next/static/')
    || url.pathname.startsWith('/icons/')
    || url.pathname === '/apple-icon'
    || /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only GET, only this origin. Anything else (POST orders, the Analyst's
  // streaming chat, cross-origin quotes) goes to the network untouched.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // The rule at the top of this file.
  if (url.pathname.startsWith('/api/')) return;

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(res => {
        // Only store complete, successful responses — a cached opaque or
        // partial response would be served forever.
        if (res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then(c => c.put(request, copy)).catch(() => {});
        }
        return res;
      })),
    );
    return;
  }

  // Pages: always try the network first so the markup is current, and fall
  // back to the offline page only when the device is genuinely offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then(
        hit => hit || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }),
      )),
    );
  }
});
