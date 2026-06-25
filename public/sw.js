// Minimal service worker — its presence (with a fetch handler) satisfies PWA install criteria on
// Chrome/Android. Deliberately network-passthrough: this is a frequently-updated marketplace with
// authed/dynamic content, so we do NOT cache app shells or API responses (which would serve stale
// listings, prices, or someone else's authed data). Offline support can be layered on later.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Intentionally no respondWith — let the browser handle every request normally.
});
