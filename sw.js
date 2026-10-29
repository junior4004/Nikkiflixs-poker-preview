var CACHE = 'nikkiflixs-v280';
var ASSETS = [
  '/',
  '/index.html',
  '/assets/rooms/poker/table-emerald-FINAL.html',
  '/assets/rooms/poker/table-red-3d-v2.html'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.map(function(n) {
        if (n !== CACHE) return caches.delete(n);
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  var isPage = e.request.mode === 'navigate' || /\.html$/.test(url.pathname) || ASSETS.indexOf(url.pathname) >= 0;
  if (isPage) {
    // HTML pages: NETWORK FIRST. A poker table served stale from cache is a
    // broken table — always try the live page, cache only as offline fallback.
    e.respondWith(
      fetch(e.request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE).then(function(cache) {
          cache.put(e.request, clone);
        });
        return response;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }
  // Static assets: cache-first (fast), refreshed on cache version bumps.
  e.respondWith(
    caches.match(e.request).then(function(resp) {
      return resp || fetch(e.request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE).then(function(cache) {
          cache.put(e.request, clone);
        });
        return response;
      });
    })
  );
});
