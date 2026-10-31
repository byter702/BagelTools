/* =============================================================================
   avatars.js  —  Bagel avatars (the Shop's collectibles)
   -----------------------------------------------------------------------------
   108 bagels in 7 rarities, opened from packs in the Shop. Each one is drawn as
   a 128×128 SVG (a top-down bagel ring, like the reference sheets in
   media/avatar ref) with its own idle animation, and handed out as an <img>
   with a data: URL, so a bagel can stand in for a profile picture anywhere.

   The drawings live in avatars-art-*.js and register with Avatars.art({ id: fn }).
   A few bagels are hand-made SVG files instead (FILES below, in media/bagels).
   Each fn gets a kit `k` and fills its layers:
     k.back  behind the bagel        k.body  on the dough (clipped to the ring)
     k.over  on the ring, unshaded   k.top   above the outline
     k.front outside the bob (particles that drift on their own)
   and may set k.base (dough fill), k.ink (outline), k.wall (inside of the hole),
   k.outer (a custom outline path), k.css (extra keyframes).
   ========================================================================== */
const Avatars = (() => {
  "use strict";
  const C = 64, R = 55, H = 13;

  /* ---- rarities, odds (percent) and what a duplicate sells back for ---- */
  const RARITIES = [
    { key: "common", label: "Common", odds: 50, color: "#a7b1bd", sell: 2 },
    { key: "uncommon", label: "Uncommon", odds: 25, color: "#4ade80", sell: 5 },
    { key: "rare", label: "Rare", odds: 15, color: "#38bdf8", sell: 12 },
    { key: "epic", label: "Epic", odds: 7, color: "#b06bff", sell: 35 },
    { key: "legendary", label: "Legendary", odds: 2.5, color: "#fbbf24", sell: 120 },
    { key: "mythic", label: "Mythic", odds: 0.4, color: "#ff4d6d", sell: 600 },
    { key: "secret", label: "Secret", odds: 0.1, color: "#e8e6ff", sell: 2500 },
  ];
  const RAR = Object.fromEntries(RARITIES.map((r, i) => [r.key, { ...r, tier: i }]));

  /* ---- packs: each holds every rarity, themed by its top bagels ---- */
  const PACKS = [
    { id: "elemental", name: "Elemental Pack", price: 50, feature: "tidal", c1: "#22c3ee", c2: "#0b4f86", blurb: "Storms, tides, stars and ice" },
    { id: "legends", name: "Legends Pack", price: 50, feature: "excalibur", c1: "#f05252", c2: "#7a1020", blurb: "Warriors, kingdoms and time itself" },
    { id: "enchanted", name: "Enchanted Pack", price: 50, feature: "phoenix", c1: "#f472b6", c2: "#6b2fc9", blurb: "Magic, monsters and sweet dreams" },
  ];

  // [id, name, rarity, pack]   (every name gets " Bagel" when shown)
  const E = "elemental", LG = "legends", N = "enchanted";
  const CATALOG = [
    // ---- Common (30)
    ["plain", "Plain", "common", LG], ["sesame", "Sesame", "common", LG], ["poppy", "Poppy Seed", "common", LG],
    ["whole_wheat", "Whole Wheat", "common", E], ["onion", "Onion", "common", LG], ["salt", "Salt", "common", LG],
    ["oat", "Oat", "common", E], ["rye", "Rye", "common", E], ["multigrain", "Multigrain", "common", E],
    ["white_bread", "White Bread", "common", N], ["brown_sugar", "Brown Sugar", "common", N], ["butter", "Butter", "common", N],
    ["cinnamon", "Cinnamon", "common", N], ["sugar", "Sugar", "common", N], ["wheat_bran", "Wheat Bran", "common", E],
    ["toasted", "Toasted", "common", LG], ["mini", "Mini", "common", N], ["sourdough", "Sourdough", "common", LG],
    ["cornmeal", "Cornmeal", "common", N], ["flaxseed", "Flaxseed", "common", E], ["sunflower", "Sunflower Seed", "common", E],
    ["pumpkin_seed", "Pumpkin Seed", "common", E], ["honey_wheat", "Honey Wheat", "common", N], ["barley", "Barley", "common", E],
    ["potato", "Potato", "common", N], ["spelt", "Spelt", "common", N], ["sprouted", "Sprouted Grain", "common", E],
    ["pumpernickel", "Pumpernickel", "common", LG], ["cracked_wheat", "Cracked Wheat", "common", LG], ["everything", "Everything", "common", LG],
    // ---- Uncommon (25)
    ["blueberry", "Blueberry", "uncommon", E], ["cinnamon_raisin", "Cinnamon Raisin", "uncommon", N], ["asiago", "Asiago Cheese", "uncommon", LG],
    ["garlic", "Garlic", "uncommon", LG], ["cheddar", "Cheddar", "uncommon", LG], ["honey_glaze", "Honey Glaze", "uncommon", N],
    ["avocado", "Avocado", "uncommon", E], ["bacon", "Bacon", "uncommon", LG], ["jalapeno", "Jalapeño", "uncommon", LG],
    ["strawberry", "Strawberry", "uncommon", N], ["choc_chip", "Chocolate Chip", "uncommon", N], ["banana", "Banana", "uncommon", E],
    ["maple", "Maple", "uncommon", N], ["coconut", "Coconut", "uncommon", E], ["lemon", "Lemon", "uncommon", E],
    ["orange", "Orange", "uncommon", E], ["raspberry", "Raspberry", "uncommon", E], ["cranberry", "Cranberry", "uncommon", E],
    ["apple_cinnamon", "Apple Cinnamon", "uncommon", N], ["peanut_butter", "Peanut Butter", "uncommon", LG], ["caramel", "Caramel", "uncommon", N],
    ["pumpkin_spice", "Pumpkin Spice", "uncommon", LG], ["vanilla", "Vanilla", "uncommon", N], ["almond", "Almond", "uncommon", LG],
    ["cherry", "Cherry", "uncommon", N],
    // ---- Rare (20)
    ["rainbow", "Rainbow", "rare", N], ["jalapeno_cheddar", "Jalapeño Cheddar", "rare", LG], ["french_toast", "French Toast", "rare", N],
    ["maple_bacon", "Maple Bacon", "rare", LG], ["pizza", "Pizza", "rare", LG], ["matcha", "Matcha", "rare", N],
    ["smores", "S'mores", "rare", N], ["birthday_cake", "Birthday Cake", "rare", N], ["cookies_cream", "Cookies & Cream", "rare", N],
    ["red_velvet", "Red Velvet", "rare", N], ["ocean", "Ocean", "rare", E], ["sandstone", "Sandstone", "rare", E],
    ["bamboo", "Bamboo", "rare", E], ["coral", "Coral", "rare", E], ["honeycomb", "Honeycomb", "rare", LG],
    ["fossil", "Fossil", "rare", E], ["cactus", "Cactus", "rare", E], ["marble", "Marble", "rare", LG],
    ["geode", "Geode", "rare", E], ["graffiti", "Graffiti", "rare", LG],
    // ---- Epic (15)
    ["cherry_blossom", "Cherry Blossom", "epic", N], ["thunder", "Thunder", "epic", E], ["frostbite", "Frostbite", "epic", E],
    ["toxic", "Toxic", "epic", E], ["amethyst", "Amethyst", "epic", E], ["samurai", "Samurai", "epic", LG],
    ["mushroom", "Mushroom", "epic", N], ["steampunk", "Steampunk", "epic", LG], ["haunted", "Haunted", "epic", N],
    ["ninja", "Ninja", "epic", LG], ["crystal", "Crystal", "epic", E], ["pirate", "Pirate", "epic", LG],
    ["medieval", "Medieval", "epic", LG], ["enchanted_forest", "Enchanted Forest", "epic", N], ["dragon_scale", "Dragon Scale", "epic", N],
    // ---- Legendary (10)
    ["solar", "Solar", "legendary", E], ["lunar", "Lunar", "legendary", E], ["tidal", "Tidal", "legendary", E],
    ["volcanic", "Volcanic", "legendary", E], ["phoenix", "Phoenix", "legendary", N], ["royal", "Royal", "legendary", LG],
    ["pharaoh", "Pharaoh", "legendary", LG], ["leviathan", "Leviathan", "legendary", N], ["excalibur", "Excalibur", "legendary", LG],
    ["sakura_emperor", "Sakura Emperor", "legendary", N],
    // ---- Mythic (5)
    ["abyss", "Abyss", "mythic", E], ["radiant", "Radiant", "mythic", LG], ["inferno", "Inferno", "mythic", E],
    ["dreamscape", "Dreamscape", "mythic", N], ["monolith", "Monolith", "mythic", LG],
    // ---- Secret (3)
    ["chrono", "Chrono", "secret", LG], ["monochrome", "Monochrome", "secret", N], ["gargantua", "Gargantua", "secret", E],
    ["hallows_end", "Hallow's End", "secret", N], ["vampire_lord", "Vampire Lord", "secret", N],
  ];
  const LIST = CATALOG.map(([id, short, rarity, pack], i) => ({ id, short, name: short + " Bagel", rarity, pack, n: i }));
  const BY_ID = Object.fromEntries(LIST.map((a) => [a.id, a]));

  /* ---- geometry ---- */
  const f = (n) => Math.round(n * 100) / 100;
  const pol = (a, r, cx = C, cy = C) => { const t = (a - 90) * Math.PI / 180; return [f(cx + r * Math.cos(t)), f(cy + r * Math.sin(t))]; };
  const pt = (p) => p[0] + " " + p[1];
  const circ = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
  const poly = (ps) => "M" + ps.map(pt).join("L") + "Z";
  const pp = (list, cx = C, cy = C) => list.map(([a, r]) => pol(a, r, cx, cy));
  // open arc of radius r from angle a0 to a1 (0° = up, clockwise)
  const arc = (r, a0, a1, cx = C, cy = C) => `M${pt(pol(a0, r, cx, cy))}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${pt(pol(a1, r, cx, cy))}`;
  // annular sector between radii r1 < r2 and angles a0 < a1
  const sect = (r1, r2, a0, a1) => {
    const lg = a1 - a0 > 180 ? 1 : 0;
    return `M${pt(pol(a0, r2))}A${r2} ${r2} 0 ${lg} 1 ${pt(pol(a1, r2))}L${pt(pol(a1, r1))}A${r1} ${r1} 0 ${lg} 0 ${pt(pol(a0, r1))}Z`;
  };
  // straight band of width w running outwards along angle a, from radius r0 to r1
  const strap = (a, r0, r1, w) => {
    const t = (a - 90) * Math.PI / 180, vx = -Math.sin(t) * w / 2, vy = Math.cos(t) * w / 2, p0 = pol(a, r0), p1 = pol(a, r1);
    return poly([[f(p0[0] + vx), f(p0[1] + vy)], [f(p1[0] + vx), f(p1[1] + vy)], [f(p1[0] - vx), f(p1[1] - vy)], [f(p0[0] - vx), f(p0[1] - vy)]]);
  };
  // Catmull-Rom spline through points, as cubic Béziers
  function smooth(ps, closed = true, t = 1) {
    const n = ps.length, g = (i) => (closed ? ps[(i + n) % n] : ps[Math.max(0, Math.min(n - 1, i))]);
    let d = `M${pt(ps[0])}`;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      d += `C${f(p1[0] + (p2[0] - p0[0]) * t / 6)} ${f(p1[1] + (p2[1] - p0[1]) * t / 6)} ${f(p2[0] - (p3[0] - p1[0]) * t / 6)} ${f(p2[1] - (p3[1] - p1[1]) * t / 6)} ${pt(p2)}`;
    }
    return d + (closed ? "Z" : "");
  }
  // points along that spline (open curve), `per` samples per segment
  function sample(ps, per = 8) {
    const n = ps.length, out = [];
    const g = (i) => ps[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      for (let j = 0; j < per; j++) {
        const t = j / per, t2 = t * t, t3 = t2 * t;
        const c = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
        out.push([c(0), c(1)]);
      }
    }
    out.push(ps[n - 1]);
    return out;
  }
  // a ribbon of width w (number, [start, end] or t => width) along a spline, round ends
  function tube(ps, w, per = 7) {
    const s = sample(ps, per), n = s.length, L = [], Rt = [], ws = [];
    const wf = typeof w === "function" ? w : Array.isArray(w) ? (t) => w[0] + (w[1] - w[0]) * t : () => w;
    for (let i = 0; i < n; i++) {
      const a = s[Math.max(0, i - 1)], b = s[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const hw = Math.max(0, wf(i / (n - 1))) / 2; ws.push(hw);
      L.push([f(s[i][0] - dy * hw), f(s[i][1] + dx * hw)]); Rt.push([f(s[i][0] + dy * hw), f(s[i][1] - dx * hw)]);
    }
    const e = f(ws[n - 1]), b0 = f(ws[0]);
    return "M" + L.map(pt).join("L") + `A${e} ${e} 0 0 1 ${pt(Rt[n - 1])}` + "L" + Rt.reverse().map(pt).join("L") + `A${b0} ${b0} 0 0 1 ${pt(L[0])}Z`;
  }

  /* ---- shapes, drawn around (0, 0) ---- */
  const star = (ro, ri, n = 5, rot = 0) => poly(Array.from({ length: n * 2 }, (_, i) => pol(rot + i * 180 / n, i % 2 ? ri : ro, 0, 0)));
  const spark = (s, t = 0.2) => `M0 ${-s}Q${f(s * t)} ${f(-s * t)} ${s} 0Q${f(s * t)} ${f(s * t)} 0 ${s}Q${f(-s * t)} ${f(s * t)} ${-s} 0Q${f(-s * t)} ${f(-s * t)} 0 ${-s}Z`;
  const rhomb = (w, h) => `M0 ${-h}L${w} 0L0 ${h}L${-w} 0Z`;
  const petal = (len, wid) => `M0 0C${f(wid)} ${f(-len * 0.3)} ${f(wid * 0.95)} ${f(-len * 0.86)} ${f(wid * 0.36)} ${-len}L0 ${f(-len * 0.86)}L${f(-wid * 0.36)} ${-len}C${f(-wid * 0.95)} ${f(-len * 0.86)} ${f(-wid)} ${f(-len * 0.3)} 0 0Z`;
  const leaf = (len, wid) => `M0 0C${f(wid)} ${f(-len * 0.22)} ${f(wid * 0.85)} ${f(-len * 0.78)} 0 ${-len}C${f(-wid * 0.85)} ${f(-len * 0.78)} ${f(-wid)} ${f(-len * 0.22)} 0 0Z`;
  const drop = (w, h, lean = 0) => `M0 0C${f(-w * 0.62)} 0 ${f(-w * 0.6)} ${f(-h * 0.5)} ${f(lean)} ${-h}C${f(w * 0.6)} ${f(-h * 0.5)} ${f(w * 0.62)} 0 0 0Z`;
  const bolt = (s) => poly([[-0.12, -1], [0.55, -1], [0.16, -0.22], [0.58, -0.22], [-0.34, 1], [-0.06, 0.06], [-0.5, 0.06]].map(([x, y]) => [f(x * s), f(y * s)]));
  const heart = (s) => `M0 ${f(s * 0.42)}C${f(-s * 1.15)} ${f(-s * 0.3)} ${f(-s * 0.5)} ${f(-s * 1.08)} 0 ${f(-s * 0.48)}C${f(s * 0.5)} ${f(-s * 1.08)} ${f(s * 1.15)} ${f(-s * 0.3)} 0 ${f(s * 0.42)}Z`;
  // crescent opening to the right
  const crescent = (r, k = 0.62) => `M0 ${-r}A${r} ${r} 0 1 0 0 ${r}A${f(r * k)} ${r} 0 1 1 0 ${-r}Z`;
  function gearD(r, n, depth = 0.24, hole = 0.32) {
    const ps = [], step = 360 / n, tw = step * 0.2;
    for (let i = 0; i < n; i++) {
      const a = i * step;
      ps.push(pol(a - tw * 1.6, r * (1 - depth), 0, 0), pol(a - tw, r, 0, 0), pol(a + tw, r, 0, 0), pol(a + tw * 1.6, r * (1 - depth), 0, 0));
    }
    return poly(ps) + (hole ? circ(0, 0, r * hole) : "");
  }

  /* ---- markup helpers ---- */
  const at = (x, y, rot = 0, s = 1) => `transform="translate(${f(x)} ${f(y)})${rot ? ` rotate(${f(rot)})` : ""}${s !== 1 ? ` scale(${f(s)})` : ""}"`;
  const P = (d, fill, x = "") => `<path d="${d}" fill="${fill}"${x}/>`;
  const S = (d, fill, ink, w = 2, x = "") => `<path d="${d}" fill="${fill}" stroke="${ink}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${x}/>`;
  const L = (d, ink, w = 2, x = "") => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${x}/>`;
  const G = (tr, inner, x = "") => `<g ${tr}${x}>${inner}</g>`;
  const anim = (cls, delay = 0, dur = 0, inner = "") => `<g class="${cls}" style="animation-delay:${f(-delay)}s${dur ? `;animation-duration:${f(dur)}s` : ""}">${inner}</g>`;
  // faceted diamond gem: light upper-right facet, dark lower-left, a glint
  function gem(x, y, w, h, c, ink, rot = 0, sw = 1.4) {
    return G(at(x, y, rot), P(rhomb(w, h), c[1]) + P(`M0 ${-h}L${w} 0L0 0Z`, c[0]) + P(`M0 ${h}L${-w} 0L0 0Z`, c[2])
      + P(rhomb(w * 0.4, h * 0.4), c[0], ' opacity=".75"') + P(spark(Math.min(w, h) * 0.32), "#fff", ` transform="translate(${f(-w * 0.3)} ${f(-h * 0.34)})" opacity=".95"`)
      + S(rhomb(w, h), "none", ink, sw));
  }
  // a crystal shard pointing up from (0,0)
  function shard(len, w, c, ink, sw = 1.3) {
    const tip = -len, sh = -len + w * 0.6;
    return P(poly([[0, tip], [w / 2, sh], [w / 2, 0], [-w / 2, 0], [-w / 2, sh]]), c[1])
      + P(poly([[0, tip], [0, 0], [-w / 2, 0], [-w / 2, sh]]), c[0])
      + P(poly([[0, tip], [w / 2, sh], [w / 4, sh + 1.5]]), "#fff", ' opacity=".35"')
      + L(`M0 ${f(tip + 1.5)}L0 ${f(-1)}`, "#fff", 0.7, ' opacity=".5"')
      + S(poly([[0, tip], [w / 2, sh], [w / 2, 0], [-w / 2, 0], [-w / 2, sh]]), "none", ink, sw);
  }
  // cluster of three shards at (x,y) leaning outwards along `rot`
  function cluster(x, y, rot, s, c, ink) {
    return G(at(x, y, rot, s),
      G('transform="rotate(-30) translate(-2 1)"', shard(12, 6, c, ink)) + G('transform="rotate(28) translate(2 1)"', shard(11, 5.6, c, ink))
      + shard(17, 7.4, c, ink) + S("M-6 1Q0 4 6 1", c[2], ink, 1.1));
  }
  // cherry blossom: 5 notched petals, darker heart, stamens
  function sakura(x, y, r, rot, c, ink, sw = 1) {
    let s = "";
    for (let i = 0; i < 5; i++) s += S(petal(r, r * 0.8), c[0], ink, sw, ` transform="rotate(${i * 72})"`);
    s += `<circle r="${f(r * 0.46)}" fill="${c[1]}" opacity=".85"/>`;
    for (let i = 0; i < 5; i++) { const [a, b] = pol(i * 72 + 36, r * 0.42, 0, 0); s += L(`M0 0L${a} ${b}`, c[2], 0.7) + `<circle cx="${a}" cy="${b}" r="${f(r * 0.09)}" fill="${c[3] || "#ffd75e"}"/>`; }
    return G(at(x, y, rot), s + `<circle r="${f(r * 0.17)}" fill="${c[2]}"/>`);
  }
  // shiny bubble
  function bubble(x, y, r, fill, ink, sw = 1.1) {
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}" stroke="${ink}" stroke-width="${sw}"/>`
      + `<ellipse cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.38)}" rx="${f(r * 0.32)}" ry="${f(r * 0.22)}" fill="#fff" opacity=".85" transform="rotate(-35 ${f(x - r * 0.35)} ${f(y - r * 0.38)})"/>`;
  }
  // puffy union of circles [[x,y,r],...] with one outline around the whole thing
  function puffs(cs, fill, ink, sw = 1.6, shade) {
    let s = cs.map(([x, y, r]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${ink}" stroke="${ink}" stroke-width="${sw * 2}"/>`).join("");
    s += cs.map(([x, y, r]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"/>`).join("");
    if (shade) s += cs.map(([x, y, r]) => `<circle cx="${f(x - r * 0.2)}" cy="${f(y - r * 0.25)}" r="${f(r * 0.62)}" fill="${shade}"/>`).join("");
    return s;
  }
  // 4-point sparkle that twinkles (front layer)
  const twinkle = (x, y, s, color, delay = 0, dur = 2.6) => G(at(x, y), anim("tw", delay, dur, P(spark(s), color)));

  /* ---- the kit handed to each drawing ---- */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

  function kit(id, meta) {
    let n = 0;
    const k = {
      id, rarity: meta ? meta.rarity : "common", R, H,
      ink: "#2b1a10", base: "#e3a35c", wall: null, outer: null, hole: null, holeFill: null,
      gloss: true, shade: true, glint: meta ? RAR[meta.rarity].tier >= 2 : false, bob: true, sw: 3.2,
      defs: "", back: "", body: "", over: "", top: "", front: "", css: "",
      rnd: rng(hash(id)),
    };
    k.r = (a, b) => a + (b - a) * k.rnd();
    k.pick = (arr) => arr[Math.floor(k.rnd() * arr.length)];
    k.uid = (p = "g") => p + (++n);
    // gradient → "url(#id)". stops: [[offset, color, opacity?], ...]; attrs: raw attributes
    k.grad = (type, stops, attrs = "") => {
      const gid = k.uid("gr");
      k.defs += `<${type}Gradient id="${gid}" ${attrs}>${stops.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ""}/>`).join("")}</${type}Gradient>`;
      return `url(#${gid})`;
    };
    k.lin = (stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => k.grad("linear", stops, `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`);
    k.rad = (stops, cx = 0.5, cy = 0.5, r = 0.5, fx, fy) => k.grad("radial", stops, `cx="${cx}" cy="${cy}" r="${r}"${fx != null ? ` fx="${fx}" fy="${fy}"` : ""}`);
    k.radU = (stops, cx = C, cy = C, r = R) => k.grad("radial", stops, `cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse"`);
    k.linU = (stops, x1, y1, x2, y2) => k.grad("linear", stops, `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse"`);
    // pulsing aura behind the bagel (the hole stays see-through)
    k.glow = (color, op = 0.6, from = 0.78, dur = 2.6) => `<g class="pu" style="animation-duration:${dur}s"><path d="${circ(C, C, 63)}${circ(C, C, H)}" fill-rule="evenodd" fill="${k.radU([[from, color, op], [1, color, 0]], C, C, 63)}"/></g>`;
    k.clip = (d) => { const cid = k.uid("cp"); k.defs += `<clipPath id="${cid}"><path d="${d}"/></clipPath>`; return `clip-path="url(#${cid})"`; };
    // ring of cells (rocks, plates, facets): rows [[r0, r1, count, angleOffset]]
    k.cells = (rows, inset = 1.4, jit = 2.2) => {
      const out = [];
      rows.forEach(([r0, r1, cnt, off = 0]) => {
        for (let i = 0; i < cnt; i++) {
          const a0 = off + i * 360 / cnt, a1 = a0 + 360 / cnt, am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
          const j = (s) => (k.rnd() - 0.5) * jit * s;
          const ps = [pol(a0 + j(3), r0 + j(1)), pol(am + j(3), r0 + j(0.6)), pol(a1 + j(3), r0 + j(1)), pol(a1 + j(2.4), rm + j(1.2)),
            pol(a1 + j(3), r1 + j(1)), pol(am + j(3), r1 + j(0.6)), pol(a0 + j(3), r1 + j(1)), pol(a0 + j(2.4), rm + j(1.2))];
          const cx = ps.reduce((s, p) => s + p[0], 0) / ps.length, cy = ps.reduce((s, p) => s + p[1], 0) / ps.length;
          const shrink = (by, dx = 0, dy = 0) => ps.map(([x, y]) => { const l = Math.hypot(cx - x, cy - y) || 1; return [f(x + (cx - x) * by / l + dx), f(y + (cy - y) * by / l + dy)]; });
          out.push({ pts: shrink(inset), inner: (by, dx, dy) => shrink(inset + by, dx, dy), cx: f(cx), cy: f(cy), a: am, r: rm });
        }
      });
      return out;
    };
    return k;
  }

  /* ---- shared idle motion (every bagel gets these keyframes) ---- */
  const BASE_CSS = ".a{transform-origin:64px 64px;animation:bob 4s ease-in-out infinite}"
    + "@keyframes bob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-1.6px) scale(1.012)}}"
    + ".tw{animation:tw 2.6s ease-in-out infinite}@keyframes tw{0%,100%{opacity:0;transform:scale(.2) rotate(0)}45%,55%{opacity:1;transform:scale(1) rotate(45deg)}}"
    + ".gl{animation:gl 6s ease-in-out infinite}@keyframes gl{0%,58%{transform:translateX(0)}88%,100%{transform:translateX(150px)}}"
    + ".sp{animation:sp 14s linear infinite}.spr{animation:sp 14s linear infinite reverse}@keyframes sp{to{transform:rotate(360deg)}}"
    + ".c64{transform-origin:64px 64px}"
    + ".sw{animation:sw 3.2s ease-in-out infinite alternate}@keyframes sw{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}"
    + ".fl{animation:fl 3s ease-in-out infinite}@keyframes fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.6px)}}"
    + ".pu{animation:pu 2.4s ease-in-out infinite}@keyframes pu{0%,100%{opacity:.3}50%{opacity:1}}"
    + ".fk{animation:fk .8s ease-in-out infinite alternate}@keyframes fk{from{transform:scale(1,1)}to{transform:scale(.9,1.14)}}"
    + ".ri{animation:ri 3.2s ease-in infinite}@keyframes ri{0%{opacity:0;transform:translateY(4px) scale(.5)}20%{opacity:1}100%{opacity:0;transform:translateY(-24px) scale(1)}}"
    + ".fa{animation:fa 5.5s linear infinite}@keyframes fa{0%{opacity:0;transform:translate(0,-8px) rotate(0)}12%,80%{opacity:1}100%{opacity:0;transform:translate(16px,46px) rotate(260deg)}}"
    + ".br{animation:br 3s ease-in-out infinite}@keyframes br{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}"
    + "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";

  function assemble(k, still) {
    const outer = k.outer || circ(C, C, k.R), hole = k.hole || circ(C, C, k.H), ring = outer + hole;
    const hf = k.H / k.R;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><defs>`
      + `<clipPath id="rc"><path d="${ring}" clip-rule="evenodd"/></clipPath><clipPath id="hc"><path d="${hole}"/></clipPath>`
      + `<radialGradient id="tor" cx="64" cy="64" r="${k.R}" gradientUnits="userSpaceOnUse"><stop offset="${f(hf)}" stop-color="#000" stop-opacity=".36"/><stop offset="${f(hf + 0.11)}" stop-color="#000" stop-opacity=".05"/><stop offset=".56" stop-color="#fff" stop-opacity=".16"/><stop offset=".8" stop-color="#fff" stop-opacity="0"/><stop offset=".93" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>`
      + `<linearGradient id="lit" x1="16" y1="12" x2="108" y2="118" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".24"/></linearGradient>`
      + `<linearGradient id="gls" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + k.defs + `</defs><style>${BASE_CSS}${k.css}${still ? "*{animation:none!important}.ri,.fa,.sn,.pp,.dr,.tr{display:none}" : ""}</style>`
      + `<g class="${k.bob ? "a" : "a0"}">${k.back}`
      + (k.holeFill ? `<path d="${hole}" fill="${k.holeFill}"/>` : "")
      + `<g clip-path="url(#rc)"><path d="${ring}" fill="${k.base}" fill-rule="evenodd"/>${k.body}`
      + (k.shade ? `<path d="${ring}" fill="url(#tor)" fill-rule="evenodd"/><path d="${ring}" fill="url(#lit)" fill-rule="evenodd"/>` : "")
      + k.over
      + (k.gloss ? L(arc(k.R - 5.5, -64, -24), "#fff", 3, ' stroke-opacity=".5"') + `<circle cx="${pol(-14, k.R - 5.5)[0]}" cy="${pol(-14, k.R - 5.5)[1]}" r="1.5" fill="#fff" opacity=".5"/>` + L(arc(k.H + 3.4, 112, 158), "#fff", 1.8, ' stroke-opacity=".3"') : "")
      + (k.glint ? `<g transform="rotate(28 64 64)"><rect class="gl" x="-16" y="-40" width="18" height="210" fill="url(#gls)" style="animation-delay:-${f(k.rnd() * 4)}s"/></g>` : "")
      + `</g>`
      + (k.wall ? `<g clip-path="url(#hc)"><path d="${hole}${circ(C, C + 3.6, k.H)}" fill-rule="evenodd" fill="${k.wall}"/></g>` : "")
      + `<path d="${ring}" fill="none" stroke="${k.ink}" stroke-width="${k.sw}" stroke-linejoin="round" fill-rule="evenodd"/>`
      + k.top + `</g>` + k.front + `</svg>`;
    return s;
  }

  /* ---- registry + cache ---- */
  const ART = {};
  const cache = new Map();
  // Bagels that are their own SVG files: the full art for big views, a lighter cut
  // (no aura or flying extras) for small avatars, and an optional one-shot intro the
  // pack reveal plays. Each file carries its own animations.
  const FV = "?v=1";
  const FILES = {
    hallows_end: { full: "media/bagels/hallows-end.svg", lite: "media/bagels/hallows-end-lite.svg", intro: "media/bagels/hallows-end-intro.svg" },
    vampire_lord: { full: "media/bagels/vampire-lord.svg", lite: "media/bagels/vampire-lord-lite.svg" },
    pharaoh: { full: "media/bagels/pharaoh.svg", lite: "media/bagels/pharaoh-lite.svg", intro: "media/bagels/pharaoh-intro.svg" },
  };
  const BIG = /\b(po-av|sh-big|sh-me-av|ph-avatar|big)\b/; // classes that show a bagel large
  function svg(id, still = false) {
    const meta = BY_ID[id] || null;
    const k = kit(id, meta);
    (ART[id] || ART.__plain || (() => {}))(k);
    return assemble(k, still);
  }
  function url(id, still = false, big = false) {
    if (FILES[id]) return (big ? FILES[id].full : FILES[id].lite) + FV;
    const key = id + (still ? "|s" : "");
    if (!cache.has(key)) cache.set(key, "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg(id, still)));
    return cache.get(key);
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function img(id, cls = "", still = false) {
    const a = BY_ID[id];
    if (!a) return "";
    return `<img class="${cls} bagel-av" data-rar="${a.rarity}" src="${url(id, still, BIG.test(cls))}" alt="${esc(a.name)}" draggable="false" />`;
  }
  // The reveal's entrance for a bagel that has one ("" if not). A fresh URL each time so
  // the browser starts the animation over instead of sharing a running copy.
  function introImg(id, cls = "") {
    const a = BY_ID[id], f = FILES[id];
    if (!a || !f || !f.intro) return "";
    return `<img class="${cls} bagel-av" data-rar="${a.rarity}" src="${f.intro}${FV}&t=${Date.now()}" alt="${esc(a.name)}" draggable="false" />`;
  }

  // crypto-strength roll: rarity by the published odds, then any bagel of that rarity in the pack
  function rand() {
    try { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; } catch (e) { return Math.random(); }
  }
  // Pack odds (percent by rarity) under a luck boost: Epic and rarer become `luck`× as
  // likely, and the extra chance comes out of Common (then Uncommon if Common runs out).
  function odds(luck = 1) {
    const o = Object.fromEntries(RARITIES.map((r) => [r.key, r.odds]));
    if (luck > 1) {
      let extra = 0;
      RARITIES.forEach((r, i) => { if (i >= 3) { extra += r.odds * (luck - 1); o[r.key] = r.odds * luck; } });
      const fromCommon = Math.min(extra, o.common);
      o.common -= fromCommon; o.uncommon -= extra - fromCommon;
    }
    return o;
  }
  function roll(packId, luck = 1) {
    const o = odds(luck);
    let x = rand() * 100, rar = RARITIES[0].key;
    for (const r of RARITIES) { if (x < o[r.key]) { rar = r.key; break; } x -= o[r.key]; }
    const pool = LIST.filter((a) => a.pack === packId && a.rarity === rar);
    const pick = pool.length ? pool[Math.floor(rand() * pool.length)] : LIST.find((a) => a.rarity === rar);
    return pick.id;
  }

  return {
    RARITIES, RAR, PACKS, LIST,
    get: (id) => BY_ID[id] || null,
    has: (id) => !!BY_ID[id],
    rarity: (key) => RAR[key] || RAR.common,
    pack: (id) => PACKS.find((p) => p.id === id) || null,
    inPack: (packId) => LIST.filter((a) => a.pack === packId),
    art: (map) => { Object.assign(ART, map); cache.clear(); },
    hasArt: (id) => !!(ART[id] || FILES[id]),
    svg, url, img, introImg, roll, odds,
    // drawing kit for avatars-art-*.js
    K: { C, R, H, f, pol, pt, circ, poly, pp, arc, sect, strap, smooth, sample, tube, star, spark, rhomb, petal, leaf, drop, bolt, heart, crescent, gearD,
      at, P, S, L, G, anim, gem, shard, cluster, sakura, bubble, puffs, twinkle },
  };
})();

window.Avatars = Avatars;
