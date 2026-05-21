// Playable Toolkit service worker — offline-first cache for the whole site.
// Strategy:
//   HTML same-origin → network-first (always try fresh; fall back to cache offline)
//   Assets same-origin → stale-while-revalidate (serve cache instantly, update in background)
//   Cross-origin (esm.sh / fonts / huggingface CDNs) → pass through, never cached here

const CACHE = 'toolkit-v13';

// Pre-cache the core shell + every tool page so the site works offline immediately.
const CORE = [
  './',
  './index.html',
  './404.html',
  './manifest.json',
  './assets/shared.css',
  './assets/shared.js',
  './assets/icon.svg',
  './assets/anim-encoders.js',
  './assets/png-crusher.worker.js',
  './assets/code-minify.worker.js',
  './tools/sprite-packer.html',
  './tools/atlas-splitter.html',
  './tools/image-optimizer.html',
  './tools/png-crusher.html',
  './tools/gif-tools.html',
  './tools/image-editor.html',
  './tools/color-tools.html',
  './tools/ai-cutout.html',
  './tools/watermark-remove.html',
  './tools/video-toolkit.html',
  './tools/composer.html',
  './tools/html-inliner.html',
  './tools/base64.html',
  './tools/qr-gen.html',
  './tools/font-subset.html',
  './tools/audio-compress.html',
  './tools/bundle-analyzer.html',
  './tools/channel-check.html',
  './tools/code-minify.html',
  './tools/slim-coach.html',
  './tools/zip-packer.html',
  './tools/playable-slim.html'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE).catch(err => {
      console.warn('[sw] pre-cache partial failure:', err);
    }))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Don't intercept cross-origin (transformers.js, esm.sh, hugging face, fonts).
  if (url.origin !== location.origin) return;

  const isHtml = req.headers.get('accept')?.includes('text/html')
                 || /\.html?$/i.test(url.pathname)
                 || url.pathname.endsWith('/');

  if (isHtml) {
    // network-first for HTML — always try fresh, fall back to cache offline.
    e.respondWith(
      fetch(req).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        } else if (resp.status === 404) {
          // file deleted from server — purge any stale cached copy so future loads stop serving it
          caches.open(CACHE).then(c => c.delete(req));
        }
        return resp;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // stale-while-revalidate for assets:
  //  - serve cache immediately so the page loads instantly
  //  - simultaneously fetch a fresh copy in the background and replace the cache
  //  - the NEXT page load gets the updated asset
  e.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        } else if (resp.status === 404) {
          // server says gone — drop any stale cached copy so the next visit doesn't resurrect it
          caches.open(CACHE).then(c => c.delete(req));
        }
        return resp;
      }).catch(() => null);
      return cached || networkFetch;
    })
  );
});

// Allow page to trigger a manual cache update / reset.
self.addEventListener('message', (e) => {
  if (e.data === 'reset-cache') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  } else if (e.data === 'skip-waiting') {
    self.skipWaiting();
  }
});
