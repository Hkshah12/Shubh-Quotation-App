/* Service worker: network-first so updates reach users immediately; cache is only a
   fallback for offline. Bump CACHE on any change to force old caches to clear. */
const CACHE = 'shubh-quote-v19';
const SHELL = ['./', 'index.html', 'styles.css', 'firebase-config.js', 'clientdata.js',
  'quotedoc.js', 'cloud.js', 'app.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Only handle our own origin. Cross-origin requests (Firebase SDK, Firestore, fonts) go
  // straight to the network untouched — the SW must never intercept or cache those.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  // Network-first: always try the network (so the latest code/data is served), then cache.
  e.respondWith(
    fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
