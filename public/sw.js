/* MineSurvive service worker: offline after the first load.
 * Install precaches the page and every asset index.html references; everything else is cached as it is
 * fetched (atlas, fonts). Navigations go network-first so a new deploy is picked up, assets cache-first. */
const VERSION = 'minesurvive-v1';
const CORE = [
  './',
  './atlas/atlas.json',
  './atlas/atlas_0.png',
  './manifest.webmanifest',
  './fonts/PixelifySans-400.woff2',
  './fonts/PixelifySans-700.woff2',
  './icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(CORE);
      try {
        const res = await fetch('./index.html', { cache: 'no-cache' });
        const html = await res.clone().text();
        await cache.put('./index.html', res);
        const refs = [...html.matchAll(/(?:src|href)="(\.?\/?[^"#?]+\.(?:js|css|woff2|png|webmanifest))"/g)];
        await Promise.all(
          refs.map((m) => cache.add(m[1]).catch(() => undefined)),
        );
      } catch {
        // Offline during install: the runtime cache fills on the next online visit.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(async () => (await caches.match('./index.html', { ignoreSearch: true })) ?? (await caches.match('./'))),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreVary: true, ignoreSearch: false }).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
