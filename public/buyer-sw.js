// Buyer PWA service worker — caches immutable Next.js static assets only.
//
// Does NOT cache navigation (HTML), API responses, or images:
// - API caching is handled by HTTP Cache-Control headers (src/lib/server/buyer-cache-headers.ts)
// - Images are already presized/immutable at the R2 layer (see specs/image-upload-architecture.md)
// - Navigation (HTML) is intentionally never cached here — caching it would risk serving a
//   stale app shell that references old, no-longer-served hashed asset filenames after a deploy.
//
// /_next/static/* URLs are content-hashed by Next.js — a new deploy always produces new URLs,
// never reuses old ones — so caching them is always safe with zero staleness risk.

const CACHE_VERSION = 'v2';
const CACHE_NAME = `yukti-buyer-shell-${CACHE_VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isImmutableStaticAsset = url.origin === self.location.origin && url.pathname.startsWith('/_next/static/');
  if (!isImmutableStaticAsset) return; // everything else (HTML, API, images) goes straight to network

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});
