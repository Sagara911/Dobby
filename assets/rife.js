// RIFE optical-flow frame interpolation via ONNX Runtime Web (WebGPU).
//
// Lazy-loads ORT + the TensorStack RIFE model on first call. All subsequent
// inferences reuse the cached session.
//
// Model I/O contract (from hzwer/Practical-RIFE export_onnx.py):
//   img0 : float32 (1, 3, H, W)   — RGB 0..1, channels-first
//   img1 : float32 (1, 3, H, W)
//   timestep : float32 (1,)       — 0.0..1.0 (0.5 = midpoint)
//   output : float32 (1, 3, H, W) — interpolated RGB 0..1
//
// H and W must each be a multiple of 32 (RIFE uses a 5-level feature pyramid).
// Inputs smaller than 32 px are zero-padded; the output is cropped back to the
// requested w/h so callers don't see the padding.
//
// Public API:
//   await RIFE.prepare({ log, onStatus, onProgress })  → { ready: true } | throws
//   await RIFE.interpolate(canvasA, canvasB, alpha, outCanvas)
//       writes the interpolated frame to outCanvas (must be sized matching A/B)
//   RIFE.isReady()
//   RIFE.dispose()

(function () {
  const ORT_URL = 'https://esm.sh/onnxruntime-web@1.22.0/webgpu';
  const ORT_WASM_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  const MODEL_URL = 'https://huggingface.co/TensorStack/RIFE/resolve/main/model.onnx';

  let ort = null;
  let session = null;
  let webgpuDevice = null;
  let preparing = null;

  async function checkWebGPU() {
    if (!('gpu' in navigator)) return false;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;
      webgpuDevice = await adapter.requestDevice();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function downloadModel(onProgress) {
    const resp = await fetch(MODEL_URL);
    if (!resp.ok) throw new Error(`下载 RIFE 模型失败: HTTP ${resp.status}`);
    const total = parseInt(resp.headers.get('content-length') || '0', 10);
    if (!resp.body || !total) {
      // no streaming progress available
      return await resp.arrayBuffer();
    }
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.(received / total);
    }
    const out = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.length; }
    return out.buffer;
  }

  async function prepare(opts = {}) {
    if (session) return { ready: true, provider: 'webgpu' };
    if (preparing) return preparing;
    const { onStatus = () => {}, onProgress = () => {} } = opts;
    preparing = (async () => {
      onStatus('检测 WebGPU...');
      const hasGpu = await checkWebGPU();
      if (!hasGpu) {
        throw new Error('当前浏览器/系统不支持 WebGPU。需要 Chrome 113+ 或 Edge 113+,且系统启用了 GPU 加速。');
      }
      onStatus('加载 ONNX Runtime Web (首次联网 ~3 MB)...');
      ort = await import(/* @vite-ignore */ ORT_URL);
      ort.env.wasm.wasmPaths = ORT_WASM_BASE;
      onStatus('下载 RIFE 模型 (~21 MB, 首次联网)...');
      const modelBuf = await downloadModel(onProgress);
      onStatus('初始化推理 session...');
      session = await ort.InferenceSession.create(modelBuf, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      });
      onStatus('RIFE 就绪');
      return { ready: true, provider: 'webgpu' };
    })().catch(e => {
      preparing = null;
      throw e;
    });
    return preparing;
  }

  function isReady() { return !!session; }

  function dispose() {
    try { session?.release?.(); } catch (_) {}
    session = null;
    webgpuDevice = null;
    preparing = null;
  }

  // Pad-up to multiple of 32. Returns the padded canvas (or the original if
  // already padded). Does NOT mutate the input.
  function padToMultiple(canvas, multiple) {
    const w = canvas.width, h = canvas.height;
    const pw = Math.ceil(w / multiple) * multiple;
    const ph = Math.ceil(h / multiple) * multiple;
    if (pw === w && ph === h) return canvas;
    const out = document.createElement('canvas');
    out.width = pw; out.height = ph;
    const ctx = out.getContext('2d');
    // edge-clamp by drawing the source first, then filling padding with the
    // bottom-right pixel (cheap and good enough for RIFE which only needs
    // the padding to be smooth, not semantically correct).
    ctx.drawImage(canvas, 0, 0);
    return out;
  }

  // Canvas → CHW float32 tensor, range 0..1
  function canvasToTensor(canvas) {
    const w = canvas.width, h = canvas.height;
    const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const out = new Float32Array(3 * w * h);
    const plane = w * h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 4;
        const dstIdx = y * w + x;
        out[dstIdx]             = data[srcIdx]     / 255;
        out[plane + dstIdx]     = data[srcIdx + 1] / 255;
        out[2 * plane + dstIdx] = data[srcIdx + 2] / 255;
      }
    }
    return new ort.Tensor('float32', out, [1, 3, h, w]);
  }

  // CHW float32 tensor → write into 2d canvas (sized W×H). cropW/cropH let
  // us crop off the right/bottom padding that was added before inference.
  function tensorToCanvas(tensor, outCanvas, cropW, cropH) {
    const [, , h, w] = tensor.dims;
    const src = tensor.data; // Float32Array
    const plane = w * h;
    const px = outCanvas.getContext('2d').getImageData(0, 0, cropW, cropH);
    const dst = px.data;
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const srcIdx = y * w + x;
        const dstIdx = (y * cropW + x) * 4;
        dst[dstIdx]     = Math.max(0, Math.min(255, src[srcIdx] * 255));
        dst[dstIdx + 1] = Math.max(0, Math.min(255, src[plane + srcIdx] * 255));
        dst[dstIdx + 2] = Math.max(0, Math.min(255, src[2 * plane + srcIdx] * 255));
        dst[dstIdx + 3] = 255;
      }
    }
    outCanvas.getContext('2d').putImageData(px, 0, 0);
  }

  async function interpolate(canvasA, canvasB, alpha, outCanvas) {
    if (!session) throw new Error('RIFE 未初始化, 先调用 RIFE.prepare()');
    if (canvasA.width !== canvasB.width || canvasA.height !== canvasB.height) {
      throw new Error('两帧尺寸不一致');
    }
    const origW = canvasA.width, origH = canvasA.height;
    const padA = padToMultiple(canvasA, 32);
    const padB = padToMultiple(canvasB, 32);
    const t0 = canvasToTensor(padA);
    const t1 = canvasToTensor(padB);
    const tStep = new ort.Tensor('float32', new Float32Array([alpha]), [1]);
    const result = await session.run({ img0: t0, img1: t1, timestep: tStep });
    const out = result.output || Object.values(result)[0];
    if (outCanvas.width !== origW || outCanvas.height !== origH) {
      outCanvas.width = origW;
      outCanvas.height = origH;
    }
    tensorToCanvas(out, outCanvas, origW, origH);
  }

  window.RIFE = { prepare, interpolate, isReady, dispose };
})();
