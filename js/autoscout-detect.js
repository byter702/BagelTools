/* =============================================================================
   autoscout-detect.js  —  Auto Scout's robot detector (a small YOLO model)
   -----------------------------------------------------------------------------
   A one-class YOLO model ("robot", trained on FRC match video and exported to
   ONNX) runs in the browser on the graphics card through ONNX Runtime Web. Each
   frame it hands the tracker a list of robot boxes; the tracker (autoscout.js)
   still decides which robot is which, from bumper color, motion and looks.

   models/robot.onnx is optional: without it (or on a browser that can't run it)
   Auto Scout falls back to finding robots by their bumpers alone.
   ========================================================================== */
const AutoScoutDetect = (() => {
  "use strict";
  const ORT_VER = "1.20.1";
  const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
  const MODEL_URL = "models/robot.onnx?v=1";
  const MIN_SCORE = 0.35, IOU = 0.5, TARGET_W = 960; // the model's input is ~960 px wide
  let session = null, loading = null, failed = null, backend = "";
  let canvas = null, ctx = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = src; s.crossOrigin = "anonymous";
      s.onload = res; s.onerror = () => rej(new Error("couldn't load " + src)); document.head.appendChild(s);
    });
  }
  // Load once; resolves to true when the detector is ready, false when it isn't available.
  function load() {
    if (session) return Promise.resolve(true);
    if (failed) return Promise.resolve(false);
    if (!loading) loading = (async () => {
      try {
        const head = await fetch(MODEL_URL, { method: "HEAD", cache: "no-store" });
        if (!head.ok) throw new Error("no model file");
        if (!window.ort) await loadScript(ORT_BASE + "ort.webgpu.min.js");
        ort.env.wasm.wasmPaths = ORT_BASE;
        const eps = "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"];
        session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: eps, graphOptimizationLevel: "all" });
        backend = eps[0];
        return true;
      } catch (e) {
        failed = e; session = null;
        try { console.warn("[AutoScout] robot detector off:", e.message || e); } catch (x) {}
        return false;
      }
    })();
    return loading;
  }

  function iou(a, b) {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const inter = ix * iy;
    return inter / (a.w * a.h + b.w * b.h - inter);
  }

  // Robot boxes in `src` (a canvas or image of W×H px), in that same pixel space.
  async function detect(src, W, H) {
    if (!session) return null;
    // the model takes sides that are multiples of 32; keep the frame's shape
    const tw = TARGET_W, th = Math.max(64, Math.round((H * TARGET_W / W) / 32) * 32);
    if (!canvas) { canvas = document.createElement("canvas"); ctx = canvas.getContext("2d", { willReadFrequently: true }); }
    if (canvas.width !== tw || canvas.height !== th) { canvas.width = tw; canvas.height = th; }
    ctx.drawImage(src, 0, 0, W, H, 0, 0, tw, th);
    const px = ctx.getImageData(0, 0, tw, th).data, n = tw * th, input = new Float32Array(3 * n);
    for (let i = 0, p = 0; i < n; i++, p += 4) { input[i] = px[p] / 255; input[n + i] = px[p + 1] / 255; input[2 * n + i] = px[p + 2] / 255; }
    const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, th, tw]) };
    const out = (await session.run(feeds))[session.outputNames[0]];
    // YOLO output: [1, 4 + classes, anchors] → cx, cy, w, h, score (one class)
    const d = out.data, A = out.dims[2], sx = W / tw, sy = H / th, found = [];
    for (let a = 0; a < A; a++) {
      const score = d[4 * A + a];
      if (score < MIN_SCORE) continue;
      const w = d[2 * A + a], h = d[3 * A + a];
      found.push({ x: (d[a] - w / 2) * sx, y: (d[A + a] - h / 2) * sy, w: w * sx, h: h * sy, score });
    }
    found.sort((a, b) => b.score - a.score);
    const keep = [];
    for (const b of found) if (keep.every((k) => iou(k, b) < IOU)) keep.push(b);
    return keep;
  }

  return { load, detect, ready: () => !!session, backend: () => backend, error: () => failed };
})();

window.AutoScoutDetect = AutoScoutDetect;
