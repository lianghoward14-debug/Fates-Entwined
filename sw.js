// Minimal service worker for Chrome PWA installability
const CACHE_NAME = 'fates-entwined-v9-deck-preview-refresh';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('fates-entwined-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy for a game that may update often
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
