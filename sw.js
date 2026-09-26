// Offline support. App files: network first (so updates show), cache as fallback.
// Data files (rates/news) are also cached, so the last good copy works offline.
const CACHE = 'paysa-v3';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest',
  'css/fonts.css', 'css/styles.css',
  'js/app.js', 'js/engine.js', 'js/validate.js',
  'assets/icon.svg',
  'assets/fonts/geist-latin-wght-normal.woff2', 'assets/fonts/geist-latin-ext-wght-normal.woff2',
  'assets/fonts/geist-mono-latin-400-normal.woff2',
  'assets/fonts/instrument-serif-latin-400-normal.woff2', 'assets/fonts/instrument-serif-latin-400-italic.woff2',
  'assets/fonts/instrument-serif-latin-ext-400-normal.woff2', 'assets/fonts/instrument-serif-latin-ext-400-italic.woff2',
  'data/rates.json', 'data/news.json',
];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // never touch other sites
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
