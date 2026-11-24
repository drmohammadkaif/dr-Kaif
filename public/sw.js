// Dr. Kaif service worker: makes the app open instantly and work with no internet.
// Bump VERSION when you change the app so phones pick up the new files.
const VERSION = 'drkaif-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png', '/icons/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return; // never cache the API

  // Page loads: try the network first (so updates arrive), fall back to the saved copy when offline or slow.
  if (req.mode === 'navigate') {
    event.respondWith(
      new Promise((resolve) => {
        let settled = false;
        const fallback = () => caches.match('/index.html').then((r) => r || caches.match('/'));
        const timer = setTimeout(() => { if (!settled) fallback().then((r) => { if (r && !settled) { settled = true; resolve(r); } }); }, 3500);
        fetch(req).then((res) => {
          clearTimeout(timer);
          if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('/index.html', copy)); }
          if (!settled) { settled = true; resolve(res); }
        }).catch(() => { clearTimeout(timer); if (!settled) fallback().then((r) => { settled = true; resolve(r || Response.error()); }); });
      })
    );
    return;
  }

  // Other files (icons, manifest): serve the saved copy, refresh it in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
