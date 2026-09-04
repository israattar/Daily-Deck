// Service worker — the reason the app opens at all with no signal.
// It keeps a copy of the app's own code (HTML/JS/CSS/fonts/icons); the DATA
// is cached separately in localStorage by api.js, because data needs the
// laptop's answers and its own freshness rules.
//
// Only registers over HTTPS (browsers refuse otherwise), which on this setup
// means the Tailscale `*.ts.net` name rather than a bare 100.x address.
const CACHE = 'daily-deck-shell-v1';

// Cache the shell as it is requested rather than guessing hashed asset names
// at install time — Vite renames every bundle on each build.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './apple-touch-icon.png']))
      .catch(() => {}) // a missing file must never block installation
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the data API — api.js owns that, and a stale reply here would
  // be indistinguishable from a fresh one.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: prefer the network so a rebuilt app is picked up, but fall
  // back to the cached page when there's no laptop to answer.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./').then((hit) => hit || caches.match(request)))
    );
    return;
  }

  // Everything else (hashed assets, fonts, icons): cache-first — the filename
  // changes when the content does, so a hit is always correct.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
