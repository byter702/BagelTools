/* =============================================================================
   avatars-art-epic.js  —  the 15 Epic bagels (see avatars.js for the kit)
   Designs follow the reference sheets in media/avatar ref (palette + motifs).
   ========================================================================== */
(() => {
  "use strict";
  const { C, R, H, f, pol, circ, poly, pp, arc, sect, strap, smooth, tube, star, spark, rhomb, petal, leaf, drop, bolt, heart, gearD,
    at, P, S, L, G, anim, gem, cluster, sakura, bubble, puffs, twinkle } = Avatars.K;
  const GOLD = ["#fff1b8", "#fdc352", "#c98a1c"];
  // a random spot on the dough: [x, y, angle, radius]
  const spot = (k, r0 = H + 5, r1 = R - 5) => { const a = k.r(0, 360), r = k.r(r0, r1); return [...pol(a, r), a, r]; };
  // wobbly blob around (x, y)
  const blob = (k, x, y, rx, ry, n = 8, wob = 0.22) => smooth(Array.from({ length: n }, (_, i) => {
    const t = i / n * Math.PI * 2, m = 1 + k.r(-wob, wob); return [f(x + Math.cos(t) * rx * m), f(y + Math.sin(t) * ry * m)];
  }));
  // inner edge of a coat that covers the ring from r outwards, with drips reaching to r - depth
  function coatEdge(k, r, drips, wobble = 1.6, depth = 13) {
    const ps = []; let a = 0;
    const ds = drips.slice().sort((x, y) => x - y);
    for (let a0 = 0; a0 < 360; a0 += 6) {
      const d = ds.find((v) => v >= a0 && v < a0 + 6);
      ps.push(pol(a0, r + Math.sin(a0 * 0.21) * wobble));
      if (d != null) {
        const dp = depth * k.r(0.7, 1.1);
        [[-6.5, 0.15], [-3.6, 0.42], [-4.2, 0.82], [0, 1], [4.2, 0.82], [3.6, 0.42], [6.5, 0.15]].forEach(([da, t]) => ps.push(pol(d + da * 34 / (r - dp * t), r - dp * t)));
      }
      a = a0;
    }
    return smooth(ps);
  }

  Avatars.art({
    /* ---------------------------------------------------------------- Amethyst */
    amethyst(k) {
      k.ink = "#33104d"; k.wall = "#4b129c";
      k.base = k.linU([[0, "#ffe08a"], [1, "#d08a22"]], 20, 20, 108, 108);
      const fills = ["#9d55e2", "#8a3fd0", "#b47be6", "#c99cf6", "#7b34c4", "#a865e8", "#6f2bb8"];
      k.cells([[H - 3, 28, 6, 14], [28, R + 4, 9, 0]], 1.6, 3.2).forEach((c) => {
        k.body += S(poly(c.pts), k.pick(fills), "#3d0e66", 1.1) + P(poly(c.inner(3.2, -1.3, -1.5)), "#fff", ' opacity=".2"')
          + P(poly(c.inner(7, -0.6, -0.8)), "#fff", ' opacity=".14"') + L(`M${c.pts[6]}L${c.pts[7]}L${c.pts[0]}`, "#fff", 0.9, ' opacity=".35"');
      });
      for (let i = 0; i < 7; i++) { const [x, y, a] = spot(k); k.over += gem(x, y, 3, 4.6, GOLD, "#5a3208", a, 0.9); }
      const cc = ["#f3e6ff", "#b67cf0", "#6f22b8"];
      [[40, 30, 12, 1.45], [210, 33, -22, 1.35], [125, 40, 28, 1.2]].forEach(([a, r, rot, s], i) => {
        const [x, y] = pol(a, r);
        k.top += cluster(x, y, rot, s, cc, "#2e0c47");
        const [tx, ty] = pol(rot, 17 * s, x, y);
        k.front += twinkle(tx, ty, 4, "#fff", i * 0.9, 2.8);
      });
      for (let i = 0; i < 3; i++) { const [x, y] = spot(k); k.front += twinkle(x, y, 2.8, "#ffe8a0", 1.3 + i, 3.2); }
    },

    /* ---------------------------------------------------------- Cherry Blossom */
    cherry_blossom(k) {
      k.ink = "#5b2a22"; k.wall = "#e3a2a6";
      k.base = k.radU([[0.24, "#f4b7bb"], [0.42, "#fff1e7"], [0.8, "#ffe7de"], [1, "#f3b8bb"]]);
      for (let i = 0; i < 6; i++) { const [x, y] = pol(i * 60 + k.r(-12, 12), k.r(28, 46)); k.body += P(blob(k, x, y, k.r(8, 12), k.r(6, 9)), "#fbc0c9", ' opacity=".75"'); }
      const bark = "#7b4a33";
      const branch = (pts, w) => S(tube(pp(pts), w), bark, "#4a2318", 1.1);
      k.body += branch([[-158, 62], [-130, 47], [-100, 40], [-70, 41], [-44, 47], [-22, 53]], (t) => 5.4 - 3.6 * t)
        + branch([[-100, 40], [-90, 30], [-80, 26]], [2.2, 0.8]) + branch([[-66, 41], [-58, 50], [-52, 54]], [2, 0.8])
        + branch([[66, 62], [92, 46], [120, 36], [150, 33], [180, 38], [204, 47]], (t) => 5.2 - 3.4 * t)
        + branch([[124, 35], [132, 24], [140, 20]], [2.2, 0.8]) + branch([[170, 36], [176, 26]], [1.8, 0.7]);
      [[-80, 26, -40], [-52, 54, 60], [140, 20, 150], [176, 26, 200], [204, 47, 230]].forEach(([a, r, rot]) => {
        const [x, y] = pol(a, r);
        k.body += G(at(x, y, rot), S(leaf(7, 3), "#8a9440", "#4f5520", 0.8) + L("M0 -0.5L0 -6", "#c3c98e", 0.6));
      });
      for (let i = 0; i < 9; i++) { const [x, y] = spot(k); k.over += G(at(x, y, k.r(0, 360)), S(petal(4, 3.2), "#ffb5c6", "#c25270", 0.6)); }
      [[-36, 16, 2.4], [62, 50, 2.2], [258, 30, 2.4], [232, 50, 2]].forEach(([a, r, s]) => { const [x, y] = pol(a, r); k.over += `<circle cx="${x}" cy="${y}" r="${s}" fill="#ff98b1" stroke="#a33a55" stroke-width=".8"/>`; });
      const pc = ["#ffc8d4", "#f2809d", "#d84a73"];
      [[-122, 44, 10.6], [-78, 30, 8.4], [-32, 45, 9.6], [18, 30, 7.6], [100, 41, 10.6], [148, 29, 8.4], [194, 44, 10], [282, 40, 9]].forEach(([a, r, s], i) => {
        const [x, y] = pol(a, r);
        k.top += G(at(x, y), anim("sw", i * 0.7, 2.6 + (i % 3) * 0.5, sakura(0, 0, s, i * 23, pc, "#a33a55", 0.9)));
      });
      [[18, 22, 0], [40, 30, 1.4], [70, 16, 2.8], [92, 26, 4.1]].forEach(([x, y, d]) => {
        k.front += G(at(x, y), anim("fa", d, 5.5, S(petal(4.4, 3.6), "#ffc2d1", "#c25270", 0.6)));
      });
    },

    /* ------------------------------------------------------------------ Crystal */
    crystal(k) {
      k.ink = "#1f3f75"; k.wall = "#88cde6";
      k.base = "#e6fbff";
      const tints = ["#eafafd", "#c6f2fd", "#fde0f0", "#e2dcfd", "#d3fbea", "#f6feff", "#b8ecfc"];
      [[H - 2, 34, 18], [34, R + 3, 24]].forEach(([ri, ro, n], row) => {
        const st = 360 / n, o = row * st / 2;
        for (let i = 0; i < n; i++) {
          const a0 = o + i * st, a1 = a0 + st;
          k.body += S(poly([pol(a0, ri), pol(a1, ri), pol(a0 + st / 2, ro)]), k.pick(tints), "#a9dcef", 0.5)
            + S(poly([pol(a0 + st / 2, ro), pol(a1 + st / 2, ro), pol(a1, ri)]), k.pick(tints), "#a9dcef", 0.5);
        }
      });
      const cy = ["#e6fcff", "#4fd3fb", "#1192e0"], pk = ["#ffe3f2", "#fd86c3", "#d9468f"], lv = ["#efe8ff", "#b995f2", "#7c55d0"], mn = ["#e3fff4", "#8ff0c9", "#3fbf9a"];
      for (let i = 0; i < 10; i++) { const [x, y, a] = spot(k); k.over += gem(x, y, 1.8, 3, k.pick([pk, cy, lv]), "#1f3f75", a, 0.6); }
      [[0, cy, 10, 19], [90, pk, 9.2, 17], [180, cy, 10, 19], [270, lv, 9.2, 17], [45, mn, 6.4, 12], [135, lv, 6.4, 12], [225, pk, 6.4, 12], [315, mn, 6.4, 12]].forEach(([a, c, w, h], i) => {
        const [x, y] = pol(a, 34);
        k.top += G(at(x, y, a), anim("br", i * 0.4, 3.2, gem(0, 0, w, h, c, "#1f3f75", 0, 1.3)));
      });
      [[0, 52], [90, 50], [180, 52], [270, 50]].forEach(([a, r], i) => { const [x, y] = pol(a + 18, r); k.front += twinkle(x, y, 3.4, "#fff", i * 0.7, 2.8); });
      k.front += twinkle(...pol(-30, 22), 2.6, "#ffd1ec", 1.9, 3);
    },

    /* ------------------------------------------------------------- Dragon Scale */
    dragon_scale(k) {
      k.ink = "#3d0710"; k.wall = "#5e0610"; k.base = "#8f0d18";
      // shingled scales pointing outwards; inner rows drawn last so their tips overlap the next row
      const sc = (w, h) => `M${-w} 0C${-w} ${f(h * 0.5)} ${f(-w * 0.5)} ${f(h * 0.8)} 0 ${h}C${f(w * 0.5)} ${f(h * 0.8)} ${w} ${f(h * 0.5)} ${w} 0Z`;
      const cols = ["#d93a1e", "#c9241b", "#e8441f", "#b01420", "#f56c25", "#a80f1a", "#e04a20"];
      [[48, 20, 8.8, 12.5], [40.5, 17, 8.6, 12], [33, 14, 8.4, 11.5], [25.5, 11, 8.2, 11], [18, 8, 7.8, 10], [11, 6, 6.4, 8]].forEach(([r, n, w, h], row) => {
        for (let i = 0; i < n; i++) {
          const a = i * 360 / n + (row % 2) * 180 / n, [x, y] = pol(a, r), col = k.pick(cols);
          k.body += G(at(x, y, a + 180), S(sc(w, h), col, "#4a0710", 1)
            + anim("pu", (a / 360) * 2.6, 2.6, P(sc(w * 0.58, h * 0.6), "#ffc06a", ' opacity=".6" transform="translate(0 3.4)"'))
            + L(`M${f(-w * 0.62)} ${f(h * 0.42)}Q0 ${f(h * 0.95)} ${f(w * 0.62)} ${f(h * 0.42)}`, "#ffd89a", 0.8, ' opacity=".45"'));
        }
      });
      const gold = k.lin([[0, "#fff2b8"], [0.45, "#fcc259"], [1, "#b8700f"]], 0, 0, 1, 0);
      const horn = (s) => S(`M${f(-4.8 * s)} 0Q${f(-2.6 * s)} ${f(-6.5 * s)} ${f(1.6 * s)} ${f(-13 * s)}Q${f(2.6 * s)} ${f(-5.4 * s)} ${f(4.8 * s)} 0Q0 ${f(1.8 * s)} ${f(-4.8 * s)} 0Z`, gold, "#4a2a05", 1.2)
        + L(`M${f(-1.4 * s)} ${f(-1.2 * s)}Q${f(-0.6 * s)} ${f(-6.4 * s)} ${f(1.2 * s)} ${f(-11 * s)}`, "#fff", 0.8, ' opacity=".75"');
      for (let i = 0; i < 8; i++) { const a = i * 45 + 8; const [x, y] = pol(a, R - 6); k.top += G(at(x, y, a), horn(1.05)); }
      for (let i = 0; i < 5; i++) { const a = i * 72 + 32; const [x, y] = pol(a, 28); k.top += G(at(x, y, a), horn(0.72)); }
      for (let i = 0; i < 3; i++) { const [x, y] = pol(i * 120 + 10, R + 5); k.front += twinkle(x, y, 3.2, "#fff6c8", i * 1.1, 3.2); }
    },

    /* --------------------------------------------------------- Enchanted Forest */
    enchanted_forest(k) {
      k.ink = "#14301b"; k.wall = "#1d4520";
      k.base = k.radU([[0.24, "#255b25"], [0.55, "#5d9a30"], [1, "#2c6a2a"]]);
      for (let i = 0; i < 22; i++) { const [x, y] = spot(k, H, R); k.body += `<circle cx="${x}" cy="${y}" r="${f(k.r(2.5, 6))}" fill="${k.pick(["#7a9725", "#4f8a2a", "#8db53a", "#3a7a2c"])}" opacity=".55"/>`; }
      const vine = pp(Array.from({ length: 14 }, (_, i) => [i * 30 - 15, 33 + Math.sin(i * 1.9) * 5]));
      k.body += S(tube(vine, 3), "#7a4f2a", "#3b240f", 0.9);
      [[20, 33, 1], [110, 36, -1], [200, 31, 1], [290, 35, -1]].forEach(([a, r, dir]) => {
        const c = pol(a, r), ps = Array.from({ length: 9 }, (_, i) => { const t = i / 8, ang = dir * t * 470, rr = 6.5 * (1 - t * 0.75); return [f(c[0] + Math.cos(ang * Math.PI / 180) * rr), f(c[1] + Math.sin(ang * Math.PI / 180) * rr)]; });
        k.body += S(tube(ps, [2, 0.6]), "#86592f", "#3b240f", 0.7);
      });
      const lf = (len, w, col) => S(leaf(len, w), col, "#14301b", 1) + L(`M0 -0.6L0 ${f(-len * 0.85)}`, "#9ad45e", 0.7, ' opacity=".8"');
      for (let i = 0; i < 18; i++) { const a = i * 20 + k.r(-5, 5), [x, y] = pol(a, R - 6); k.over += G(at(x, y, a + k.r(-40, 40)), lf(k.r(10, 13), k.r(4.6, 5.6), k.pick(["#4cae53", "#2f8a3a", "#3f9d45"]))); }
      for (let i = 0; i < 9; i++) { const a = i * 40 + 10, [x, y] = pol(a, H + 4); k.over += G(at(x, y, a + k.r(-30, 30)), lf(7, 3.4, k.pick(["#4cae53", "#2f8a3a"]))); }
      const flower = (x, y, r, c) => { const cs = Array.from({ length: 5 }, (_, i) => { const [px, py] = pol(i * 72, r * 0.62, x, y); return [px, py, r * 0.52]; }); return puffs(cs, c, "#5a1d3c", 0.8) + `<circle cx="${x}" cy="${y}" r="${f(r * 0.34)}" fill="#ffd24a" stroke="#7a5a10" stroke-width=".6"/>`; };
      [[-60, 30, "#f59bc8"], [40, 42, "#fff1d2"], [140, 30, "#f59bc8"], [175, 44, "#fff1d2"], [250, 40, "#f59bc8"], [320, 28, "#c8b4ff"]].forEach(([a, r, c]) => { const [x, y] = pol(a, r); k.top += flower(x, y, 5.6, c); });
      [[-20, 44, "#ff7ac8"], [80, 30, "#ffd84a"], [210, 26, "#b9a0ff"], [292, 46, "#ffd84a"], [118, 47, "#ff7ac8"]].forEach(([a, r, c], i) => {
        const [x, y] = pol(a, r);
        k.top += G(at(x, y), anim("fl", i * 0.6, 3.2, anim("pu", i * 0.5, 2.2, `<circle r="7" fill="${c}" opacity=".35"/>`) + bubble(0, 0, 3.4, c, "#3b1a2c", 0.9)));
      });
      for (let i = 0; i < 5; i++) { const [x, y] = spot(k, 20, 50); k.front += G(at(x, y), anim("ri", i * 0.7, 3.6, `<circle r="1" fill="#fff59a"/><circle r="2.4" fill="#fff59a" opacity=".3"/>`)); }
    },

    /* ---------------------------------------------------------------- Frostbite */
    frostbite(k) {
      k.ink = "#0f3a72"; k.wall = "#3b8dcc"; k.base = "#3a98dc";
      const ice = ["#9fe2fd", "#7fd0f8", "#bfeeff", "#5fbbf0", "#d4f5ff", "#8ad8fb"];
      k.cells([[H - 3, 29, 6, 5], [29, R + 4, 10, 0]], 1, 3).forEach((c) => {
        k.body += P(poly(c.pts), k.pick(ice)) + P(poly(c.inner(2.8, -1, -1.2)), "#fff", ' opacity=".4"') + P(poly(c.inner(6, 0.8, 0.9)), "#2f86cf", ' opacity=".18"')
          + L(`M${c.pts[6]}L${c.pts[7]}L${c.pts[0]}`, "#fff", 1, ' opacity=".75"');
      });
      // snow cap on the top rim, with drips
      const cap = (rOut, rIn, a0, a1, drips, dir) => {
        const ps = [];
        for (let a = a0; a <= a1; a += 8) ps.push(pol(a, rOut));
        for (let a = a1; a >= a0; a -= 5) {
          const d = drips.find((v) => Math.abs(v - a) < 2.5);
          if (d != null) { const dp = k.r(9, 14); [[7, 0.08], [4.6, 0.42], [4.4, 0.8], [2.4, 1], [0, 1.05], [-2.4, 1], [-4.4, 0.8], [-4.6, 0.42], [-7, 0.08]].forEach(([da, t]) => ps.push(pol(d + da * 34 / rIn, rIn + dir * dp * t))); }
          else ps.push(pol(a, rIn + Math.sin(a * 0.3) * 1.4));
        }
        return smooth(ps);
      };
      const top = cap(R + 3, R - 11, -84, 84, [-56, -20, 16, 52], -1);
      k.over += S(top, "#bcd3ec", "#0f3a72", 1.4) + P(top, "#f8fcff", ' transform="translate(0 -1.8)"') + L(arc(R - 4, -60, -20), "#fff", 2.4);
      // icicles hanging from the snow line
      [[-40, R - 12, 10], [-6, R - 12, 12], [30, R - 12, 9]].forEach(([a, r, len]) => { const [x, y] = pol(a, r); k.over += G(at(x, y, a + 180), S(`M-2.6 0Q-1 ${f(-len * 0.5)} 0 ${-len}Q1 ${f(-len * 0.5)} 2.6 0Z`, "#d6f4ff", "#0f3a72", 1) + L(`M-0.8 -1L-0.2 ${f(-len * 0.7)}`, "#fff", 0.8)); });
      const flake = (s) => { let d = ""; for (let i = 0; i < 6; i++) { const [x, y] = pol(i * 60, s, 0, 0), [b1x, b1y] = pol(i * 60 - 30, s * 0.42, x * 0.55, y * 0.55), [b2x, b2y] = pol(i * 60 + 30, s * 0.42, x * 0.55, y * 0.55); d += `M0 0L${x} ${y}M${f(x * 0.55)} ${f(y * 0.55)}L${b1x} ${b1y}M${f(x * 0.55)} ${f(y * 0.55)}L${b2x} ${b2y}`; } return L(d, "#0f3a72", 3.4) + L(d, "#fff", 1.6); };
      [[115, 36, 8], [205, 32, 7], [290, 40, 6.6]].forEach(([a, r, s], i) => { const [x, y] = pol(a, r); k.top += G(at(x, y), anim("sp", i * 3, 16, flake(s))); });
      const icc = ["#f2fdff", "#9fe2fd", "#3d93d6"];
      k.top += cluster(...pol(150, 44), 150, 1.05, icc, "#0f3a72") + cluster(...pol(245, 46), 245, 0.9, icc, "#0f3a72");
      k.css += ".sn{animation:sn 6s linear infinite}@keyframes sn{0%{opacity:0;transform:translate(0,-10px)}15%,80%{opacity:1}100%{opacity:0;transform:translate(6px,44px)}}";
      [[30, 8], [58, 2], [90, 10], [110, 20], [20, 30]].forEach(([x, y], i) => { k.front += G(at(x, y), anim("sn", i * 1.2, 6, `<circle r="${f(1.2 + (i % 2) * 0.6)}" fill="#fff" stroke="#9ccbee" stroke-width=".5"/>`)); });
      k.front += twinkle(...pol(-30, R - 4), 3, "#fff", 0.4, 3) + twinkle(...pol(70, 30), 2.4, "#fff", 1.8, 3);
    },

    /* ------------------------------------------------------------------ Haunted */
    haunted(k) {
      k.ink = "#1d0f3a"; k.wall = "#24114a";
      k.base = k.radU([[0.24, "#2a1458"], [0.6, "#47237f"], [1, "#2b1456"]]);
      let smoke = "";
      for (let i = 0; i < 7; i++) {
        const a = i * 51 + k.r(-8, 8);
        smoke += P(tube(pp([[a, 12], [a + 22, 24], [a + 12, 37], [a + 36, 47], [a + 62, 57]]), (t) => 1 + 8 * Math.sin(Math.PI * t)), k.pick(["#6f3fbd", "#8a55d6", "#5b2fa3", "#9b6be3"]), ' opacity=".9"');
      }
      for (let i = 0; i < 4; i++) { const a = i * 90 + 30; smoke += P(tube(pp([[a, 18], [a + 30, 30], [a + 20, 44], [a + 50, 54]]), (t) => 0.5 + 5 * Math.sin(Math.PI * t)), "#1f0d40", ' opacity=".55"'); }
      k.body += `<g class="sp c64" style="animation-duration:60s">${smoke}</g>`;
      [[20, 26], [130, 44], [150, 24], [260, 46], [300, 26], [40, 50]].forEach(([a, r]) => { const [x, y] = pol(a, r); k.over += G(at(x, y), S(spark(k.r(3.6, 5), 0.24), "#c9a0ff", "#2a1458", 0.8) + P(spark(1.6, 0.3), "#fff", ' opacity=".8"')); });
      const ghost = (w, h) => {
        const body = `M${-w} 0C${-w} ${f(-h * 1.15)} ${w} ${f(-h * 1.15)} ${w} 0L${w} ${f(h * 0.6)}Q${f(w * 0.66)} ${f(h * 0.32)} ${f(w * 0.33)} ${f(h * 0.62)}Q0 ${f(h * 0.32)} ${f(-w * 0.33)} ${f(h * 0.62)}Q${f(-w * 0.66)} ${f(h * 0.32)} ${-w} ${f(h * 0.6)}Z`;
        return S(body, k.lin([[0, "#ffffff"], [0.6, "#f1e6ff"], [1, "#c9adf7"]], 0, 0, 1, 0.3), "#2a1458", 1.3)
          + `<ellipse cx="${f(-w * 0.36)}" cy="${f(-h * 0.36)}" rx="1.15" ry="1.65" fill="#1b0c33"/><ellipse cx="${f(w * 0.36)}" cy="${f(-h * 0.36)}" rx="1.15" ry="1.65" fill="#1b0c33"/>`
          + `<circle cx="${f(-w * 0.32)}" cy="${f(-h * 0.46)}" r=".45" fill="#fff"/><circle cx="${f(w * 0.4)}" cy="${f(-h * 0.46)}" r=".45" fill="#fff"/>`
          + `<ellipse cx="${f(-w * 0.62)}" cy="${f(-h * 0.08)}" rx="1.3" ry=".7" fill="#ff9cd2" opacity=".7"/><ellipse cx="${f(w * 0.62)}" cy="${f(-h * 0.08)}" rx="1.3" ry=".7" fill="#ff9cd2" opacity=".7"/>`
          + `<ellipse cx="0" cy="${f(-h * 0.02)}" rx=".9" ry="1.1" fill="#1b0c33"/>`;
      };
      [[-42, 35, -18, 1.6], [80, 34, 14, 1.5], [200, 35, -8, 1.65]].forEach(([a, r, rot, s], i) => {
        const [x, y] = pol(a, r);
        k.top += G(at(x, y, rot, s), anim("fl", i * 1.1, 3.4, anim("sw", i * 0.8, 2.8, ghost(7, 9))));
      });
      for (let i = 0; i < 4; i++) { const [x, y] = spot(k, 20, 58); k.front += twinkle(x, y, 2.8, "#e4d0ff", i * 0.8, 3); }
    },

    /* ----------------------------------------------------------------- Medieval */
    medieval(k) {
      k.ink = "#1b1d24"; k.wall = "#5a5b62"; k.base = "#9a9ca3";
      // inner stone collar, two courses of blocks
      [[H - 2, 23.5, 8, 0], [23.5, 34, 10, 18]].forEach(([r0, r1, n, o]) => {
        for (let i = 0; i < n; i++) { const a0 = o + i * 360 / n; k.body += S(sect(r0, r1, a0, a0 + 360 / n), k.pick(["#dcdcde", "#cfcfd3", "#e6e6e8", "#d4d4d8"]), "#86878d", 0.9); }
      });
      // outer band: blue panels and steel plates
      for (let i = 0; i < 8; i++) {
        const a0 = i * 45 - 22.5;
        k.body += i % 2 ? S(sect(34, R + 3, a0, a0 + 45), "#b7b9bf", "#4a4c54", 1) + L(arc(44, a0 + 6, a0 + 39), "#d9dbe0", 0.8, ' opacity=".8"') + L(arc(49, a0 + 6, a0 + 39), "#8d8f96", 0.8)
          : S(sect(34, R + 3, a0, a0 + 45), k.radU([[0.6, "#3f8ff0"], [0.85, "#2574df"], [1, "#0a3d8f"]]), "#0a2a5e", 1);
      }
      k.body += `<circle cx="64" cy="64" r="34" fill="none" stroke="#2c2d33" stroke-width="3.6"/><circle cx="64" cy="64" r="34" fill="none" stroke="#9fa1a8" stroke-width="1"/>`;
      for (let i = 0; i < 8; i++) {
        const a = i * 45 + 22.5;
        k.over += S(sect(32.5, R + 3, a - 4.2, a + 4.2), k.lin([[0, "#5c5e66"], [1, "#2e2f36"]], 0, 0, 1, 0), "#14151a", 1);
        [39, 49].forEach((r) => { const [x, y] = pol(a, r); k.over += `<circle cx="${x}" cy="${y}" r="1.7" fill="#d7d9de" stroke="#14151a" stroke-width=".7"/><circle cx="${f(x - 0.5)}" cy="${f(y - 0.5)}" r=".6" fill="#fff"/>`; });
      }
      const shield = "M-11.5 -12L11.5 -12L11.5 0C11.5 8 5 12.5 0 15.5C-5 12.5 -11.5 8 -11.5 0Z";
      const fleur = "M0 -9.5C3.2 -6.4 3.2 -2 0 2C-3.2 -2 -3.2 -6.4 0 -9.5Z"
        + "M-1 1C-4.4 -0.6 -7.6 -2 -7.4 -5.4C-7.2 -7.6 -4.6 -8 -4 -6C-4.8 -4 -3 -2 -1 -0.4Z"
        + "M1 1C4.4 -0.6 7.6 -2 7.4 -5.4C7.2 -7.6 4.6 -8 4 -6C4.8 -4 3 -2 1 -0.4Z"
        + "M-4.6 1H4.6V3.2H-4.6Z" + "M-1.4 3.2L1.4 3.2L0.8 7.4L-0.8 7.4Z";
      k.top += G(at(64, 17.5), S(shield, k.lin([[0, "#e2e4e8"], [1, "#8d9097"]], 0, 0, 1, 1), "#14151a", 1.6)
        + S(shield, k.lin([[0, "#4d9cf5"], [1, "#0b4fae"]]), "#0a2a5e", 0.9, ' transform="scale(.76) translate(0 1)"')
        + anim("pu", 0, 2.6, P(fleur, "#ffe58a", ' opacity=".55" transform="scale(1.25) translate(0 -.5)"'))
        + S(fleur, "#fdc84a", "#6b3f06", 0.7, ' transform="translate(0 -.5)"')
        + `<circle cx="-11.5" cy="-12" r="1.6" fill="#d7d9de" stroke="#14151a" stroke-width=".7"/><circle cx="11.5" cy="-12" r="1.6" fill="#d7d9de" stroke="#14151a" stroke-width=".7"/>`);
      k.front += twinkle(...pol(22.5, 49), 2.6, "#fff", 0.3, 3.4) + twinkle(...pol(202.5, 39), 2.4, "#fff", 2, 3.4) + twinkle(76, 8, 3, "#fff6c8", 1.1, 3);
    },

    /* ----------------------------------------------------------------- Mushroom */
    mushroom(k) {
      k.ink = "#4a1b0d"; k.wall = "#b5814e";
      k.base = k.radU([[0.24, "#c48f5c"], [0.36, "#efcd9d"], [1, "#e4b47f"]]);
      // the cap's scalloped rim around the hole
      const edge = smooth(Array.from({ length: 40 }, (_, i) => pol(i * 9, i % 2 ? 21.6 : 19.4)));
      k.body += P(circ(C, C, R + 3) + edge, k.radU([[0.3, "#ff6f5a"], [0.62, "#e8302a"], [1, "#b3171b"]]), ' fill-rule="evenodd"') + L(edge, "#5a120a", 1.4);
      k.body += L(arc(R - 5, 120, 230), "#8a0f12", 2.6, ' opacity=".35"') + L(arc(26, -70, -20), "#ffb0a0", 1.6, ' opacity=".6"');
      [[-22, 30, 7.4], [22, 45, 7], [72, 31, 5.8], [104, 46, 8], [150, 35, 6.2], [192, 47, 7.2], [250, 31, 5.6], [282, 46, 7.6], [330, 47, 6], [-62, 47, 4.6], [172, 26, 4.2]].forEach(([a, r, s]) => {
        const [x, y] = pol(a, r);
        k.over += P(blob(k, x + 0.9, y + 1.1, s, s * 0.82), "#d6c2a2") + P(blob(k, x, y, s, s * 0.82), "#f8f0e0") + P(`M${f(x - s * 0.55)} ${f(y - s * 0.25)}a${f(s * 0.34)} ${f(s * 0.24)} -30 1 1 ${f(s * 0.55)} ${f(-s * 0.24)}`, "#fff", ' opacity=".95"');
      });
      const clover = (s) => { let d = ""; for (let i = 0; i < 3; i++) d += S(heart(s), "#4cae53", "#245f3a", 0.9, ` transform="rotate(${i * 120 + 180}) translate(0 ${f(s * 0.45)})"`); return d + `<circle r="${f(s * 0.22)}" fill="#245f3a"/>`; };
      [[62, 50, 3.6], [196, 50, 3.2], [262, 52, 3], [30, 22, 2.6], [228, 24, 2.6]].forEach(([a, r, s]) => { const [x, y] = pol(a, r); k.top += G(at(x, y, k.r(0, 120)), clover(s)); });
      const mini = `<path d="M-2.8 0L-2.1 -6.5L2.1 -6.5L2.8 0Q0 1.5 -2.8 0Z" fill="#f6ead2" stroke="#4a1b0d" stroke-width="1.1" stroke-linejoin="round"/>`
        + `<path d="M-7.4 -5.2C-7.4 -12.8 7.4 -12.8 7.4 -5.2Q0 -3 -7.4 -5.2Z" fill="#e8302a" stroke="#4a1b0d" stroke-width="1.1" stroke-linejoin="round"/>`
        + `<circle cx="-3" cy="-8.4" r="1.4" fill="#f8f0e0"/><circle cx="2.4" cy="-9.6" r="1.1" fill="#f8f0e0"/><circle cx="4.4" cy="-6.6" r=".8" fill="#f8f0e0"/>`
        + `<path d="M-5.6 -7.8Q-4.6 -10.6 -1.8 -11.4" fill="none" stroke="#fff" stroke-width=".8" opacity=".6" stroke-linecap="round"/>`;
      k.css += ".sq{animation:sq 2.6s ease-in-out infinite}@keyframes sq{0%,60%,100%{transform:scale(1,1)}70%{transform:scale(1.12,.86)}80%{transform:scale(.94,1.1)}90%{transform:scale(1.03,.97)}}";
      [[46, 41, 1.55, 10], [206, 39, 1.4, -12], [238, 49, 1.1, 6]].forEach(([a, r, s, rot], i) => { const [x, y] = pol(a, r); k.top += G(at(x, y, rot, s), anim("sq", i * 0.8, 2.6, mini)); });
      for (let i = 0; i < 4; i++) { const [x, y] = spot(k, 30, 52); k.front += G(at(x, y), anim("ri", i * 0.9, 3.6, `<circle r="1.2" fill="#fff7e2" stroke="#d9b98a" stroke-width=".4"/>`)); }
    },

    /* -------------------------------------------------------------------- Ninja */
    ninja(k) {
      k.ink = "#0e0f15"; k.wall = "#1c1e27";
      k.base = "#2b2e3b";
      k.cells([[H - 3, 28, 6, 0], [28, R + 4, 10, 15]], 1.4, 3).forEach((c) => {
        k.body += P(poly(c.pts), k.pick(["#3d4152", "#464b5e", "#353847", "#4d5266"])) + P(poly(c.inner(3, -1, -1.2)), "#8a8fa2", ' opacity=".24"');
      });
      const red = k.lin([[0, "#ff4b4b"], [0.5, "#e52027"], [1, "#a3121b"]], 0, 0, 1, 1);
      [[-32, 30], [52, 28], [138, 28], [222, 30], [306, 28]].forEach(([a, tw]) => {
        const c = pp([[a, R + 4], [a + tw * 0.45, 34], [a + tw, H - 3]]);
        k.body += S(tube(c, [17, 11]), red, "#3a0508", 1.3)
          + L(smooth(pp([[a - 3.4, R + 4], [a + tw * 0.45 - 2.8, 34], [a + tw - 4, H - 3]]), false), "#7f0e18", 1.2)
          + L(smooth(pp([[a + 4.6, R + 4], [a + tw * 0.45 + 3.8, 34], [a + tw + 4.4, H - 3]]), false), "#ff8a8a", 1, ' opacity=".6"');
      });
      const shuriken = P(spark(10.5, 0.3), k.lin([[0, "#f4f5f8"], [0.55, "#b9bcc6"], [1, "#6d7182"]], 0, 0, 1, 1)) + S(spark(10.5, 0.3), "none", "#0e0f15", 1.3)
        + L("M0 -9.4L0 9.4M-9.4 0L9.4 0", "#fff", 0.7, ' opacity=".45"') + `<circle r="2.1" fill="#2b2e3b" stroke="#0e0f15" stroke-width="1"/>`;
      [[96, 39, 1], [180, 40, 0.95], [264, 38, 1]].forEach(([a, r, s], i) => { const [x, y] = pol(a, r); k.top += G(at(x, y, 0, s), anim("sp", i * 1.7, 7, shuriken)); });
      const [kx, ky] = pol(-12, 45);
      k.css += ".tl{animation:tl 1.8s ease-in-out infinite alternate}@keyframes tl{from{transform:rotate(-5deg) scaleX(.96)}to{transform:rotate(7deg) scaleX(1.04)}}";
      k.top += G(at(kx, ky, 0, 1.45), anim("tl", 0, 1.8, S(tube([[2, 0], [9, -7], [17, -7], [24, -13]], [6.4, 3.6]), red, "#3a0508", 1) + L("M4 -2L15 -7.5", "#7f0e18", 0.8))
        + anim("tl", 0.6, 1.6, S(tube([[2, 1], [12, 0], [19, 4], [25, 2]], [5.8, 3.2]), red, "#3a0508", 1))
        + S("M-5 -4.6Q0 -6.4 5 -4.6Q6.4 0 5 4.6Q0 6.2 -5 4.6Q-6.4 0 -5 -4.6Z", red, "#3a0508", 1.1) + L("M-2.6 -3L-1.6 3M1.4 -3.4L2.4 2.8", "#7f0e18", 0.8)
        + L("M-3.6 -3.4Q0 -4.8 3.4 -3.6", "#ff9a9a", 0.8, ' opacity=".7"'));
      k.front += twinkle(...pol(96, 48), 2.8, "#fff", 0.5, 3) + twinkle(...pol(264, 47), 2.6, "#fff", 2, 3);
    },

    /* ------------------------------------------------------------------- Pirate */
    pirate(k) {
      k.ink = "#2a1306"; k.wall = "#43200c";
      k.base = k.radU([[0.24, "#5e3214"], [0.55, "#9a5a2b"], [1, "#6a3816"]]);
      for (let r = 16; r < R; r += 3.6) { const a0 = k.r(0, 360), a1 = a0 + k.r(50, 140); k.body += L(arc(r, a0, a1), "#5a2e12", 0.9, ' opacity=".6"'); }
      for (let i = 0; i < 12; i++) { const a = i * 30 + 15; k.body += L(`M${pol(a, H).join(" ")}L${pol(a, R + 2).join(" ")}`, "#3e1d09", 1.1); }
      const gold = k.lin([[0, "#ffe08a"], [0.5, "#fdb83c"], [1, "#c4791d"]], 0, 0, 1, 0);
      k.body += S(sect(27, 33.5, 200, 316), gold, "#2a1306", 1.2);
      [[136, 9], [180, 10], [228, 9]].forEach(([a, w]) => {
        k.over += S(strap(a, H - 3, R + 3, w), gold, "#2a1306", 1.2) + L(`M${pol(a - 3.4, H + 2)}L${pol(a - 2, R)}`, "#fff3c0", 0.9, ' opacity=".6"');
        [22, 36, 48].forEach((r) => { const [x, y] = pol(a, r); k.over += `<circle cx="${x}" cy="${y}" r="1.7" fill="#9a5a12" stroke="#2a1306" stroke-width=".7"/><circle cx="${f(x - 0.5)}" cy="${f(y - 0.5)}" r=".6" fill="#ffe9a8"/>`; });
      });
      // coiled rope
      const ropeA = [92, 128];
      k.over += S(tube(pp(Array.from({ length: 6 }, (_, i) => [ropeA[0] + i * (ropeA[1] - ropeA[0]) / 5, 47.5])), 6), "#d8b27a", "#3d2508", 1.1);
      for (let a = ropeA[0] + 1; a < ropeA[1]; a += 2.6) k.over += L(`M${pol(a - 1.6, 50.2)}L${pol(a + 1.2, 44.8)}`, "#9b7442", 1);
      const coin = (x, y, r, flat) => flat ? `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${f(r * 0.55)}" fill="#fdc046" stroke="#2a1306" stroke-width="1"/><ellipse cx="${x}" cy="${f(y - 0.2)}" rx="${f(r * 0.65)}" ry="${f(r * 0.32)}" fill="none" stroke="#c4791d" stroke-width=".8"/>`
        : `<circle cx="${x}" cy="${y}" r="${r}" fill="#fdc046" stroke="#2a1306" stroke-width="1.1"/><circle cx="${x}" cy="${y}" r="${f(r * 0.66)}" fill="none" stroke="#c4791d" stroke-width=".9"/><path d="M${f(x - r * 0.5)} ${f(y - r * 0.2)}a${f(r * 0.6)} ${f(r * 0.6)} 0 0 1 ${f(r * 0.6)} ${f(-r * 0.35)}" fill="none" stroke="#fff6c8" stroke-width=".9" stroke-linecap="round"/>`;
      [[70, 34, 5.2, 0], [82, 41, 5, 1], [62, 43, 4.8, 1], [76, 27, 4.6, 0], [92, 32, 5, 0], [256, 38, 5, 0], [270, 46, 4.4, 1], [160, 38, 4.4, 0]].forEach(([a, r, s, fl]) => { const [x, y] = pol(a, r); k.top += coin(x, y, s, fl); });
      // bandana over the top
      const ps = []; for (let a = -80; a <= 64; a += 9) ps.push(pol(a, R + 1.5));
      [[64, 40], [40, 30], [10, 26], [-20, 27], [-50, 32], [-80, 41]].forEach(([a, r]) => ps.push(pol(a, r)));
      const band = smooth(ps), red = k.lin([[0, "#e83a3a"], [1, "#9b151d"]], 0, 0, 0.6, 1);
      k.top += S(band, red, "#2a1306", 1.6) + L(smooth(pp([[-70, 46], [-30, 38], [10, 35], [50, 40]]), false), "#7a0f17", 1.2) + L(smooth(pp([[-60, 52], [-20, 48], [30, 48]]), false), "#ff7070", 0.9, ' opacity=".5"');
      for (let i = 0; i < 6; i++) { const [x, y] = pol(-64 + i * 24, 50 - (i % 2) * 6); k.top += `<circle cx="${x}" cy="${y}" r="1.2" fill="#fff" opacity=".85"/>`; }
      const [sx, sy] = pol(-10, 40);
      const bone = (rot) => G(`transform="rotate(${rot})"`, S("M-7 -1.2H7V1.2H-7Z", "#f6efe2", "#2a1306", 0.8) + ["-7 -1.4", "-7 1.4", "7 -1.4", "7 1.4"].map((c) => { const [x, y] = c.split(" "); return `<circle cx="${x}" cy="${y}" r="1.5" fill="#f6efe2" stroke="#2a1306" stroke-width=".8"/>`; }).join("") + P("M-6.6 -1.1H6.6V1.1H-6.6Z", "#f6efe2"));
      k.top += G(at(sx, sy, 8, 1.45), bone(35) + bone(-35)
        + S("M-4.6 -1.6C-4.6 -8.4 4.6 -8.4 4.6 -1.6C4.6 0.4 3.4 1.2 2.6 1.6V3.6H-2.6V1.6C-3.4 1.2 -4.6 0.4 -4.6 -1.6Z", "#f6efe2", "#2a1306", 0.9)
        + `<circle cx="-1.8" cy="-3" r="1.3" fill="#2a1306"/><circle cx="1.8" cy="-3" r="1.3" fill="#2a1306"/><path d="M0 -1L-.7 .4H.7Z" fill="#2a1306"/><path d="M-1.4 2.2V3.4M0 2.2V3.4M1.4 2.2V3.4" stroke="#2a1306" stroke-width=".5"/>`);
      const [nx, ny] = pol(66, 49);
      k.top += G(at(nx, ny, 0, 1.3), anim("tl", 0, 1.9, S(tube([[0, 0], [8, 5], [12, 13]], [6, 3]), red, "#2a1306", 1)) + anim("tl", 0.7, 1.7, S(tube([[0, 0], [10, -1], [16, 3]], [5.4, 2.6]), red, "#2a1306", 1))
        + `<circle r="3.6" fill="#c41e26" stroke="#2a1306" stroke-width="1"/>`);
      k.css += ".tl{animation:tl 1.8s ease-in-out infinite alternate}@keyframes tl{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}";
      k.front += twinkle(...pol(74, 34), 3, "#fff6c8", 0.2, 2.6) + twinkle(...pol(258, 40), 2.6, "#fff6c8", 1.5, 2.8);
    },

    /* ------------------------------------------------------------------ Samurai */
    samurai(k) {
      k.ink = "#1a0e0e"; k.wall = "#3e0b10"; k.base = "#1c1010";
      const plate = k.radU([[0.3, "#ef3b3b"], [0.75, "#c7151f"], [1, "#8f0f17"]]);
      [[H - 2, 24, 10, 0], [24.6, 38, 14, 6], [38.6, R + 2, 18, 0]].forEach(([r0, r1, n, o]) => {
        for (let i = 0; i < n; i++) {
          const a0 = o + i * 360 / n, a1 = a0 + 360 / n, am = (a0 + a1) / 2;
          k.body += S(sect(r0 + 0.7, r1 - 0.7, a0 + 1.4, a1 - 1.4), plate, "#2a0a0a", 1.1) + L(arc(r1 - 2.6, a0 + 3.4, a1 - 3.4), "#ff8a7a", 1, ' opacity=".6"');
          const [x1, y1] = pol(am - 2.8, r0 + 3.4), [x2, y2] = pol(am + 2.8, r0 + 3.4), [x3, y3] = pol(am, r0 + 6);
          k.body += L(`M${x1} ${y1}L${x3} ${y3}L${x2} ${y2}`, "#1f1212", 1.3);
        }
      });
      [24.3, 38.3].forEach((r) => { k.over += `<circle cx="64" cy="64" r="${r}" fill="none" stroke="#2a0a0a" stroke-width="4"/><circle cx="64" cy="64" r="${r}" fill="none" stroke="#fcc14a" stroke-width="2.3"/><circle cx="64" cy="64" r="${f(r - 0.5)}" fill="none" stroke="#fff3c0" stroke-width=".6" opacity=".7"/>`; });
      for (let i = 0; i < 12; i++) { const [x, y] = pol(i * 30 + 15, 38.3); k.over += `<circle cx="${x}" cy="${y}" r="1.5" fill="#fff0b0" stroke="#5a3a05" stroke-width=".6"/>`; }
      const gold = k.lin([[0, "#fff1b0"], [0.5, "#fcc14a"], [1, "#b8760e"]], 0, 0, 1, 1);
      const horn = [[61, 24], [51, 17], [43.5, 8.5], [40.5, 1.5]];
      const hw = (t) => 8.4 * (1 - t) + 1;
      k.top += S(tube(horn, hw), gold, "#3a2205", 1.4) + S(tube(horn.map(([x, y]) => [128 - x, y]), hw), gold, "#3a2205", 1.4)
        + L("M56 19Q49 12 45 4.6", "#fff6d0", 1.1, ' opacity=".85"') + L("M72 19Q79 12 83 4.6", "#fff6d0", 1.1, ' opacity=".85"');
      k.top += S("M50 25Q64 33 78 25L75.5 32.5Q64 37.5 52.5 32.5Z", gold, "#3a2205", 1.3) + L("M54 29.4Q64 34 74 29.4", "#b8760e", 0.9);
      k.top += G(at(64, 22), `<circle r="9.4" fill="${gold}" stroke="#3a2205" stroke-width="1.5"/><circle r="7.4" fill="#8f0f17" stroke="#3a2205" stroke-width=".8"/>` + anim("pu", 0, 2.6, `<circle r="6.6" fill="#ffd76a" opacity=".35"/>`) + sakura(0, 0, 5.6, 0, ["#ffd76a", "#e8a52a", "#9a5a12"], "#6b3a05", 0.7));
      k.top += G(at(64, 106), anim("sw", 0, 2.4, G('transform="scale(1.35)"', S("M-3.4 2L3.4 2L5.4 14Q0 16 -5.4 14Z", k.lin([[0, "#e8333b"], [1, "#8f0f17"]]), "#1a0e0e", 0.9) + L("M-2 4V13.4M0 4V14.4M2 4V13.4", "#7a0a10", 0.7)
        + S("M-3.8 0H3.8V3.4H-3.8Z", gold, "#3a2205", 0.9) + `<circle cy="-2" r="2.8" fill="#c7151f" stroke="#1a0e0e" stroke-width="1"/>`)));
      k.front += twinkle(42, 4, 3, "#fff6c8", 0.3, 3) + twinkle(86, 4, 3, "#fff6c8", 1.8, 3);
    },

    /* ---------------------------------------------------------------- Steampunk */
    steampunk(k) {
      k.ink = "#2e1709"; k.wall = "#4e260f"; k.base = "#5e2c10";
      k.cells([[H - 3, 31, 6, 10], [31, R + 4, 9, 0]], 1.15, 1.3).forEach((c) => {
        k.body += S(poly(c.pts), k.pick(["#d9783a", "#c4612b", "#e58b47", "#b8562a", "#cf6d33"]), "#2e1709", 0.8) + P(poly(c.inner(2.4, -0.7, -0.9)), "#ffd29a", ' opacity=".22"');
        [0, 2, 4, 6].forEach((j) => { const [x, y] = c.inner(2.6)[j]; k.body += `<circle cx="${x}" cy="${y}" r="1.15" fill="#f2b468" stroke="#2e1709" stroke-width=".5"/>`; });
      });
      for (let i = 0; i < 6; i++) { const [x, y] = spot(k); k.body += P(blob(k, x, y, k.r(3, 6), k.r(2.5, 4.5)), "#2a9a8f", ' opacity=".45"'); }
      const brass = k.lin([[0, "#ffe2a0"], [0.45, "#e8a640"], [1, "#9a5f16"]], 0, 0, 1, 1);
      const pipe = (pts, w) => S(tube(pp(pts), w), brass, "#2e1709", 1.3) + L(smooth(pp(pts.map(([a, r]) => [a, r - w * 0.24])), false), "#fff3c8", 1.3, ' opacity=".75"');
      k.over += pipe([[150, 47], [185, 48], [222, 46], [250, 41], [262, 32]], 7.6) + pipe([[50, 47], [74, 46.5], [104, 45]], 6.6);
      [[150, 47], [206, 47.4], [262, 32], [50, 47], [104, 45]].forEach(([a, r]) => { const [x, y] = pol(a, r); k.over += G(at(x, y, a), S("M-5.4 -2.6H5.4V2.6H-5.4Z", "#a15425", "#2e1709", 1.1) + L("M-4.4 -1.6H4.4", "#e89a60", 0.7)); });
      const gear = (r, n) => S(gearD(r, n, 0.22, 0.24), brass, "#2e1709", 1.3, ' fill-rule="evenodd"') + `<circle r="${f(r * 0.62)}" fill="none" stroke="#9a5f16" stroke-width="1.5"/>` + `<circle r="${f(r * 0.62)}" fill="none" stroke="#fff3c8" stroke-width=".7" opacity=".6"/>`
        + Array.from({ length: 4 }, (_, i) => L(`M${pol(i * 90 + 45, r * 0.3, 0, 0)}L${pol(i * 90 + 45, r * 0.58, 0, 0)}`, "#9a5f16", 1.4)).join("");
      [[-40, 31, 17, 12, "sp", 10], [-88, 47, 7.6, 8, "spr", 4.5], [140, 31, 10.5, 9, "spr", 6.5]].forEach(([a, r, s, n, cls, d], i) => { const [x, y] = pol(a, r); k.top += G(at(x, y), anim(cls, i, d, gear(s, n))); });
      const [gx, gy] = pol(96, 31);
      k.css += ".nd{animation:nd 2.2s ease-in-out infinite alternate}@keyframes nd{from{transform:rotate(-50deg)}to{transform:rotate(40deg)}}";
      k.top += G(at(gx, gy, 0, 1.25), `<circle r="6.4" fill="#f5eee0" stroke="#2e1709" stroke-width="1.1"/><circle r="6.4" fill="none" stroke="#e8a640" stroke-width="1.5" opacity=".9"/>`
        + L("M0 -4.4V-3.4M4.4 0H3.4M-4.4 0H-3.4M3.1 -3.1L2.4 -2.4M-3.1 -3.1L-2.4 -2.4", "#5a3a1a", 0.7)
        + anim("nd", 0, 2.2, L("M0 0L0 -4.6", "#c41e26", 1.1)) + `<circle r="1" fill="#2e1709"/>`);
      const [px, py] = pol(266, 27);
      for (let i = 0; i < 3; i++) k.front += G(at(px - 2, py - 3), anim("ri", i * 1.05, 3.2, `<circle r="${3.4 - i * 0.3}" fill="#fff" opacity=".75"/><circle cx="2.6" cy="-1.6" r="2.3" fill="#fff" opacity=".7"/>`));
    },

    /* ------------------------------------------------------------------ Thunder */
    thunder(k) {
      k.ink = "#0a1120"; k.wall = "#0f1a2e";
      k.base = k.radU([[0.24, "#0f1a30"], [0.6, "#1a2a4a"], [1, "#0e182c"]]);
      let clouds = "";
      for (let i = 0; i < 11; i++) {
        const a = i * 32.7 + k.r(-6, 6), r = i % 2 ? k.r(41, 48) : k.r(22, 29), [x, y] = pol(a, r), s = k.r(1, 1.25);
        const cs = [[x, y, 8.5 * s], [x - 8 * s, y + 2.5 * s, 6.5 * s], [x + 8 * s, y + 2 * s, 7 * s], [x + 2.5 * s, y - 6 * s, 6.2 * s], [x - 4.5 * s, y - 4.5 * s, 5.4 * s]];
        clouds += puffs(cs, k.pick(["#3d5590", "#34497d", "#46609c", "#2f4373"]), "#0c1630", 1.2, "#5d78b8")
          + L(`M${f(x - 2.5)} ${f(y + 1.5)}a3.6 3.6 0 1 1 4 -2.8a1.9 1.9 0 1 1 -1.9 1.4`, "#1b2a4d", 1.2);
      }
      k.body += `<g class="sp c64" style="animation-duration:80s">${clouds}</g>`;
      k.css += ".zp{animation:zp 3s ease-in-out infinite}@keyframes zp{0%,68%,100%{transform:scale(1)}72%{transform:scale(1.18)}78%{transform:scale(1.06)}}"
        + ".zg{animation:zg 3s linear infinite;opacity:0}@keyframes zg{0%,68%,100%{opacity:0}71%{opacity:.95}75%{opacity:.25}79%{opacity:.8}86%{opacity:0}}"
        + ".zf{animation:zf 3s linear infinite;opacity:0}@keyframes zf{0%,69%,100%{opacity:0}72%{opacity:.35}76%{opacity:0}79%{opacity:.25}84%{opacity:0}}";
      k.over += `<circle class="zf" cx="64" cy="64" r="60" fill="#cfe4ff"/>`;
      const yel = k.lin([[0, "#fff3a0"], [0.45, "#fdbb2f"], [1, "#e8861c"]], 0, 0, 1, 1);
      [[30, 35, 14.5, 18], [124, 37, 13, -10], [212, 34, 14.5, 22], [298, 38, 12.5, -6]].forEach(([a, r, s, rot], i) => {
        const [x, y] = pol(a, r);
        k.top += G(at(x, y, rot), `<g class="zg" style="animation-delay:-${f(i * 0.75)}s">${S(bolt(s), "#fff7c0", "#fff7c0", 6, ' opacity=".7"')}</g>` + anim("zp", i * 0.75, 3, S(bolt(s), yel, "#3a2405", 1.5) + L(`M${f(-0.05 * s)} ${f(-0.86 * s)}L${f(0.32 * s)} ${f(-0.86 * s)}`, "#fff", 1.1)));
      });
      for (let i = 0; i < 4; i++) { const [x, y] = spot(k, 20, 58); k.front += twinkle(x, y, 2.8, "#a8d4ff", i * 0.7, 2.2); }
    },

    /* -------------------------------------------------------------------- Toxic */
    toxic(k) {
      k.ink = "#08310e"; k.wall = "#0d4414";
      k.base = k.radU([[0.24, "#145a1a"], [0.6, "#2c9420"], [1, "#1f7a1c"]]);
      const lime = k.radU([[0.3, "#e3fb86"], [0.7, "#b8fa0b"], [1, "#8fd60a"]]);
      const outer = coatEdge(k, 43, [18, 62, 108, 150, 196, 240, 282, 326], 2, 15);
      const inner = (() => { const ps = []; for (let a = 0; a < 360; a += 10) { const d = [40, 160, 270].find((v) => Math.abs(v - a) < 5); ps.push(pol(a, 20 + Math.sin(a * 0.12) * 1.5)); if (d != null) { ps.push(pol(a + 2.5, 26)); ps.push(pol(a + 6, 29)); ps.push(pol(a + 9.5, 26)); } } return smooth(ps); })();
      k.body += P(circ(C, C, R + 4) + outer, lime, ' fill-rule="evenodd"') + L(outer, "#2a6e0a", 1.4) + S(inner, lime, "#2a6e0a", 1.4);
      k.body += L(arc(R - 4, -64, -18), "#fbffd0", 2.6, ' opacity=".85"') + L(arc(23, 200, 240), "#fbffd0", 1.8, ' opacity=".75"');
      [[-40, 48, 5.6], [10, 48, 3.8], [58, 49, 4.6], [120, 48, 3.2], [172, 49, 5], [232, 47, 3.8], [300, 49, 4.4], [-80, 22, 3], [100, 22, 3.2], [212, 22, 2.6]].forEach(([a, r, s]) => { const [x, y] = pol(a, r); k.over += bubble(x, y, s, "#d4ff4a", "#2a6e0a", 1); });
      k.top += bubble(...pol(-50, 40), 7.4, "#c6ff3a", "#08310e", 1.3) + bubble(...pol(150, 38), 5, "#c6ff3a", "#08310e", 1.2);
      k.css += ".pp{animation:pp 2.8s ease-in infinite}@keyframes pp{0%{opacity:0;transform:scale(.2)}20%{opacity:1}70%{opacity:1;transform:scale(1)}78%{opacity:0;transform:scale(1.6)}100%{opacity:0}}"
        + ".dr{animation:dr 3.6s ease-in infinite}@keyframes dr{0%,40%{opacity:0;transform:translateY(0) scale(.4)}55%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(16px) scale(.8)}}";
      [[30, 3.2], [100, 2.4], [210, 3], [320, 2.4]].forEach(([a, s], i) => { const [x, y] = pol(a, 33); k.front += G(at(x, y), anim("pp", i * 0.7, 2.8, bubble(0, 0, s, "#e8ff7a", "#2a6e0a", 0.8))); });
      k.front += G(at(...pol(182, R - 1)), anim("dr", 0, 3.6, S(drop(5.4, 8), "#b8fa0b", "#08310e", 1.1, ' transform="rotate(180)"')));
      k.back += k.glow("#b8fa0b", 0.55, 0.78, 2.8);
    },
  });
})();
