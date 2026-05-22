// High-quality WASM codecs — lazy-loaded on demand.
//
// Default compression in the toolkit uses canvas.toBlob (browser-native
// libjpeg-turbo / libpng). These engines produce noticeably smaller files
// at the same visual quality, but each is a ~200 KB-1 MB WASM download on
// first use, so the user opts in per compression run via a 压缩引擎
// selector in the tool's UI.
//
// Public surface (`window.Codecs`):
//   await Codecs.prepareJpeg() / prepareOxipng() / prepareWebp()
//     pre-warm the module without encoding anything (used by status UI)
//   await Codecs.encodeJpeg(imageData, { quality }) → Uint8Array
//   await Codecs.optimizePng(pngBytes, { level }) → Uint8Array
//   await Codecs.encodeWebp(imageData, { quality }) → Uint8Array
//   Codecs.isReady(name) — has the module finished loading once?
//
// All encoders refuse to return < 64-byte output (paranoia guard against
// the same silent-corruption class we fixed in playable-slim).

(function () {
  const MOZJPEG_URL = 'https://esm.sh/@jsquash/jpeg';
  const OXIPNG_URL  = 'https://esm.sh/@jsquash/oxipng';
  const WEBP_URL    = 'https://esm.sh/@jsquash/webp';

  const cache = new Map(); // name → module promise
  const ready = new Set(); // names that have resolved at least once

  function loadOnce(name, url) {
    let p = cache.get(name);
    if (!p) {
      p = import(/* @vite-ignore */ url).then(mod => { ready.add(name); return mod; });
      cache.set(name, p);
    }
    return p;
  }

  function prepareJpeg()   { return loadOnce('jpeg',   MOZJPEG_URL); }
  function prepareOxipng() { return loadOnce('oxipng', OXIPNG_URL); }
  function prepareWebp()   { return loadOnce('webp',   WEBP_URL); }

  async function encodeJpeg(imageData, opts = {}) {
    const mod = await prepareJpeg();
    const quality = Math.max(1, Math.min(100, Math.round((opts.quality || 0.85) * 100)));
    const out = await mod.encode(imageData, { quality });
    if (!out || out.byteLength < 64) {
      throw new Error('mozjpeg 输出过短 (' + (out?.byteLength || 0) + ' 字节)');
    }
    // Magic-byte check: JPEG starts with 0xFF 0xD8 0xFF
    const u = new Uint8Array(out, 0, 3);
    if (u[0] !== 0xFF || u[1] !== 0xD8 || u[2] !== 0xFF) {
      throw new Error('mozjpeg 输出 magic bytes 错误');
    }
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }

  async function optimizePng(pngBytes, opts = {}) {
    const mod = await prepareOxipng();
    // oxipng level: 0 = fastest, 6 = max optimize (default 2)
    const level = Math.max(0, Math.min(6, opts.level ?? 4));
    const out = await mod.optimise(pngBytes, { level, interlace: false });
    if (!out || out.byteLength < 64) {
      throw new Error('oxipng 输出过短');
    }
    const u = new Uint8Array(out, 0, 8);
    // PNG magic 89 50 4E 47 0D 0A 1A 0A
    if (u[0] !== 0x89 || u[1] !== 0x50 || u[2] !== 0x4E || u[3] !== 0x47 ||
        u[4] !== 0x0D || u[5] !== 0x0A || u[6] !== 0x1A || u[7] !== 0x0A) {
      throw new Error('oxipng 输出 magic bytes 错误');
    }
    // If oxipng produced a LARGER file (rare — happens on tiny/already-optimal
    // PNGs), fall back to the original so the caller never gets a worse result.
    if (out.byteLength >= pngBytes.byteLength) return pngBytes;
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }

  async function encodeWebp(imageData, opts = {}) {
    const mod = await prepareWebp();
    const quality = Math.max(1, Math.min(100, Math.round((opts.quality || 0.85) * 100)));
    // method 6 = slowest / smallest. lossless: opt-in via opts.lossless.
    const cfg = opts.lossless
      ? { lossless: 1, quality: 100, method: 6 }
      : { quality, method: 6 };
    const out = await mod.encode(imageData, cfg);
    if (!out || out.byteLength < 64) {
      throw new Error('webp 输出过短');
    }
    // WebP magic: "RIFF" .... "WEBP" — bytes 0-3 = "RIFF", 8-11 = "WEBP"
    const u = new Uint8Array(out, 0, 12);
    const okRiff = u[0]===0x52 && u[1]===0x49 && u[2]===0x46 && u[3]===0x46;
    const okWebp = u[8]===0x57 && u[9]===0x45 && u[10]===0x42 && u[11]===0x50;
    if (!okRiff || !okWebp) throw new Error('webp 输出 magic bytes 错误');
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }

  function isReady(name) { return ready.has(name); }

  window.Codecs = {
    prepareJpeg, prepareOxipng, prepareWebp,
    encodeJpeg, optimizePng, encodeWebp,
    isReady,
  };
})();
