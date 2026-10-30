/* =============================================================================
   avatars-art-mythic.js  —  the 5 Mythic and 3 Secret bagels (see avatars.js)
   ========================================================================== */
(() => {
  "use strict";
  const { C, R, H, f, pol, circ, poly, pp, arc, sect, strap, smooth, tube, star, spark, rhomb, drop, crescent, gearD,
    at, P, S, L, G, anim, gem, shard, puffs, twinkle } = Avatars.K;
  const spot = (k, r0 = H + 5, r1 = R - 5) => { const a = k.r(0, 360), r = k.r(r0, r1); return [...pol(a, r), a, r]; };
  const gold = (k) => k.lin([[0, "#fff1b0"], [0.5, "#fcc14a"], [1, "#b8760e"]], 0, 0, 1, 1);
  // a particle at angle a / radius r that gets pulled into the hole
  const sucked = (a, r, inner, delay, dur) => `<g transform="rotate(${f(a)} 64 64)"><g transform="translate(64 ${f(64 - r)})">${anim("sk", delay, dur, inner)}</g></g>`;

  Avatars.art({
    /* -------------------------------------------------------------------- Abyss */
    abyss(k) {
      k.ink = "#0c0618"; k.wall = "#14082c";
      k.base = k.radU([[0.24, "#4a0ea0"], [0.6, "#9716ec"], [1, "#5a10b0"]]);
      k.body += `<path class="pu" d="${circ(C, C, R + 3)}${circ(C, C, H - 2)}" fill-rule="evenodd" fill="#f0c4ff" style="animation-duration:2.4s"/>`;
      k.cells([[H - 3, 29, 6, 8], [29, R + 4, 9, 0]], 1.7, 3.6).forEach((c) => {
        const d = smooth(c.pts, true, 0.3);
        k.body += L(d, "#c25cff", 3.4, ' opacity=".55"') + S(d, k.pick(["#313143", "#2a2a3a", "#3a3a4e", "#24243a"]), "#0c0618", 1.1)
          + P(smooth(c.inner(3, -1.1, -1.3), true, 0.3), "#7c7c92", ' opacity=".4"') + P(smooth(c.inner(6.4, -1.4, -1.6), true, 0.3), "#aaa9b8", ' opacity=".18"');
      });
      [[0, 40], [140, 38], [250, 40]].forEach(([a0], i) => { k.body += P(tube(pp([[a0, 60], [a0 + 20, 46], [a0 + 8, 34], [a0 + 30, 22]]), (t) => 5 * (1 - t) + 0.6), "#090124", ' opacity=".85"'); });
      const pc = ["#f3dcff", "#c062ff", "#5c0fb0"];
      [[38, 36, 30, 1.25], [118, 44, 120, 0.95], [205, 34, 196, 1.15], [300, 42, 300, 1]].forEach(([a, r, rot, s], i) => {
        const [x, y] = pol(a, r);
        k.top += G(at(x, y, rot, s), anim("pu", i * 0.5, 2.4, `<path d="${rhomb(7, 14)}" fill="#d08dfb" opacity=".5" transform="translate(0 -8) scale(1.4)"/>`) + shard(17, 7.4, pc, "#0c0618", 1.3));
      });
      k.over += `<circle class="pu" cx="64" cy="64" r="${H + 1.6}" fill="none" stroke="#e2a8ff" stroke-width="3" style="animation-duration:1.8s"/>`;
      k.back += k.glow("#9716ec", 0.7, 0.78, 2.4);
      k.css += ".sk{animation:sk 3s ease-in infinite}@keyframes sk{0%{opacity:0;transform:translateY(0) scale(1)}20%{opacity:1}100%{opacity:0;transform:translateY(38px) scale(.2)}}";
      for (let i = 0; i < 7; i++) k.front += sucked(i * 51 + 10, 58, `<circle r="1.6" fill="#e2a8ff"/><circle r="3.2" fill="#9716ec" opacity=".4"/>`, i * 0.43, 3);
    },

    /* ------------------------------------------------------------------ Radiant */
    radiant(k) {
      k.ink = "#5a3205"; k.wall = "#c27a0e";
      k.base = k.radU([[0.24, "#e89a12"], [0.55, "#fdc024"], [1, "#e8a012"]]);
      let rays = "";
      for (let i = 0; i < 16; i++) rays += P(sect(H - 3, R + 3, i * 22.5 - 5, i * 22.5 + 5), "#fdf6e1", ' opacity=".9"');
      k.body += `<g class="sp c64" style="animation-duration:30s">${rays}</g>` + L(arc(R - 6, 0, 359.9), "#fff4c0", 1.4, ' opacity=".7"') + L(arc(H + 6, 0, 359.9), "#fff4c0", 1.2, ' opacity=".6"');
      const halo = k.lin([[0, "#fff6c8"], [0.5, "#fdc024"], [1, "#df8d11"]], 0, 0, 1, 0);
      const ell = (half) => `M2 64A62 17 0 0 ${half} 126 64`;
      k.back += k.glow("#ffd84a", 0.75, 0.66, 2.4) + `<g transform="rotate(-14 64 64)">${L(ell(1), "#5a3205", 6.4) + L(ell(1), halo, 3.6)}</g>`;
      k.css += ".hd{animation:hd 3s linear infinite}@keyframes hd{to{stroke-dashoffset:-60}}";
      k.top += `<g transform="rotate(-14 64 64)">${L(ell(0), "#5a3205", 6.4) + L(ell(0), halo, 3.6)}<path class="hd" d="${ell(0)}" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="6 54" stroke-linecap="round"/></g>`;
      const st = k.lin([[0, "#ffffff"], [0.6, "#fff4c0"], [1, "#fdc024"]], 0, 0, 1, 1);
      [[0, 33, 13], [90, 33, 11], [180, 33, 13], [270, 33, 11], [45, 44, 6], [135, 44, 6], [225, 44, 6], [315, 44, 6]].forEach(([a, r, s], i) => {
        const [x, y] = pol(a, r);
        k.top += G(at(x, y), anim("br", i * 0.35, 2.4, S(spark(s, 0.2), st, "#5a3205", 1.2) + P(spark(s * 0.42, 0.26), "#fff")));
      });
      for (let i = 0; i < 6; i++) { const [x, y] = spot(k, 20, 56); k.front += G(at(x, y), anim("ri", i * 0.55, 3, P(spark(2, 0.3), "#fffbe0"))); }
    },

    /* ------------------------------------------------------------------ Inferno */
    inferno(k) {
      k.ink = "#140606"; k.wall = "#0e0a0c";
      k.base = k.radU([[0.24, "#141116"], [0.6, "#2e2b30"], [1, "#18151a"]]);
      for (let i = 0; i < 12; i++) { const [x, y] = spot(k); k.body += P(poly([[x - 4, y], [x - 1, y - 4], [x + 4, y - 2], [x + 3, y + 3], [x - 2, y + 4]].map(([a, b]) => [f(a), f(b)])), "#49494b", ' opacity=".7"'); }
      // tongues of fire licking out past the rim
      let crown = "";
      const fire = k.lin([[0, "#df1622"], [0.55, "#fd701d"], [1, "#fde199"]], 0, 1, 0, 0);
      for (let i = 0; i < 16; i++) {
        const a = i * 22.5, [x, y] = pol(a, 46), h = i % 2 ? 20 : 15.5;
        crown += G(at(x, y, a + (i % 2 ? 8 : -6)), anim("fk", (i % 4) * 0.2, 0.7 + (i % 3) * 0.15, S(drop(12.5, h, 3), fire, "#140606", 1.2) + P(drop(6.4, h * 0.62, 2), "#fdb835", ' opacity=".95"') + P(drop(3, h * 0.36, 1), "#fff3c0")));
      }
      k.back += k.glow("#fd5717", 0.7, 0.74, 1.8) + crown;
      [[0, "#df1622", 12], [0, "#fd701d", 7.5], [0, "#fdb835", 3.4]].forEach(([, col, w], layer) => {
        for (let i = 0; i < 7; i++) {
          const a = i * 51.4 + 8, pts = pp([[a, 15], [a + 16, 26], [a + 8, 38], [a + 24, 50], [a + 34, 60]]);
          k.body += layer === 0 ? S(tube(pts, (t) => w * Math.sin(Math.PI * (0.15 + t * 0.85)) + 1), col, "#140606", 1.1) : P(tube(pts, (t) => w * Math.sin(Math.PI * (0.15 + t * 0.85)) + 0.5), col);
        }
      });
      for (let i = 0; i < 6; i++) { const [x, y, a] = spot(k, 20, 50); k.over += gem(x, y, 2.6, 4, ["#ffb0a0", "#df1622", "#6a0608"], "#140606", a, 0.8); }
      const [gx, gy] = pol(0, 46);
      k.top += G(at(gx, gy), S(rhomb(9, 12), "#2e2b30", "#140606", 1.4) + gem(0, 0, 5.6, 8.4, ["#ffd0a0", "#fd5717", "#8a0a0a"], "#140606", 0, 1.1));
      for (let i = 0; i < 8; i++) { const [x, y] = spot(k, 30, 58); k.front += G(at(x, y), anim("ri", i * 0.4, 2.4, `<circle r="1.3" fill="#ffd24a"/><circle r="2.8" fill="#fd5717" opacity=".4"/>`)); }
    },

    /* --------------------------------------------------------------- Dreamscape */
    dreamscape(k) {
      k.ink = "#4a2f8a"; k.wall = "#8f72d6";
      k.base = k.radU([[0.24, "#a98ae8"], [0.6, "#d4c2fa"], [1, "#9f86ea"]]);
      let sky = "";
      for (let i = 0; i < 12; i++) {
        const a = i * 30 + k.r(-6, 6), r = i % 2 ? k.r(42, 48) : k.r(24, 30), [x, y] = pol(a, r), s = k.r(0.95, 1.2);
        const cs = [[x, y, 7.6 * s], [x - 7 * s, y + 2.4 * s, 5.8 * s], [x + 7 * s, y + 2 * s, 6.2 * s], [x + 2 * s, y - 5 * s, 5.6 * s], [x - 4 * s, y - 4 * s, 4.8 * s]];
        sky += puffs(cs, ["#ffd0e8", "#fff6fb", "#e6d8fb", "#c9e9ff", "#ffc0de"][i % 5], "#8a6cc9", 1, "#ffffff");
      }
      k.body += `<g class="sp c64" style="animation-duration:90s">${sky}</g>`;
      const g = k.lin([[0, "#fff4c0"], [0.5, "#fdd769"], [1, "#e8a92a"]], 0, 0, 1, 1);
      [[40, 36, 6], [110, 46, 5], [160, 28, 4.4], [220, 46, 5.6], [290, 34, 4.6], [-10, 48, 4]].forEach(([a, r, s], i) => {
        const [x, y] = pol(a, r);
        k.top += G(at(x, y), anim("br", i * 0.45, 2.6, S(star(s, s * 0.46, 5), g, "#8a5a10", 1.1) + P(star(s * 0.4, s * 0.2, 5), "#fff", ' opacity=".8"')));
      });
      const [mx, my] = pol(-42, 38);
      k.top += G(at(mx, my, -20), anim("sw", 0, 3.4, S(crescent(12, 0.6), g, "#8a5a10", 1.4) + L(arc(9.6, 200, 300, 0, 0), "#fff", 1.2, ' opacity=".85"')));
      k.back += k.glow("#ffb8e6", 0.6, 0.8, 3.4);
      for (let i = 0; i < 6; i++) { const [x, y] = spot(k, 18, 60); k.front += twinkle(x, y, 2.4, "#fff", i * 0.5, 2.6); }
    },

    /* ----------------------------------------------------------------- Monolith */
    monolith(k) {
      k.ink = "#0c0b12"; k.wall = "#1a0b38";
      k.base = k.radU([[0.24, "#38176e"], [0.55, "#8a2cf5"], [1, "#4a1a90"]]);
      let swirl = "";
      for (let i = 0; i < 6; i++) swirl += L(arc(18 + i * 6.4, i * 50, i * 50 + 120), "#e2b8ff", 1.4, ' opacity=".7"');
      k.body += `<g class="sp c64" style="animation-duration:14s">${swirl}</g><path class="pu" d="${circ(C, C, R + 3)}${circ(C, C, H - 2)}" fill-rule="evenodd" fill="#d6a8ff" style="animation-duration:2s"/>`;
      k.css += ".mf{animation:mf 3.2s ease-in-out infinite}@keyframes mf{0%,100%{transform:translate(0,0)}50%{transform:translate(0,-2.6px)}}";
      const runes = ["M-2 -4L2 0L-2 4", "M0 -4V4M-3 -1H3", "M-3 -3L3 3M-3 3L0 0", "M-2.4 -4H2.4L-2.4 4H2.4", "M0 -4L3 0L0 4L-3 0Z", "M-2.6 4V-4L2.6 0", "M-3 0H3M0 -4V0L-2.6 4", "M-2 -4V4M2 -4V4M-2 0H2"];
      for (let i = 0; i < 8; i++) {
        const a = i * 45, [x, y] = pol(a, 38);
        const slab = G("", S("M-10 13L-11.4 -3L-7 -15L7 -15L11.4 -3L10 13Z", "#26252f", k.ink, 1.4)
          + P("M-7.6 10L-8.6 -2.6L-5.2 -12L5.2 -12L8.6 -2.6L7.6 10Z", "#4b4a58") + P("M-8.6 -2.6L-5.2 -12L0 -12L-2.4 -1.8Z", "#6a6875")
          + L("M-5.2 -12L5.2 -12", "#a4a2a9", 1, ' opacity=".7"')
          + anim("pu", i * 0.3, 2.2, L(runes[i], "#e7c4ff", 3.2, ' opacity=".6" transform="translate(0 1)"')) + L(runes[i], "#b869fa", 1.4, ' transform="translate(0 1)"'));
        k.top += G(at(x, y, a, 1.18), anim("mf", (i % 2) * 1.6, 3.2, slab));
      }
      k.back += k.glow("#8a2cf5", 0.7, 0.72, 2.2);
      for (let i = 0; i < 5; i++) { const [x, y] = spot(k, 20, 52); k.front += G(at(x, y), anim("ri", i * 0.6, 3, `<circle r="1.2" fill="#f0d2fc"/><circle r="2.6" fill="#a33efc" opacity=".35"/>`)); }
    },

    /* =================================================================== SECRET */
    /* ------------------------------------------------------------------- Chrono */
    chrono(k) {
      k.ink = "#120a04"; k.wall = "#021416";
      k.base = k.radU([[0.24, "#021a1c"], [0.6, "#0b4a4a"], [1, "#063335"]]);
      const g = gold(k);
      for (let i = 0; i < 60; i++) { const big = i % 5 === 0; k.body += L(`M${pol(i * 6, big ? 40 : 42.4)}L${pol(i * 6, 45)}`, "#fcc14a", big ? 1.8 : 0.8, big ? "" : ' opacity=".8"'); }
      k.body += `<circle cx="64" cy="64" r="${R - 3.6}" fill="none" stroke="${k.ink}" stroke-width="8.4"/><circle cx="64" cy="64" r="${R - 3.6}" fill="none" stroke="${g}" stroke-width="6"/>`
        + L(arc(R - 5, -70, -10), "#fff4c0", 1.4, ' opacity=".8"');
      for (let i = 0; i < 24; i++) { const [x, y] = pol(i * 15, R - 3.6); k.body += `<circle cx="${x}" cy="${y}" r=".9" fill="#7a4a0a"/>`; }
      k.body += `<circle cx="64" cy="64" r="${H + 2.6}" fill="none" stroke="${k.ink}" stroke-width="5.6"/><circle cx="64" cy="64" r="${H + 2.6}" fill="none" stroke="${g}" stroke-width="3.6"/>`;
      [["XII", 0], ["III", 90], ["VI", 180], ["IX", 270]].forEach(([t, a]) => {
        const [x, y] = pol(a, 31);
        k.over += `<text x="${x}" y="${f(y + 4.2)}" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="12" fill="${g}" stroke="${k.ink}" stroke-width="1.6" paint-order="stroke" letter-spacing="-.4">${t}</text>`;
      });
      const hand = (len, w) => S(`M-${w} -15L0 ${-len + 6}L${w} -15Z`, g, k.ink, 1.1) + S(rhomb(w + 1.4, 4.6), g, k.ink, 1.1, ` transform="translate(0 ${-len + 6})"`);
      k.css += ".mh{animation:sp 12s steps(60) infinite;transform-origin:64px 64px}.hh{animation:sp 144s linear infinite;transform-origin:64px 64px}"
        + ".cw{animation:cw 4s ease-out infinite;transform-origin:64px 64px}@keyframes cw{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(4.2)}}";
      k.top += `<g class="hh" style="animation-delay:-50s"><g transform="translate(64 64)">${hand(31, 2.6)}</g></g><g class="mh" style="animation-delay:-2s"><g transform="translate(64 64)">${hand(46, 2)}</g></g>`;
      const gear = (r, n) => S(gearD(r, n, 0.22, 0), g, k.ink, 1.3) + `<circle r="${f(r * 0.62)}" fill="none" stroke="#b8760e" stroke-width="1.4"/>` + `<circle r="${f(r * 0.36)}" fill="#063335" stroke="${k.ink}" stroke-width="1"/>`
        + gem(0, 0, r * 0.26, r * 0.26, ["#c8fffb", "#23d8d2", "#04706c"], k.ink, 45, 0.8);
      k.top += G(at(...pol(-48, 50)), anim("sp", 0, 10, gear(12.5, 10))) + G(at(...pol(132, 50)), anim("spr", 0, 7.5, gear(10, 8)));
      k.front += `<circle class="cw" cx="64" cy="64" r="15" fill="none" stroke="#23d8d2" stroke-width="1.4"/>` + twinkle(...pol(40, 58), 3, "#c8fffb", 0.5, 2.6) + twinkle(...pol(220, 60), 2.8, "#fff6c8", 1.8, 2.8);
      k.back += k.glow("#23d8d2", 0.55, 0.8, 3);
    },

    /* --------------------------------------------------------------- Monochrome */
    monochrome(k) {
      k.ink = "#0a0a0a"; k.wall = "#000";
      k.base = k.radU([[0.24, "#0e0f0e"], [0.6, "#3a3a3a"], [1, "#1a1b1a"]]);
      for (let i = 0; i < 8; i++) {
        const a = i * 45 + k.r(-8, 8), pts = [];
        for (let j = 0; j <= 5; j++) pts.push(pol(a + (j % 2 ? 6 : -4) * (j ? 1 : 0), 15 + j * 8.6));
        k.body += S(tube(pts, (t) => 4.6 * (1 - t) + 0.6, 2), "#ede9e2", "#8f8f92", 0.6);
        const [bx, by] = pts[3]; k.body += S(tube([[bx, by], pol(a + 16, 46), pol(a + 22, 52)], [2.2, 0.4], 2), "#c9c9cb", "#6f7073", 0.4);
      }
      k.css += ".gx{animation:gx 6s steps(1) infinite;mix-blend-mode:difference;opacity:0}@keyframes gx{0%,91%,95%,100%{opacity:0}92%,94%{opacity:1}}"
        + ".bl{animation:bl 5s ease-in-out infinite}@keyframes bl{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.06)}}"
        + ".lk{animation:lk 7s ease-in-out infinite}@keyframes lk{0%,18%,100%{transform:translate(0,0)}28%,44%{transform:translate(-4.4px,.6px)}54%,70%{transform:translate(4.4px,-.6px)}80%{transform:translate(0,1.4px)}}";
      k.over += `<path class="gx" d="${circ(C, C, R + 3)}${circ(C, C, H)}" fill-rule="evenodd" fill="#fff"/>`;
      const eye = `<circle r="19" fill="#ede9e2" stroke="${k.ink}" stroke-width="2"/><circle r="16.6" fill="none" stroke="#8f8f92" stroke-width="1"/>`
        + S(rhomb(2.4, 4), "#141514", k.ink, 0.6, ' transform="translate(0 -15.6)"') + S(rhomb(2.4, 4), "#141514", k.ink, 0.6, ' transform="translate(0 15.6)"')
        + `<g class="bl"><path d="M-16 0Q0 -13.6 16 0Q0 13.6 -16 0Z" fill="#fff" stroke="${k.ink}" stroke-width="1.8"/>`
        + `<g class="lk"><circle r="7" fill="${k.radU([[0, "#c9c9cb"], [0.6, "#6f7073"], [1, "#2a2a2a"]], 0, 0, 7)}" stroke="${k.ink}" stroke-width="1.2"/><circle r="3.4" fill="#000"/><circle cx="-2.2" cy="-2.4" r="1.5" fill="#fff"/></g>`
        + `<path d="M-16 0Q0 -13.6 16 0" fill="none" stroke="${k.ink}" stroke-width="2"/></g>`;
      k.top += G(at(64, 64), eye);
      [[20, 60, 5, 0], [70, 61, 4, 1], [130, 59, 5.4, 0], [196, 61, 4.2, 1], [250, 60, 5, 0], [312, 61, 3.8, 1]].forEach(([a, r, s, w], i) => {
        const [x, y] = pol(a, r);
        k.front += G(at(x, y, a + 20), anim("fl", i * 0.5, 2.6 + (i % 3) * 0.4, S(rhomb(s * 0.6, s * 1.2), w ? "#ede9e2" : "#2a2a2a", w ? "#3d3d3d" : "#ede9e2", 1) + P(`M0 ${f(-s * 1.2)}L${f(s * 0.6)} 0L0 0Z`, w ? "#fff" : "#6f7073", ' opacity=".8"')));
      });
      k.back += k.glow("#ffffff", 0.45, 0.82, 3);
    },

    /* ---------------------------------------------------------------- Gargantua */
    gargantua(k) {
      k.ink = "#1a0a02"; k.H = 21; k.wall = null; k.holeFill = "#000"; k.gloss = false;
      k.base = k.radU([[0.38, "#fff2b0"], [0.5, "#fdbd2c"], [0.76, "#ec9103"], [1, "#9a4e06"]]);
      let disk = "";
      for (let i = 0; i < 16; i++) { const r = k.r(24, 53), a0 = k.r(0, 360); disk += L(arc(r, a0, a0 + k.r(40, 120)), k.pick(["#fedc79", "#d95f0b", "#602706", "#fff6d0", "#c47c4b"]), k.r(1, 2.6), ` opacity="${f(k.r(0.45, 0.85))}"`); }
      k.body += `<g class="sp c64" style="animation-duration:9s">${disk}</g>`;
      k.body += `<circle class="pu" cx="64" cy="64" r="${k.H + 2.4}" fill="none" stroke="#fff6d0" stroke-width="4" style="animation-duration:1.6s"/>`;
      // the disk seen edge-on, crossing in front of the hole, and the hole's shadow above it
      const band = "M2 66Q64 52 126 66Q64 80 2 66Z";
      k.top += S(band, k.lin([[0, "#9a4e06"], [0.35, "#fdbd2c"], [0.5, "#fff6d0"], [0.65, "#fdbd2c"], [1, "#9a4e06"]], 0, 0, 0, 1), k.ink, 1.3)
        + L("M12 66Q64 58 116 66", "#602706", 1, ' opacity=".7"') + L("M18 66.6Q64 72 110 66.6", "#fff6d0", 1, ' opacity=".8"')
        + `<path d="M${64 - k.H} 62.6A${k.H} ${k.H} 0 0 1 ${64 + k.H} 62.6Z" fill="#000"/>`
        + L(arc(k.H + 0.6, -84, 84), "#fff6d0", 1.6) + L(arc(k.H + 0.6, -84, 84), "#fedc79", 4, ' opacity=".35"');
      let rocks = "";
      [[30, 58, 3.2], [110, 60, 2.6], [200, 58, 3.6], [280, 60, 2.4], [330, 57, 2]].forEach(([a, r, s]) => {
        const [x, y] = pol(a, r);
        rocks += S(poly([[x - s, y], [x - s * 0.3, y - s], [x + s, y - s * 0.4], [x + s * 0.7, y + s * 0.8], [x - s * 0.5, y + s * 0.9]].map(([a1, b]) => [f(a1), f(b)])), "#744b46", k.ink, 0.9);
      });
      k.front += `<g class="sp c64" style="animation-duration:24s">${rocks}</g>`;
      k.back += k.glow("#fdbd2c", 0.75, 0.74, 2);
    },
  });
})();
