/* =============================================================================
   avatars-art-bakery.js  —  the 30 Common, 25 Uncommon and 20 Rare bagels
   Drawn from the reference sheets in media/avatar ref/common-rare: commons
   follow the BASE design, uncommons VARIATION 1, rares VARIATIONS 1 and 2.
   Shared "bakery" kit: dough, toppings, frostings, drizzles, fruit.
   ========================================================================== */
(() => {
  "use strict";
  const { C, R, H, f, pol, circ, poly, pp, arc, sect, strap, smooth, tube, star, spark, rhomb, petal, leaf, drop, heart,
    at, P, S, L, G, anim, gem, cluster, bubble, puffs, twinkle } = Avatars.K;
  const INK = "#2b1406";

  /* ---- dough: lip by the hole, top, side, outer edge ---- */
  const DOUGH = {
    golden: ["#fcd793", "#f9b955", "#ef9a2e", "#c96e18"], wheat: ["#f0c88c", "#dc9a52", "#c47c34", "#97561c"],
    rye: ["#f0c890", "#dda060", "#c98446", "#9c5e28"], dark: ["#b98b62", "#7e4e2c", "#62391c", "#43230d"],
    pale: ["#fff4d8", "#fde0a4", "#f6c070", "#dc9440"], toast: ["#fde0a2", "#f8b154", "#ec8f2c", "#c4621a"],
    corn: ["#ffe9a0", "#fdcb52", "#f4a82a", "#d07e12"], sugar: ["#f6d8a8", "#e8ae68", "#d18c46", "#a8622a"],
    orange: ["#fde0b0", "#f8b05a", "#ec8a2e", "#c4621a"], red: ["#f2a0a8", "#d83448", "#b81c34", "#7e0c1e"],
    choc: ["#b88866", "#6e3e22", "#56301a", "#3a1e0c"], green: ["#e6f0a8", "#9cb84a", "#7f9a36", "#5a7020"],
  };
  function dough(k, d, ink = INK) {
    const c = DOUGH[d] || d;
    k.base = k.radU([[0.22, c[3]], [0.28, c[0]], [0.43, c[1]], [0.74, c[2]], [0.93, c[2]], [1, c[3]]]);
    k.ink = ink; k.wall = c[3]; k.sw = 3.4;
    k.ts = k.rarity === "common" ? 1.4 : 1.15; // toppings read big, like the reference sheets
    return c;
  }
  // lighter / darker streaks swirling round the bagel (the twisted-dough look)
  function streaks(k, color, n = 5, op = 0.55, w = 7, sweep = 80) {
    for (let i = 0; i < n; i++) {
      const a = i * 360 / n + k.r(-8, 8);
      k.body += P(tube(pp([[a, 15], [a + sweep * 0.3, 26], [a + sweep * 0.62, 38], [a + sweep, 52]]), (t) => 0.6 + w * Math.sin(Math.PI * t)), color, ` opacity="${op}"`);
    }
  }
  // n spots on the ring that don't crowd each other: [x, y, rot, angle, radius]
  function spots(k, n, gap, r0 = H + 5, r1 = R - 5) {
    const out = [];
    for (let tries = 0; out.length < n && tries < n * 80; tries++) {
      const a = k.r(0, 360), r = Math.sqrt(k.r(r0 * r0, r1 * r1)), [x, y] = pol(a, r);
      if (out.every(([u, v]) => (u - x) ** 2 + (v - y) ** 2 >= gap * gap)) out.push([x, y, k.r(0, 360), a, r]);
    }
    return out;
  }
  const put = (k, list, fn, layer = "body") => { k[layer] += list.map(([x, y, rot, a, r], i) => fn(x, y, rot, i, a, r)).join(""); };
  const sprinkle = (k, n, gap, fn, r0, r1, layer) => { const s = k.ts || 1; put(k, spots(k, n, gap * s, r0, r1), (x, y, rot, i, a, r) => (s === 1 ? fn(x, y, rot, i, a, r) : G(at(x, y, 0, s), fn(0, 0, rot, i, a, r))), layer); };
  const dot = (x, y, r, fill, x2 = "") => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}"${x2}/>`;

  /* ---- toppings, drawn at (x, y) turned `rot` ---- */
  const seedD = (s, w = 0.6) => `M0 ${-s}C${f(s * w)} ${f(-s * 0.42)} ${f(s * w * 0.9)} ${f(s * 0.62)} 0 ${s}C${f(-s * w * 0.9)} ${f(s * 0.62)} ${f(-s * w)} ${f(-s * 0.42)} 0 ${-s}Z`;
  const ovalD = (rx, ry) => `M${-rx} 0A${rx} ${ry} 0 1 0 ${rx} 0A${rx} ${ry} 0 1 0 ${-rx} 0Z`;
  const chunkD = (k, s) => poly(Array.from({ length: 6 }, (_, i) => pol(i * 60 + k.r(-14, 14), s * k.r(0.75, 1.1), 0, 0)));
  const T = {
    sesame: (x, y, r) => G(at(x, y, r), S(seedD(2.5), "#fff3d6", "#7a4a1c", 0.7) + L("M-.5 -1.2Q-.6 0 -.3 1", "#fff", 0.6)),
    poppy: (x, y) => dot(x, y, 0.95, "#2a2833"),
    oat: (x, y, r) => G(at(x, y, r), S(ovalD(4.6, 2.6), "#fbecc6", "#8a5a24", 0.8) + L("M-3 0Q0 -1 3 0", "#d9b77e", 0.7) + L("M-2.6 -1.2Q-1 -1.9 1 -1.7", "#fff", 0.6)),
    flax: (x, y, r) => G(at(x, y, r), S(seedD(2.6, 0.55), "#7a3c18", "#2b1406", 0.6) + L("M-.4 -1.4Q-.6 0 -.4 1.2", "#c8865a", 0.6)),
    sunflower: (x, y, r) => G(at(x, y, r), S(seedD(4, 0.5), "#3e3d44", INK, 0.8) + L("M-.9 -2.6L-.8 2.6M.9 -2.6L.8 2.6", "#a9a8b0", 0.6)),
    pepita: (x, y, r) => G(at(x, y, r), S(seedD(3.8, 0.62), "#86a04a", "#2e3e10", 0.8) + P(seedD(2.6, 0.5), "#a9bf62") + L("M0 -2.4V2.2", "#6a8236", 0.5)),
    salt: (k) => (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(1.6, 2.6)), "#fbfcff", "#8c909c", 0.6) + P("M-1 -1.4L.6 -1.2L.2 .2Z", "#d6d9e2")),
    sugar: (k) => (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(1.3, 2)), "#ffffff", "#b9a88a", 0.5)),
    brownsugar: (k) => (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(1.8, 2.6)), "#c47a30", "#5a2c08", 0.7) + P("M-1 -1.2L.8 -1L0 .2Z", "#eaa860")),
    onion: (k) => (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(1.8, 2.6)), "#fff2d2", "#9a6a3a", 0.6)),
    toastbit: (k) => (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(1.2, 1.8)), "#9a4a1a", "#4a1c04", 0.5)),
    garlic: (k) => (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(2, 2.8)), "#fff6dc", "#a48a5a", 0.6) + P("M-1 -1.2L.8 -1L0 0Z", "#ffffff")),
    corn: (x, y) => dot(x, y, 1.1, "#ffd23a", ' stroke="#b4801c" stroke-width=".4"'),
    barley: (x, y, r) => G(at(x, y, r), S(ovalD(3.4, 2), "#fbe4b0", "#8a5a24", 0.7) + L("M-2.2 0H2.2", "#c9a066", 0.6)),
    spelt: (x, y, r) => G(at(x, y, r), S(seedD(3.6, 0.55), "#f6dcaa", "#8a5a24", 0.7) + L("M0 -2.4V2.4", "#c9a066", 0.5)),
    caraway: (x, y, r) => G(at(x, y, r), L("M-1.8 .6Q0 -1 1.8 .6", "#4a2a10", 1.2)),
    bran: (k) => (x, y, r) => G(at(x, y, r), P(chunkD(k, k.r(0.8, 1.3)), k.pick(["#fbe6c0", "#a8662a", "#f2d29a", "#8a4e1e"]))),
    speck: (x, y) => dot(x, y, 0.7, "#8a4a1a", ' opacity=".8"'),
    vanilla: (x, y) => dot(x, y, 0.55, "#2a1a0e"),
    parsley: (x, y, r) => G(at(x, y, r), S("M0 -2.2Q2.2 -1.6 1.6 .6Q.6 2.2 -1 1.4Q-2.4 0 0 -2.2Z", "#3e9a2a", "#14400a", 0.5)),
    chive: (x, y, r) => G(at(x, y, r), S("M-1.4 -.7H1.4V.7H-1.4Z", "#4cae3a", "#1a4a0e", 0.5)),
    chip: (x, y, r) => G(at(x, y, r), S("M0 -3.4L3 2.2Q0 3.2 -3 2.2Z", "#4a2412", "#1a0a02", 0.8) + P("M-.6 -1.8L.6 -1.8L.2 0Z", "#8a5236")),
    raisin: (x, y, r) => G(at(x, y, r), S("M-2.8 -.6Q-2.2 -2.2 0 -1.8Q2.6 -2.2 2.8 0Q2.6 2 0 1.8Q-2.6 2.2 -2.8 -.6Z", "#4a1e3a", "#1e0a18", 0.7) + L("M-1.2 -.6Q0 .3 1.4 -.4", "#7a4a6a", 0.6)),
    cranberry: (x, y, r) => G(at(x, y, r), S("M-2.6 -.8Q-1.8 -2.6 .4 -2.4Q2.8 -1.8 2.6 .8Q1.8 2.6 -.4 2.4Q-2.8 1.8 -2.6 -.8Z", "#b8183a", "#4a0414", 0.8) + dot(-0.9, -0.9, 0.7, "#ff8aa0")),
    blueberry: (x, y, r) => G(at(x, y, r), `<circle r="3.3" fill="#3a3aa8" stroke="#141446" stroke-width=".8"/>` + P(star(1.2, 0.5, 5), "#1a1a5a", ' transform="translate(.4 -.4)"') + dot(-1.3, -1.3, 0.8, "#a8b0ff")),
    raspberry: (x, y) => [[0, 0], [1.6, 0], [-1.6, 0], [0.8, -1.4], [-0.8, -1.4], [0.8, 1.4], [-0.8, 1.4]].map(([a, b]) => dot(x + a, y + b, 1.05, "#e0285a", ' stroke="#6a0420" stroke-width=".45"')).join("") + dot(x - 0.6, y - 0.8, 0.45, "#ffc0d4"),
    almond: (x, y, r) => G(at(x, y, r), S("M0 -4.4Q3 -1.6 2.2 2Q0 4 -2.2 2Q-3 -1.6 0 -4.4Z", "#f6e2bc", "#8a5226", 0.8) + L("M0 -4.2Q2.6 -1.2 2 1.8Q0 3.6 -2 1.8", "#c48a54", 0.8)),
    pecan: (x, y, r) => G(at(x, y, r), S("M-2.6 -4C-.6 -4.6 .6 -4.6 2.6 -4C3.4 -1 3.4 1 2.6 4C.6 4.6 -.6 4.6 -2.6 4C-3.4 1 -3.4 -1 -2.6 -4Z", "#8a3e18", "#2e1004", 0.8) + L("M0 -4V4M-2 -2Q0 -1 2 -2M-2 1Q0 2 2 1", "#5a2208", 0.7)),
    nut: (k) => (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(1.8, 2.6)), k.pick(["#f6dcae", "#c88a4a"]), "#5a3010", 0.6)),
    coconut: (x, y, r) => G(at(x, y, r), S("M-3 -1Q0 -2.6 3 -1L2.6 1Q0 -.4 -2.6 1Z", "#fffaf0", "#a8885a", 0.6) + L("M-2.4 -.4Q0 -1.6 2.4 -.4", "#e8b878", 0.6)),
    zest: (color, dark) => (x, y, r) => G(at(x, y, r), S("M-2.6 -.6Q0 -1.4 2.6 -.4L2.4 .6Q0 -.2 -2.4 .6Z", color, dark, 0.5)),
    pepper: (x, y, r) => G(at(x, y, r), P("M-.6 -.4L.6 -.5L.5 .5L-.5 .4Z", "#3a2a1a")),
    sprinkle: (x, y, r, i) => G(at(x, y, r), `<rect x="-2.2" y="-.8" width="4.4" height="1.6" rx=".8" fill="${["#ff5a8a", "#4ab8ff", "#ffd34a", "#6ad86a", "#b07aff", "#ff8a3a"][i % 6]}" stroke="rgba(0,0,0,.25)" stroke-width=".3"/>`),
  };

  /* ---- spreads, frostings, drizzles ---- */
  // a frosting ring on top with drips running over both edges
  function icingPath(k, rIn = 19, rOut = 46, nOut = 8, nIn = 3, dOut = 8, dIn = 4.6) {
    const edge = (r, n, dir, depth) => {
      const drips = Array.from({ length: n }, (_, i) => i * 360 / n + k.r(-10, 10) + 5), ps = [];
      for (let a = 0; a < 360; a += 5) {
        const d = drips.find((v) => v >= a && v < a + 5);
        ps.push(pol(a, r + Math.sin(a * 0.31) * 1.1));
        if (d != null) {
          const dp = depth * k.r(0.65, 1.15);
          [[-4.4, 0.12], [-2.8, 0.5], [-2.6, 0.84], [-1.3, 1.02], [0, 1.08], [1.3, 1.02], [2.6, 0.84], [2.8, 0.5], [4.4, 0.12]].forEach(([da, t]) => { const rr = r + dir * dp * t; ps.push(pol(d + da * 57.3 / rr, rr)); });
        }
      }
      return smooth(ps);
    };
    return edge(rOut, nOut, 1, dOut) + edge(rIn, nIn, -1, dIn);
  }
  function icing(k, fill, edge, o = {}) {
    const d = icingPath(k, o.rIn, o.rOut, o.nOut, o.nIn, o.dOut, o.dIn);
    k.body += P(d, "#000", ' fill-rule="evenodd" opacity=".18" transform="translate(.8 1.6)"') + S(d, fill, edge || k.ink, 1.3, ' fill-rule="evenodd"')
      + L(arc((o.rOut || 46) - 4.4, -72, -26), "#fff", 2.4, ' opacity=".6"') + L(arc((o.rIn || 19) + 3.6, 196, 238), "#fff", 1.5, ' opacity=".45"');
    return d;
  }
  // thick paste with a wavy edge and no drips (peanut butter, guac)
  const spread = (k, fill, edge, rIn = 19, rOut = 47) => icing(k, fill, edge, { rIn, rOut, nOut: 0, nIn: 0 });
  // parallel diagonal stripes of drizzle across the whole bagel
  function stripes(k, color, n = 5, w = 4.4, tilt = -35, edge = "") {
    let s = "";
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * (100 / n), ps = [];
      for (let t = -70; t <= 70; t += 14) ps.push([f(64 + t + Math.sin((t + i * 30) * 0.08) * 2.2), f(64 + off + Math.sin(t * 0.09 + i) * 3)]);
      const d = smooth(ps, false);
      s += L(d, edge || k.ink, w + 2) + L(d, color, w) + L(d, "#fff", w * 0.3, ' opacity=".55" transform="translate(-.4 -.8)"');
    }
    k.body += `<g transform="rotate(${tilt} 64 64)">${s}</g>`;
  }
  // a zigzag of drizzle running round the ring
  function zigzag(k, color, n = 11, r0 = 21, r1 = 47, w = 3.2, edge = "") {
    const d = smooth(Array.from({ length: n * 2 + 1 }, (_, i) => pol(i * 180 / n + k.r(-3, 3), i % 2 ? r1 + k.r(-2, 2) : r0 + k.r(-1, 2))), false);
    k.body += L(d, edge || k.ink, w + 2) + L(d, color, w) + L(d, "#fff", w * 0.3, ' opacity=".55" transform="translate(-.4 -.6)"');
  }
  function swirl(k, color, edge, turns = 1.6, w = 6) {
    const ps = []; for (let i = 0; i <= 64; i++) { const t = i / 64; ps.push(pol(t * 360 * turns + 20, 16 + t * 36)); }
    k.body += S(tube(ps, (t) => w * Math.sin(Math.PI * (0.06 + t * 0.88)) + 0.6, 3), color, edge, 0.9);
  }
  // melted cheese: blobby patches
  function melt(k, color, edge, n = 7, r0 = 22, r1 = 46, s0 = 6, s1 = 9) {
    let s = "";
    spots(k, n, 13, r0, r1).forEach(([x, y]) => {
      const w = k.r(s0, s1), ps = Array.from({ length: 10 }, (_, j) => { const t = j / 10 * Math.PI * 2, m = 1 + k.r(-0.18, 0.22); return [f(x + Math.cos(t) * w * m), f(y + Math.sin(t) * w * 0.8 * m)]; });
      s += P(smooth(ps), "#000", ' opacity=".14" transform="translate(.6 1.2)"') + S(smooth(ps), color, edge, 0.9) + P(smooth(ps.map(([px, py]) => [f(x + (px - x) * 0.45 - 1), f(y + (py - y) * 0.45 - 1)])), "#fff", ' opacity=".35"');
    });
    k.body += s;
  }
  const shreds = (k, n, color, edge) => sprinkle(k, n, 5.2, (x, y, r) => G(at(x, y, r), S("M-3.4 -.9H3.4V.9H-3.4Z", color, edge, 0.6)));

  /* ---- fruit and bits ---- */
  function citrusWedge(x, y, s, rot, peel, flesh, ink) {
    let seg = ""; for (let i = 1; i < 4; i++) seg += L(`M0 0L${pol(-90 + i * 45, s * 0.8, 0, 0)}`, "#fff", 0.7, ' opacity=".85"');
    return G(at(x, y, rot), S(`M${-s} 0A${s} ${s} 0 0 1 ${s} 0Z`, peel, ink, 1) + P(`M${f(-s * 0.8)} 0A${f(s * 0.8)} ${f(s * 0.8)} 0 0 1 ${f(s * 0.8)} 0Z`, "#fffbe8") + P(`M${f(-s * 0.7)} 0A${f(s * 0.7)} ${f(s * 0.7)} 0 0 1 ${f(s * 0.7)} 0Z`, flesh) + seg);
  }
  const bananaSlice = (x, y, s) => `<circle cx="${f(x)}" cy="${f(y)}" r="${s}" fill="#fff2c4" stroke="#8a6a1a" stroke-width="1"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.62)}" fill="#fbe49a" opacity=".8"/>`
    + G(at(x, y), L(Array.from({ length: 5 }, (_, i) => `M0 0L${pol(i * 72, s * 0.42, 0, 0)}`).join(""), "#c8a24a", 0.8)) + dot(x, y, 0.6, "#8a6a2a");
  const strawSlice = (x, y, s, rot) => G(at(x, y, rot, s / 5), S("M0 5L-5 -3Q-3 -5.4 0 -5Q3 -5.4 5 -3Z", "#e8283c", "#5a0412", 1) + P("M0 3.4L-3.4 -2.4Q-2 -3.8 0 -3.4Q2 -3.8 3.4 -2.4Z", "#ff8a96") + P("M0 1.8L-1.6 -1.4Q0 -2 1.6 -1.4Z", "#fff0f0", ' opacity=".9"')
    + [[-2.4, -1.6], [2.4, -1.6], [0, 2.4], [-1.2, .4], [1.2, .4]].map(([a, b]) => `<ellipse cx="${a}" cy="${b}" rx=".35" ry=".6" fill="#ffe27a"/>`).join(""));
  const avoSlice = (x, y, s, rot) => G(at(x, y, rot, s / 9), S("M-9 2C-7 -5 7 -5 9 2C5 -1 -5 -1 -9 2Z", "#2e5a12", "#0e2a04", 1) + P("M-7.6 1.2C-5.6 -3.6 5.6 -3.6 7.6 1.2C4.4 -.8 -4.4 -.8 -7.6 1.2Z", "#d6ea8a") + P("M-6 .6C-4 -2.2 4 -2.2 6 .6C3 -.6 -3 -.6 -6 .6Z", "#b0d45a", ' opacity=".8"'));
  const jalaRing = (x, y, s) => `<circle cx="${f(x)}" cy="${f(y)}" r="${s}" fill="#2e8a22" stroke="#0e3a08" stroke-width="1"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.68)}" fill="#cfe89a"/>` + [0, 72, 144, 216, 288].map((a) => `<ellipse cx="${pol(a, s * 0.38, x, y)[0]}" cy="${pol(a, s * 0.38, x, y)[1]}" rx=".6" ry="1" transform="rotate(${a} ${pol(a, s * 0.38, x, y).join(" ")})" fill="#fffbe0"/>`).join("") + dot(x, y, f(s * 0.16), "#eaf6c0");
  const appleChunk = (x, y, s, rot) => G(at(x, y, rot, s / 3.4), S("M-3.4 -2.6Q-3.4 -3.4 -2.6 -3.4H2.6Q3.4 -3.4 3.4 -2.6V2.6Q3.4 3.4 2.6 3.4H-2.6Q-3.4 3.4 -3.4 2.6Z", "#fff4d0", "#5a2a08", 0.8) + P("M-3.4 -1.4V-2.6Q-3.4 -3.4 -2.6 -3.4H2.6Q3.4 -3.4 3.4 -2.6V-1.4Z", "#d8282c"));
  const cherryChunk = (x, y, r) => G(at(x, y, r), S("M-2.8 -1Q-2 -3 .4 -2.8Q3 -2.2 2.8 .6Q2 3 -.4 2.8Q-3 2.2 -2.8 -1Z", "#c0102e", "#4a0410", 0.8) + dot(-0.9, -1, 0.8, "#ff7a90"));
  const baconBit = (x, y, r, s = 1) => G(at(x, y, r, s), S("M-4.4 -2.4Q-2 -3.4 0 -2.4Q2.4 -3.2 4.4 -2.2L4 2.4Q2 3.2 0 2.4Q-2.4 3.4 -4.2 2.4Z", "#c8423a", "#4a0a06", 0.9) + L("M-3.8 -.6Q-1.6 -1.4 0 -.6Q2 -1.4 3.8 -.4", "#fbd8c4", 1.1) + L("M-3.6 1.2Q-1.4 .6 .4 1.2Q2 .6 3.6 1.4", "#8a1a14", 0.8));
  const pepperoni = (x, y, s) => `<circle cx="${f(x)}" cy="${f(y)}" r="${s}" fill="#d8302a" stroke="#4a0606" stroke-width="1"/>` + [[0.3, -0.3, 0.14], [-0.35, 0.2, 0.11], [0.1, 0.45, 0.1], [-0.2, -0.45, 0.09]].map(([a, b, r]) => dot(x + a * s, y + b * s, f(r * s), "#8a1414")).join("") + L(arc(s * 0.72, 200, 265, x, y), "#ff9a8a", 0.9, ' opacity=".8"');
  const mushroom = (x, y, r) => G(at(x, y, r), S("M-4 0C-4 -4.4 4 -4.4 4 0Z", "#d8c0a0", "#4a3018", 0.8) + S("M-1.4 0H1.4L1.2 3.4H-1.2Z", "#f2e2c8", "#4a3018", 0.7) + L("M-2.6 -1.4Q0 -3 2.6 -1.4", "#f6e8d0", 0.7));
  const greenPepper = (x, y, r) => G(at(x, y, r), L("M-3 1Q-3.4 -2.4 0 -2.8Q3.4 -2.4 3 1", "#2e8a22", 2.2) + L("M-3 1Q-3.4 -2.4 0 -2.8Q3.4 -2.4 3 1", "#6ad04a", 0.9));
  const marsh = (x, y, s, rot) => G(at(x, y, rot, s / 4), S("M-4 -3Q-4 -4 -3 -4H3Q4 -4 4 -3V3Q4 4 3 4H-3Q-4 4 -4 3Z", "#fffaf2", "#6a4a2a", 0.8) + P("M-4 -.6Q-4 -4 -1 -4H3Q4 -4 4 -3V-.6Q1 .6 -4 -.6Z", "#e8a24a", ' opacity=".9"') + P("M-2 -3H1.4V-2.4H-2Z", "#fff", ' opacity=".6"'));
  const graham = (x, y, s, rot) => G(at(x, y, rot, s / 4), S("M-4 -4H4V4H-4Z", "#e0a050", "#5a3010", 0.8) + [-2, 0, 2].map((a) => [-2, 0, 2].map((b) => dot(a, b, 0.45, "#a8642a")).join("")).join("") + L("M-4 -.1H4", "#b8743a", 0.5));
  const chocChunk = (x, y, s, rot) => G(at(x, y, rot, s / 4), S("M-4 -3.4H4V3.4H-4Z", "#4a2212", "#1a0802", 0.8) + P("M-4 -3.4H4L2.6 -2H-2.6Z", "#7a4428") + L("M0 -3.4V3.4", "#2a1006", 0.6));
  const cookie = (x, y, s, rot) => G(at(x, y, rot, s / 5), `<circle r="5" fill="#2a2420" stroke="#0e0a08" stroke-width="1"/>` + `<path d="M-5 0A5 5 0 0 0 5 0Z" fill="#3a322c"/>` + L(arc(3.4, 0, 359.9, 0, 0), "#4a403a", 0.6) + `<rect x="-5" y="-.9" width="10" height="1.8" fill="#fffaf0" stroke="#0e0a08" stroke-width=".5"/>` + `<path d="M-5 -1A5 5 0 0 1 5 -1" fill="#2a2420" stroke="#0e0a08" stroke-width=".6"/>`);
  const crumb = (k) => (x, y, r) => G(at(x, y, r), P(chunkD(k, k.r(1, 2)), "#2a2420"));
  const leafy = (x, y, rot, len, w, fill, dark) => G(at(x, y, rot), S(leaf(len, w), fill, dark, 0.9) + L(`M0 -.6L0 ${f(-len * 0.85)}`, "#fff", 0.6, ' opacity=".5"'));
  const swirlDollop = (x, y, s, c1, c2) => G(at(x, y, 0, s / 6), S("M-6 2C-6.4 -1 -4 -2.6 -1.6 -2.4C-1.4 -4.6 1.6 -5.6 3 -3.6C5 -3.2 6.4 -.6 6 2C3 4 -3 4 -6 2Z", c1, "#4a1a3a", 0.9) + L("M-4 .4C-2 -1.6 2 -1.6 4 .4M-1.6 -2.2C0 -3.2 1.6 -3 2.4 -2.2", c2, 1) + `<circle cx="0" cy="-5.4" r="1.6" fill="${c1}" stroke="#4a1a3a" stroke-width=".8"/>`);
  const shellD = "M0 4L-5 -1Q-4.6 -5 0 -5.6Q4.6 -5 5 -1Z";
  const shell = (x, y, rot, s = 1) => G(at(x, y, rot, s), S(shellD, "#ffe2c8", "#7a3a1a", 0.9) + L("M0 4L-2.8 -4.4M0 4L0 -5.4M0 4L2.8 -4.4", "#e0a07a", 0.7) + S("M-1.6 4H1.6V5.4H-1.6Z", "#ffd0b0", "#7a3a1a", 0.6));
  const starfish = (x, y, rot, s = 1) => G(at(x, y, rot, s), S(star(6, 2.6, 5), "#ff8a5a", "#6a1e08", 1) + [0, 72, 144, 216, 288].map((a) => dot(...pol(a, 2.6, 0, 0), 0.5, "#ffd0b0")).join("") + dot(0, 0, 0.6, "#ffd0b0"));
  const ammonite = (x, y, s, rot) => { const ps = []; for (let i = 0; i <= 48; i++) { const t = i / 48; ps.push(pol(t * 1000, 0.8 + t * 6.4 * s, x, y)); } return G(`transform="rotate(${rot} ${f(x)} ${f(y)})"`, `<circle cx="${f(x)}" cy="${f(y)}" r="${f(7.4 * s)}" fill="#c9a87a" stroke="#4a3018" stroke-width="1"/>` + L(smooth(ps, false), "#6a4a28", 1.1) + Array.from({ length: 10 }, (_, i) => L(`M${pol(i * 36, 4.2 * s, x, y)}L${pol(i * 36, 7 * s, x, y)}`, "#8a6a44", 0.6)).join("")); };
  const sparkles = (k, n, color = "#fff", r0 = 20, r1 = 56, s = 2.8) => { for (let i = 0; i < n; i++) { const [x, y] = pol(k.r(0, 360), k.r(r0, r1)); k.front += twinkle(x, y, s, color, i * 0.9 + k.r(0, 1), 2.8); } };
  const steam = (k, n = 3, x = 64, y = 26) => { for (let i = 0; i < n; i++) k.front += G(at(x + (i - 1) * 9, y), anim("ri", i * 1, 3.2, L("M0 0Q-2 -3 0 -6Q2 -9 0 -12", "#fff", 1.8, ' opacity=".75"'))); };

  Avatars.art({
    /* ================================================================ COMMON */
    __plain(k) { dough(k, "golden"); },
    plain(k) { dough(k, "golden"); streaks(k, "#fde9bd", 5, 0.65, 8); streaks(k, "#e08f30", 4, 0.35, 5, 70); k.body += L(arc(44, 110, 170), "#fff", 2, ' opacity=".35"'); },
    sesame(k) { dough(k, "golden"); sprinkle(k, 40, 6.4, T.sesame); },
    poppy(k) { dough(k, "golden"); sprinkle(k, 120, 3.6, T.poppy); },
    whole_wheat(k) { dough(k, "wheat"); sprinkle(k, 14, 8.6, T.oat); sprinkle(k, 30, 4.4, T.bran(k)); },
    onion(k) { dough(k, "golden"); sprinkle(k, 26, 6.6, T.onion(k)); sprinkle(k, 18, 5, T.toastbit(k)); },
    salt(k) { dough(k, "golden"); streaks(k, "#fde9bd", 5, 0.6, 8); sprinkle(k, 28, 6.4, T.salt(k)); sparkles(k, 2); },
    oat(k) { dough(k, "golden"); sprinkle(k, 20, 9.6, T.oat); sprinkle(k, 16, 4, T.bran(k)); },
    rye(k) { dough(k, "rye"); sprinkle(k, 36, 5.6, T.caraway); sprinkle(k, 14, 5, (x, y) => dot(x, y, 0.8, "#fff2d8", ' opacity=".9"')); },
    multigrain(k) { dough(k, "golden"); sprinkle(k, 11, 9.4, T.oat); sprinkle(k, 10, 7, T.sesame); sprinkle(k, 14, 5, T.flax); sprinkle(k, 18, 4, T.poppy); },
    white_bread(k) {
      dough(k, "pale", "#3a1e08");
      for (let i = 0; i < 5; i++) { const [x, y] = pol(i * 72 + 20, k.r(28, 40)); k.body += `<ellipse cx="${x}" cy="${y}" rx="${f(k.r(8, 12))}" ry="${f(k.r(4, 6))}" transform="rotate(${f(i * 72 + 110)} ${x} ${y})" fill="#fffaf0" opacity=".6"/>`; }
      sprinkle(k, 10, 9, (x, y) => dot(x, y, 0.8, "#c99a5a", ' opacity=".7"'));
    },
    brown_sugar(k) { dough(k, "sugar"); streaks(k, "#a8622a", 5, 0.45, 7); streaks(k, "#f6d8a8", 4, 0.5, 5, 70); sprinkle(k, 16, 8, T.brownsugar(k)); },
    butter(k) {
      dough(k, "golden"); streaks(k, "#fde9bd", 4, 0.5, 7);
      const [x, y] = pol(-25, 33);
      k.body += P(smooth([[x - 13, y - 2], [x - 5, y - 10], [x + 10, y - 8], [x + 14, y + 4], [x + 6, y + 12], [x - 2, y + 18], [x - 6, y + 9], [x - 12, y + 7]]), "#ffe066", ' opacity=".9"') + L(`M${x - 9} ${y - 4}Q${x} ${y - 9} ${x + 9} ${y - 5}`, "#fff8c0", 1.4);
      k.top += G(at(x, y, -14), S("M-7 -5H7V5H-7Z", "#fff1a0", "#8a6a10", 1.2) + P("M-7 -5H7V-1.6H-7Z", "#fffbe0") + S("M-7 5H7V7.4H-7Z", "#f0d050", "#8a6a10", 1) + L("M-5 -3.4H1", "#fff", 1));
      k.front += twinkle(x + 7, y - 7, 2.6, "#fff", 0.4, 3);
    },
    cinnamon(k) { dough(k, ["#fde2b4", "#f2b56c", "#e0974c", "#b8682a"]); swirl(k, "#a8582a", "#5a2a08", 1.5, 7); sprinkle(k, 70, 3.4, T.speck); },
    sugar(k) { dough(k, "golden"); sprinkle(k, 24, 7, T.sugar(k)); sprinkle(k, 16, 5, (x, y) => dot(x, y, 0.9, "#fff")); sparkles(k, 3); },
    wheat_bran(k) { dough(k, "toast"); sprinkle(k, 60, 4, T.bran(k)); sprinkle(k, 8, 9, T.oat); },
    toasted(k) { dough(k, "toast"); k.body += L(arc(52, 0, 359.9), "#9a4a12", 4, ' opacity=".45"'); sprinkle(k, 34, 5.6, (x, y) => dot(x, y, 1.1, "#fff4d8", ` stroke="#9a5a24" stroke-width=".4"`)); },
    mini(k) { k.R = 47; k.H = 12; dough(k, "golden"); k.body += L(arc(30, -120, -40), "#fff", 4, ' opacity=".55"') + L(arc(38, 120, 160), "#fff", 2, ' opacity=".4"'); sprinkle(k, 12, 9, T.sesame, 17, 42); },
    sourdough(k) {
      dough(k, "golden");
      for (let i = 0; i < 5; i++) { const a = i * 72; k.body += S(tube(pp([[a, 12], [a + 28, 24], [a + 50, 37], [a + 66, 52]]), (t) => 0.8 + 8.4 * Math.sin(Math.PI * t)), "#fde3ac", "#c47a2a", 0.8); }
      streaks(k, "#b8641c", 5, 0.5, 2.4, 70);
    },
    cornmeal(k) { dough(k, "corn"); sprinkle(k, 60, 4.4, T.corn); sprinkle(k, 12, 6, (x, y) => dot(x, y, 0.9, "#fff8e0")); },
    flaxseed(k) { dough(k, "golden"); sprinkle(k, 34, 6.6, T.flax); sprinkle(k, 10, 5, (x, y) => dot(x, y, 0.7, "#fff4d8")); },
    sunflower(k) { dough(k, "golden"); sprinkle(k, 16, 10, T.sunflower); sprinkle(k, 14, 5, T.bran(k)); },
    pumpkin_seed(k) { dough(k, "golden"); streaks(k, "#fde9bd", 4, 0.45, 6); sprinkle(k, 18, 9.6, T.pepita); },
    honey_wheat(k) { dough(k, "corn"); sprinkle(k, 14, 9.6, T.oat); sprinkle(k, 14, 4.4, T.bran(k)); k.body += L(arc(40, -60, -10), "#fff6c8", 2, ' opacity=".7"'); },
    barley(k) { dough(k, "golden"); sprinkle(k, 22, 8.4, T.barley); },
    potato(k) { dough(k, "golden"); sprinkle(k, 22, 7, (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(1.4, 2.2)), "#8a4a1e", "#3a1804", 0.6))); sprinkle(k, 12, 6, (x, y) => dot(x, y, 0.8, "#fff4d8")); },
    spelt(k) { dough(k, "golden"); sprinkle(k, 18, 9, T.spelt); sprinkle(k, 10, 5, (x, y) => dot(x, y, 0.8, "#7a4a1a")); },
    sprouted(k) { dough(k, "golden"); sprinkle(k, 10, 9, (x, y, r) => G(at(x, y, r, 0.85), T.pepita(0, 0, 0))); sprinkle(k, 8, 9, T.oat); sprinkle(k, 16, 5, (x, y, r) => G(at(x, y, r), S(seedD(1.8), "#7a4a1e", INK, 0.5))); },
    pumpernickel(k) { dough(k, "dark", "#1a0a02"); sprinkle(k, 12, 9.4, T.oat); sprinkle(k, 26, 5, (x, y, r) => G(at(x, y, r), S(seedD(2.2, 0.5), "#2a1408", "#0e0602", 0.4))); sprinkle(k, 10, 5, (x, y) => dot(x, y, 0.8, "#fbe6c0")); },
    cracked_wheat(k) { dough(k, "golden"); sprinkle(k, 22, 6.6, (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(1.6, 2.4)), "#fbe8c0", "#8a5a24", 0.6))); sprinkle(k, 20, 5.6, (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(1.4, 2.2)), "#b8702e", "#4a2208", 0.6))); },
    everything(k) { dough(k, "golden"); sprinkle(k, 16, 6.6, T.sesame); sprinkle(k, 30, 4, T.poppy); sprinkle(k, 10, 6, T.toastbit(k)); sprinkle(k, 8, 6, T.garlic(k)); sprinkle(k, 8, 6, T.salt(k)); },

    /* ============================================================== UNCOMMON */
    blueberry(k) {
      dough(k, "golden");
      icing(k, "#fffaf2", "#5a3a5a", { nOut: 7 });
      for (let i = 0; i < 5; i++) { const a = i * 72 + 20; k.body += P(tube(pp([[a, 20], [a + 14, 30], [a + 6, 40], [a + 18, 47]]), (t) => 0.6 + 2.6 * Math.sin(Math.PI * t)), "#7a2a8a", ' opacity=".85"'); }
      sprinkle(k, 9, 11, T.blueberry, 20, 46, "top");
      sparkles(k, 1, "#e0e4ff");
    },
    cinnamon_raisin(k) { dough(k, ["#fde2b4", "#f2b56c", "#e0974c", "#b8682a"]); swirl(k, "#c07434", "#6a3410", 1.4, 6); sprinkle(k, 14, 9, T.raisin); sprinkle(k, 18, 5, T.sugar(k)); },
    asiago(k) { dough(k, "golden"); melt(k, "#ffe58a", "#b88a2a", 8, 20, 48, 5, 8); shreds(k, 22, "#fff0b0", "#a8822a"); sprinkle(k, 12, 6, T.parsley); },
    garlic(k) { dough(k, "golden"); sprinkle(k, 18, 7.4, T.garlic(k)); sprinkle(k, 16, 6.6, T.parsley); sprinkle(k, 10, 4, (x, y) => dot(x, y, 0.8, "#fff8e0")); },
    cheddar(k) { dough(k, "golden"); melt(k, "#ffc23a", "#b8720a", 7, 20, 48, 6, 9); shreds(k, 26, "#ff9a1a", "#8a4a04"); sprinkle(k, 12, 6, T.chive); },
    honey_glaze(k) {
      dough(k, "corn");
      icing(k, k.linU([[0, "#ffd96a"], [1, "#e89a10"]], 20, 20, 108, 108), "#8a5208", { nOut: 8, dOut: 7 });
      sprinkle(k, 14, 8, T.nut(k), 22, 44);
      sparkles(k, 2, "#fff6c8");
    },
    avocado(k) {
      dough(k, "golden");
      spread(k, "#bcd86a", "#4a6a14");
      [[20, 34], [110, 33], [200, 34], [290, 33]].forEach(([a, r]) => { const [x, y] = pol(a, r); k.top += avoSlice(x, y, 11, a + 90); });
      sprinkle(k, 18, 5, (x, y) => dot(x, y, 0.8, "#1e1e14"), 20, 46); sprinkle(k, 10, 6, T.chive, 20, 46);
    },
    bacon(k) {
      dough(k, "golden");
      icing(k, "#fffaf2", "#8a7a6a", { nOut: 6 });
      sprinkle(k, 7, 13, (x, y, r) => baconBit(x, y, r, 1.25), 22, 44, "top");
      sprinkle(k, 10, 6, T.chive, 20, 46);
    },
    jalapeno(k) {
      dough(k, "golden");
      icing(k, "#fffaf0", "#8a7a6a", { nOut: 6 });
      [[15, 33], [85, 41], [150, 31], [220, 42], [290, 33]].forEach(([a, r]) => { k.top += jalaRing(...pol(a, r), 6.4); });
      sprinkle(k, 12, 6, T.chive, 20, 48);
    },
    strawberry(k) {
      dough(k, "golden");
      icing(k, "#fffaf4", "#8a5a6a", { nOut: 7 });
      [[15, 40], [80, 29], [140, 41], [205, 30], [270, 41], [330, 29]].forEach(([a, r], i) => { k.top += strawSlice(...pol(a, r), 7.6, a + 180 + i * 15); });
      sprinkle(k, 14, 6, (x, y) => dot(x, y, 0.9, "#ff8aa8"), 20, 46);
    },
    choc_chip(k) { dough(k, ["#fef0cc", "#fbd890", "#f2b860", "#d08a34"]); streaks(k, "#fff4dc", 4, 0.6, 6); sprinkle(k, 12, 10, (x, y, r) => G(at(x, y, r * 0.2 - 18, 1.3), T.chip(0, 0, 0))); sprinkle(k, 10, 6, (x, y) => dot(x, y, 0.9, "#4a2412")); },
    banana(k) {
      dough(k, "golden");
      icing(k, "#fffaf0", "#8a7a6a", { nOut: 7 });
      [[20, 34], [95, 40], [165, 32], [235, 41], [305, 32]].forEach(([a, r]) => { k.top += bananaSlice(...pol(a, r), 7.4); });
      sprinkle(k, 10, 7, T.nut(k), 20, 48);
    },
    maple(k) {
      dough(k, "golden");
      icing(k, k.linU([[0, "#d8862a"], [1, "#9a4a0a"]], 20, 20, 108, 108), "#4a1e04", { nOut: 7 });
      sprinkle(k, 6, 15, (x, y, r) => G(at(x, y, r, 1.15), T.pecan(0, 0, 0)), 22, 44, "top");
      sprinkle(k, 8, 6, (x, y, r) => G(at(x, y, r), S(chunkD(k, 1.6), "#f6dcae", "#5a3010", 0.5)), 22, 44);
      sparkles(k, 1, "#fff2c0");
    },
    coconut(k) { dough(k, "golden"); icing(k, "#fffcf6", "#9a8a7a", { nOut: 8 }); sprinkle(k, 18, 8, (x, y, r) => G(at(x, y, r, 1.2), T.coconut(0, 0, 0)), 22, 46); },
    lemon(k) {
      dough(k, "golden");
      icing(k, "#fff6c0", "#a8962a", { nOut: 7 });
      sprinkle(k, 30, 4.4, T.poppy, 22, 44); sprinkle(k, 14, 7, (x, y, r) => G(at(x, y, r, 1.2), T.zest("#ffe03a", "#8a7a0a")(0, 0, 0)), 22, 44);
      sparkles(k, 1, "#fffbd0");
    },
    orange(k) {
      dough(k, "golden");
      stripes(k, "#fffaf0", 5, 4, -35, "#9a7a5a");
      [[20, 36], [110, 36], [200, 36], [290, 36]].forEach(([a, r], i) => { k.top += citrusWedge(...pol(a, r), 8.4, a + 90 + i * 20, "#ff8a1a", "#ffb04a", "#6a2a04"); });
      sprinkle(k, 10, 7, (x, y, r) => G(at(x, y, r), T.zest("#ff9a2a", "#7a3a04")(0, 0, 0)));
    },
    raspberry(k) {
      dough(k, "golden");
      icing(k, "#fffaf6", "#8a5a6a", { nOut: 7 });
      swirl(k, "#e8407a", "#8a1a3a", 1.2, 4);
      sprinkle(k, 7, 12, (x, y) => G(at(x, y, 0, 1.6), T.raspberry(0, 0)), 22, 46, "top");
      sprinkle(k, 10, 5, (x, y) => dot(x, y, 0.8, "#ff5a8a"), 20, 46);
    },
    cranberry(k) { dough(k, "golden"); stripes(k, "#fffaf0", 5, 4.4, -35, "#9a7a5a"); sprinkle(k, 11, 10, (x, y, r) => G(at(x, y, r, 1.3), T.cranberry(0, 0, 0)), 20, 48, "top"); },
    apple_cinnamon(k) {
      dough(k, "golden");
      sprinkle(k, 50, 3.6, T.speck);
      stripes(k, "#fffaf0", 4, 4, -30, "#9a7a5a");
      sprinkle(k, 9, 11, (x, y, r) => appleChunk(x, y, 4.6, r), 20, 46, "top");
    },
    peanut_butter(k) {
      dough(k, "golden");
      spread(k, k.linU([[0, "#d89a54"], [1, "#a8642a"]], 20, 20, 108, 108), "#4a2208", 18.5, 48);
      k.body += L(smooth(pp(Array.from({ length: 13 }, (_, i) => [i * 30, i % 2 ? 40 : 28])), true), "#f0c084", 1.6, ' opacity=".7"');
      sprinkle(k, 12, 8, (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(2, 2.8)), "#f2d29a", "#6a3a10", 0.7)), 22, 44);
    },
    caramel(k) {
      dough(k, "golden");
      icing(k, k.linU([[0, "#e8a040"], [1, "#b8641a"]], 20, 20, 108, 108), "#5a2a04", { nOut: 8 });
      sprinkle(k, 14, 7.4, T.nut(k), 22, 44);
      sparkles(k, 1, "#fff2c0");
    },
    pumpkin_spice(k) { dough(k, "orange"); sprinkle(k, 40, 4, T.speck); zigzag(k, "#fffaf0", 9, 22, 46, 3.4, "#9a7a5a"); sprinkle(k, 14, 7, (x, y, r) => G(at(x, y, r), S(chunkD(k, 1.8), "#c8642a", "#4a1804", 0.6))); },
    vanilla(k) { dough(k, "golden"); sprinkle(k, 26, 4.6, T.vanilla, 20, 50); zigzag(k, "#fffaf0", 10, 20, 48, 4, "#9a7a5a"); sparkles(k, 1); },
    almond(k) { dough(k, "golden"); sprinkle(k, 13, 10.4, (x, y, r) => G(at(x, y, r, 1.4), T.almond(0, 0, 0)), 18, 50, "top"); sprinkle(k, 14, 5, T.sugar(k)); },
    cherry(k) { dough(k, "golden"); icing(k, "#ffc8d8", "#8a3a5a", { nOut: 8 }); sprinkle(k, 11, 9.4, (x, y, r) => G(at(x, y, r, 1.25), cherryChunk(0, 0, 0)), 22, 46, "top"); sprinkle(k, 10, 5, (x, y) => dot(x, y, 0.8, "#fff")); },

    /* ================================================================== RARE */
    rainbow(k) {
      k.ink = "#1e1430"; k.wall = "#7a4ab0"; k.base = "#fff";
      const cols = ["#ff4a5a", "#ff9a2a", "#ffd83a", "#4ad06a", "#3aa8ff", "#8a5aff", "#ff6ab8"];
      let bands = "";
      cols.forEach((c, i) => { const a = i * 360 / cols.length; bands += S(tube(pp([[a - 30, 8], [a, 22], [a + 30, 36], [a + 60, 50], [a + 80, 62]]), (t) => 1 + 22 * Math.sin(Math.PI * (0.1 + t * 0.8))), c, "#fff", 2.2); });
      k.body += `<g class="sp c64" style="animation-duration:24s">${bands}</g>`;
      for (let i = 0; i < 7; i++) { const [x, y] = pol(i * 51 + 20, k.r(26, 44)); k.over += `<ellipse cx="${x}" cy="${y}" rx="3.4" ry="1.6" transform="rotate(${f(i * 51 - 40)} ${x} ${y})" fill="#fff" opacity=".55"/>`; }
      sparkles(k, 3);
    },
    jalapeno_cheddar(k) {
      dough(k, "golden");
      icing(k, k.radU([[0.3, "#ffd84a"], [1, "#f2a21a"]]), "#7a4a04", { nOut: 9, dOut: 7 });
      shreds(k, 16, "#ff9a1a", "#8a4a04");
      [[10, 33], [70, 42], [125, 31], [185, 42], [245, 32], [305, 42]].forEach(([a, r]) => { k.top += jalaRing(...pol(a, r), 6.8); });
      sprinkle(k, 10, 6, T.chive, 20, 48);
      steam(k, 3, 64, 24);
    },
    french_toast(k) {
      dough(k, ["#fde2a8", "#f6b858", "#e8922e", "#b8621a"]);
      sprinkle(k, 40, 4, T.speck);
      stripes(k, "#b8641a", 4, 6, -30, "#4a1e04");
      k.top += G(at(...pol(20, 35), -12, 1.05), S("M-7 -5H7V5H-7Z", "#fff1a0", "#8a6a10", 1.2) + P("M-7 -5H7V-1.6H-7Z", "#fffbe0") + S("M-7 5H7V7.4H-7Z", "#f0d050", "#8a6a10", 1) + L("M-5 -3.4H1", "#fff", 1));
      steam(k, 2, 60, 22);
      sparkles(k, 1, "#fff6c8");
    },
    maple_bacon(k) {
      dough(k, "golden");
      icing(k, k.linU([[0, "#e09a3a"], [1, "#a85a14"]], 20, 20, 108, 108), "#4a1e04", { nOut: 8 });
      stripes(k, "#fff2d8", 3, 3.2, -30, "#8a5a2a");
      sprinkle(k, 8, 12.6, (x, y, r) => baconBit(x, y, r, 1.3), 22, 46, "top");
      sparkles(k, 2, "#fff2c0");
    },
    pizza(k) {
      dough(k, ["#fde2a8", "#f2b860", "#e09a40", "#b06a20"]);
      k.body += P(circ(C, C, 49) + circ(C, C, 18), "#d8341e", ' fill-rule="evenodd"');
      icing(k, "#ffe27a", "#b8820a", { rIn: 19, rOut: 46, nOut: 9, nIn: 2, dOut: 3.6 });
      [[15, 40], [70, 30], [120, 42], [180, 31], [235, 42], [295, 32], [340, 42]].forEach(([a, r]) => { k.top += pepperoni(...pol(a, r), 6.8); });
      sprinkle(k, 4, 14, mushroom, 24, 44, "top");
      sprinkle(k, 4, 14, greenPepper, 24, 44, "top");
      steam(k, 3, 64, 22);
    },
    matcha(k) {
      dough(k, "green", "#1e2a08");
      icing(k, "#e2f0b0", "#4a6a14", { nOut: 6 });
      zigzag(k, "#d4ea9a", 8, 22, 46, 3, "#5a7a1e");
      [[25, 34], [110, 40], [200, 33], [290, 40]].forEach(([a, r], i) => { k.top += G(at(...pol(a, r)), anim("sw", i * 0.7, 3, leafy(0, 0, a + 60, 10, 4.4, "#4a7a1e", "#14300a"))); });
      sprinkle(k, 16, 5, (x, y) => dot(x, y, 0.8, "#5a7a1e"), 20, 48);
      sparkles(k, 1, "#eaffd0");
    },
    smores(k) {
      dough(k, "choc", "#160802");
      icing(k, "#5a2e14", "#160802", { nOut: 8 });
      zigzag(k, "#3a1a0a", 7, 24, 44, 2.4, "#160802");
      [[15, 44], [95, 44], [175, 44], [255, 44], [335, 44]].forEach(([a, r], i) => { k.top += marsh(...pol(a, r), 6.6, i * 37); });
      [[55, 30], [215, 30]].forEach(([a, r]) => { k.top += graham(...pol(a, r), 6, a); });
      [[135, 30], [295, 30]].forEach(([a, r]) => { k.top += chocChunk(...pol(a, r), 5.4, a); });
      steam(k, 2, 62, 22);
    },
    birthday_cake(k) {
      dough(k, "golden");
      icing(k, "#fffaf6", "#8a6a7a", { nOut: 9, nIn: 4 });
      sprinkle(k, 34, 5.6, T.sprinkle, 20, 46);
      [[0, 38, "#ff6ab0", "#ffd0e8"], [130, 38, "#4ab8ff", "#d0ecff"], [240, 38, "#a07aff", "#e8dcff"]].forEach(([a, r, c1, c2], i) => { k.top += G(at(...pol(a, r)), anim("br", i * 0.6, 2.8, swirlDollop(0, 0, 7.6, c1, c2))); });
      k.top += G(at(...pol(65, 40), 0, 0.95), S("M-2.2 0V-12H2.2V0Z", "#ffd34a", "#7a5a0a", 0.9) + L("M-2.2 -3L2.2 -5M-2.2 -7L2.2 -9", "#ff6ab0", 1) + L("M0 -12V-14", "#3a2a1a", 0.8)
        + anim("fk", 0, 0.5, S(drop(3.4, 6.4), "#ffc23a", "#c8460a", 0.7, ' transform="translate(0 -14)"') + P(drop(1.7, 3.6), "#fff6c0", ' transform="translate(0 -14.4)"')));
      sparkles(k, 3);
    },
    cookies_cream(k) {
      k.ink = "#160e0a"; k.wall = "#b8a898";
      k.base = k.radU([[0.22, "#c8b8a8"], [0.28, "#fffaf2"], [0.6, "#f6efe4"], [1, "#d8cab8"]]);
      sprinkle(k, 30, 4.6, crumb(k));
      [[20, 34], [100, 42], [180, 33], [260, 42], [330, 30]].forEach(([a, r], i) => { k.top += cookie(...pol(a, r), 6.6, a + i * 30); });
      sprinkle(k, 12, 6, crumb(k), 18, 50);
    },
    red_velvet(k) {
      dough(k, "red", "#2e0408");
      stripes(k, "#fffaf0", 4, 8, -32, "#8a6a5a");
      sprinkle(k, 22, 6.4, (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(1.6, 2.6)), "#c8182e", "#4a0410", 0.6)));
      sparkles(k, 1, "#ffd8e0");
    },
    ocean(k) {
      k.ink = "#08305a"; k.wall = "#0a4a8a";
      k.base = k.radU([[0.24, "#0a5ab8"], [0.6, "#1a8ae8"], [1, "#0a62c8"]]);
      // a sandy beach on the lower left
      k.body += S(smooth(pp([[150, 70], [160, 42], [185, 32], [210, 26], [240, 30], [262, 40], [272, 70]])), "#f6d48a", "#b8823a", 1.2) + L(smooth(pp([[160, 44], [190, 34], [222, 30], [258, 42]]), false), "#fff", 2.4, ' opacity=".85"');
      let waves = "";
      for (let i = 0; i < 4; i++) { const a = i * 50 - 60; waves += S(tube(pp([[a, 16], [a + 20, 26], [a + 40, 36], [a + 58, 48], [a + 70, 58]]), (t) => 1 + 7 * Math.sin(Math.PI * t)), ["#3ab0ff", "#7ad8ff", "#2a9aef", "#5ac4ff"][i], "#08305a", 0.8); }
      waves += [[-20, 40], [40, 30], [90, 44]].map(([a, r]) => S(`M${pol(a - 10, r)}Q${pol(a, r + 6)} ${pol(a + 10, r)}`, "none", "#fff", 2.6)).join("");
      k.body += `<g class="sw c64" style="animation-duration:4s">${waves}</g>`;
      sprinkle(k, 10, 6, (x, y) => dot(x, y, 0.9, "#e6f7ff"), 18, 50);
      k.top += shell(...pol(205, 42), 20, 1.3) + starfish(...pol(245, 34), 15, 1.1) + shell(...pol(170, 38), -30, 0.9);
      for (let i = 0; i < 3; i++) { const [x, y] = pol(i * 60 + 10, k.r(26, 44)); k.front += G(at(x, y), anim("ri", i * 1, 3.2, `<circle r="1.5" fill="none" stroke="#e6f7ff" stroke-width=".8"/>`)); }
    },
    sandstone(k) {
      k.ink = "#3a1c08"; k.wall = "#a8642a"; k.base = "#e8b07a";
      ["#fbe2b8", "#e8a868", "#c8743a", "#f2c48a", "#b85e2a", "#f6d6a2", "#d88a4a"].forEach((c, i) => {
        const ps = []; for (let a = 0; a < 360; a += 12) ps.push(pol(a, 15 + i * 6.2 + Math.sin(a * 0.05 + i * 1.3) * 3.4));
        k.body += P(circ(C, C, R + 4) + smooth(ps), c, ' fill-rule="evenodd"');
      });
      for (let i = 0; i < 5; i++) { const a = k.r(0, 360), r = k.r(22, 46); k.body += L(smooth([pol(a, r), pol(a + 5, r + 3), pol(a + 3, r + 7), pol(a + 8, r + 10)], false), "#6a3410", 1.1); }
      sprinkle(k, 8, 10, (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(2.2, 3.4)), "#f2c48a", "#5a2a08", 0.8) + P("M-1.4 -1.6L1 -1.4L0 .2Z", "#fde6c0")), 20, 48);
      sparkles(k, 1, "#fff2d8");
    },
    bamboo(k) {
      k.ink = "#14300a"; k.wall = "#2e5a12"; k.base = "#2e7a2a";
      for (let i = 0; i < 12; i++) {
        const a = i * 30;
        k.body += S(sect(H - 3, R + 3, a, a + 30), i % 2 ? k.lin([[0, "#3e9a3a"], [0.5, "#2e7a2a"], [1, "#1e5a1a"]], 0, 0, 1, 0) : k.lin([[0, "#e8f27a"], [0.5, "#c8e04a"], [1, "#9ac030"]], 0, 0, 1, 0), "#14300a", 1.1)
          + L(arc(34, a + 2, a + 28), i % 2 ? "#14501a" : "#7a9a1a", 2.2) + L(arc(34.4, a + 4, a + 26), "#fff", 0.8, ' opacity=".35"');
      }
      [[20, 44], [70, 30], [130, 46], [190, 30], [250, 45], [310, 31]].forEach(([a, r], i) => { k.top += G(at(...pol(a, r)), anim("sw", i * 0.5, 2.8, leafy(0, 0, a + 40, 13, 4.2, "#3e9a3a", "#0e2a08") + leafy(0, 0, a - 10, 11, 3.6, "#5ab84a", "#0e2a08"))); });
    },
    coral(k) {
      k.ink = "#5a1024"; k.wall = "#c84a6a";
      k.base = k.radU([[0.24, "#f2869a"], [0.6, "#ffc2cc"], [1, "#f0889c"]]);
      for (let i = 0; i < 8; i++) { const [x, y] = pol(i * 45 + 10, k.r(24, 44)); k.body += `<ellipse cx="${x}" cy="${y}" rx="${f(k.r(6, 10))}" ry="${f(k.r(4, 7))}" fill="#ffe0e4" opacity=".7"/>`; }
      const branch = (c) => S(tube([[0, 4], [0, -4], [-3, -9], [-4.6, -13]], [3.6, 1.8]), c, "#5a1024", 0.9) + S(tube([[0, -3], [3.4, -8], [5.6, -11]], [3, 1.4]), c, "#5a1024", 0.9) + S(tube([[0, -7], [1, -12]], [2.4, 1.2]), c, "#5a1024", 0.9) + S(tube([[-3, -9], [-7, -11]], [2, 1]), c, "#5a1024", 0.9);
      [[20, 36, "#ff5a7a"], [80, 44, "#ff7a94"], [140, 33, "#fffaf2"], [200, 44, "#ff5a7a"], [255, 32, "#ff7a94"], [315, 44, "#fffaf2"]].forEach(([a, r, c], i) => { k.top += G(at(...pol(a, r), a + k.r(-20, 20), 1.55), anim("sw", i * 0.5, 3.4, branch(c))); });
      sprinkle(k, 12, 6, (x, y) => dot(x, y, 1.1, "#fff", ' opacity=".8"'), 18, 50);
      for (let i = 0; i < 3; i++) { const [x, y] = pol(i * 120 + 50, 30); k.front += G(at(x, y), anim("ri", i * 1, 3.2, `<circle r="1.4" fill="none" stroke="#fff" stroke-width=".7"/>`)); }
    },
    honeycomb(k) {
      k.ink = "#3a1e02"; k.wall = "#a8640a"; k.base = "#c8820a";
      for (let gx = -6; gx <= 6; gx++) for (let gy = -6; gy <= 6; gy++) {
        const x = 64 + gx * 11 + (gy % 2 ? 5.5 : 0), y = 64 + gy * 9.5;
        k.body += G(at(x, y), S(star(6, 6, 3, 30), k.pick(["#ffc23a", "#ffb02a", "#ffd25a", "#f29a1a"]), "#8a4e04", 1.4) + P(star(3.4, 3.4, 3, 30), "#fff2a0", ' opacity=".35" transform="translate(-1 -1)"'));
      }
      icing(k, "rgba(255,186,40,.82)", "#8a4e04", { nOut: 8, nIn: 3, rIn: 20, rOut: 32, dOut: 10 });
      const bee = G("", `<ellipse rx="4.4" ry="3.2" fill="#ffd23a" stroke="#2a1a04" stroke-width=".9"/>` + L("M-1.2 -3V3M1.4 -3V3", "#2a1a04", 1.2)
        + `<ellipse cx="-1" cy="-3.8" rx="2.6" ry="1.7" fill="#eaf6ff" stroke="#5a7a9a" stroke-width=".6" opacity=".92"/><ellipse cx="1.6" cy="-3.6" rx="2.2" ry="1.5" fill="#eaf6ff" stroke="#5a7a9a" stroke-width=".6" opacity=".92"/>` + dot(4.2, -0.6, 0.65, "#2a1a04"));
      k.css += ".bz{animation:bz 4s ease-in-out infinite}@keyframes bz{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(7px,-4px) rotate(8deg)}50%{transform:translate(11px,2px) rotate(-6deg)}75%{transform:translate(3px,5px) rotate(4deg)}}";
      k.front += G(at(...pol(-40, 42)), `<g class="bz">${bee}</g>`);
    },
    fossil(k) {
      k.ink = "#2e2418"; k.wall = "#8a7a62";
      k.base = k.radU([[0.24, "#b8a688"], [0.6, "#e6d8bc"], [1, "#c8b694"]]);
      for (let i = 0; i < 4; i++) { const a = k.r(0, 360), r = k.r(20, 46); k.body += L(smooth([pol(a, r), pol(a + 6, r + 4), pol(a + 3, r + 8), pol(a + 9, r + 12)], false), "#8a7a62", 1.1); }
      sprinkle(k, 24, 4.6, (x, y) => dot(x, y, 0.8, "#9a8a70", ' opacity=".7"'));
      k.body += ammonite(...pol(40, 34), 1.6, 0) + ammonite(...pol(220, 37), 1.3, 60);
      const fern = (x, y, rot) => G(at(x, y, rot), L("M0 7V-7", "#6a5640", 1.2) + [-5, -2, 1, 4].map((t) => S(leaf(4.4, 1.8), "#a89070", "#5a4630", 0.6, ` transform="translate(0 ${t}) rotate(-60)"`) + S(leaf(4.4, 1.8), "#a89070", "#5a4630", 0.6, ` transform="translate(0 ${t}) rotate(60)"`)).join(""));
      k.body += fern(...pol(135, 36), 40) + fern(...pol(310, 36), -30);
      sprinkle(k, 6, 12, (x, y, r) => G(at(x, y, r), S(chunkD(k, k.r(2.2, 3.2)), "#7a7a7e", "#2e2e32", 0.8) + P("M-1.2 -1.6L1 -1.2L0 .2Z", "#a8a8ae")), 20, 48);
      sparkles(k, 1, "#fff8e0");
    },
    cactus(k) {
      k.ink = "#14300a"; k.wall = "#2e5a1a";
      k.base = k.radU([[0.24, "#2e6a22"], [0.6, "#6aa83a"], [1, "#3e7a2a"]]);
      for (let i = 0; i < 10; i++) { const a = i * 36; k.body += P(tube(pp([[a, 10], [a + 14, 24], [a + 22, 38], [a + 26, 58]]), (t) => 1 + 9 * Math.sin(Math.PI * (0.1 + t * 0.8))), i % 2 ? "#4a8a2a" : "#8ac44a", ' opacity=".9"'); }
      sprinkle(k, 24, 8, (x, y, r) => G(at(x, y, r), S("M-1 1.6L0 -2.6L1 1.6Z", "#fff2c8", "#7a6a3a", 0.5)), 16, 52);
      for (let i = 0; i < 10; i++) { const a = i * 36 + 18, [x, y] = pol(a, R - 1); k.top += G(at(x, y, a), S("M-1.4 0L0 -4.4L1.4 0Z", "#fff2c8", "#5a4a1a", 0.7)); }
      const flower = (s) => { let d = ""; for (let i = 0; i < 5; i++) d += S(`M0 0C${f(-s * 0.7)} ${f(-s * 0.4)} ${f(-s * 0.5)} ${f(-s * 1.1)} 0 ${f(-s)}C${f(s * 0.5)} ${f(-s * 1.1)} ${f(s * 0.7)} ${f(-s * 0.4)} 0 0Z`, "#ff6aa8", "#7a0a3a", 0.8, ` transform="rotate(${i * 72})"`); return d + `<circle r="${f(s * 0.32)}" fill="#ffd23a" stroke="#8a5a0a" stroke-width=".6"/>`; };
      k.top += G(at(...pol(-30, 39)), anim("br", 0, 3, flower(10.5))) + G(at(...pol(135, 34)), anim("br", 1, 3, flower(8.6)));
    },
    marble(k) {
      k.ink = "#1e1e24"; k.wall = "#a8a8b4";
      k.base = k.radU([[0.24, "#d8d4cc"], [0.55, "#fbf8f2"], [1, "#e4e0d8"]]);
      for (let i = 0; i < 6; i++) {
        const a = i * 60 + k.r(-10, 10);
        k.body += P(tube(pp([[a, 10], [a + 18, 22], [a + 8, 34], [a + 26, 46], [a + 18, 60]]), (t) => 1 + 10.5 * Math.sin(Math.PI * t)), i % 2 ? "#26262c" : "#8a8a94", ' opacity=".92"')
          + L(smooth(pp([[a + 6, 14], [a + 22, 26], [a + 14, 38], [a + 30, 50]]), false), "#a8a8b0", 1.1, ' opacity=".8"');
      }
      sprinkle(k, 8, 9, (x, y) => dot(x, y, 1.2, "#4a4a52", ' opacity=".6"'));
      sparkles(k, 3, "#fff", 20, 56, 2.6);
    },
    geode(k) {
      k.ink = "#1e1a24"; k.wall = "#3a1a6a";
      k.base = k.radU([[0.24, "#2a0e5a"], [0.5, "#6a2ac8"], [1, "#4a1a9a"]]);
      // a rim of grey stones around a purple crystal heart
      k.cells([[33, R + 4, 11, 0]], 1.3, 3).forEach((c) => { k.body += S(poly(c.pts), k.pick(["#9a9aa2", "#b4b4bc", "#8a8a92", "#c4c4cc"]), "#2e2e36", 1) + P(poly(c.inner(2.6, -0.8, -1)), "#fff", ' opacity=".3"'); });
      for (let i = 0; i < 18; i++) { const a = i * 20 + k.r(-6, 6), [x, y] = pol(a, k.r(19, 30)); k.body += G(at(x, y, a + 180 + k.r(-25, 25), k.r(0.7, 1.05)), cluster(0, 0, 0, 1, ["#e8d4ff", "#a45af0", "#5a1aa8"], "#1e0a3a")); }
      sprinkle(k, 6, 10, (x, y, r) => gem(x, y, 1.8, 2.6, ["#e8d4ff", "#a45af0", "#5a1aa8"], "#1e0a3a", r, 0.6), 36, 50);
      k.over += `<circle class="pu" cx="64" cy="64" r="${H + 6}" fill="none" stroke="#d8b0ff" stroke-width="5" opacity=".5"/>`;
      sparkles(k, 3, "#f0e4ff", 18, 34, 2.8);
    },
    graffiti(k) {
      k.ink = "#141414"; k.wall = "#d8c8a8";
      k.base = k.radU([[0.24, "#e0d0b0"], [0.5, "#fdf6e6"], [1, "#eadcc0"]]);
      const splat = (x, y, s, c) => { const ps = Array.from({ length: 12 }, (_, i) => { const t = i / 12 * Math.PI * 2, m = i % 2 ? k.r(0.55, 0.8) : k.r(0.95, 1.3); return [f(x + Math.cos(t) * s * m), f(y + Math.sin(t) * s * m)]; }); return S(smooth(ps), c, "#141414", 0.9) + S(`M${f(x - 1.2)} ${f(y + s * 0.6)}V${f(y + s * 1.6)}Q${f(x)} ${f(y + s * 2)} ${f(x + 1.2)} ${f(y + s * 1.6)}V${f(y + s * 0.6)}Z`, c, "#141414", 0.8); };
      const cs = ["#ff2a9a", "#1ac8f0", "#ffe02a"];
      [[10, 40, 11], [70, 30, 9.6], [130, 43, 12], [190, 30, 9.6], [250, 42, 11], [310, 31, 9.6]].forEach(([a, r, s], i) => { k.body += splat(...pol(a, r), s, cs[i % 3]); });
      const zig = (c, a) => { const d = `M${pol(a - 22, 40)}L${pol(a - 12, 30)}L${pol(a - 2, 42)}L${pol(a + 8, 30)}L${pol(a + 18, 42)}`; return L(d, "#141414", 5.6) + L(d, c, 3.4); };
      k.over += zig("#ffe02a", 40) + zig("#ff2a9a", 220);
      sprinkle(k, 14, 5, (x, y, r, i) => dot(x, y, 1.1, cs[i % 3], ' stroke="#141414" stroke-width=".4"'));
      k.top += G(at(...pol(140, 40), 30), S("M-2.6 -6H2.6V5.4Q2.6 7 0 7Q-2.6 7 -2.6 5.4Z", "#ff2a9a", "#141414", 1) + S("M-1.3 -9H1.3V-6H-1.3Z", "#d8d8d8", "#141414", 0.8) + L("M-1.4 -4V3.6", "#fff", 0.8, ' opacity=".6"'));
      k.front += G(at(...pol(140, 40), 30), G('transform="translate(0 -11)"', anim("ri", 0, 2.4, dot(0, 0, 1.6, "#ff2a9a", ' opacity=".7"'))));
    },
  });
})();
