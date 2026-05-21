// Farnebäck-flow frame interpolation via OpenCV.js — the CPU fallback for
// systems without WebGPU. Lazy-loads opencv.js (~8 MB) on first call.
//
// Quality is clearly below RIFE (no neural prior, struggles with occlusion
// and large displacements) but clearly above the plain 50/50 blend on real
// footage with moderate motion. Speed is CPU-only, single-threaded —
// ~300-600ms per 480p pair on a modern laptop.
//
// Public API mirrors RIFE.js:
//   await Farneback.prepare({ onStatus, onProgress })
//   await Farneback.interpolate(canvasA, canvasB, alpha, outCanvas)
//   Farneback.isReady()
//   Farneback.dispose()

(function () {
  const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';

  let cv = null;
  let preparing = null;

  async function loadOpenCV(onStatus) {
    return new Promise((resolve, reject) => {
      if (window.cv && window.cv.Mat) return resolve(window.cv);
      onStatus?.('下载 OpenCV.js (~8 MB, 首次联网)...');
      const script = document.createElement('script');
      script.src = OPENCV_URL;
      script.async = true;
      // opencv.js bootstraps window.cv as a Module-like object; we wait for
      // its runtime to finish initializing.
      script.onload = () => {
        const c = window.cv;
        if (!c) return reject(new Error('opencv.js 加载完但 window.cv 不存在'));
        if (c.Mat) return resolve(c);  // already initialized synchronously
        const prevHandler = c.onRuntimeInitialized;
        c.onRuntimeInitialized = () => {
          if (typeof prevHandler === 'function') {
            try { prevHandler(); } catch (_) {}
          }
          resolve(c);
        };
        // safety timer in case onRuntimeInitialized never fires
        setTimeout(() => { if (c.Mat) resolve(c); }, 30000);
      };
      script.onerror = () => reject(new Error('OpenCV.js 下载失败 — 检查网络'));
      document.head.appendChild(script);
    });
  }

  async function prepare(opts = {}) {
    if (cv) return { ready: true, provider: 'opencv-cpu' };
    if (preparing) return preparing;
    const { onStatus = () => {} } = opts;
    preparing = (async () => {
      onStatus('加载 OpenCV.js...');
      cv = await loadOpenCV(onStatus);
      onStatus('初始化 Farnebäck flow 引擎...');
      // No further init needed — calcOpticalFlowFarneback is stateless
      onStatus('Farnebäck 就绪');
      return { ready: true, provider: 'opencv-cpu' };
    })().catch(e => {
      preparing = null;
      throw e;
    });
    return preparing;
  }

  function isReady() { return !!cv; }

  function dispose() {
    cv = null;
    preparing = null;
  }

  // Symmetric warp interpolation:
  //   1. compute forward flow A→B (per-pixel displacement)
  //   2. warp A forward by alpha (sample A at (x - α·fx, y - α·fy))
  //   3. warp B backward by (1-α) (sample B at (x + (1-α)·fx, y + (1-α)·fy))
  //   4. linear blend the two warps at (1-α) : α
  //
  // Quality is "good enough for live-action playables" — neighborhoods that
  // disocclude over the interval still produce ghosting (no occlusion mask).
  async function interpolate(canvasA, canvasB, alpha, outCanvas) {
    if (!cv) throw new Error('Farnebäck 未初始化, 先调用 Farneback.prepare()');
    if (canvasA.width !== canvasB.width || canvasA.height !== canvasB.height) {
      throw new Error('两帧尺寸不一致');
    }
    const w = canvasA.width, h = canvasA.height;

    const matA = cv.imread(canvasA);
    const matB = cv.imread(canvasB);
    const grayA = new cv.Mat();
    const grayB = new cv.Mat();
    cv.cvtColor(matA, grayA, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(matB, grayB, cv.COLOR_RGBA2GRAY);

    const flow = new cv.Mat();
    // Standard Farnebäck parameters tuned for video frame interpolation:
    // pyrScale=0.5, levels=3, winsize=15, iterations=3, polyN=5, polySigma=1.2
    cv.calcOpticalFlowFarneback(grayA, grayB, flow, 0.5, 3, 15, 3, 5, 1.2, 0);

    const mapAx = new cv.Mat(h, w, cv.CV_32F);
    const mapAy = new cv.Mat(h, w, cv.CV_32F);
    const mapBx = new cv.Mat(h, w, cv.CV_32F);
    const mapBy = new cv.Mat(h, w, cv.CV_32F);
    const flowData = flow.data32F;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const fi = (y * w + x) * 2;
        const fx = flowData[fi], fy = flowData[fi + 1];
        const pi = y * w + x;
        mapAx.data32F[pi] = x - alpha * fx;
        mapAy.data32F[pi] = y - alpha * fy;
        mapBx.data32F[pi] = x + (1 - alpha) * fx;
        mapBy.data32F[pi] = y + (1 - alpha) * fy;
      }
    }

    const warpedA = new cv.Mat();
    const warpedB = new cv.Mat();
    cv.remap(matA, warpedA, mapAx, mapAy, cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    cv.remap(matB, warpedB, mapBx, mapBy, cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());

    const out = new cv.Mat();
    cv.addWeighted(warpedA, 1 - alpha, warpedB, alpha, 0, out);

    if (outCanvas.width !== w || outCanvas.height !== h) {
      outCanvas.width = w; outCanvas.height = h;
    }
    cv.imshow(outCanvas, out);

    matA.delete(); matB.delete();
    grayA.delete(); grayB.delete();
    flow.delete();
    mapAx.delete(); mapAy.delete(); mapBx.delete(); mapBy.delete();
    warpedA.delete(); warpedB.delete();
    out.delete();
  }

  window.Farneback = { prepare, interpolate, isReady, dispose };
})();
