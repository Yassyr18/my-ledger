const CACHE_NAME = 'my-ledger-v3';

const ASSETS = [
  '/my-ledger/',
  '/my-ledger/index.html',
  '/my-ledger/manifest.json',
  '/my-ledger/css/style.css',
  '/my-ledger/js/utils.js',
  '/my-ledger/js/db.js',
  '/my-ledger/js/sync.js',
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

// INSTALL
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())  // ← activate immediately
  );
});

// ACTIVATE — delete ALL old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())  // ← take control immediately
  );
});

// FETCH — network first for HTML, cache first for assets
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  const isHTML = event.request.destination === 'document' ||
                 event.request.url.endsWith('.html');

  if (isHTML) {
    // HTML: try network first, fallback to cache
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache =>
            cache.put(event.request, clone)
          );
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Assets: cache first, fallback to network
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache =>
              cache.put(event.request, clone)
            );
          }
          return response;
        });
      })
    );
  }
});

// MESSAGE
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
