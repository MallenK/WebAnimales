const STATIC_CACHE = 'wab-static-v2';
const API_CACHE = 'wab-api-v1';
const API_MAX = 40;

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './src/app.js',
  './src/api.js',
  './src/i18n.js',
  './src/globe.js',
  './src/modal.js',
  './src/favorites.js',
  './src/history.js',
  './src/share.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Non-GET: skip
  if (request.method !== 'GET') return;

  // Static assets: cache-first
  const isStatic = STATIC_ASSETS.some(a => {
    const path = a.replace('./', '');
    return url.pathname.endsWith(path) || url.pathname === path;
  });

  if (isStatic || url.hostname === location.hostname) {
    e.respondWith(
      caches.match(request).then(cached =>
        cached || fetch(request).then(res => {
          if (res.ok) {
            caches.open(STATIC_CACHE).then(c => c.put(request, res.clone()));
          }
          return res;
        })
      )
    );
    return;
  }

  // API calls: network-first with cache fallback + LRU eviction
  const isAPI = (
    url.hostname.includes('inaturalist.org') ||
    url.hostname.includes('wikipedia.org') ||
    url.hostname.includes('xeno-canto.org')
  );

  if (isAPI) {
    e.respondWith(
      fetch(request)
        .then(async res => {
          if (res.ok) {
            const cache = await caches.open(API_CACHE);
            const keys = await cache.keys();
            if (keys.length >= API_MAX) {
              await cache.delete(keys[0]);
            }
            await cache.put(request, res.clone());
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});
