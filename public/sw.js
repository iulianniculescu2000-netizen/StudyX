// StudyX Service Worker — PWA offline shell
// Strategy:
//   - navigation (HTML): network-first, fallback to cached app shell (offline launch)
//   - same-origin static assets: stale-while-revalidate (fast + self-updating)
//   - cross-origin (AI APIs, CDNs): never intercepted — pass straight to network
// Assets use fixed filenames (no content hash), so SWR is required to avoid
// serving stale JS/CSS forever after a deploy.

const VERSION = 'v1.0.6';
const SHELL_CACHE = `studyx-shell-${VERSION}`;
const ASSET_CACHE = `studyx-assets-${VERSION}`;

// Resolve relative to the SW scope so it works at root or on a subpath.
const SHELL_URLS = ['./', './index.html', './manifest.json', './favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is atomic — one 404 fails the whole install. Cache individually
      // and ignore misses so a renamed asset never blocks activation.
      await Promise.all(
        SHELL_URLS.map((url) => cache.add(url).catch(() => undefined))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only handle our own origin — let AI API / third-party calls go to network untouched.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

// Navigation: fresh HTML when online, cached shell when offline.
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    cache.put('./index.html', response.clone());
    return response;
  } catch {
    return (
      (await cache.match('./index.html')) ||
      (await cache.match('./')) ||
      new Response('Offline', { status: 503, statusText: 'Offline' })
    );
  }
}

// Assets: serve cache immediately, refresh in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || new Response('', { status: 504 });
}
