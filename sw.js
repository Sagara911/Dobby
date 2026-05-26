// Dobby service worker — online-first with offline fallback.
// Strategy:
//   Same-origin (HTML + assets) → network-first (always try fresh, fall back to cache offline)
//   Cross-origin (esm.sh / fonts / huggingface CDNs) → pass through, never cached here
// Rationale: SWR for assets used to bite users on every deploy (copy/UI changes only
// showed after a SECOND refresh). Network-first costs one extra round-trip per request
// online but matches "push = next refresh shows it" behavior of a normal website.

const CACHE = 'dobby-v41';

// Pre-cache the core shell + every tool page so the site works offline immediately.
const CORE = [
  './',
  './index.html',
  './404.html',
  './messages.html',
  './skill.html',
  './SKILL.md',
  './manifest.json',
  './assets/shared.css',
  './assets/shared.js',
  './assets/i18n-strings.js',
  './assets/icon.svg',
  './assets/anim-encoders.js',
  './assets/rife.js',
  './assets/farneback.js',
  './assets/codecs.js',
  './assets/png-crusher.worker.js',
  './assets/code-minify.worker.js',
  './tools/sprite-packer.html',
  './tools/atlas-splitter.html',
  './tools/image-optimizer.html',
  './tools/png-crusher.html',
  './tools/gif-tools.html',
  './tools/pixel-editor.html',
  './tools/sfx-maker.html',
  './tools/tilemap.html',
  './tools/lottie-tools.html',
  './tools/image-editor.html',
  './tools/color-tools.html',
  './tools/ai-cutout.html',
  './tools/watermark-remove.html',
  './tools/video-toolkit.html',
  './tools/composer.html',
  './tools/image-diff.html',
  './tools/svg-tools.html',
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
  './tools/batch-rename.html',
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

  // Network-first for ALL same-origin requests. Online: always fresh. Offline:
  // fall back to whatever's cached (HTML navigations fall back to index.html
  // so the SPA shell still loads).
  e.respondWith(
    fetch(req).then(resp => {
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(req, clone));
      } else if (resp.status === 404) {
        // server says gone — drop any stale cached copy so the next visit doesn't resurrect it
        caches.open(CACHE).then(c => c.delete(req));
      }
      return resp;
    }).catch(() => caches.match(req).then(c => c || (isHtml ? caches.match('./index.html') : undefined)))
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
