/* SSS Analytics service worker
   - Keeps a copy of the app and its CDN styling/icon files so it opens with no signal.
   - App page: tries the network first (so updates show up), but falls back to the saved copy
     if the network is offline or slower than 3 seconds (weak signal at the field). */
const VERSION = 'sss-v1';
const APP_FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const CDN_NO_CORS = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];
const CDN_CORS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2'
];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all([
      ...APP_FILES.map(u => cache.add(u).catch(() => {})),
      ...CDN_NO_CORS.map(u => fetch(new Request(u, { mode: 'no-cors' })).then(r => cache.put(u, r)).catch(() => {})),
      ...CDN_CORS.map(u => fetch(u).then(r => r.ok && cache.put(u, r)).catch(() => {}))
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(res => { clearTimeout(timer); resolve(res); }, err => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // CDN files: saved copy first, otherwise fetch and keep it
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    })());
    return;
  }

  // The app itself: network first (3s limit), saved copy as the fallback
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetchWithTimeout(req, 3000);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      } catch (err) {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
        }
        return Response.error();
      }
    })());
  }
});
