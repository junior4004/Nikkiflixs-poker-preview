var CACHE = 'nikkiflixs-v300';
var ASSETS = [
  '/',
  '/index.html',
  '/assets/rooms/poker/table-emerald-FINAL.html',
  '/assets/rooms/poker/table-red-3d-v2.html'
];

// FIX for stale builds (Jerry, 2026-11-02): the v287 worker had two traps.
// 1. install() failed outright if ANY precache fetch failed (e.g. during the
//    GitHub Pages propagation window), so the new worker never activated and
//    the OLD worker kept serving old files indefinitely.
// 2. Static assets were cache-first, so avatars/felt/sfx stayed old even
//    when the HTML page itself was fresh.
// This version: install never fails on a precache miss, and EVERY request
// under scope is network-first with the HTTP cache bypassed, falling back
// to the saved copy only when the network actually fails. Fresh beats fast.

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(ASSETS).catch(function() {
        // One asset failing must not block the whole update.
        return null;
      });
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
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(new Request(e.request, { cache: 'reload' })).then(function(response) {
      var clone = response.clone();
      caches.open(CACHE).then(function(cache) {
        cache.put(e.request, clone);
      });
      return response;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
