// Filter — service worker
// Handles: OS-level push notifications, notification click routing, and
// basic install/offline shell support so the app can be added to the
// home screen like a native app.

const CACHE_NAME = 'filter-shell-2026-10-24-01';
// Push payloads use app-absolute paths like '/' or '/?tab=orders'. Map them onto
// this SW's scope so they work at the domain root (Netlify) and under /filter/ (GitHub Pages).
function appUrl(u){ try { const scope = self.registration.scope; if (!u || u === '/') return scope; if (/^https?:/i.test(u)) return u; return new URL(u.replace(/^\//, ''), scope).href; } catch (e) { return self.registration.scope; } }
const STATIC_ASSETS = ['./icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './manifest.json'];

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(STATIC_ASSETS)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('filter-shell') && k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Same-origin only. Icons/manifest: cache-first. The page itself: always
// network first (so updates show immediately), cached copy only when offline.
// Supabase API calls are cross-origin and are never touched.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('version.json') || url.pathname.endsWith('sw.js')) return; // always network
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    if (url.search.includes('_=')) return; // version checks go straight to network
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const c = await caches.open(CACHE_NAME); c.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }
  if (STATIC_ASSETS.some((a) => url.pathname.endsWith(a.slice(1)))) {
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((resp) => {
      const copy = resp.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, copy)); return resp;
    })));
  }
});

// Show a real OS notification when the server pushes one to us.
self.addEventListener('push', (event) => {
  let data = { title: 'Filter', body: 'You have an update.', url: '/' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [80, 40, 80],
    data: { url: data.url || '/' },
    tag: data.tag || 'filter-notification',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Filter', options));
});

// Focus (or open) the app when a notification is tapped.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = appUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then((c) => (c || client).navigate ? (c || client).navigate(targetUrl).catch(() => c) : c).catch(() => self.clients.openWindow && self.clients.openWindow(targetUrl));
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
