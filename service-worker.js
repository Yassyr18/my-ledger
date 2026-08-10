const CACHE_NAME = 'my-ledger-v1';

const ASSETS = [
  '/my-ledger/',
  '/my-ledger/index.html',
  '/my-ledger/manifest.json',
  '/my-ledger/css/style.css',
  '/my-ledger/js/utils.js',
  '/my-ledger/js/db.js',
  '/my-ledger/js/accounts.js',
  '/my-ledger/js/transactions.js',
  '/my-ledger/js/dashboard.js',
  '/my-ledger/js/stats.js',
  '/my-ledger/js/budgets.js',
  '/my-ledger/js/goals.js',
  '/my-ledger/js/debts.js',
  '/my-ledger/js/search.js',
  '/my-ledger/js/settings.js',
  '/my-ledger/js/export.js',
  '/my-ledger/js/app.js'
];

// INSTALL — cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ACTIVATE — delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// FETCH — serve from cache first, fallback to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Only cache valid responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch(() => {
        // If fetch fails and it's a page request, serve index.html
        if (event.request.destination === 'document') {
          return caches.match('/my-ledger/index.html');
        }
      });
    })
  );
});

// MESSAGE — force update cache when new version deployed
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
