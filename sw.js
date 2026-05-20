// Playable Toolkit service worker — offline-first cache for the whole site.
// Strategy: cache-first for same-origin assets, network-first for everything else.

const CACHE = 'toolkit-v3';

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
  './tools/sprite-packer.html',
  './tools/atlas-splitter.html',
  './tools/image-optimizer.html',
  './tools/png-crusher.html',
  './tools/gif-maker.html',
  './tools/gif-editor.html',
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
  './tools/slim-coach.html'
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
  // Don't cache cross-origin CDN responses (transformers.js, esm.sh, hugging face) —
  // they're large and already cached by the browser, plus we don't want stale lib versions.
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then(cached => {
      // network-first for HTML so updates show up; cache-first for assets.
      const isHtml = req.headers.get('accept')?.includes('text/html');
      if (isHtml) {
        return fetch(req).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return resp;
        }).catch(() => cached || caches.match('./index.html'));
      }
      // cache-first for assets
      if (cached) return cached;
      return fetch(req).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return resp;
      });
    })
  );
});

// Allow page to trigger a manual cache update / reset.
self.addEventListener('message', (e) => {
  if (e.data === 'reset-cache') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
