/* Nikkiflixs service worker — app-shell caching for install-to-home-screen.
   Cache-first for same-origin static assets; network-only for live odds API.
   Bump CACHE_VERSION on each release so updates propagate. */
var CACHE_VERSION = 'nikkiflixs-v77';
var SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];
var ODDS_API_HOST = 'api.the-odds-api.com';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(SHELL_URLS);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isOddsApi(url) {
  return url.hostname === ODDS_API_HOST;
}

function isCacheable(req) {
  if (req.method !== 'GET') return false;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return false; // same-origin only
  return true;
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  var url = new URL(req.url);

  // Live odds/scores: always network, never cache.
  if (isOddsApi(url)) {
    event.respondWith(fetch(req));
    return;
  }

  // Static assets: cache-first, populate runtime cache on miss.
  if (isCacheable(req)) {
    event.respondWith(
      caches.match(req, { ignoreSearch: false }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          // Only cache successful, basic (same-origin) responses.
          if (res && res.status === 200 && res.type === 'basic') {
            var copy = res.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put(req, copy);
            });
          }
          return res;
        }).catch(function () {
          // Offline fallback: serve cached shell for navigations.
          if (req.mode === 'navigate') {
            return caches.match('/index.html');
          }
          throw new Error('offline');
        });
      })
    );
    return;
  }

  // Everything else (cross-origin fonts etc.): network as normal.
  event.respondWith(fetch(req));
});
