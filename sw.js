/* Service worker: network-first so updates reach users immediately; cache is only a
   fallback for offline. Bump CACHE on any change to force old caches to clear. */
const CACHE = 'shubh-quote-v31';
const SHELL = ['./', 'index.html', 'styles.css', 'firebase-config.js', 'clientdata.js',
  'quotedoc.js', 'cloud.js', 'app.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'fonts/fonts.css', 'data/catalog.csv'];

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
/* Only a genuine, final, same-origin 200 is worth keeping.
   Behind an access proxy (Cloudflare Access and the like) an expired session
   answers a request for data/catalog.csv with a login page. Caching that would
   poison the catalogue with HTML and leave the app looking empty, with nothing
   on screen to explain why and no way out but clearing site data.
     - !resp.ok        drops 4xx/5xx, including the proxy's own challenges
     - resp.redirected drops anything that bounced through a login host
     - type 'basic'    drops opaque cross-origin responses
     - 'no-store'      respects what the server asked us not to keep */
function cacheable(resp) {
  if (!resp || !resp.ok || resp.redirected) return false;
  if (resp.type !== 'basic') return false;
  return !/no-store/i.test(resp.headers.get('Cache-Control') || '');
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Only handle our own origin. Cross-origin requests (Firebase SDK, Firestore, fonts) go
  // straight to the network untouched — the SW must never intercept or cache those.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  // Network-first: always try the network (so the latest code/data is served), then cache.
  e.respondWith(
    fetch(e.request).then(resp => {
      if (cacheable(resp)) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return resp;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
