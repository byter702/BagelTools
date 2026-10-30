/* =============================================================================
   avatars-art-legendary.js  —  the 10 Legendary bagels (see avatars.js for the kit)
   ========================================================================== */
(() => {
  "use strict";
  const { C, R, H, f, pol, circ, poly, pp, arc, sect, strap, smooth, tube, star, spark, rhomb, petal, leaf, drop, crescent,
    at, P, S, L, G, anim, gem, shard, cluster, sakura, bubble, twinkle } = Avatars.K;
  const GOLD = ["#fff1b8", "#fdc352", "#c98a1c"], BLUE = ["#bfe3ff", "#2a8cf5", "#0a3f9e"], RED = ["#ffc2b0", "#e8352a", "#8a0f12"];
  const spot = (k, r0 = H + 5, r1 = R - 5) => { const a = k.r(0, 360), r = k.r(r0, r1); return [...pol(a, r), a, r]; };
  // a gem in a gold diamond setting
  const set = (k, x, y, w, h, c, ink, rot = 0) => G(at(x, y, rot), S(rhomb(w + 3.4, h + 4.4), k.lin([[0, "#fff1b0"], [0.5, "#fcc14a"], [1, "#b8760e"]], 0, 0, 1, 1), ink, 1.3)
    + L(rhomb(w + 1.7, h + 2.3), "#b8760e", 0.8) + gem(0, 0, w, h, c, ink, 0, 1.1));
  const gold = (k) => k.lin([[0, "#fff1b0"], [0.5, "#fcc14a"], [1, "#b8760e"]], 0, 0, 1, 1);

  Avatars.art({
    /* -------------------------------------------------------------------- Solar */
    solar(k) {
      k.ink = "#5a1a05"; k.R = 45; k.wall = "#c4520a";
      k.base = k.radU([[0.29, "#e86a0a"], [0.48, "#ffc93a"], [0.8, "#ffbf33"], [1, "#f58a12"]], 64, 64, 45);
      const spike = (a, r0, r1, wd) => `M${pol(a - wd, r0)}Q${pol(a - wd * 0.2, (r0 + r1) / 2 + 2)} ${pol(a + wd * 0.35, r1)}Q${pol(a + wd * 0.3, (r0 + r1) / 2)} ${pol(a + wd, r0)}Z`;
      let back = "", front = "";
      for (let i = 0; i < 12; i++) { back += spike(i * 30 + 15, 40, 58, 10); front += spike(i * 30, 40, 63, 10); }
      k.back += k.glow("#ffd24a", 0.7, 0.62, 3)
        + `<g class="sp c64" style="animation-duration:50s">${S(back, k.radU([[0.6, "#c4150b"], [1, "#fa7914"]], 64, 64, 60), "#5a1a05", 1.5)}</g>`
        + `<g class="spr c64" style="animation-duration:70s">${S(front, k.radU([[0.62, "#fa8505"], [0.85, "#ffc536"], [1, "#fff0a8"]], 64, 64, 63), "#5a1a05", 1.6)}</g>`;
      k.body += L(arc(38, -150, -60), "#fff0a0", 3, ' opacity=".7"') + L(arc(30, 20, 120), "#fff0a0", 2.4, ' opacity=".6"') + L(arc(36, 150, 230), "#f07a12", 2.6, ' opacity=".6"');
      for (let i = 0; i < 7; i++) { const [x, y] = spot(k, 20, 40); k.body += `<ellipse cx="${x}" cy="${y}" rx="${f(k.r(2, 3.6))}" ry="${f(k.r(1.6, 2.8))}" fill="#e2650a" opacity=".55"/>`; }
      [0, 90, 180, 270].forEach((a, i) => { const [x, y] = pol(a, 31); k.top += G(at(x, y, a), anim("br", i * 0.5, 2.6, gem(0, 0, 4.6, 8.4, ["#ffe0a0", "#f5701a", "#b8300a"], "#5a1a05", 0, 1.2))); });
      for (let i = 0; i < 4; i++) { const [x, y] = pol(i * 90 + 45, 60); k.front += twinkle(x, y, 3.6, "#fff6c8", i * 0.6, 2.6); }
    },

    /* -------------------------------------------------------------------- Lunar */
    lunar(k) {
      k.ink = "#141623"; k.wall = "#1d1e29";
      k.base = k.radU([[0.24, "#3a4258"], [0.55, "#66708f"], [1, "#3e4660"]]);
      let moon = "";
      [[30, 40, 7], [100, 30, 5], [150, 46, 6], [230, 32, 4.4], [290, 46, 6.6], [-20, 24, 3.6], [190, 22, 3.2], [60, 50, 3.4]].forEach(([a, r, s]) => {
        const [x, y] = pol(a, r);
        moon += `<circle cx="${x}" cy="${y}" r="${s}" fill="#353b50" stroke="#1d2131" stroke-width="1"/>`
          + `<path d="${arc(s - 0.8, 100, 250, x, y)}" fill="none" stroke="#7d87a3" stroke-width="1.3" stroke-linecap="round"/>`
          + `<path d="${arc(s - 1, -60, 40, x, y)}" fill="none" stroke="#1b1f2d" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`;
      });
      for (let i = 0; i < 9; i++) {
        const [x, y] = spot(k), s = k.r(1.6, 3);
        moon += S(poly([[x - s, y], [x - s * 0.4, y - s], [x + s * 0.8, y - s * 0.6], [x + s, y + s * 0.4], [x, y + s]].map(([a, b]) => [f(a), f(b)])), "#6a7088", "#1d2131", 0.7);
      }
      const silver = k.lin([[0, "#ffffff"], [0.5, "#d6dae6"], [1, "#8e94a8"]], 0, 0, 1, 1);
      [[-48, 34, -30, 15], [72, 38, 40, 12.5], [196, 35, 170, 14]].forEach(([a, r, rot, s]) => {
        const [x, y] = pol(a, r);
        moon += G(at(x, y, rot), S(crescent(s, 0.58), silver, "#141623", 1.4) + L(arc(s - 2.2, 200, 300, 0, 0), "#fff", 1, ' opacity=".8"'));
      });
      [[10, 46], [130, 22], [250, 46], [320, 30]].forEach(([a, r]) => { const [x, y] = pol(a, r); moon += G(at(x, y), S(spark(3.6, 0.22), "#eef1fa", "#141623", 0.8)); });
      k.body += `<g class="sp c64" style="animation-duration:70s">${moon}</g>`;
      k.back += k.glow("#b9c6e0", 0.6, 0.82, 4);
      [[-10, 60], [60, 61], [140, 60], [220, 61], [300, 60]].forEach(([a, r], i) => { const [x, y] = pol(a, r); k.front += twinkle(x, y, 3, "#e6ecff", i * 0.55, 2.8); });
    },

    /* -------------------------------------------------------------------- Tidal */
    tidal(k) {
      k.ink = "#001a4d"; k.wall = "#00245f";
      k.base = k.radU([[0.24, "#002a6e"], [0.6, "#0a55b5"], [1, "#003a8a"]]);
      let sea = "";
      for (let i = 0; i < 9; i++) {
        const a = i * 40;
        sea += P(tube(pp([[a, 12], [a + 25, 22], [a + 45, 34], [a + 62, 46], [a + 80, 58]]), (t) => 1 + 8 * Math.sin(Math.PI * t)), ["#017adf", "#0a62c8", "#1e8ff0"][i % 3]);
        sea += L(smooth(pp([[a + 8, 16], [a + 30, 27], [a + 50, 39], [a + 66, 50]]), false), "#78d4fd", 1.3, ' opacity=".8"');
      }
      // breaking wave crests with foam claws
      const crestPts = [[-16, 7], [-8, 3.4], [-1, -1.6], [4.6, -6.4], [9.4, -6], [10.6, -1.8], [7.6, 1], [5, -0.6]];
      const crest = G("", P(tube([[-18, 10], [-8, 6.4], [0, 3], [6, -1]], [9, 5]), "#2a95ef") + S(tube(crestPts, (t) => 8 * (1 - t) + 1.2), "#f6fbff", "#002a6b", 1.2)
        + L(smooth([[-13, 6.4], [-6, 3.4], [0, 0]], false), "#9fdcff", 1.6) + [[1.6, -7.2, -50], [5.4, -9.4, -10], [9.6, -8.6, 30], [12.2, -4.4, 70]].map(([x, y, r]) => S(drop(2.8, 4.6), "#f6fbff", "#002a6b", 0.9, ` transform="translate(${x} ${y}) rotate(${r})"`)).join(""));
      for (let i = 0; i < 4; i++) { const a = i * 90 + 20, [x, y] = pol(a, 36); sea += G(at(x, y, a + 92, 1.75), crest); }
      for (let i = 0; i < 12; i++) { const [x, y] = spot(k); sea += `<circle cx="${x}" cy="${y}" r="${f(k.r(1, 2.2))}" fill="#d6f1fd" stroke="#004295" stroke-width=".6"/>`; }
      k.body += `<g class="sp c64" style="animation-duration:36s">${sea}</g>`;
      for (let i = 0; i < 5; i++) { const [x, y] = spot(k, 24, 50); k.front += G(at(x, y), anim("ri", i * 0.75, 3.6, `<circle r="${f(1.4 + (i % 3) * 0.5)}" fill="none" stroke="#e6f7ff" stroke-width=".8"/><circle cx="-.5" cy="-.5" r=".5" fill="#fff"/>`)); }
      k.front += twinkle(...pol(-40, 58), 3, "#e6f7ff", 0.3, 3) + twinkle(...pol(140, 58), 2.8, "#e6f7ff", 1.7, 3);
    },

    /* ----------------------------------------------------------------- Volcanic */
    volcanic(k) {
      k.ink = "#120f14"; k.wall = "#2a0d08";
      k.base = k.radU([[0.24, "#ff7a00"], [0.6, "#ffb21a"], [1, "#ff6a00"]]);
      k.body += `<path class="pu" d="${circ(C, C, R + 3)}${circ(C, C, H - 2)}" fill-rule="evenodd" fill="#fff3a0" style="animation-duration:2.2s"/>`;
      k.cells([[H - 3, 27, 6, 0], [27, 41, 8, 20], [41, R + 4, 11, 5]], 1.9, 3.2).forEach((c) => {
        const d = smooth(c.pts, true, 0.45);
        k.body += L(d, "#ff4a00", 3.2, ' opacity=".55"') + S(d, k.pick(["#2b2b36", "#1a1d2a", "#3d3c47", "#33323d"]), "#120f14", 1.1)
          + P(smooth(c.inner(2.8, -1.1, -1.3), true, 0.45), "#686674", ' opacity=".55"') + P(smooth(c.inner(5.6, -1.4, -1.6), true, 0.45), "#8a8794", ' opacity=".35"');
      });
      for (let i = 0; i < 6; i++) { const [x, y, a] = spot(k); k.over += gem(x, y, 2.4, 3.6, ["#ffe58a", "#fa8903", "#c41e10"], "#2a0d08", a, 0.8); }
      k.back += k.glow("#ff6a00", 0.65, 0.8, 2.2);
      for (let i = 0; i < 6; i++) { const [x, y] = spot(k, 18, 52); k.front += G(at(x, y), anim("ri", i * 0.55, 2.8, `<circle r="1.3" fill="#ffd24a"/><circle r="2.8" fill="#ff7a00" opacity=".35"/>`)); }
    },

    /* ------------------------------------------------------------------ Phoenix */
    phoenix(k) {
      k.ink = "#4a0b0b"; k.wall = "#d9a66a";
      k.base = k.radU([[0.24, "#f2c890"], [0.45, "#fff4e2"], [1, "#fbe3c0"]]);
      const feather = (s, c1, c2) => G(`transform="scale(${f(s * 1.32)} ${s})"`, S("M0 0C-5.4 -4 -6.4 -12.5 0.6 -21C-0.2 -14.5 5.2 -10.8 5.6 -5.6C5.8 -2.2 3.2 0.2 0 0Z", c1, "#4a0b0b", 1.1 / s)
        + P("M0.4 -2.4C-2.4 -5.6 -2.6 -11 0.2 -16C0.6 -11.4 2.8 -8.4 2.8 -5.2C2.8 -3.4 1.8 -2.2 0.4 -2.4Z", c2, ' opacity=".9"'));
      for (let i = 0; i < 14; i++) { const a = i * 25.7, [x, y] = pol(a, 29); k.body += G(at(x, y, a + 40), feather(1.12, i % 2 ? "#f29a2a" : "#fdc642", "#fff0b8")); }
      for (let i = 0; i < 16; i++) {
        const a = i * 22.5 + 9, [x, y] = pol(a, 40);
        k.top += G(at(x, y, a + 40), anim("fk", (i % 5) * 0.17, 0.9, feather(1.1, i % 2 ? "#d64c1c" : "#bb2020", "#fd7931")));
      }
      k.top += set(k, ...pol(180, 44), 5.4, 8, RED, "#4a0b0b") + set(k, ...pol(0, 46), 3.4, 5, ["#fff1b8", "#fdc642", "#d97a10"], "#4a0b0b");
      k.back += k.glow("#ff7a1a", 0.6, 0.8, 2.4);
      for (let i = 0; i < 6; i++) { const [x, y] = spot(k, 30, 56); k.front += G(at(x, y), anim("ri", i * 0.5, 2.6, S(drop(2.2, 3.6), "#ffcf4a", "#ff6a00", 0.5))); }
    },

    /* -------------------------------------------------------------------- Royal */
    royal(k) {
      k.ink = "#3a2208"; k.wall = "#cfc3b0";
      k.base = k.radU([[0.24, "#e6dccb"], [0.45, "#fffaf2"], [1, "#efe5d4"]]);
      for (let i = 0; i < 6; i++) { const a = i * 60 + k.r(0, 30); k.body += L(smooth(pp([[a, 16], [a + 10, 26], [a + 4, 36], [a + 16, 46], [a + 10, 57]]), false), "#cbbca8", 0.9, ' opacity=".8"'); }
      const g = gold(k);
      k.body += `<circle cx="64" cy="64" r="40" fill="none" stroke="#3a2208" stroke-width="5.2"/><circle cx="64" cy="64" r="40" fill="none" stroke="${g}" stroke-width="3.4"/><circle cx="64" cy="64" r="21" fill="none" stroke="#3a2208" stroke-width="4"/><circle cx="64" cy="64" r="21" fill="none" stroke="${g}" stroke-width="2.4"/>`;
      for (let i = 0; i < 8; i++) {
        const a = i * 45 + 22.5, [x, y] = pol(a, 30.5);
        k.body += G(at(x, y, a), L("M-6 3C-6 -2 -2 -4 0 -1C2 -4 6 -2 6 3M-3 2.4C-3 0 -1 -0.4 0 1", "#3a2208", 3) + L("M-6 3C-6 -2 -2 -4 0 -1C2 -4 6 -2 6 3M-3 2.4C-3 0 -1 -0.4 0 1", "#fcc14a", 1.6));
      }
      for (let i = 0; i < 16; i++) { const [x, y] = pol(i * 22.5, 48.5); k.body += `<circle cx="${x}" cy="${y}" r="1.6" fill="#fcc14a" stroke="#3a2208" stroke-width=".7"/>`; }
      [90, 270].forEach((a) => { k.top += set(k, ...pol(a, 40), 3.6, 5.2, BLUE, "#1a1440"); });
      k.top += set(k, ...pol(180, 44), 6, 9, BLUE, "#1a1440");
      const crown = S("M-16 7L-16 -3L-10 2.4L-5.6 -8.6L0 -1.4L5.6 -8.6L10 2.4L16 -3L16 7Z", g, "#3a2208", 1.4)
        + S("M-16.4 4.4H16.4V9.6H-16.4Z", g, "#3a2208", 1.3) + L("M-14 6.2H14", "#fff3c0", 0.9, ' opacity=".8"')
        + [[-16, -3], [-5.6, -8.6], [5.6, -8.6], [16, -3]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.9" fill="#fffaf0" stroke="#3a2208" stroke-width=".8"/>`).join("")
        + gem(0, 7, 2.6, 2.6, BLUE, "#1a1440", 0, 0.7) + gem(-9, 7, 1.9, 1.9, ["#ffd6e6", "#e8336b", "#8a0f3a"], "#1a1440", 0, 0.6) + gem(9, 7, 1.9, 1.9, ["#ffd6e6", "#e8336b", "#8a0f3a"], "#1a1440", 0, 0.6)
        + gem(0, -3.4, 2.4, 3.4, BLUE, "#1a1440", 0, 0.7);
      k.top += G(at(64, 13, 0, 1.15), anim("fl", 0, 3.2, crown));
      [[0, 22], [180, 50], [90, 47], [270, 47]].forEach(([a, r], i) => { const [x, y] = pol(a, r); k.front += twinkle(x, y, 3.2, "#fff", i * 0.7, 2.8); });
    },

    /* ------------------------------------------------------------------ Pharaoh */
    pharaoh(k) {
      k.ink = "#2e1606"; k.wall = "#b88a58";
      k.base = k.radU([[0.24, "#d9b080"], [0.45, "#fde6bd"], [1, "#efcf9a"]]);
      for (let i = 0; i < 30; i++) { const [x, y] = spot(k, H, R); k.body += `<circle cx="${x}" cy="${y}" r="${f(k.r(0.5, 1.1))}" fill="#c99a62" opacity=".6"/>`; }
      [[28, 152], [208, 332]].forEach(([a0, a1]) => {
        const n = 11, st = (a1 - a0) / n;
        for (let i = 0; i < n; i++) k.body += S(sect(31, R + 3, a0 + i * st, a0 + (i + 1) * st), i % 2 ? k.lin([[0, "#3b8cff"], [1, "#0a3fa0"]]) : gold(k), "#2e1606", 1.1);
        k.body += L(arc(31, a0, a1), "#2e1606", 2.6) + L(arc(32.6, a0 + 2, a1 - 2), "#fff3c0", 0.8, ' opacity=".6"');
      });
      for (let i = 0; i < 8; i++) { const a = [k.r(-24, 22), k.r(158, 202)][i % 2], [x, y] = pol(a, k.r(20, 48)); k.over += gem(x, y, 2.2, 3.2, GOLD, "#5a3208", a, 0.7); }
      const g = gold(k);
      const ankh = "M-1.8 -2C-6.4 -4.4 -6.4 -13.6 0 -13.6C6.4 -13.6 6.4 -4.4 1.8 -2L1.8 -0.4L7.4 -0.4L7.4 3L1.8 3L1.8 15L-1.8 15L-1.8 3L-7.4 3L-7.4 -0.4L-1.8 -0.4ZM0 -4.8C2.8 -5.6 2.8 -11 0 -11C-2.8 -11 -2.8 -5.6 0 -4.8Z";
      k.top += G(at(64, 23, 0, 1.05), anim("pu", 0, 2.6, P(ankh, "#fff0a0", ' opacity=".7" transform="scale(1.18)"')) + S(ankh, g, "#2e1606", 1.2, ' fill-rule="evenodd"') + L("M-3.6 -7.6Q-3 -11 0 -11.6", "#fff6d0", 0.8, ' opacity=".8"'));
      const wing = (dir) => S(`M0 0C${dir * 6} -3 ${dir * 13} -2 ${dir * 17} 2C${dir * 12} 2 ${dir * 8} 4 ${dir * 4} 5Z`, g, "#2e1606", 1.1) + L(`M${dir * 4} 1.6L${dir * 13} 1.4M${dir * 4} 3.2L${dir * 10} 3.4`, "#b8760e", 0.7);
      const [bx, by] = pol(180, 45);
      k.top += G(at(bx, by), wing(1) + wing(-1)) + set(k, bx, by, 5, 7.4, BLUE, "#1a1440");
      k.front += twinkle(bx + 4, by - 6, 3, "#fff", 0.4, 2.6) + twinkle(70, 9, 2.8, "#fff6c8", 1.6, 3);
    },

    /* ---------------------------------------------------------------- Leviathan */
    leviathan(k) {
      k.ink = "#0b0a33"; k.wall = "#001237";
      k.base = k.radU([[0.24, "#001a52"], [0.6, "#0a3d9a"], [1, "#012a70"]]);
      let sea = "";
      for (let i = 0; i < 8; i++) { const a = i * 45; sea += P(tube(pp([[a, 14], [a + 30, 26], [a + 20, 40], [a + 50, 52]]), (t) => 0.8 + 6 * Math.sin(Math.PI * t)), i % 2 ? "#0f52b5" : "#1a6fd6"); sea += L(smooth(pp([[a + 6, 18], [a + 28, 30], [a + 24, 42]]), false), "#a8e4fd", 1.2, ' opacity=".8"'); }
      k.body += `<g class="sp c64" style="animation-duration:50s">${sea}</g>`;
      const purp = k.lin([[0, "#9a82f0"], [0.5, "#6a4fd0"], [1, "#3c2894"]], 0, 0, 1, 1);
      const tent = (pts, w) => {
        const sm = Avatars.K.sample(pts, 6);
        let s = S(tube(pts, (t) => w * (1 - t * 0.85)), purp, "#1b0f45", 1.3);
        for (let i = 2; i < sm.length - 4; i += 3) {
          const t = i / (sm.length - 1), a = sm[Math.max(0, i - 1)], b = sm[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
          const off = w * (1 - t * 0.85) * 0.22, r = w * (1 - t * 0.85) * 0.2;
          const x = sm[i][0] - dy / l * off, y = sm[i][1] + dx / l * off;
          s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#c891fa" stroke="#3c2894" stroke-width=".6"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.45)}" fill="#7a5ad8"/>`;
        }
        return s;
      };
      [0, 90, 180, 270].forEach((a0, i) => {
        const pts = pp([[a0, 58], [a0 + 25, 44], [a0 + 52, 34], [a0 + 70, 24], [a0 + 64, 17], [a0 + 52, 19]]);
        const [bx, by] = pol(a0, 52);
        k.over += `<g class="tsw" style="transform-origin:${bx}px ${by}px;animation-delay:-${f(i * 0.9)}s">${tent(pts, 10)}</g>`;
      });
      k.css += ".tsw{animation:tsw 3.6s ease-in-out infinite alternate}@keyframes tsw{from{transform:rotate(-5deg)}to{transform:rotate(5deg)}}";
      const ic = ["#f0fbff", "#9fe2fd", "#3d93d6"];
      k.top += G(at(...pol(48, 44), 50, 0.85), shard(14, 6.4, ic, "#0b0a33")) + G(at(...pol(232, 46), 228, 0.8), shard(13, 6, ic, "#0b0a33"));
      for (let i = 0; i < 5; i++) { const [x, y] = spot(k, 20, 52); k.front += G(at(x, y), anim("ri", i * 0.8, 3.6, `<circle r="${f(1.2 + (i % 2) * 0.6)}" fill="none" stroke="#bfe9ff" stroke-width=".8"/>`)); }
      k.front += twinkle(...pol(48, 58), 3, "#e6f7ff", 0.5, 3);
    },

    /* ---------------------------------------------------------------- Excalibur */
    excalibur(k) {
      k.ink = "#141a2e"; k.wall = "#6b6662";
      k.base = k.radU([[0.24, "#9d9894"], [0.5, "#d9d7d4"], [1, "#b3aeaa"]]);
      k.cells([[H - 3, 30, 6, 12], [30, R + 4, 9, 0]], 1.1, 2).forEach((c) => {
        k.body += S(poly(c.pts), k.pick(["#d1d0cf", "#c2c1c1", "#cbc7c4", "#bab5b1", "#dcdad7"]), "#7c7874", 0.9) + P(poly(c.inner(2.4, -0.8, -0.9)), "#fff", ' opacity=".3"');
      });
      for (let i = 0; i < 4; i++) { const [x, y] = spot(k); k.body += P(`M${x} ${y}q2 -1.4 3.4 -0.2q1.6 1.2 3 -0.4`, "none", ` stroke="#6c7d2f" stroke-width="1.6" opacity=".55" stroke-linecap="round"`); }
      const runes = ["M-3 -5L-3 5M-3 -5L2 -2L-3 1", "M-3 5L0 -5L3 5M-1.8 1H1.8", "M-3 -5L3 5M3 -5L-3 5", "M0 -5L0 5M0 -5L3 -2M0 -1L-3 -4"];
      [[70, 33], [125, 34], [235, 34], [290, 33]].forEach(([a, r], i) => {
        const [x, y] = pol(a, r);
        k.over += G(at(x, y, 0, 1.15), anim("pu", i * 0.6, 2.6, L(runes[i], "#9ed2ff", 3.6, ' opacity=".55"')) + L(runes[i], "#2993fd", 1.5));
      });
      const g = gold(k);
      [45, 135, 225, 315].forEach((a) => {
        k.top += S(sect(R - 10, R + 2, a - 12, a + 12), g, "#141a2e", 1.3) + L(arc(R - 7.5, a - 9, a + 9), "#fff3c0", 0.9, ' opacity=".7"');
        k.top += gem(...pol(a, R - 4), 3, 4.2, BLUE, "#141a2e", a, 0.9);
      });
      k.top += set(k, ...pol(180, 45), 5.4, 8.4, BLUE, "#141a2e");
      // the sword in the stone
      const blade = "M-4 17L4 17L3.4 37L0 41L-3.4 37Z";
      k.top += G(at(64, -2, 0, 1.15), S("M-6.4 38Q-3 33.6 0 35.4Q3 33.6 6.4 38Q3 41 0 40Q-3 41 -6.4 38Z", "#8a8580", "#141a2e", 1) + S(blade, k.lin([[0, "#ffffff"], [0.5, "#d9dee8"], [1, "#9aa3b5"]], 0, 0, 1, 0), "#141a2e", 1.3) + L("M0 18.5L0 36", "#8a93a8", 1)
          + `<g ${k.clip(blade)}><rect class="gl" x="-14" y="10" width="6" height="40" fill="#fff" opacity=".9" style="animation-duration:3.6s" transform="skewX(-25)"/></g>`
          + S("M-13.5 13.6Q-15.6 15.6 -13.5 17.6L13.5 17.6Q15.6 15.6 13.5 13.6Z", g, "#141a2e", 1.3) + `<circle cx="-14.4" cy="15.6" r="2" fill="${g}" stroke="#141a2e" stroke-width="1"/><circle cx="14.4" cy="15.6" r="2" fill="${g}" stroke="#141a2e" stroke-width="1"/>`
          + gem(0, 15.6, 2, 2.4, BLUE, "#141a2e", 0, 0.7)
          + S("M-2.2 4.6H2.2V13.6H-2.2Z", "#172242", "#141a2e", 1) + L("M-2.2 6.4L2.2 7.8M-2.2 9L2.2 10.4M-2.2 11.6L2.2 13", "#3b4a7a", 0.8)
          + `<circle cx="0" cy="3.4" r="3.2" fill="${g}" stroke="#141a2e" stroke-width="1.2"/>` + gem(0, 3.4, 1.5, 1.8, BLUE, "#141a2e", 0, 0.5));
      k.front += twinkle(70, 20, 3.2, "#fff", 0.2, 2.6) + twinkle(...pol(180, 54), 2.8, "#cfe8ff", 1.4, 3);
    },

    /* ----------------------------------------------------------- Sakura Emperor */
    sakura_emperor(k) {
      k.ink = "#160704"; k.wall = "#0e0403";
      k.base = k.radU([[0.24, "#1a0806"], [0.55, "#3a160e"], [1, "#1e0a06"]]);
      const g = gold(k);
      const cloud = "M-8 2C-10 2 -10 -2 -7.4 -2C-7.6 -5.4 -2.4 -6.4 -1.4 -3C0 -6.8 6.4 -5.8 5.8 -1.6C8.6 -2 9.8 2 7.4 2Z";
      [[50, 36, 0], [128, 30, 20], [232, 32, -10], [305, 40, 15]].forEach(([a, r, rot]) => {
        const [x, y] = pol(a, r);
        k.body += G(at(x, y, rot, 1.25), L(cloud, g, 1.6) + L("M-4 -0.6a1.8 1.8 0 1 1 2.4 1.6M3 -1.6a1.4 1.4 0 1 1 1.8 1.2", g, 1.1));
      });
      [0, 180].forEach((a) => { k.body += S(strap(a, H - 3, R + 3, 11), g, "#160704", 1.2) + S(strap(a, H - 3, R + 3, 5), "#b0233f", "#5a0a14", 0.8); });
      const pk = ["#ffc4d4", "#fd8fae", "#e05b78", "#ffe27a"];
      [[42, 46, 8.6], [86, 34, 7.4], [118, 47, 8.2], [236, 46, 8.6], [270, 30, 7], [312, 47, 8], [150, 25, 5.6], [210, 24, 5.6]].forEach(([a, r, s], i) => {
        const [x, y] = pol(a, r);
        k.top += G(at(x, y), anim("sw", i * 0.6, 2.8, sakura(0, 0, s, i * 20, pk, "#7a1830", 0.9)));
      });
      for (let i = 0; i < 8; i++) { const [x, y] = spot(k); k.over += G(at(x, y, k.r(0, 360)), S(petal(3.8, 3), "#fd9ab4", "#7a1830", 0.6)); }
      const [ex, ey] = pol(0, 44);
      k.top += G(at(ex, ey), S("M-12 4C-12 -2 -7 -4 -4 -2C-4 -7 4 -7 4 -2C7 -4 12 -2 12 4C6 3 -6 3 -12 4Z", g, "#160704", 1.2)
        + `<circle r="7.6" fill="${g}" stroke="#160704" stroke-width="1.3"/><circle r="5.8" fill="#2b1008" stroke="#7a4a0a" stroke-width=".8"/>` + sakura(0, 0, 4.6, 0, pk, "#7a1830", 0.6));
      k.top += set(k, ...pol(180, 45), 4.6, 7, ["#ffc2cc", "#e0284a", "#7a0a1e"], "#160704");
      [[18, 6, 0], [46, 14, 1.4], [88, 4, 2.8], [106, 20, 4.1]].forEach(([x, y, d]) => { k.front += G(at(x, y), anim("fa", d, 5.5, S(petal(4.4, 3.6), "#ffc2d1", "#a33a55", 0.6))); });
      k.front += twinkle(ex + 9, ey - 8, 3, "#fff6c8", 0.6, 3);
    },
  });
})();
