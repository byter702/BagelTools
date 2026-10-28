/* =============================================================================
   autoscout.js  —  Auto Scout's vision engine (no libraries, no server)
   -----------------------------------------------------------------------------
   Reads a match video one frame at a time (a captured YouTube player or a video
   file, see autoscout-ui.js) and keeps track of:

     • the six robots. A scout tags each one at the start of the match; from then
       on it's followed by its look (a 16×16 color template that slowly adapts)
       and its bumper color, with a little momentum so it coasts through brief
       occlusions. Boxes shrink toward the far side of the field (perspective).
     • what each robot launches. Top robots shoot 10+ pieces a second, so the
       pieces leaving a robot are a stream, not separate balls. Auto Scout
       measures the stream: freshly arrived, rising piece-colored pixels in a band
       just above the robot, turned into pieces using how big one piece looks and
       how fast pieces rise. That count is what "shots" and balls-per-second are.
     • single flights. Fast, smooth chains of moving blobs are traced ball by ball.
       They draw the shot arcs, teach the engine how fast pieces leave a robot,
       and show where a robot's shots end: in its hub (make), near it (miss), or
       somewhere else (a pass).

   finish() turns all that into per-robot numbers. Points come from the official
   TBA breakdown: each alliance's hub count, period by period, is split by how
   much each robot launched in that period (weighted by its own make rate), so
   the robots always add up to the scoreboard. Climbs come straight from TBA.

   Everything runs on a ~260K-pixel copy of the field view the scout framed.
   The game-specific parts (piece color, match periods, reading TBA) live in
   game-config.js under GAME.autoScout, so a new season only needs a new entry.
   ========================================================================== */
const AutoScout = (() => {
  "use strict";

  /* ---- pixel classes ------------------------------------------------------- */
  // bit 1 = game piece, 2 = red bumper, 4 = blue bumper
  const PIECES = {
    // 2026 FUEL: bright yellow foam balls. Not orange (green well below red), not
    // the greenish safety-vest yellow (green above red), not white (blue high).
    yellow: (r, g, b) => r > 120 && g > 95 && b < g * 0.62 && g >= r * 0.66 && g <= r * 1.1 && r - b > 75,
  };
  const redPx = (r, g, b) => r > 95 && r > g * 1.75 && r > b * 1.55;
  const bluePx = (r, g, b) => b > 85 && b > r * 1.45 && b > g * 1.08;

  function classify(px, n, cls, isPiece) {
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = px[p], g = px[p + 1], b = px[p + 2];
      cls[i] = (isPiece(r, g, b) ? 1 : 0) | (redPx(r, g, b) ? 2 : 0) | (bluePx(r, g, b) ? 4 : 0);
    }
  }

  /* ---- connected components (8-connected) on a 0/1 mask; clears what it visits.
     With `fresh`, each blob also counts how many of its pixels are new (nn). */
  function blobs(mask, W, H, stack, minA, maxA, fresh) {
    const out = [];
    for (let s = 0, N = W * H; s < N; s++) {
      if (!mask[s]) continue;
      let sp = 0, n = 0, nn = 0, sx = 0, sy = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
      stack[sp++] = s; mask[s] = 0;
      while (sp) {
        const i = stack[--sp], x = i % W, y = (i - x) / W;
        n++; sx += x; sy += y; if (fresh && fresh[i]) nn++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= W) continue;
            const j = yy * W + xx;
            if (mask[j]) { mask[j] = 0; if (sp < stack.length) stack[sp++] = j; }
          }
        }
      }
      if (n >= minA && n <= maxA) out.push({ x: sx / n, y: sy / n, n, nn, x0, x1, y0, y1 });
    }
    return out;
  }

  /* ---- homography (4 point pairs) -------------------------------------------- */
  // Maps image points to field inches: H · [x, y, 1].
  function homography(src, dst) {
    const A = [], b = [];
    for (let k = 0; k < 4; k++) {
      const [x, y] = src[k], [u, v] = dst[k];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (let c = 0; c < 8; c++) { // Gaussian elimination with partial pivoting
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-9) return null;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        if (!f) continue;
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = b.map((v, i) => v / A[i][i]);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }
  function applyH(Hm, x, y) {
    const w = Hm[6] * x + Hm[7] * y + Hm[8];
    return [(Hm[0] * x + Hm[1] * y + Hm[2]) / w, (Hm[3] * x + Hm[4] * y + Hm[5]) / w];
  }

  /* ---- robot boxes from bumper color (auto-find + snap a tap to a robot) ---- */
  function colorMask(px, W, H, want) {
    const m = new Uint8Array(W * H);
    for (let i = 0, p = 0, N = W * H; i < N; i++, p += 4) {
      const r = px[p], g = px[p + 1], b = px[p + 2];
      m[i] = (want === "red" ? redPx(r, g, b) : bluePx(r, g, b)) ? 1 : 0;
    }
    return m;
  }
  // Bumper-shaped blobs of one alliance color: wider than tall, robot sized. (The
  // field's own red/blue ramps and walls are much bigger and get skipped.)
  function bumperBlobs(px, W, H, alliance) {
    const u = W / 640, m = colorMask(px, W, H, alliance);
    const list = blobs(m, W, H, new Int32Array(W * H), Math.round(18 * u * u), Math.round(1400 * u * u));
    return list.filter((b) => {
      const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
      return bw >= 10 * u && bw <= 90 * u && bw / bh >= 1.6 && b.n / (bw * bh) > 0.3;
    }).map((b) => ({ alliance, x: b.x, y: b.y, n: b.n, box: boxFromBumper(b, W, H) }));
  }
  function boxFromBumper(b, W, H) {
    const bw = b.x1 - b.x0 + 1, pad = Math.max(2, bw * 0.08);
    const w = bw + pad * 2, h = Math.min(w * 1.1, Math.max(w * 0.8, (b.y1 - b.y0 + 1) * 2.6));
    const x = Math.max(0, b.x0 - pad), bottom = Math.min(H - 1, b.y1 + pad);
    return { x, y: Math.max(0, bottom - h), w: Math.min(w, W - x), h: Math.min(h, bottom) };
  }
  // A best guess at the 3 red + 3 blue robots in a frame (the biggest bumper blobs).
  function findRobots(px, W, H) {
    const pick = (al) => bumperBlobs(px, W, H, al).sort((a, b) => b.n - a.n).slice(0, 3).sort((a, b) => a.x - b.x);
    return { red: pick("red"), blue: pick("blue") };
  }
  // A tap near a robot → a box around its bumper (or a default box at the tap).
  function snapBox(px, W, H, x, y, alliance, fallbackW) {
    const u = W / 640;
    const near = bumperBlobs(px, W, H, alliance)
      .map((b) => ({ b, d: Math.hypot(b.x - x, b.y - y) }))
      .filter((o) => o.d < Math.max(40 * u, o.b.box.w * 1.1))
      .sort((a, b) => a.d - b.d)[0];
    if (near) return near.b.box;
    const w = fallbackW || W * 0.07, h = w * 0.9;
    return { x: Math.max(0, x - w / 2), y: Math.max(0, y - h * 0.6), w, h };
  }

  /* ===========================================================================
     The engine for one match
     cfg: { width, height,                       processing frame size (px)
            piece: "yellow",                     game-piece color class
            robots: [{ team, alliance, box }],   boxes in processing px
            hubs: { red: {x, y, r}, blue: {x, y, r} },
            corners: [[x,y] ×4] | null           far-left, far-right, near-right, near-left
            field: { w, h },                     inches
            periods: [{ id, end }] }             seconds from the start of auto
     ======================================================================== */
  function create(cfg) {
    const W = cfg.width, H = cfg.height, N = W * H, u = W / 640;
    const isPiece = PIECES[cfg.piece] || PIECES.yellow;
    const cls = new Uint8Array(N), mov = new Uint8Array(N), fresh = new Uint8Array(N);
    const prev1 = new Uint8Array(N), prev2 = new Uint8Array(N), still = new Uint8Array(N); // still: frames in a row piece-colored
    // The field's own red and blue (ramps, walls, hub sides): red/blue pixels in the first
    // frame outside every tagged robot. Not bumpers, so they never count as one.
    const fieldCol = new Uint8Array(N), colRun = new Uint16Array(N), inBox = new Uint8Array(N);
    // Field color hidden in the first frame (someone standing in front of a ramp) is
    // learned later: red/blue that stays put for 3 s outside every robot box is field.
    function learnFieldColors(boxes) {
      inBox.fill(0);
      boxes.forEach((b) => {
        const x0 = Math.max(0, Math.floor(b.x - b.w * 0.15)), x1 = Math.min(W - 1, Math.ceil(b.x + b.w * 1.15));
        const y0 = Math.max(0, Math.floor(b.y - b.h * 0.15)), y1 = Math.min(H - 1, Math.ceil(b.y + b.h * 1.2));
        for (let y = y0; y <= y1; y++) inBox.fill(1, y * W + x0, y * W + x1 + 1);
      });
      const need = 30; // calls (every 3rd frame): about 3 s
      for (let i = 0; i < N; i++) {
        if (cls[i] & 6) { if (colRun[i] < 65535) colRun[i]++; if (colRun[i] >= need && !inBox[i] && !fieldCol[i]) fieldCol[i] = 1; }
        else colRun[i] = 0;
      }
    }
    function markFieldColors() {
      const bx = cfg.robots.map((r) => r.box);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!(cls[i] & 6)) continue;
        if (bx.some((b) => x > b.x - b.w * 0.15 && x < b.x + b.w * 1.15 && y > b.y - b.h * 0.15 && y < b.y + b.h * 1.2)) continue;
        fieldCol[i] = 1;
      }
      // a little margin, so the edge of a ramp doesn't flicker in and out
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (fieldCol[i] === 1) { if (!fieldCol[i - 1]) fieldCol[i - 1] = 2; if (!fieldCol[i + 1]) fieldCol[i + 1] = 2; if (!fieldCol[i - W]) fieldCol[i - W] = 2; if (!fieldCol[i + W]) fieldCol[i + W] = 2; } }
    }
    const near1 = new Uint8Array(N), rowTmp = new Uint8Array(N); // near1: piece-colored within a few px a frame ago
    const lumaOld = new Uint8Array(N); let lumaAt = -99; // a luma copy, refreshed every 5 frames
    let M_ON = true, M_THR = 2, M_FRAMES = 120, M_LOST = false, B_EMA = false;
    const stack = new Int32Array(N);
    const thumbNow = new Float32Array(32 * 18), thumbRef = new Float32Array(32 * 18);
    let warm = 0, frames = 0, skipped = 0, lastT = null, haveRef = false, offField = false, px = null;
    const fieldW = (cfg.field && cfg.field.w) || 651.2, fieldH = (cfg.field && cfg.field.h) || 317.7;
    const Hm = cfg.corners ? homography(cfg.corners, [[0, 0], [fieldW, 0], [fieldW, fieldH], [0, fieldH]]) : null;
    const periods = cfg.periods || [];
    // is image point (x, y) on (or just off) the field? (no corners set: anywhere)
    const onField = (x, y) => {
      if (!Hm) return true;
      const [X, Y] = applyH(Hm, x, y);
      return X > -0.06 * fieldW && X < 1.06 * fieldW && Y > -0.12 * fieldH && Y < 1.15 * fieldH;
    };
    const periodAt = (t) => { for (const p of periods) if (t < p.end) return p.id; return periods.length ? periods[periods.length - 1].id : "match"; };
    const gImg = 9.81 * (W / 16.5) * 0.8; // gravity in px/s² (roughly; the field is ~16.5 m across)

    /* ================= robots ================= */
    // Perspective: box width ≈ a + b·(center y), fitted to the scout's boxes.
    let sa = 0, sb = 0;
    (() => {
      const bx = cfg.robots.map((r) => r.box), xs = bx.map((b) => b.y + b.h / 2), ys = bx.map((b) => b.w);
      const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
      sb = den > (H * 0.05) ** 2 * n && num > 0 ? Math.min(num / den, (my / H) * 2.2) : 0;
      sa = my - sb * mx;
    })();
    const sizeAt = (cy) => Math.max(10 * u, sa + sb * cy);
    const refW = sizeAt(H / 2);

    const GRID = 16, TS = GRID * GRID * 3;
    const robots = cfg.robots.map((r, i) => {
      const b = r.box, cy = b.y + b.h / 2;
      return {
        i, team: String(r.team), alliance: r.alliance, pend: null,
        off: !!r.off || b.x + b.w / 2 < 0 || b.x + b.w / 2 > W || b.y + b.h / 2 < 0 || b.y + b.h / 2 > H,
        cx: b.x + b.w / 2, cy, vx: 0, vy: 0, k: b.w / sizeAt(cy), aspect: b.h / b.w,
        tpl: new Float32Array(TS), gal: [], galAt: 0, still: 0, h0: new Float32Array(64), hr: new Float32Array(64), colorBad: 0, cost: 18, matches: 0, lost: 0, weak: 0, bumper: 0, bOff: [0, 0.04], sure: 0, seen: 0,
        launched: 0, byPeriod: {}, series: [], heat: new Float32Array(72), makes: 0, misses: 0, passes: 0, traced: 0,
        path: [], // where it was on the field: [t, X, Y, estimated?]
      };
    });
    const boxOf = (r, cx = r.cx, cy = r.cy) => { const w = r.k * sizeAt(cy), h = w * r.aspect; return { x: cx - w / 2, y: cy - h / 2, w, h }; };
    const fieldPos = (r) => {
      const b = boxOf(r), fx = b.x + b.w / 2, fy = b.y + b.h;
      if (Hm) { const [X, Y] = applyH(Hm, fx, fy); return [Math.max(0, Math.min(1, X / fieldW)), Math.max(0, Math.min(1, Y / fieldH))]; }
      return [fx / W, fy / H];
    };

    function sampleInto(out, cx, cy, w, h) {
      for (let j = 0, o = 0; j < GRID; j++) {
        const y = Math.max(0, Math.min(H - 1, Math.round(cy - h / 2 + (j + 0.5) * h / GRID)));
        for (let i = 0; i < GRID; i++, o += 3) {
          const x = Math.max(0, Math.min(W - 1, Math.round(cx - w / 2 + (i + 0.5) * w / GRID)));
          const p = (y * W + x) * 4;
          out[o] = px[p]; out[o + 1] = px[p + 1]; out[o + 2] = px[p + 2];
        }
      }
    }
    const tmp = new Float32Array(TS), offX = new Int32Array(GRID), offY = new Int32Array(GRID);
    function setOffsets(w, h) {
      for (let i = 0; i < GRID; i++) { offX[i] = Math.round(-w / 2 + (i + 0.5) * w / GRID); offY[i] = Math.round(-h / 2 + (i + 0.5) * h / GRID); }
    }
    // Mean |difference| per channel between a robot's template and the box at (cx, cy).
    // how well a robot's gallery of looks matches the box at (cx, cy): the best one
    function lookAt(r, cx, cy) {
      let best = costAt(r.tpl, cx, cy);
      for (let g = 0; g < r.gal.length; g++) { const c = costAt(r.gal[g], cx, cy); if (c < best) best = c; }
      return best;
    }
    function costAt(t, cx, cy) {
      const x0 = Math.round(cx), y0 = Math.round(cy);
      let s = 0, o = 0;
      for (let j = 0; j < GRID; j++) {
        const y = y0 + offY[j];
        if (y < 0 || y >= H) { o += GRID * 3; s += 120 * GRID; continue; }
        const row = y * W;
        for (let i = 0; i < GRID; i++, o += 3) {
          const x = x0 + offX[i];
          if (x < 0 || x >= W) { s += 120; continue; }
          const p = (row + x) * 4;
          s += Math.abs(px[p] - t[o]) + Math.abs(px[p + 1] - t[o + 1]) + Math.abs(px[p + 2] - t[o + 2]);
        }
      }
      return s / TS;
    }
    // Share of alliance-colored pixels along the bottom of the box (the bumper).
    function bumperAt(r, cx, cy, w, h) {
      const bit = r.alliance === "red" ? 2 : 4;
      let hit = 0, tot = 0;
      for (let j = 0; j < 4; j++) {
        const y = Math.round(cy + h / 2 - h * 0.34 + (j + 0.5) * h * 0.34 / 4);
        if (y < 0 || y >= H) continue;
        for (let i = 0; i < 12; i++) {
          const x = Math.round(cx - w / 2 + (i + 0.5) * w / 12);
          if (x < 0 || x >= W) continue;
          tot++; const k = y * W + x; if ((cls[k] & bit) && !fieldCol[k]) hit++;
        }
      }
      return tot ? hit / tot : 0;
    }
    function seedTemplate(r) {
      if (r.off) { r.gal = []; r.galAt = frames; return; } // nothing to see yet
      const b = boxOf(r);
      sampleInto(r.tpl, r.cx, r.cy, b.w, b.h);
      r.gal = [Float32Array.from(r.tpl)]; r.galAt = frames;
      histAt(r.cx, r.cy, b.w, b.h, r.h0); r.hr.set(r.h0);
      r.bumper = Math.min(0.5, bumperAt(r, r.cx, r.cy, b.w, b.h));
      r.cost = 18; r.lost = 0; r.weak = 0;
    }
    function searchAll(r, taken) {
      const cands = [];
      for (let cy = 0; cy < H; cy += 6 * u) {
        const w = r.k * sizeAt(cy), h = w * r.aspect, step = Math.max(4, Math.round(w / 5));
        setOffsets(w, h);
        for (let cx = w / 2; cx < W - w / 2; cx += step) {
          if (!onField(cx, cy + h / 2)) continue; // robots stand on the carpet
          // not where another robot already is
          if (robots.some((o, k) => o !== r && taken[k] && Math.abs(taken[k].x - cx) < taken[k].w * 0.6 && Math.abs(taken[k].y - cy) < taken[k].h * 0.6)) continue;
          cands.push([lookAt(r, cx, cy), cx, cy, w, h]);
        }
      }
      cands.sort((a, b) => a[0] - b[0]);
      let best = null;
      cands.slice(0, 6).forEach(([c, cx, cy, w, h]) => {
        const col = colorMatch(r, cx, cy, w, h);
        if (!best || c + (1 - col) * 40 < best.c + (1 - best.col) * 40) best = { x: cx, y: cy, c, col, w, h, reseed: false };
      });
      return best;
    }
    function trackRobot(r, dt) {
      const px0 = r.cx + r.vx * dt, py0 = r.cy + r.vy * dt;
      const speed = Math.hypot(r.vx, r.vy);
      const R = r.lost > 15 ? 110 * u : Math.max(14 * u, Math.min(70 * u, 14 * u + 1.5 * speed * dt));
      const w = r.k * sizeAt(py0), h = w * r.aspect;
      setOffsets(w, h);
      const score = (cx, cy) => {
        let c = lookAt(r, cx, cy);
        if (r.bumper > 0.12) c += 20 * Math.max(0, r.bumper - bumperAt(r, cx, cy, w, h)) / r.bumper;
        const d = Math.hypot(cx - px0, cy - py0) / R;
        return c + 6 * d * d;
      };
      let best = Infinity, bx = px0, by = py0;
      const step = Math.max(2, Math.round(R / 14));
      for (let dy = -R; dy <= R; dy += step) for (let dx = -R; dx <= R; dx += step) {
        if (dx * dx + dy * dy > R * R) continue;
        const c = score(px0 + dx, py0 + dy);
        if (c < best) { best = c; bx = px0 + dx; by = py0 + dy; }
      }
      const cx0 = bx, cy0 = by;
      for (let dy = -step; dy <= step; dy++) for (let dx = -step; dx <= step; dx++) {
        const c = score(cx0 + dx, cy0 + dy);
        if (c < best) { best = c; bx = cx0 + dx; by = cy0 + dy; }
      }
      return { x: bx, y: by, c: best, w, h };
    }
    // This frame's bumpers: red/blue strips about as wide as a robot should be there
    // (white bumper numbers split a bumper, so close small horizontal gaps first).
    function detectBumpers() {
      const out = { red: [], blue: [] };
      [["red", 2], ["blue", 4]].forEach(([al, bit]) => {
        for (let y = 0; y < H; y++) {
          const row = y * W;
          let last = -99;
          for (let x = 0; x < W; x++) {
            const on = (cls[row + x] & bit) && !fieldCol[row + x];
            mov[row + x] = on ? 1 : 0;
            if (on) { if (x - last > 1 && x - last <= 4 * u) for (let k = last + 1; k < x; k++) mov[row + k] = 1; last = x; }
          }
        }
        const parts = [];
        blobs(mov, W, H, stack, Math.round(10 * u * u), Math.round(2600 * u * u)).forEach((b) => {
          const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, ew = sizeAt(b.y1);
          if (bw < 0.2 * ew || bw > 2.4 * ew || bh > 0.8 * ew || bw / bh < 1.1 || b.n / (bw * bh) < 0.25) return;
          parts.push({ x0: b.x0, x1: b.x1, yb: b.y1, n: b.n });
        });
        // a robot's front and side bumpers (or a bumper cut by its number) are one robot
        for (let changed = true; changed;) {
          changed = false;
          for (let a = 0; a < parts.length && !changed; a++) for (let c = a + 1; c < parts.length; c++) {
            const A = parts[a], B = parts[c], ew = sizeAt(Math.max(A.yb, B.yb));
            const gap = Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1);
            if (gap > 0.25 * ew || Math.abs(A.yb - B.yb) > 0.35 * ew || Math.max(A.x1, B.x1) - Math.min(A.x0, B.x0) > 1.3 * ew) continue;
            A.x0 = Math.min(A.x0, B.x0); A.x1 = Math.max(A.x1, B.x1); A.yb = Math.max(A.yb, B.yb); A.n += B.n;
            parts.splice(c, 1); changed = true; break;
          }
        }
        parts.forEach((b) => {
          const bw = b.x1 - b.x0 + 1, ew = sizeAt(b.yb);
          if (bw < 0.3 * ew || !onField((b.x0 + b.x1) / 2, b.yb)) return;
          // two robots side by side make one long strip: split it
          if (bw > 1.6 * ew) { const q = bw / 4; out[al].push({ x: b.x0 + q, yb: b.yb, w: bw / 2, n: b.n / 2 }, { x: b.x1 - q, yb: b.yb, w: bw / 2, n: b.n / 2 }); }
          else out[al].push({ x: (b.x0 + b.x1) / 2, yb: b.yb, w: bw, n: b.n });
        });
      });
      return out;
    }
    // The detector's robot boxes as candidates. Which alliance: the red vs blue along the
    // bottom of the box (its bumper); a box with neither clearly is offered to both.
    function detsFromModel(boxes) {
      const out = { red: [], blue: [] };
      boxes.forEach((b) => {
        const cx = b.x + b.w / 2, yb = b.y + b.h, ew = sizeAt(yb);
        if (!onField(cx, yb) || b.w < 0.35 * ew || b.w > 2.6 * ew) return;
        let red = 0, blue = 0;
        for (let j = 0; j < 5; j++) {
          const y = Math.round(yb - b.h * 0.4 + (j + 0.5) * b.h * 0.4 / 5); if (y < 0 || y >= H) continue;
          for (let i = 0; i < 14; i++) {
            const x = Math.round(b.x + (i + 0.5) * b.w / 14); if (x < 0 || x >= W) continue;
            const k = y * W + x; if (fieldCol[k]) continue;
            if (cls[k] & 2) red++; else if (cls[k] & 4) blue++;
          }
        }
        const d = { x: cx, yb, w: b.w, det: b };
        if (red >= 4 && red > blue * 1.5) out.red.push(d);
        else if (blue >= 4 && blue > red * 1.5) out.blue.push(d);
        else { out.red.push(d); out.blue.push(d); }
      });
      return out;
    }
    // A robot's colors as a 64-bin histogram (4 levels per channel) over its box, fuel
    // left out. It stays the same when the robot turns, unlike its look.
    const floorBin = new Uint8Array(64);
    function learnFloor() {
      const hs = new Float32Array(64); let n = 0;
      for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
        const k = y * W + x; if (cls[k] & 7) continue;
        const q = k * 4; hs[(px[q] >> 6) * 16 + (px[q + 1] >> 6) * 4 + (px[q + 2] >> 6)]++; n++;
      }
      const order = [...hs.keys()].sort((a, b) => hs[b] - hs[a]);
      let cum = 0;
      for (let k = 0; k < 3 && cum < n * 0.55; k++) { floorBin[order[k]] = 1; cum += hs[order[k]]; }
    }
    function histAt(cx, cy, w, h, out) {
      out.fill(0); let n = 0;
      for (let j = 0; j < 12; j++) {
        const y = Math.round(cy - h * 0.45 + (j + 0.5) * h * 0.9 / 12); if (y < 0 || y >= H) continue;
        for (let i = 0; i < 12; i++) {
          const x = Math.round(cx - w * 0.45 + (i + 0.5) * w * 0.9 / 12); if (x < 0 || x >= W) continue;
          const k = y * W + x; if (cls[k] & 1) continue;
          const q = k * 4, bin = (px[q] >> 6) * 16 + (px[q + 1] >> 6) * 4 + (px[q + 2] >> 6);
          if (floorBin[bin]) continue;
          out[bin]++; n++;
        }
      }
      if (n) for (let k = 0; k < 64; k++) out[k] /= n;
      return n >= 12 ? n : 0;
    }
    const bc = (a, b) => { let t = 0; for (let k = 0; k < 64; k++) t += Math.sqrt(a[k] * b[k]); return t; };
    const hTmp = new Float32Array(64);
    // how much the box at (cx, cy) has this robot's colors (1 = the same)
    function colorMatch(r, cx, cy, w, h) {
      if (!histAt(cx, cy, w, h, hTmp)) return 0.5;
      return Math.max(bc(hTmp, r.h0), bc(hTmp, r.hr));
    }
    // where a robot's bumper sits in its box (measured when it's tagged)
    function bumperOffset(r, dets) {
      const b = boxOf(r);
      const inBox = dets[r.alliance].filter((d) => d.x > b.x && d.x < b.x + b.w && d.yb > b.y + b.h * 0.3 && d.yb < b.y + b.h * 1.25)
        .sort((p, q) => q.w - p.w)[0];
      r.bOff = inBox ? [(r.cx - inBox.x) / b.w, (b.y + b.h - inBox.yb) / b.h] : [0, 0.04];
    }
    let W_DIST = 12, W_LOOK = 0.5, W_COL = 60, W_NONE = 22;
    function updateRobots(dt, model) {
      const dets = model ? detsFromModel(model) : detectBumpers();
      // 1. Bumpers. Every pairing of a robot with a bumper gets a cost (how far from where
      //    the robot should be, how much the box there has its colors and its look, how big
      //    the bumper is); the cheapest way to pair up the whole alliance wins, so two
      //    robots crossing paths can't both grab the nearest bumper.
      const res = robots.map(() => null);
      ["red", "blue"].forEach((al) => {
        const team = robots.filter((r) => r.alliance === al && !r.off), cand = dets[al];
        const C = team.map((r) => {
          const px0 = r.cx + r.vx * dt, py0 = r.cy + r.vy * dt, w = r.k * sizeAt(py0), h = w * r.aspect;
          const lostFor = Math.max(r.lost, r.weak);
          const gate = lostFor > 30 ? 3 * w : lostFor > 8 ? 1.6 * w : Math.max(0.6 * w, Math.min(1.8 * w, 0.55 * w + 1.5 * Math.hypot(r.vx, r.vy) * dt));
          const ex = px0 - r.bOff[0] * w, eyb = py0 + h / 2 - r.bOff[1] * h; // predicted bumper spot
          setOffsets(w, h);
          return cand.map((d) => {
            // a detector box is the whole robot; a bumper strip sits at the bottom of it
            const dist = d.det ? Math.hypot(d.x - px0, (d.yb - (py0 + h / 2)) * 1.3) : Math.hypot(d.x - ex, (d.yb - eyb) * 1.3);
            if (dist > gate) return null;
            const cx = d.det ? d.x : d.x + r.bOff[0] * w, cy = d.det ? d.yb - h / 2 : d.yb + r.bOff[1] * h - h / 2;
            const look = lookAt(r, cx, cy), col = colorMatch(r, cx, cy, w, h);
            const size = d.det ? Math.abs(d.w / w - 1) * 6 : Math.abs(d.w / (0.85 * w) - 1) * 5;
            const cost = (dist / gate) ** 2 * (lostFor > 30 ? W_DIST / 3 : W_DIST) + Math.max(0, look - r.cost) * W_LOOK + Math.max(0, 0.85 - col) * W_COL + size;
            return { cost, cx, cy, look, col, w, h, det: d.det };
          });
        });
        const none = team.map((r) => (Math.max(r.lost, r.weak) > 8 ? W_NONE + 10 : W_NONE)); // cost of "no bumper for this robot"
        let best = Infinity, pick = null;
        const cur = [], used = new Set();
        (function go(k, sum) {
          if (sum >= best) return;
          if (k === team.length) { best = sum; pick = cur.slice(); return; }
          cur[k] = -1; go(k + 1, sum + none[k]);
          C[k].forEach((c, di) => { if (!c || used.has(di)) return; used.add(di); cur[k] = di; go(k + 1, sum + c.cost); used.delete(di); });
        })(0, 0);
        (pick || []).forEach((di, k) => {
          if (di < 0) return;
          const c = C[k][di], r = team[k];
          res[r.i] = { x: c.cx, y: c.cy, c: c.look, col: c.col, w: c.w, h: c.h, bumper: true, det: c.det, reseed: Math.max(r.lost, r.weak) > 30 && c.col > 0.55 };
        });
        // A robot that's off screen comes back as a bumper of its color that nobody else
        // owns and that stays put for a quarter second (nearest to where it was last).
        const offs = robots.filter((r) => r.alliance === al && r.off);
        if (offs.length) {
          const free = cand.filter((d, di) => !(pick || []).includes(di) &&
            !team.some((r) => Math.hypot(d.x - r.cx, d.yb - (r.cy + r.k * sizeAt(r.cy) * r.aspect / 2)) < 1.2 * r.k * sizeAt(r.cy)));
          offs.forEach((r) => {
            let bd = null, bdist = Infinity;
            free.forEach((d) => { const dd = Math.hypot(d.x - r.cx, d.yb - r.cy); if (dd < bdist) { bdist = dd; bd = d; } });
            if (!bd) { r.pend = null; return; }
            const ew = sizeAt(bd.yb);
            r.pend = r.pend && Math.hypot(bd.x - r.pend.x, bd.yb - r.pend.yb) < 0.6 * ew ? { x: bd.x, yb: bd.yb, n: r.pend.n + 1 } : { x: bd.x, yb: bd.yb, n: 1 };
            free.splice(free.indexOf(bd), 1);
            if (r.pend.n < 8) return;
            const w = r.k * sizeAt(bd.yb), h = w * r.aspect;
            r.off = false; r.pend = null; r.cx = bd.x; r.cy = bd.yb + 0.04 * h - h / 2; r.vx = 0; r.vy = 0;
            r.lost = 0; r.weak = 0; r.colorBad = 0; r.matches = 0; r.cost = 18; r.bOff = [0, 0.04];
            seedTemplate(r); r.came = (r.came || 0) + 1;
          });
        }
      });
      // 2. no bumper (hidden, turned, blurred): search by look around where it should be
      robots.forEach((r, i) => {
        if (res[i] || r.off) return;
        let m = trackRobot(r, dt);
        m.col = colorMatch(r, m.x, m.y, m.w, m.h);
        if (Math.max(r.lost, r.weak) > 20 && frames % 8 === i % 8) { const g = searchAll(r, res); if (g && g.c + (1 - g.col) * 40 < m.c + (1 - m.col) * 40 - 4) m = g; }
        res[i] = m.col > 0.6 && m.c < r.cost * 1.7 + 12 ? m : null;
      });
      // two robots on one spot: the worse match lets go and coasts
      for (let a = 0; a < robots.length; a++) for (let b = a + 1; b < robots.length; b++) {
        const A = res[a], B = res[b];
        if (!A || !B) continue;
        const ix = Math.max(0, Math.min(A.x + A.w / 2, B.x + B.w / 2) - Math.max(A.x - A.w / 2, B.x - B.w / 2));
        const iy = Math.max(0, Math.min(A.y + A.h / 2, B.y + B.h / 2) - Math.max(A.y - A.h / 2, B.y - B.h / 2));
        const inter = ix * iy, iou = inter / (A.w * A.h + B.w * B.h - inter);
        if (iou > 0.45) { if (A.c > B.c) res[a] = null; else res[b] = null; }
      }
      robots.forEach((r, i) => {
        if (r.off) return;
        const m = res[i];
        r.lastC = m ? +m.c.toFixed(1) : null; r.lastB = !!(m && m.bumper); r.lastCol = m && m.col != null ? +m.col.toFixed(2) : null;
        if (m && (m.bumper || m.c < Math.min(r.cost * 1.8 + 12, 58))) {
          const nvx = (m.x - r.cx) / dt, nvy = (m.y - r.cy) / dt;
          if (m.reseed) { r.vx = 0; r.vy = 0; } else { r.vx = r.vx * 0.55 + nvx * 0.45; r.vy = r.vy * 0.55 + nvy * 0.45; }
          r.cx = m.x; r.cy = m.y; r.lost = 0;
          // the first few matches set what "normal" frame-to-frame change looks like for this robot
          r.cost = r.matches++ < 5 ? Math.max(r.cost * 0.5 + m.c * 0.5, 8) : r.cost * 0.92 + Math.min(m.c, r.cost * 2) * 0.08;
          // Only a bumper-confirmed match teaches the tracker how the robot looks (a look-only
          // match could be the floor it just left, and learning that is how boxes get stuck).
          if (m.det) { r.k += (m.det.w / sizeAt(r.cy) - r.k) * 0.1; r.aspect += (m.det.h / m.det.w - r.aspect) * 0.1; }
          if (m.bumper) {
            if (B_EMA) r.bumper = r.bumper * 0.9 + Math.min(0.5, bumperAt(r, r.cx, r.cy, m.w, m.h)) * 0.1;
            sampleInto(tmp, r.cx, r.cy, m.w, m.h);
            const a = m.reseed ? 1 : 0.05;
            for (let k = 0; k < TS; k++) r.tpl[k] += (tmp[k] - r.tpl[k]) * a;
            if (frames - r.galAt > 25 && (m.col == null || m.col > 0.6)) { // a new angle for the gallery, every ~1 s
              r.galAt = frames; r.gal.push(Float32Array.from(tmp));
              if (r.gal.length > 5) r.gal.splice(1, 1); // the tagged look always stays
            }
          }
          if (m.col != null) {
            r.colorBad = m.col < 0.5 ? r.colorBad + 1 : 0;
            if (m.col > 0.7 && histAt(r.cx, r.cy, m.w, m.h, hTmp)) for (let k = 0; k < 64; k++) r.hr[k] += (hTmp[k] - r.hr[k]) * 0.03;
          }
        } else {
          r.lost++;
          r.cx += r.vx * dt; r.cy += r.vy * dt; r.vx *= 0.8; r.vy *= 0.8;
        }
        r.cx = Math.max(0, Math.min(W - 1, r.cx)); r.cy = Math.max(0, Math.min(H - 1, r.cy));
        // A box that drifted onto a person or the carpet loses its bumper color: don't
        // trust it (and don't credit it with shots) until it finds the robot again.
        if (r.bumper > 0.12) {
          const b = boxOf(r);
          if (bumperAt(r, r.cx, r.cy, b.w, b.h) < r.bumper * 0.3) r.weak++; else r.weak = 0;
        }
        const b = boxOf(r), lostFor = Math.max(r.lost, r.weak);
        if (r.cx < -0.2 * b.w || r.cx > W + 0.2 * b.w || r.cy > H + 0.2 * b.h || r.cy < -0.3 * b.h ||
          (lostFor > 45 && (r.cx < b.w * 0.8 || r.cx > W - b.w * 0.8 || r.cy > H - b.h * 0.5))) { r.off = true; r.pend = null; r.vx = 0; r.vy = 0; }
      });
    }
    function motionCheck() {
      if (frames - lumaAt < 5) return;
      if (lumaAt > 0) robots.forEach((r) => {
        if (r.off) return;
        const b = boxOf(r); let e = 0, n = 0;
        for (let j = 0; j < 8; j++) { const y = Math.round(b.y + (j + 0.5) * b.h / 8); if (y < 0 || y >= H) continue;
          for (let i = 0; i < 8; i++) { const x = Math.round(b.x + (i + 0.5) * b.w / 8); if (x < 0 || x >= W) continue;
            const k = y * W + x, q = k * 4; e += Math.abs(((px[q] * 77 + px[q + 1] * 151 + px[q + 2] * 28) >> 8) - lumaOld[k]); n++; } }
        if (n && e / n < M_THR) r.still += frames - lumaAt; else r.still = 0;
        if (M_ON && r.still > M_FRAMES) { // scenery: remember its red/blue as the field's, and go find the robot
          for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(H, b.y + b.h); y++) for (let x = Math.max(0, Math.floor(b.x)); x < Math.min(W, b.x + b.w); x++) { const k = y * W + x; if (cls[k] & 6) fieldCol[k] = 1; }
          r.still = 0; if (M_LOST) { r.lost = Math.max(r.lost, 31); r.weak = Math.max(r.weak, 21); }
        }
      });
      for (let k = 0, q = 0; k < N; k++, q += 4) lumaOld[k] = (px[q] * 77 + px[q + 1] * 151 + px[q + 2] * 28) >> 8;
      lumaAt = frames;
    }
    const unsure = (r) => r.off || r.lost > 8 || r.weak > 20 || r.colorBad > 20;

    /* ================= pieces ================= */
    const hubs = cfg.hubs || {};
    const hubDist = (al, x, y) => { const h = hubs[al]; return h ? Math.hypot(x - h.x, y - h.y) / h.r : Infinity; };
    let pieceArea = 30 * u * u, rise = 5; // rise: how fast pieces leave a robot, in robot-heights per second
    const riseSamples = [];
    // How big one piece looks: the typical small piece-colored blob in the first frame
    // (loose pieces lying on the carpet; piles merge into bigger blobs and are skipped).
    function measurePiece() {
      for (let i = 0; i < N; i++) mov[i] = cls[i] & 1;
      const sizes = blobs(mov, W, H, stack, Math.max(4, Math.round(4 * u * u)), Math.round(260 * u * u))
        .filter((b) => { const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1; return bw / bh < 1.8 && bh / bw < 1.8 && b.n / (bw * bh) > 0.5; })
        .map((b) => b.n).sort((a, b) => a - b);
      if (sizes.length >= 8) pieceArea = sizes[Math.floor(sizes.length * 0.45)];
    }

    // last frame's piece pixels, grown by rad px (a separable box dilation)
    function dilatePrev(rad) {
      for (let y = 0; y < H; y++) {
        const row = y * W; let run = -1e9;
        for (let x = 0; x < W; x++) { if (prev1[row + x]) run = x; rowTmp[row + x] = x - run <= rad ? 1 : 0; }
        run = 1e9;
        for (let x = W - 1; x >= 0; x--) { if (prev1[row + x]) run = x; if (run - x <= rad) rowTmp[row + x] = 1; }
      }
      for (let x = 0; x < W; x++) {
        let run = -1e9;
        for (let y = 0; y < H; y++) { const i = y * W + x; if (rowTmp[i]) run = y; near1[i] = y - run <= rad ? 1 : 0; }
        run = 1e9;
        for (let y = H - 1; y >= 0; y--) { const i = y * W + x; if (rowTmp[i]) run = y; if (run - y <= rad) near1[i] = 1; }
      }
    }
    // --- 1. launch flow: what leaves each robot, frame by frame ---
    // Pieces in the band above a robot that moved farther than their own size since the
    // last frame (no piece pixel within a few px of them a frame ago) are in the air: a
    // pile a robot is pushing, or a piece rolling, only creeps a few px per frame. How
    // much of that is up there, over how long a piece takes to rise through the band,
    // is how many pieces it's launching.
    const STILL = 8;
    let BAND_UP = 0.45, BAND_X = 0.05, BIG = 0, SHOW = false, RAD = 0, FAST = false, CARRY = true;
    const shown = []; // with SHOW: the pixels each robot was credited for in the last frame
    // Every piece-colored blob this frame, with each pixel's blob id in lab[] (so the
    // flow can skip pixels of big blobs: a volunteer's yellow shirt isn't fuel).
    const lab = new Int32Array(N);
    let comps = [];
    function labelPieces() {
      comps = []; lab.fill(0);
      for (let s0 = 0; s0 < N; s0++) {
        if (!(cls[s0] & 1) || lab[s0]) continue;
        const id = comps.length + 1;
        let sp = 0, n = 0, nn = 0, sx = 0, sy = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
        stack[sp++] = s0; lab[s0] = id;
        while (sp) {
          const i = stack[--sp], x = i % W, y = (i - x) / W;
          n++; sx += x; sy += y; if (fresh[i]) nn++;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy; if (yy < 0 || yy >= H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx; if (xx < 0 || xx >= W) continue;
              const j = yy * W + xx;
              if ((cls[j] & 1) && !lab[j]) { lab[j] = id; if (sp < stack.length) stack[sp++] = j; }
            }
          }
        }
        comps.push({ x: sx / n, y: sy / n, n, nn, x0, x1, y0, y1 });
      }
    }
    function launchFlow(t, dt, boxes) {
      robots.forEach((r, ri) => {
        r.seen++; if (!unsure(r)) r.sure++;
        if (unsure(r)) return; // a box that isn't on its robot right now gets no credit
        const b = boxes[ri];
        // a short band right on top of the robot: its own launches all pass through it,
        // other robots' arcs are usually higher up by the time they cross it
        const x0 = Math.max(0, Math.floor(b.x - BAND_X * b.w)), x1 = Math.min(W - 1, Math.ceil(b.x + (1 + BAND_X) * b.w));
        const y0 = Math.max(0, Math.floor(b.y - BAND_UP * b.h)), y1 = Math.min(H - 1, Math.floor(b.y + 0.08 * b.h));
        if (y1 <= y0 || x1 <= x0) return;
        const reach = Math.max(4, Math.round(b.h * 0.3));
        const scale = b.w / refW, pa = pieceArea * scale * scale, big = BIG * pa;
        // a driving robot shoves pieces along at its own speed: skip what's just where
        // the robot's motion would have carried last frame's pieces
        const mdx = Math.round(r.vx * dt), mdy = Math.round(r.vy * dt), carry = CARRY && Math.hypot(mdx, mdy) >= 1.5;
        let s = 0;
        if (SHOW) shown[ri] = [];
        for (let y = y0; y <= y1; y++) {
          const row = y * W;
          for (let x = x0; x <= x1; x++) {
            const i = row + x;
            if (!(cls[i] & 1) || (FAST ? near1[i] : still[i] >= STILL) || (big && comps[lab[i] - 1].n > big)) continue;
            if (carry) {
              const qx = x - mdx, qy = y - mdy;
              let moved = false;
              for (let ky = -1; ky <= 1 && !moved; ky++) for (let kx = -1; kx <= 1; kx++) {
                const yy = qy + ky, xx = qx + kx;
                if (yy >= 0 && yy < H && xx >= 0 && xx < W && prev1[yy * W + xx]) { moved = true; break; }
              }
              if (moved) continue;
            }
            let other = false;
            for (let k = 0; k < boxes.length; k++) {
              if (k === ri) continue;
              const o = boxes[k];
              if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) { other = true; break; }
            }
            if (other) continue;
            // rising (it was just below a frame ago) counts; falling (just above) doesn't
            let up = 0, dn = 0;
            for (let d = 2; d <= reach; d += 2) {
              if (y + d < H && prev1[i + d * W]) up = 1;
              if (y - d >= 0 && prev1[i - d * W]) dn = 1;
            }
            const wgt = up ? (dn ? 0.8 : 1) : dn ? 0 : 0.4;
            s += wgt; if (SHOW && wgt) shown[ri].push(i);
          }
        }
        if (!s) return;
        // pixels → pieces: a rising piece shows up once per frame it spends in the band
        const perFrame = Math.max(0.5, rise * b.h * dt); // how far a piece rises per frame (px)
        // no robot launches more than ~25 pieces a second: anything above is noise
        const pieces = Math.min(25 * dt, s / (pa * Math.max(1, (y1 - y0 + 1) / perFrame)));
        if (pieces < 0.05) return;
        r.launched += pieces;
        const pid = periodAt(t + 0.8); // it lands (and counts) about a second later
        r.byPeriod[pid] = (r.byPeriod[pid] || 0) + pieces;
        r.series.push(t, pieces);
        const [X, Y] = fieldPos(r); // where it shoots from, on a 12 × 6 grid of the field
        r.heat[Math.min(11, Math.floor(X * 12)) + 12 * Math.min(5, Math.floor(Y * 6))] += pieces;
      });
    }

    // --- 2. single flights, traced ball by ball ---
    let tracks = [], nextId = 1;
    const traces = [];   // recent finished arcs, for drawing
    const flights = [];  // finished flights: { t, robot, res }
    const minA = Math.max(2, Math.round(2 * u * u)), maxA = Math.round(900 * u * u);
    function robotCoreHit(x, y, boxes) {
      for (const b of boxes) if (x > b.x + b.w * 0.1 && x < b.x + b.w * 0.9 && y > b.y + b.h * 0.25 && y < b.y + b.h) return true;
      return false;
    }
    // Which robot launched a piece first seen at (x, y)? Nearest box top, within reach.
    function launcher(pts, boxes) {
      let best = -1, bd = Infinity;
      boxes.forEach((b, i) => {
        const tx = b.x + b.w / 2, ty = b.y + b.h * 0.15;
        for (const [qx, qy] of pts) {
          const dx = (qx - tx) / b.w, dy = (qy - ty) / b.h;
          if (dx < -1.1 || dx > 1.1 || dy < -1.9 || dy > 0.85) continue;
          const d = Math.hypot(dx, dy * 0.7);
          if (d < bd) { bd = d; best = i; }
        }
      });
      return best;
    }
    function finishTrack(tr, boxes) {
      const p = tr.pts, n = p.length;
      // A real flight is fast (a rolling piece isn't), smooth (a chain hopping between
      // different pieces zigzags) and seen at least three times.
      if (n < 3) return;
      const a = p[0], z = p[n - 1];
      let len = 0;
      const speeds = [];
      for (let k = 1; k < n; k++) {
        const d = Math.hypot(p[k].x - p[k - 1].x, p[k].y - p[k - 1].y);
        len += d; speeds.push(d / Math.max(1e-3, p[k].t - p[k - 1].t));
      }
      const vmed = speeds.slice().sort((x, y) => x - y)[speeds.length >> 1];
      const straight = Math.hypot(z.x - a.x, z.y - a.y) / Math.max(1e-6, len);
      if (len < 18 * u || vmed < 170 * u || straight < 0.72) return;
      // launched pieces leave a robot going up (or at least not falling)
      const v0x = p[1].x - a.x, v0y = p[1].y - a.y;
      const ri = v0y <= 0.35 * Math.hypot(v0x, v0y) ? launcher([[a.x, a.y], [a.x - v0x, a.y - v0y]], boxes) : -1;
      const rob = ri >= 0 ? robots[ri] : null;
      let res = "pass";
      if (rob) {
        // where it went: into its hub, near it (a miss), or somewhere else (a pass)
        const vx = z.x - p[n - 2].x, vy = z.y - p[n - 2].y, al = rob.alliance;
        const dEnd = Math.min(hubDist(al, z.x, z.y), hubDist(al, z.x + vx, z.y + vy) * 1.15);
        if (dEnd < 1.3) res = "make";
        else {
          let near = Infinity;
          for (let k = Math.floor(n * 0.4); k < n; k++) near = Math.min(near, hubDist(al, p[k].x, p[k].y));
          if (near < 3.5) res = "miss";
        }
        rob.traced++;
        if (res === "make") rob.makes++; else if (res === "miss") rob.misses++; else rob.passes++;
        const b = boxes[ri], dtt = Math.max(1e-3, p[1].t - a.t);
        riseSamples.push(Math.abs(v0y / dtt) / b.h);
        if (riseSamples.length >= 12 && riseSamples.length % 6 === 0) {
          const srt = riseSamples.slice(-200).sort((x, y) => x - y);
          rise = Math.max(2, Math.min(14, srt[srt.length >> 1]));
        }
      }
      flights.push({ t: a.t, robot: ri, res });
      traces.push({ pts: p.map((q) => [q.x, q.y]), robot: ri, res, at: z.t });
      if (traces.length > 80) traces.shift();
    }
    function tracePieces(t, boxes) {
      // a flying piece is a blob that's mostly new (it moved farther than its own size)
      const found = comps.filter((b) => b.n >= minA && b.n <= maxA && b.nn >= b.n * 0.55 && !robotCoreHit(b.x, b.y, boxes));
      if (found.length > 260) { tracks = []; return; }
      const used = new Uint8Array(found.length), pairs = [];
      tracks.forEach((tr, ti) => {
        const p = tr.pts, z = p[p.length - 1], lag = t - z.t;
        let ex = z.x, ey = z.y, gate = 30 * u * Math.min(3, Math.max(1, lag * 30));
        if (p.length > 1) {
          const y = p[p.length - 2], h = Math.max(1e-3, z.t - y.t);
          const vx = (z.x - y.x) / h, vy = (z.y - y.y) / h;
          ex = z.x + vx * lag; ey = z.y + vy * lag + 0.5 * gImg * lag * lag;
          gate = 6 * u + 0.35 * Math.hypot(vx, vy) * lag + 5 * u * tr.miss;
        }
        found.forEach((b, bi) => { const d = Math.hypot(b.x - ex, b.y - ey); if (d < gate) pairs.push([d, ti, bi]); });
      });
      pairs.sort((a, b) => a[0] - b[0]);
      const tUsed = new Uint8Array(tracks.length);
      for (const [, ti, bi] of pairs) {
        if (tUsed[ti] || used[bi]) continue;
        tUsed[ti] = 1; used[bi] = 1;
        const b = found[bi]; tracks[ti].pts.push({ t, x: b.x, y: b.y }); tracks[ti].miss = 0;
      }
      const keep = [];
      tracks.forEach((tr, ti) => {
        if (!tUsed[ti]) tr.miss++;
        if (tr.miss > 2 || tr.pts.length > 120) finishTrack(tr, boxes); else keep.push(tr);
      });
      found.forEach((b, bi) => { if (!used[bi]) keep.push({ id: nextId++, pts: [{ t, x: b.x, y: b.y }], miss: 0 }); });
      tracks = keep.length > 400 ? keep.slice(-400) : keep;
    }

    /* ================= one frame ================= */
    function thumb(out) {
      const cw = W / 32, ch = H / 18;
      for (let j = 0; j < 18; j++) for (let i = 0; i < 32; i++) {
        const x = Math.floor((i + 0.5) * cw), y = Math.floor((j + 0.5) * ch), p = (y * W + x) * 4;
        out[j * 32 + i] = px[p] * 0.3 + px[p + 1] * 0.59 + px[p + 2] * 0.11;
      }
    }
    const sceneDiff = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]); return s / a.length; };

    function step(rgba, t, model) {
      px = rgba; frames++;
      thumb(thumbNow);
      if (!haveRef) { thumbRef.set(thumbNow); haveRef = true; }
      // a replay, a close-up or an ad: wait for the field camera to come back
      if (sceneDiff(thumbNow, thumbRef) > (offField ? 26 : 34)) {
        offField = true; skipped++; warm = 0; tracks = []; lastT = t; still.fill(0);
        return { off: true };
      }
      if (offField) { offField = false; robots.forEach((r) => { r.lost = Math.max(r.lost, 16); }); }
      for (let k = 0; k < thumbRef.length; k++) thumbRef[k] += (thumbNow[k] - thumbRef[k]) * 0.01;
      const dt = lastT == null ? 1 / 30 : Math.max(1 / 90, Math.min(1, t - lastT));
      lastT = t;
      classify(px, N, cls, isPiece);
      if (frames === 1) { markFieldColors(); learnFloor(); robots.forEach(seedTemplate); const d = detectBumpers(); robots.forEach((r) => bumperOffset(r, d)); measurePiece(); }
      else { updateRobots(dt, model); motionCheck(); }
      // fresh = piece-colored now but in neither of the last two frames
      for (let i = 0; i < N; i++) fresh[i] = (cls[i] & 1) && !prev1[i] && !prev2[i] ? 1 : 0;
      if (warm >= 3) {
        const boxes = robots.map((r) => boxOf(r));
        labelPieces();
        if (frames % 3 === 0) learnFieldColors(boxes);
        // the flow needs STILL frames of history to tell resting pieces from moving ones
        if (warm > STILL) { if (FAST) dilatePrev(RAD || Math.max(1, Math.round(0.3 * Math.sqrt(pieceArea / Math.PI) * 2))); launchFlow(t, dt, boxes); }
        tracePieces(t, boxes);
      }
      for (let i = 0; i < N; i++) { const f = cls[i] & 1; prev2[i] = prev1[i]; prev1[i] = f; still[i] = f ? Math.min(255, still[i] + 1) : 0; }
      warm++;
      if (frames % 6 === 0) robots.forEach((r) => { const [X, Y] = fieldPos(r); r.path.push([Math.round(t * 10) / 10, +X.toFixed(3), +Y.toFixed(3), unsure(r) ? 1 : 0]); });
      return { off: false };
    }

    // a scout put a robot back where it belongs
    function relocate(i, box) {
      const r = robots[i]; if (!r || !px) return;
      r.cx = box.x + box.w / 2; r.cy = box.y + box.h / 2; r.vx = 0; r.vy = 0;
      r.off = r.cx < 0 || r.cx > W || r.cy < 0 || r.cy > H; r.pend = null;
      r.k = box.w / sizeAt(r.cy); r.aspect = box.h / box.w;
      seedTemplate(r);
      bumperOffset(r, detectBumpers());
    }

    /* ---- what to draw right now ---- */
    function view(t) {
      return {
        robots: robots.map((r) => Object.assign(boxOf(r), { team: r.team, alliance: r.alliance, est: unsure(r), off: r.off, lostFor: r.off ? 0 : Math.max(r.lost, r.weak), field: fieldPos(r),
          firing: recentRate(r, t) })),
        tracks: tracks.filter((tr) => tr.pts.length > 2).map((tr) => tr.pts.slice(-8).map((q) => [q.x, q.y])),
        traces: traces.filter((tr) => t - tr.at < 1.2).map((tr) => ({ pts: tr.pts, robot: tr.robot, res: tr.res, age: t - tr.at })),
        off: offField,
      };
    }
    // pieces per second leaving a robot over the last second
    function recentRate(r, t) {
      let s = 0;
      for (let k = r.series.length - 2; k >= 0 && r.series[k] > t - 1; k -= 2) s += r.series[k + 1];
      return s;
    }

    /* ---- live counts ---- */
    function tally() {
      return robots.map((r) => ({ team: r.team, alliance: r.alliance, shots: r.launched, makes: r.makes, misses: r.misses, passes: r.passes,
        traced: r.traced, byPeriod: r.byPeriod }));
    }

    /* ---- the end: split the official counts by who was shooting ---- */
    // official: { red: { periods: { auto: n, … }, climbs: [pts r1..r3], climbLabels: [...], piecePoints }, blue: {…} }
    function finish(official) {
      tracks.forEach((tr) => finishTrack(tr, robots.map((r) => boxOf(r)))); tracks = [];
      const out = robots.map((r) => ({ team: r.team, alliance: r.alliance, shots: r.launched, traced: r.traced,
        makes: r.makes, misses: r.misses, passes: r.passes, fuel: 0, byPeriod: {}, path: r.path }));
      ["red", "blue"].forEach((al) => {
        const idx = out.map((o, i) => (o.alliance === al ? i : -1)).filter((i) => i >= 0);
        const off = (official && official[al]) || {}, counts = off.periods || {};
        const total = Object.values(counts).reduce((s, v) => s + (v || 0), 0);
        let launched = idx.reduce((s, i) => s + robots[i].launched, 0);
        // Shots can't be fewer than makes: if the flow undercounted (a hidden robot, a
        // replay), scale this alliance's shots up so it isn't credited 100%+.
        const lift = launched > 0 && total > launched * 0.95 ? total / (launched * 0.95) : 1;
        // each robot's make rate from its traced flights, pulled toward the alliance's
        const allianceRate = launched > 0 ? Math.min(1, total / (launched * lift)) : 0.7;
        const rate = idx.map((i) => { const r = robots[i], aimed = r.makes + r.misses; return (r.makes + 6 * allianceRate) / (aimed + 6); });
        const whole = idx.map((i, k) => robots[i].launched * rate[k]);
        Object.keys(counts).forEach((pid) => {
          const C = counts[pid] || 0;
          let w = idx.map((i, k) => (robots[i].byPeriod[pid] || 0) * rate[k]);
          if (!(w.reduce((s, x) => s + x, 0) > 0.5)) w = whole.slice();      // nobody seen shooting then
          if (!w.some((x) => x > 0)) w = idx.map(() => 1);
          const sum = w.reduce((s, x) => s + x, 0);
          // largest-remainder rounding so the robots add up to the official count exactly
          const raw = w.map((x) => (C * x) / sum), base = raw.map(Math.floor);
          let left = C - base.reduce((s, x) => s + x, 0);
          raw.map((x, k) => [x - base[k], k]).sort((a, b) => b[0] - a[0]).forEach(([, k]) => { if (left > 0) { base[k]++; left--; } });
          idx.forEach((i, k) => {
            out[i].byPeriod[pid] = { fuel: base[k], shots: Math.round((robots[i].byPeriod[pid] || 0) * lift) };
            out[i].fuel += base[k];
          });
        });
        idx.forEach((i, k) => {
          const o = out[i];
          o.shots = Math.round(robots[i].launched * lift);
          o.acc = o.shots >= 5 ? Math.min(1, o.fuel / o.shots) : null;
          o.climb = (off.climbs || [])[k] || 0;
          o.climbLabel = (off.climbLabels || [])[k] || "";
          o.points = o.fuel * (off.piecePoints || 1) + o.climb;
          o.lift = +lift.toFixed(2);
        });
      });
      // shooting pace from the launch flow: seconds where it was shooting ≥ 1.5 pieces/s
      out.forEach((o, i) => {
        const s = robots[i].series, lift = o.lift || 1;
        let shootPieces = 0, shootSec = 0, peak = 0;
        const bins = new Map(); // quarter-second bins
        for (let k = 0; k < s.length; k += 2) { const b = Math.floor(s[k] * 4); bins.set(b, (bins.get(b) || 0) + s[k + 1] * lift); }
        const keys = [...bins.keys()].sort((a, b) => a - b);
        keys.forEach((b) => {
          let win = 0; for (let j = b; j < b + 4; j++) win += bins.get(j) || 0; // the next second
          peak = Math.max(peak, win);
          const rateHere = (bins.get(b - 1) || 0) + bins.get(b) + (bins.get(b + 1) || 0); // ~0.75 s around it
          if (rateHere / 0.75 >= 1.5) { shootPieces += bins.get(b); shootSec += 0.25; }
        });
        o.bps = shootSec ? +Math.min(30, shootPieces / shootSec).toFixed(1) : 0;
        o.peakBps = +Math.min(30, peak).toFixed(1);
        o.tracked = robots[i].seen ? +(robots[i].sure / robots[i].seen).toFixed(2) : 0; // share of the match it was surely on its robot
        o.shootSec = +shootSec.toFixed(1);
        o.heat = Array.from(robots[i].heat, (v) => Math.round(v * lift * 10) / 10);
      });
      return { robots: out, frames, skipped, flights: flights.length };
    }

    // for tuning: what each robot's tracker is thinking
    const debug = () => robots.map((r) => ({ team: r.team, cost: +r.cost.toFixed(1), lastC: r.lastC, col: r.lastCol, bumperHit: r.lastB, bumper: +r.bumper.toFixed(2), lost: r.lost, weak: r.weak, colorBad: r.colorBad, x: Math.round(r.cx), y: Math.round(r.cy) }));
    // for tuning: how alike the robots' color fingerprints are (1 = identical)
    const colorPairs = () => robots.map((a) => robots.map((b) => +bc(a.h0, b.h0).toFixed(2)));
    const tune = (o) => { if (o.bandUp) BAND_UP = o.bandUp; if (o.bandX != null) BAND_X = o.bandX; if (o.big != null) BIG = o.big; if (o.show != null) SHOW = o.show; if (o.rad != null) RAD = o.rad; if (o.fast != null) FAST = o.fast; if (o.carry != null) CARRY = o.carry; if (o.wDist != null) W_DIST = o.wDist; if (o.wLook != null) W_LOOK = o.wLook; if (o.wCol != null) W_COL = o.wCol; if (o.wNone != null) W_NONE = o.wNone; if (o.mOn != null) M_ON = o.mOn; if (o.mThr != null) M_THR = o.mThr; if (o.mFrames != null) M_FRAMES = o.mFrames; if (o.mLost != null) M_LOST = o.mLost; if (o.bEma != null) B_EMA = o.bEma; };
    return { step, view, tally, finish, relocate, periodAt, debug, tune, colorPairs, shown: () => shown, bumpers: () => (px ? detectBumpers() : null), get frames() { return frames; }, get skipped() { return skipped; } };
  }

  return { create, findRobots, snapBox, homography, applyH, PIECES };
})();

window.AutoScout = AutoScout;
