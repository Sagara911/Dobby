// Web Worker: 把 PNG Crusher 的 median-cut + dither + palette PNG 编码
// 推到独立线程,避免主线程卡顿。
//
// 接收消息:{ id, imageData, opts: { nColors, dither, kmeans, perceptual, alphaMode, alphaThresh } }
// 回复消息:{ id, ok: true, png: Uint8Array } 或 { id, ok: false, error: string }
//          + 中间进度:{ id, progress: 0..1, status: '...' }

self.onmessage = async (e) => {
  const { id, imageData, opts } = e.data;
  try {
    const png = await crushPng(imageData, opts, (pct, status) => {
      self.postMessage({ id, progress: pct, status });
    });
    self.postMessage({ id, ok: true, png }, [png.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message });
  }
};

async function crushPng(imageData, opts, onProgress) {
  const { width: w, height: h, data: src } = imageData;
  const { nColors, dither, kmeans, perceptual, alphaMode, alphaThresh } = opts;

  // Skip the copy when alphaMode === 'keep' — we never mutate the buffer in
  // that path, and a copy of an 8K spritesheet's pixel data is 256MB on its
  // own. With alpha threshold/discard we mutate in place on src (the main
  // thread already transferred ownership to us).
  let pixels;
  if (alphaMode === 'threshold') {
    pixels = src;
    for (let i = 3; i < pixels.length; i += 4) {
      pixels[i] = pixels[i] >= alphaThresh ? 255 : 0;
    }
  } else if (alphaMode === 'discard') {
    pixels = src;
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  } else {
    pixels = src;
  }

  const W = perceptual
    ? { r: 0.299, g: 0.587, b: 0.114, a: 0.5 }
    : { r: 1, g: 1, b: 1, a: 1 };

  onProgress(0.1, '构建调色板...');
  let palette = buildPalette4D(pixels, w, h, nColors, W);

  if (kmeans) {
    onProgress(0.3, 'K-means 精炼...');
    palette = refinePaletteKMeans(pixels, w, h, palette, 5, W);
  }

  onProgress(0.6, dither ? '映射像素 (Floyd-Steinberg)...' : '映射像素...');
  const indices = dither
    ? mapWithDither(pixels, w, h, palette, W)
    : mapNearest(pixels, w, h, palette, W);

  onProgress(0.85, '编码 PNG...');
  const png = await encodePalettePng(indices, w, h, palette);
  onProgress(1, '完成');
  return png;
}

function buildPalette4D(pixels, w, h, maxColors, W) {
  const total = w * h;
  const target = 50000;
  const stride = Math.max(1, Math.floor(total / target));
  const samples = [];
  let counter = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (counter++ % stride === 0) samples.push([pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]]);
  }
  if (!samples.length) return [{ r: 0, g: 0, b: 0, a: 0 }];
  const boxes = [{ pixels: samples }];
  const weights = [W.r, W.g, W.b, W.a];
  while (boxes.length < maxColors) {
    let bestIdx = -1, bestRange = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].pixels.length < 2) continue;
      const r = boxRange4(boxes[i], weights);
      if (r.max > bestRange) { bestRange = r.max; bestIdx = i; }
    }
    if (bestIdx < 0) break;
    const { channel } = boxRange4(boxes[bestIdx], weights);
    boxes[bestIdx].pixels.sort((a, b) => a[channel] - b[channel]);
    const mid = boxes[bestIdx].pixels.length >> 1;
    boxes.splice(bestIdx, 1,
      { pixels: boxes[bestIdx].pixels.slice(0, mid) },
      { pixels: boxes[bestIdx].pixels.slice(mid) });
  }
  return boxes.map(box => {
    let r = 0, g = 0, b = 0, a = 0;
    for (const p of box.pixels) { r += p[0]; g += p[1]; b += p[2]; a += p[3]; }
    const n = box.pixels.length;
    return { r: Math.round(r/n), g: Math.round(g/n), b: Math.round(b/n), a: Math.round(a/n) };
  });
}

function boxRange4(box, weights) {
  let min = [255,255,255,255], max = [0,0,0,0];
  for (const p of box.pixels) {
    for (let c = 0; c < 4; c++) {
      if (p[c] < min[c]) min[c] = p[c];
      if (p[c] > max[c]) max[c] = p[c];
    }
  }
  let rangeMax = -1, channel = 0;
  for (let c = 0; c < 4; c++) {
    const r = (max[c] - min[c]) * weights[c];
    if (r > rangeMax) { rangeMax = r; channel = c; }
  }
  return { max: rangeMax, channel };
}

function refinePaletteKMeans(pixels, w, h, initialPalette, iterations, W) {
  const total = w * h;
  const target = 50000;
  const stride = Math.max(1, Math.floor(total / target));
  const samples = [];
  let counter = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (counter++ % stride === 0) samples.push([pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]]);
  }
  if (!samples.length) return initialPalette;
  let centers = initialPalette.map(p => [p.r, p.g, p.b, p.a]);
  const pn = centers.length;
  const assignment = new Int32Array(samples.length);
  for (let iter = 0; iter < iterations; iter++) {
    let changed = 0;
    for (let s = 0; s < samples.length; s++) {
      const [r, g, b, a] = samples[s];
      let best = 0, bestD = Infinity;
      for (let k = 0; k < pn; k++) {
        const c = centers[k];
        const dr = (r - c[0]), dg = (g - c[1]), db = (b - c[2]), da = (a - c[3]);
        const d = W.r*dr*dr + W.g*dg*dg + W.b*db*db + W.a*da*da;
        if (d < bestD) { bestD = d; best = k; }
      }
      if (assignment[s] !== best) { assignment[s] = best; changed++; }
    }
    if (changed === 0) break;
    const sums = Array.from({ length: pn }, () => [0, 0, 0, 0]);
    const counts = new Int32Array(pn);
    for (let s = 0; s < samples.length; s++) {
      const k = assignment[s];
      const p = samples[s];
      sums[k][0] += p[0]; sums[k][1] += p[1]; sums[k][2] += p[2]; sums[k][3] += p[3];
      counts[k]++;
    }
    for (let k = 0; k < pn; k++) {
      if (counts[k] > 0) {
        centers[k][0] = sums[k][0] / counts[k];
        centers[k][1] = sums[k][1] / counts[k];
        centers[k][2] = sums[k][2] / counts[k];
        centers[k][3] = sums[k][3] / counts[k];
      }
    }
  }
  return centers.map(c => ({
    r: Math.round(c[0]), g: Math.round(c[1]),
    b: Math.round(c[2]), a: Math.round(c[3])
  }));
}

function mapNearest(pixels, w, h, palette, W) {
  const out = new Uint8Array(w * h);
  const pn = palette.length;
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    out[i] = nearestPaletteIndex(pixels[j], pixels[j+1], pixels[j+2], pixels[j+3], palette, pn, W);
  }
  return out;
}

function nearestPaletteIndex(r, g, b, a, palette, pn, W) {
  let best = 0, bestD = Infinity;
  for (let k = 0; k < pn; k++) {
    const p = palette[k];
    const dr = r - p.r, dg = g - p.g, db = b - p.b, da = a - p.a;
    const d = W.r*dr*dr + W.g*dg*dg + W.b*db*db + W.a*da*da;
    if (d < bestD) { bestD = d; best = k; if (d === 0) break; }
  }
  return best;
}

// Streaming Floyd-Steinberg: only the current row + next row's error buffer
// are kept in memory (2 × w × 4 floats), instead of the whole w·h·4 working
// buffer the previous version allocated. For a 4K spritesheet this drops the
// dither working set from ~268MB to ~256KB — fixes the "Array buffer
// allocation failed" OOM in Workers on large images. Output is identical:
// same FS error distribution (7/16, 3/16, 5/16, 1/16).
function mapWithDither(pixels, w, h, palette, W) {
  const out = new Uint8Array(w * h);
  const pn = palette.length;
  const rowFloats = w * 4;
  // current row working values (source pixels + accumulated incoming error)
  let cur = new Float32Array(rowFloats);
  // next row accumulated incoming error (added to baseline pixels at row swap)
  let nxt = new Float32Array(rowFloats);
  // bootstrap row 0
  for (let i = 0; i < rowFloats; i++) cur[i] = pixels[i];

  for (let y = 0; y < h; y++) {
    const outRow = y * w;
    for (let x = 0; x < w; x++) {
      const idx = x * 4;
      const r = cur[idx], g = cur[idx+1], b = cur[idx+2], a = cur[idx+3];
      const pi = nearestPaletteIndex(
        Math.max(0, Math.min(255, r)),
        Math.max(0, Math.min(255, g)),
        Math.max(0, Math.min(255, b)),
        Math.max(0, Math.min(255, a)), palette, pn, W);
      out[outRow + x] = pi;
      const p = palette[pi];
      const er = r - p.r, eg = g - p.g, eb = b - p.b, ea = a - p.a;
      // forward to (x+1, y) in current row
      if (x + 1 < w) {
        const k = idx + 4;
        const f = 7 / 16;
        cur[k]   += er * f;
        cur[k+1] += eg * f;
        cur[k+2] += eb * f;
        cur[k+3] += ea * f;
      }
      // diffuse to next row
      if (y + 1 < h) {
        if (x - 1 >= 0) {
          const k = idx - 4;
          const f = 3 / 16;
          nxt[k]   += er * f;
          nxt[k+1] += eg * f;
          nxt[k+2] += eb * f;
          nxt[k+3] += ea * f;
        }
        {
          const f = 5 / 16;
          nxt[idx]   += er * f;
          nxt[idx+1] += eg * f;
          nxt[idx+2] += eb * f;
          nxt[idx+3] += ea * f;
        }
        if (x + 1 < w) {
          const k = idx + 4;
          const f = 1 / 16;
          nxt[k]   += er * f;
          nxt[k+1] += eg * f;
          nxt[k+2] += eb * f;
          nxt[k+3] += ea * f;
        }
      }
    }
    // advance: cur := pixels(y+1) + nxt;  nxt := zero
    if (y + 1 < h) {
      const base = (y + 1) * rowFloats;
      const tmp = cur;
      cur = nxt;
      nxt = tmp;
      for (let i = 0; i < rowFloats; i++) {
        cur[i] += pixels[base + i];  // cur was nxt (with accumulated error)
        nxt[i] = 0;                  // nxt was old cur, clear for fresh accumulation
      }
    }
  }
  return out;
}

async function encodePalettePng(indices, w, h, palette) {
  const lineLen = w + 1;
  const scan = new Uint8Array(h * lineLen);
  for (let y = 0; y < h; y++) {
    scan[y * lineLen] = 0;
    scan.set(indices.subarray(y * w, (y + 1) * w), y * lineLen + 1);
  }
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(scan);
  writer.close();
  const idat = new Uint8Array(await new Response(cs.readable).arrayBuffer());

  const chunks = [];
  let totalLen = 0;
  function pushArr(arr) {
    const u = arr instanceof Uint8Array ? arr : new Uint8Array(arr);
    chunks.push(u); totalLen += u.length;
  }
  pushArr([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w, false); dv.setUint32(4, h, false);
  ihdr[8] = 8; ihdr[9] = 3;
  pushArr(buildChunk('IHDR', ihdr));

  // PLTE
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((p, i) => { plte[i*3] = p.r; plte[i*3+1] = p.g; plte[i*3+2] = p.b; });
  pushArr(buildChunk('PLTE', plte));

  // tRNS
  let lastNon255 = -1;
  for (let i = 0; i < palette.length; i++) if (palette[i].a < 255) lastNon255 = i;
  if (lastNon255 >= 0) {
    const trns = new Uint8Array(lastNon255 + 1);
    for (let i = 0; i <= lastNon255; i++) trns[i] = palette[i].a;
    pushArr(buildChunk('tRNS', trns));
  }

  pushArr(buildChunk('IDAT', idat));
  pushArr(buildChunk('IEND', new Uint8Array(0)));

  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function buildChunk(type, data) {
  const len = data.length;
  const buf = new Uint8Array(8 + len + 4);
  buf[0] = (len >> 24) & 0xFF;
  buf[1] = (len >> 16) & 0xFF;
  buf[2] = (len >> 8) & 0xFF;
  buf[3] = len & 0xFF;
  buf[4] = type.charCodeAt(0); buf[5] = type.charCodeAt(1);
  buf[6] = type.charCodeAt(2); buf[7] = type.charCodeAt(3);
  buf.set(data, 8);
  const crcData = new Uint8Array(4 + data.length);
  crcData[0] = buf[4]; crcData[1] = buf[5]; crcData[2] = buf[6]; crcData[3] = buf[7];
  crcData.set(data, 4);
  const crc = crc32(crcData);
  buf[8+len]   = (crc >>> 24) & 0xFF;
  buf[8+len+1] = (crc >>> 16) & 0xFF;
  buf[8+len+2] = (crc >>> 8) & 0xFF;
  buf[8+len+3] = crc & 0xFF;
  return buf;
}

let _crcTable;
function crc32(data) {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      _crcTable[i] = c;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ _crcTable[(crc ^ data[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
