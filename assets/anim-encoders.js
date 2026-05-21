// GIF89a + APNG encoders. Both ~self-contained, no deps on Toolkit.
// Used by gif-maker.html and gif-editor.html.
//
// Public API:
//   AnimEncoders.buildGif(frames, opts) -> Promise<Blob>
//   AnimEncoders.buildApng(frames, opts) -> Promise<Blob>
//
// frames: array of { bitmap | canvas, w, h }
//   Each frame must be the same width/height (use opts.w / opts.h to verify).
//
// opts (both):
//   fps:        playback fps (default 12)
//   loop:       repeat count (0 = infinite, default 0)
//   onProgress: (pct: 0..1) => void
//   onStatus:   (msg) => void
//   yieldUi:    async tick yield (default 0-ms setTimeout)
// opts (gif only):
//   paletteMode: 'median' | 'uniform' (default 'median')

(function () {
  function defaultYield() { return new Promise(r => setTimeout(r, 0)); }
  const noop = () => {};

  function frameImageData(f) {
    const cv = document.createElement('canvas');
    cv.width = f.w; cv.height = f.h;
    cv.getContext('2d').drawImage(f.bitmap || f.canvas, 0, 0);
    return cv.getContext('2d').getImageData(0, 0, f.w, f.h);
  }

  // =========================================================================
  // GIF89a encoder
  // =========================================================================
  async function buildGif(frames, opts = {}) {
    const fps = opts.fps || 12;
    const loop = opts.loop || 0;
    const paletteMode = opts.paletteMode || 'median';
    const onProgress = opts.onProgress || noop;
    const onStatus = opts.onStatus || noop;
    const yieldUi = opts.yieldUi || defaultYield;
    const w = frames[0].w, h = frames[0].h;
    const delays = opts.delays || null; // per-frame delay in centiseconds, optional

    onStatus('采样像素 / 量化调色板...');
    await yieldUi();

    const framePixels = frames.map(frameImageData);

    let palette;
    if (paletteMode === 'uniform') palette = buildUniformPalette();
    else palette = buildMedianCutPalette(framePixels, 256);

    onStatus(`调色板 ${palette.length / 3} 色,开始 LZW 编码...`);
    await yieldUi();

    const out = new ByteSink();
    out.writeBytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
    out.writeU16(w); out.writeU16(h);
    const colorBits = Math.max(1, Math.ceil(Math.log2(palette.length / 3)));
    const tableSize = 1 << colorBits;
    out.writeU8(0x80 | ((colorBits - 1) << 4) | (colorBits - 1));
    out.writeU8(0); out.writeU8(0);
    out.writeBytes(palette);
    for (let i = palette.length; i < tableSize * 3; i++) out.writeU8(0);

    if (frames.length > 1) {
      out.writeBytes([0x21, 0xFF, 0x0B]);
      out.writeBytes([0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30]);
      out.writeBytes([0x03, 0x01]);
      out.writeU16(loop);
      out.writeU8(0);
    }

    const defaultDelay = Math.max(2, Math.round(100 / fps));
    for (let i = 0; i < frames.length; i++) {
      const delay = delays ? Math.max(2, delays[i]) : defaultDelay;
      out.writeBytes([0x21, 0xF9, 0x04, 0x00]);
      out.writeU16(delay);
      out.writeU8(0); out.writeU8(0);
      out.writeU8(0x2C);
      out.writeU16(0); out.writeU16(0);
      out.writeU16(w); out.writeU16(h);
      out.writeU8(0);

      const indices = mapToPalette(framePixels[i], palette);
      lzwEncode(indices, colorBits, out);

      onProgress((i + 1) / frames.length);
      if ((i & 7) === 7) await yieldUi();
    }
    out.writeU8(0x3B);
    return new Blob([out.toUint8Array()], { type: 'image/gif' });
  }

  function buildUniformPalette() {
    const p = [];
    for (let r = 0; r < 6; r++)
      for (let g = 0; g < 6; g++)
        for (let b = 0; b < 6; b++)
          p.push(r * 51, g * 51, b * 51);
    for (let i = 0; i < 16; i++) {
      const v = Math.round(i * 255 / 15);
      p.push(v, v, v);
    }
    return p;
  }

  function buildMedianCutPalette(framePixels, maxColors) {
    const samples = [];
    const target = 50000;
    const totalPixels = framePixels.reduce((s, p) => s + p.width * p.height, 0);
    const stride = Math.max(1, Math.floor(totalPixels / target));
    let counter = 0;
    for (const img of framePixels) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        if (counter++ % stride === 0) samples.push([d[i], d[i+1], d[i+2]]);
      }
    }
    if (!samples.length) return [0, 0, 0];
    const boxes = [{ pixels: samples }];
    while (boxes.length < maxColors) {
      let bestIdx = -1, bestRange = -1;
      for (let i = 0; i < boxes.length; i++) {
        const r = boxRange(boxes[i]);
        if (r.max > bestRange && boxes[i].pixels.length > 1) {
          bestRange = r.max; bestIdx = i;
        }
      }
      if (bestIdx < 0) break;
      boxes.splice(bestIdx, 1, ...splitBox(boxes[bestIdx]));
    }
    const palette = [];
    for (const box of boxes) {
      const avg = [0, 0, 0];
      for (const p of box.pixels) { avg[0] += p[0]; avg[1] += p[1]; avg[2] += p[2]; }
      palette.push(
        Math.round(avg[0] / box.pixels.length),
        Math.round(avg[1] / box.pixels.length),
        Math.round(avg[2] / box.pixels.length)
      );
    }
    return palette;
  }

  function boxRange(box) {
    let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
    for (const p of box.pixels) {
      if (p[0] < minR) minR = p[0]; if (p[0] > maxR) maxR = p[0];
      if (p[1] < minG) minG = p[1]; if (p[1] > maxG) maxG = p[1];
      if (p[2] < minB) minB = p[2]; if (p[2] > maxB) maxB = p[2];
    }
    const rangeR = maxR - minR, rangeG = maxG - minG, rangeB = maxB - minB;
    const max = Math.max(rangeR, rangeG, rangeB);
    const channel = max === rangeR ? 0 : (max === rangeG ? 1 : 2);
    return { max, channel };
  }
  function splitBox(box) {
    const { channel } = boxRange(box);
    box.pixels.sort((a, b) => a[channel] - b[channel]);
    const mid = box.pixels.length >> 1;
    return [{ pixels: box.pixels.slice(0, mid) }, { pixels: box.pixels.slice(mid) }];
  }
  function mapToPalette(imageData, palette) {
    const data = imageData.data;
    const n = data.length / 4;
    const out = new Uint8Array(n);
    const pn = palette.length / 3;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = data[j], g = data[j+1], b = data[j+2];
      let best = 0, bestD = Infinity;
      for (let k = 0; k < pn; k++) {
        const dr = r - palette[k*3], dg = g - palette[k*3+1], db = b - palette[k*3+2];
        const d = dr*dr + dg*dg + db*db;
        if (d < bestD) { bestD = d; best = k; if (d === 0) break; }
      }
      out[i] = best;
    }
    return out;
  }

  function lzwEncode(indices, colorBits, out) {
    const minCodeSize = Math.max(2, colorBits);
    out.writeU8(minCodeSize);
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    const dict = new Map();
    const blocks = new BlockWriter(out);
    const bits = new BitPacker(blocks);
    function resetDict() { dict.clear(); codeSize = minCodeSize + 1; nextCode = eoiCode + 1; }
    bits.writeBits(clearCode, codeSize);
    resetDict();
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      if (dict.has(key)) prefix = dict.get(key);
      else {
        bits.writeBits(prefix, codeSize);
        if (nextCode < 4096) {
          dict.set(key, nextCode); nextCode++;
          if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
        } else {
          bits.writeBits(clearCode, codeSize); resetDict();
        }
        prefix = k;
      }
    }
    bits.writeBits(prefix, codeSize);
    bits.writeBits(eoiCode, codeSize);
    bits.flush();
    blocks.flush();
    out.writeU8(0);
  }

  class ByteSink {
    constructor() { this.bytes = []; }
    writeU8(v) { this.bytes.push(v & 0xFF); }
    writeU16(v) { this.bytes.push(v & 0xFF, (v >> 8) & 0xFF); }
    writeBytes(arr) { for (const b of arr) this.bytes.push(b & 0xFF); }
    toUint8Array() { return new Uint8Array(this.bytes); }
  }
  class BlockWriter {
    constructor(out) { this.out = out; this.buf = []; }
    writeByte(b) { this.buf.push(b); if (this.buf.length === 255) this.flush(); }
    flush() {
      if (!this.buf.length) return;
      this.out.writeU8(this.buf.length);
      this.out.writeBytes(this.buf);
      this.buf = [];
    }
  }
  class BitPacker {
    constructor(bw) { this.blocks = bw; this.accum = 0; this.bits = 0; }
    writeBits(code, size) {
      this.accum |= (code & ((1 << size) - 1)) << this.bits;
      this.bits += size;
      while (this.bits >= 8) {
        this.blocks.writeByte(this.accum & 0xFF);
        this.accum >>>= 8; this.bits -= 8;
      }
    }
    flush() {
      if (this.bits > 0) { this.blocks.writeByte(this.accum & 0xFF); this.accum = 0; this.bits = 0; }
    }
  }

  // =========================================================================
  // APNG encoder
  // =========================================================================
  async function buildApng(frames, opts = {}) {
    const fps = opts.fps || 12;
    const loop = opts.loop || 0;
    const onProgress = opts.onProgress || noop;
    const yieldUi = opts.yieldUi || defaultYield;
    const w = frames[0].w, h = frames[0].h;
    const delayNum = 1;
    const delayDen = fps;

    const out = new ByteSink();
    out.writeBytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    let firstChunks = null;
    const frameChunks = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(f.bitmap || f.canvas, 0, 0);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      const buf = new Uint8Array(await blob.arrayBuffer());
      const chunks = parsePngChunks(buf);
      if (i === 0) firstChunks = chunks;
      frameChunks.push(chunks);
      onProgress((i + 1) / frames.length);
      if ((i & 3) === 3) await yieldUi();
    }

    const ihdr = firstChunks.find(c => c.type === 'IHDR');
    writeChunk(out, 'IHDR', ihdr.data);

    const actl = new Uint8Array(8);
    new DataView(actl.buffer).setUint32(0, frames.length, false);
    new DataView(actl.buffer).setUint32(4, loop, false);
    writeChunk(out, 'acTL', actl);

    let seq = 0;
    for (let i = 0; i < frames.length; i++) {
      const fctl = new Uint8Array(26);
      const dv = new DataView(fctl.buffer);
      dv.setUint32(0, seq++, false);
      dv.setUint32(4, w, false);
      dv.setUint32(8, h, false);
      dv.setUint32(12, 0, false);
      dv.setUint32(16, 0, false);
      dv.setUint16(20, delayNum, false);
      dv.setUint16(22, delayDen, false);
      fctl[24] = 0; fctl[25] = 0;
      writeChunk(out, 'fcTL', fctl);

      const idats = frameChunks[i].filter(c => c.type === 'IDAT');
      if (i === 0) {
        for (const c of idats) writeChunk(out, 'IDAT', c.data);
      } else {
        for (const c of idats) {
          const fdat = new Uint8Array(4 + c.data.length);
          new DataView(fdat.buffer).setUint32(0, seq++, false);
          fdat.set(c.data, 4);
          writeChunk(out, 'fdAT', fdat);
        }
      }
    }
    writeChunk(out, 'IEND', new Uint8Array(0));
    return new Blob([out.toUint8Array()], { type: 'image/png' });
  }

  function parsePngChunks(buf) {
    const chunks = [];
    let p = 8;
    while (p < buf.length) {
      const len = (buf[p] << 24) | (buf[p+1] << 16) | (buf[p+2] << 8) | buf[p+3];
      const type = String.fromCharCode(buf[p+4], buf[p+5], buf[p+6], buf[p+7]);
      const data = buf.slice(p + 8, p + 8 + len);
      chunks.push({ type, data });
      p += 8 + len + 4;
      if (type === 'IEND') break;
    }
    return chunks;
  }
  function writeChunk(out, type, data) {
    const len = data.length;
    out.writeBytes([(len >> 24) & 0xFF, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF]);
    const typeBytes = [type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)];
    out.writeBytes(typeBytes);
    out.writeBytes(data);
    const crc = crc32png(new Uint8Array([...typeBytes, ...data]));
    out.writeBytes([(crc >> 24) & 0xFF, (crc >> 16) & 0xFF, (crc >> 8) & 0xFF, crc & 0xFF]);
  }
  function crc32png(data) {
    let table = crc32png._t;
    if (!table) {
      table = crc32png._t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // =========================================================================
  // GIF decoder (uses browser's ImageDecoder API)
  // =========================================================================
  async function decodeGif(blobOrBuffer) {
    if (!('ImageDecoder' in window)) {
      throw new Error('当前浏览器不支持 ImageDecoder API,请用 Chrome 94+ / Edge 94+');
    }
    const buf = blobOrBuffer instanceof Blob ? await blobOrBuffer.arrayBuffer() : blobOrBuffer;
    const decoder = new ImageDecoder({ data: buf, type: 'image/gif' });
    await decoder.tracks.ready;  // tracks must be populated before reading selectedTrack
    await decoder.completed;
    const track = decoder.tracks.selectedTrack;
    if (!track) throw new Error('无法读取 GIF 帧轨道,文件可能损坏');
    const frames = [];
    for (let i = 0; i < track.frameCount; i++) {
      const result = await decoder.decode({ frameIndex: i });
      const vf = result.image;
      const bitmap = await createImageBitmap(vf);
      frames.push({
        bitmap,
        w: bitmap.width,
        h: bitmap.height,
        duration: vf.duration // microseconds
      });
      vf.close();
    }
    return frames;
  }

  window.AnimEncoders = { buildGif, buildApng, decodeGif };
})();
