/* =============================================================================
   shop.js  —  the Bagel Shop: packs of bagel avatars + Bagel Bucks boosts
   -----------------------------------------------------------------------------
   Owner-only while it's in beta (app.js gates the route and the sidebar link).
   Everything lives on the scouter's own doc (scouters/{id}), changed only in
   transactions so a purchase can't double-spend:
     avatars: { bagelId: count }   avatar: equipped bagel id ("" = photo)
     boost:   { id, mult, until }  packsOpened, shopAt (last shop change)
   The bagels themselves are drawn by avatars.js.
   ========================================================================== */
const ShopUI = (() => {
  "use strict";
  let H = null; // helpers from app.js: $, $$, esc, icon, toast, modal, pageHero, emptyState, myPhoto, reduceMotion
  const BOOSTS = [
    { id: "toaster", name: "Toaster Boost", mult: 1.5, mins: 60, price: 30, ic: "zap", blurb: "1.5× Bagel Bucks from scouting for an hour" },
    { id: "double", name: "Double Dough", mult: 2, mins: 60, price: 75, ic: "coins", blurb: "2× Bagel Bucks from scouting for an hour" },
    { id: "golden", name: "Golden Oven", mult: 3, mins: 60, price: 175, ic: "crown", blurb: "3× Bagel Bucks from scouting for an hour" },
  ];
  const TABS = [["packs", "Packs", "shop"], ["collection", "Collection", "bagel"], ["boosts", "Boosts", "zap"]];

  /* ---- data -------------------------------------------------------------- */
  const db = () => (window.Cloud && Cloud.enabled() && window.firebase) ? firebase.firestore() : null;
  const meId = () => (Store.getMe() || {}).id;
  // What a transaction just wrote, shown until the live cloud copy catches up.
  let shadow = null;
  function myDoc() {
    const cloud = ((window.Cloud && Cloud.getScouters()) || []).find((s) => s.id === meId()) || {};
    if (shadow && shadow.id === meId() && (cloud.shopAt || 0) < shadow.shopAt) return { ...cloud, ...shadow };
    return cloud;
  }
  const owned = () => myDoc().avatars || {};
  const balance = () => { const d = myDoc(); return typeof d.bb === "number" ? d.bb : ((Store.getMe() || {}).bb || 0); };
  const equipped = () => { const id = myDoc().avatar; return id && Avatars.has(id) ? id : ""; };
  const activeBoost = () => { const b = myDoc().boost; return b && b.until > Date.now() ? b : null; };
  // the multiplier on Bagel Bucks earned from scouting right now (app.js asks)
  const bbMult = () => { const b = activeBoost(); return b ? Number(b.mult) || 1 : 1; };

  // one transaction on a scouter doc (mine unless `uid` is given)
  async function tx(work, uid) {
    const d = db(); if (!d) throw new Error("OFFLINE");
    const id = uid || meId(); if (!id) throw new Error("NO_USER");
    const ref = d.collection("scouters").doc(id);
    const out = await d.runTransaction(async (t) => {
      const s = await t.get(ref), cur = s.exists ? s.data() : {};
      const res = work(cur);
      const patch = { ...res.patch, id, shopAt: Date.now() };
      t.set(ref, patch, { merge: true });
      return { ...res, patch };
    });
    if (id === meId()) shadow = { ...(shadow && shadow.id === id ? shadow : {}), ...out.patch };
    return out;
  }
  const openPackTx = (pack) => tx((cur) => {
    const bal = cur.bb || 0;
    if (bal < pack.price) throw new Error("FUNDS");
    const id = Avatars.roll(pack.id), have = (cur.avatars || {})[id] || 0;
    return { id, isNew: !have, count: have + 1, patch: { bb: bal - pack.price, avatars: { ...(cur.avatars || {}), [id]: have + 1 }, packsOpened: (cur.packsOpened || 0) + 1 } };
  });
  const sellTx = (id) => tx((cur) => {
    const have = (cur.avatars || {})[id] || 0, value = Avatars.rarity(Avatars.get(id).rarity).sell;
    if (have < 2) throw new Error("LAST");
    return { value, patch: { bb: (cur.bb || 0) + value, avatars: { ...(cur.avatars || {}), [id]: have - 1 } } };
  });
  const equipTx = (id) => tx((cur) => {
    if (id && !((cur.avatars || {})[id] > 0)) throw new Error("NOT_OWNED");
    return { patch: { avatar: id || "" } };
  });
  const boostTx = (b) => tx((cur) => {
    const bal = cur.bb || 0, now = Date.now(), act = cur.boost && cur.boost.until > now ? cur.boost : null;
    if (bal < b.price) throw new Error("FUNDS");
    if (act && act.id !== b.id) throw new Error("BOOSTING");
    return { patch: { bb: bal - b.price, boost: { id: b.id, mult: b.mult, until: (act ? act.until : now) + b.mins * 60000 } } };
  });
  // admin: one of every bagel for a member (counts they already have are kept)
  const grantAllTx = (uid) => tx((cur) => {
    const avatars = { ...(cur.avatars || {}) };
    Avatars.LIST.forEach((a) => { avatars[a.id] = Math.max(1, avatars[a.id] || 0); });
    return { patch: { avatars } };
  }, uid);
  const errMsg = (e) => ({
    FUNDS: "Not enough Bagel Bucks", OFFLINE: "The shop needs the cloud connection", NO_USER: "Sign in first",
    LAST: "Keep at least one of each bagel", NOT_OWNED: "You don't own that bagel yet", BOOSTING: "Another boost is still running",
  }[e && e.message] || "Something went wrong. Try again.");

  /* ---- page -------------------------------------------------------------- */
  let root = null, tab = "packs", rarFilter = "all", ticker = null;
  const esc = (s) => H.esc(s), icon = (n) => H.icon(n);
  function init(helpers) { H = helpers; }
  function page(el) {
    root = el;
    draw();
    clearInterval(ticker);
    ticker = setInterval(() => { if (!root || !root.isConnected) { clearInterval(ticker); ticker = null; return; } tickBoost(); }, 1000);
  }
  // live cloud data arrived: redraw unless a pack is opening on top
  function refresh() { if (root && root.isConnected && !opening) draw(); }

  const fmtLeft = (ms) => { const m = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(m / 3600), mm = Math.floor((m % 3600) / 60), ss = m % 60; return h ? `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`; };
  function tickBoost() {
    const b = activeBoost();
    root.querySelectorAll("[data-boost-left]").forEach((el) => { el.textContent = b ? fmtLeft(b.until - Date.now()) : "0:00"; });
    if (!b && root.querySelector("[data-boost-left]")) draw();
  }
  const wallet = () => `<span class="sh-wallet" title="Your Bagel Bucks">${icon("coins")}<b>${balance().toLocaleString()}</b><small>BB</small></span>`;

  function draw() {
    const cloudOn = !!db(), eq = equipped(), own = owned();
    const have = Avatars.LIST.filter((a) => own[a.id] > 0).length, total = Avatars.LIST.length, b = activeBoost();
    root.innerHTML = H.pageHero({ ic: "shop", eyebrow: "BagelTools · Beta", title: "Bagel Shop", sub: "Open packs, collect every bagel, and boost the Bagel Bucks you earn.", side: wallet() })
      + (cloudOn ? "" : `<div class="card" style="margin-bottom:14px">${H.emptyState("lock", "The shop needs the cloud", "Your Bagel Bucks live in the cloud, so packs and boosts open once you're connected.")}</div>`)
      + `<section class="card sh-top">
          <div class="sh-me">${eq ? Avatars.img(eq, "sh-me-av") : `<img class="sh-me-av" src="${esc(H.myPhoto())}" alt="" />`}
            <div><span class="pg-eyebrow">Your avatar</span><b>${eq ? esc(Avatars.get(eq).name) : "Profile photo"}</b>
              <span class="hint">${eq ? "It replaces your profile picture everywhere." : "Open a pack, then equip a bagel."}</span></div></div>
          <div class="sh-prog"><div class="sh-prog-row"><span>Collection</span><b>${have}<small>/${total}</small></b></div><div class="sh-bar"><i style="width:${(have / total * 100).toFixed(1)}%"></i></div></div>
          ${b ? `<div class="sh-boostchip">${icon("zap")}<span><b>${b.mult}× boost</b> <span data-boost-left>${fmtLeft(b.until - Date.now())}</span></span></div>` : ""}
        </section>
        <nav class="sh-tabs" role="tablist">${TABS.map(([id, label, ic]) => `<button role="tab" class="sh-tab${tab === id ? " on" : ""}" data-tab="${id}" aria-selected="${tab === id}">${icon(ic)}${label}</button>`).join("")}</nav>
        <div class="sh-body">${tab === "packs" ? packsHTML() : tab === "collection" ? collectionHTML() : boostsHTML()}</div>`;
    root.querySelectorAll("[data-tab]").forEach((x) => { x.onclick = () => { tab = x.dataset.tab; draw(); }; });
    root.querySelectorAll("[data-open]").forEach((x) => { x.onclick = () => openPack(x.dataset.open); });
    root.querySelectorAll("[data-odds]").forEach((x) => { x.onclick = () => oddsDialog(x.dataset.odds); });
    root.querySelectorAll("[data-rf]").forEach((x) => { x.onclick = () => { rarFilter = x.dataset.rf; draw(); }; });
    root.querySelectorAll("[data-av]").forEach((x) => { x.onclick = () => itemDialog(x.dataset.av); });
    root.querySelectorAll("[data-buy]").forEach((x) => { x.onclick = () => buyBoost(x.dataset.buy); });
  }

  // a paper bakery bag with the pack's top bagel on it
  function packArt(p, cls = "") {
    return `<div class="pk ${cls}" style="--c1:${p.c1};--c2:${p.c2}"><div class="pk-bag">
      <span class="pk-fold"></span><span class="pk-tag">702 Bakery</span>
      <img class="pk-hero" src="${Avatars.url(p.feature, true)}" alt="" draggable="false" />
      <b class="pk-name">${esc(p.name.replace(/ Pack$/, ""))}</b><span class="pk-sub">Pack</span><span class="pk-shine"></span></div></div>`;
  }
  function packsHTML() {
    const bal = balance(), on = !!db();
    return `<div class="sh-packs">${Avatars.PACKS.map((p) => {
      const inPack = Avatars.inPack(p.id), got = inPack.filter((a) => owned()[a.id] > 0).length;
      return `<article class="sh-pack">${packArt(p)}
        <div class="sh-pack-info"><h3>${esc(p.name)}</h3><p class="hint">${esc(p.blurb)} · ${got}/${inPack.length} found</p>
          <div class="sh-pack-row"><button class="btn primary" data-open="${p.id}"${on && bal >= p.price ? "" : " disabled"}>${icon("coins")} Open · ${p.price} BB</button>
            <button class="btn ghost sm" data-odds="${p.id}">Drop rates</button></div></div></article>`;
    }).join("")}</div>`;
  }
  const lockedImg = (a) => `<span class="sh-lock" data-rar="${a.rarity}">${a.rarity === "secret" ? "?" : `<img src="${Avatars.url(a.id, true)}" alt="" draggable="false" />`}</span>`;
  function collectionHTML() {
    const own = owned(), eq = equipped();
    const chips = [["all", "All"], ...Avatars.RARITIES.map((r) => [r.key, r.label])].map(([k, l]) => `<button class="sh-chip${rarFilter === k ? " on" : ""}" data-rf="${k}"${k !== "all" ? ` style="--rc:${Avatars.rarity(k).color}"` : ""}>${l}</button>`).join("");
    return `<div class="sh-chips">${chips}</div>` + Avatars.RARITIES.filter((r) => rarFilter === "all" || r.key === rarFilter).map((r) => {
      const items = Avatars.LIST.filter((a) => a.rarity === r.key), got = items.filter((a) => own[a.id] > 0).length;
      return `<section class="sh-rar" style="--rc:${r.color}"><h3><span class="sh-rdot"></span>${r.label}<small>${got}/${items.length} · ${r.odds}% per pack</small></h3>
        <div class="sh-grid">${items.map((a) => own[a.id] > 0
          ? `<button class="sh-item${eq === a.id ? " eq" : ""}" data-av="${a.id}" data-rar="${a.rarity}" title="${esc(a.name)}">${Avatars.img(a.id, "sh-av", true)}<b>${esc(a.short)}</b>${own[a.id] > 1 ? `<span class="sh-n">×${own[a.id]}</span>` : ""}${eq === a.id ? `<span class="sh-eq">${icon("check")}</span>` : ""}</button>`
          : `<div class="sh-item locked" data-rar="${a.rarity}">${lockedImg(a)}<b>???</b></div>`).join("")}</div></section>`;
    }).join("");
  }
  function boostsHTML() {
    const b = activeBoost(), bal = balance(), on = !!db();
    return (b ? `<section class="card sh-active">${icon("zap")}<div><b>${esc((BOOSTS.find((x) => x.id === b.id) || {}).name || "Boost")} is on</b><span class="hint">Scouting pays <b>${b.mult}×</b> Bagel Bucks for <b data-boost-left>${fmtLeft(b.until - Date.now())}</b> more.</span></div></section>` : "")
      + `<div class="sh-boosts">${BOOSTS.map((x) => {
        const blocked = b && b.id !== x.id;
        return `<article class="sh-boost${b && b.id === x.id ? " on" : ""}" data-b="${x.id}"><span class="sh-bico">${icon(x.ic)}</span>
          <b class="sh-mult">${x.mult}×</b><h3>${esc(x.name)}</h3><p class="hint">${esc(x.blurb)}</p>
          <button class="btn ${b && b.id === x.id ? "ghost" : "primary"}" data-buy="${x.id}"${on && bal >= x.price && !blocked ? "" : " disabled"}>${icon("coins")} ${b && b.id === x.id ? "Add an hour" : "Buy"} · ${x.price} BB</button></article>`;
      }).join("")}</div>
      <p class="hint sh-note">Boosts multiply what you earn for new match and pit records while they run. Only one boost can run at a time; buying the same one again adds another hour.</p>`;
  }

  function oddsDialog(packId) {
    const p = Avatars.pack(packId), own = owned();
    H.modal(p.name + " · drop rates", `<div class="sh-odds">${Avatars.RARITIES.map((r) => {
      const items = Avatars.inPack(packId).filter((a) => a.rarity === r.key);
      return `<div class="sh-odds-row" style="--rc:${r.color}"><div class="sh-odds-head"><span class="sh-rdot"></span><b>${r.label}</b><span>${r.odds}%</span></div>
        <div class="sh-odds-items">${items.map((a) => own[a.id] > 0 ? `<span title="${esc(a.name)}">${Avatars.img(a.id, "", true)}</span>` : `<span title="Not found yet">${lockedImg(a)}</span>`).join("")}</div></div>`;
    }).join("")}</div><p class="hint" style="margin-top:12px">Each pack rolls a rarity first, then any bagel of that rarity in this pack, all equally likely.</p>`);
  }
  function itemDialog(id) {
    const a = Avatars.get(id), r = Avatars.rarity(a.rarity), n = owned()[id] || 0, isEq = equipped() === id;
    H.modal(a.name, `<div class="sh-detail" style="--rc:${r.color}">
        <div class="sh-detail-av">${Avatars.img(id, "sh-big")}</div>
        <span class="sh-rtag" data-rar="${a.rarity}">${r.label}</span>
        <p class="hint">${esc(Avatars.pack(a.pack).name)} · you have ${n}</p>
        <div class="btn-row" style="justify-content:center">
          <button class="btn primary" id="shEquip">${icon(isEq ? "x" : "check")} ${isEq ? "Use my photo instead" : "Equip"}</button>
          ${n > 1 ? `<button class="btn ghost" id="shSell">${icon("coins")} Sell a duplicate · +${r.sell} BB</button>` : ""}
        </div></div>`, (body, close) => {
      body.querySelector("#shEquip").onclick = () => equip(isEq ? "" : id).then(close);
      const sell = body.querySelector("#shSell");
      if (sell) sell.onclick = async () => {
        sell.disabled = true;
        try { const res = await sellTx(id); H.toast(`Sold a duplicate · +${res.value} BB`); close(); draw(); }
        catch (e) { H.toast(errMsg(e), "err"); sell.disabled = false; }
      };
    });
  }
  async function equip(id) {
    try {
      await equipTx(id);
      Store.setMe({ avatar: id || "" });
      H.toast(id ? `${Avatars.get(id).name} equipped` : "Back to your profile photo");
      if (H.onAvatarChange) H.onAvatarChange();
      draw();
    } catch (e) { H.toast(errMsg(e), "err"); }
  }
  async function buyBoost(bid) {
    const b = BOOSTS.find((x) => x.id === bid); if (!b) return;
    try { await boostTx(b); H.toast(`${b.name} on · ${b.mult}× Bagel Bucks for scouting`); draw(); }
    catch (e) { H.toast(errMsg(e), "err"); }
  }

  /* ---- opening a pack ------------------------------------------------------ */
  let opening = false;
  async function openPack(packId) {
    const p = Avatars.pack(packId);
    if (!p || opening) return;
    if (!db()) return H.toast(errMsg(new Error("OFFLINE")), "err");
    if (balance() < p.price) return H.toast(errMsg(new Error("FUNDS")), "err");
    opening = true;
    const show = Reveal.start(p, H.reduceMotion());
    let res;
    try { res = await openPackTx(p); }
    catch (e) { show.cancel(); opening = false; H.toast(errMsg(e), "err"); return; }
    show.reveal(res, {
      again: () => { opening = false; draw(); openPack(packId); },
      equip: () => { equip(res.id); },
      done: () => { opening = false; draw(); },
      canAgain: () => balance() >= p.price,
      price: p.price,
    });
  }
  // Play a pack-opening show without spending or giving anything (Admin → Shop).
  // `pick` is a rarity key (any bagel of it) or a bagel id.
  function preview(pick) {
    if (opening) return;
    const pool = Avatars.RAR[pick] ? Avatars.LIST.filter((a) => a.rarity === pick) : [Avatars.get(pick)].filter(Boolean);
    if (!pool.length) return;
    const a = pool[Math.floor(Math.random() * pool.length)];
    opening = true;
    const show = Reveal.start(Avatars.pack(a.pack), H.reduceMotion());
    show.reveal({ id: a.id, isNew: true, count: 1 }, {
      preview: true,
      again: () => { opening = false; preview(pick); },
      done: () => { opening = false; },
      canAgain: () => true,
    });
  }

  /* ---- Admin → Shop: preview the shows, give members bagels ---------------- */
  function admin(el) {
    let q = "";
    const given = new Set(); // shown as complete before the live roster catches up
    const draw = () => {
      if (!el.isConnected) return;
      const docs = new Map(((window.Cloud && Cloud.getScouters()) || []).map((s) => [s.id, s]));
      const people = Object.values(Store.getMembers()).map((m) => ({ id: Store.scouterIdFor(m.first, m.last), name: `${m.first || ""} ${m.last || ""}`.trim() }))
        .filter((p) => p.name).sort((x, y) => x.name.localeCompare(y.name));
      const total = Avatars.LIST.length;
      const got = (id) => { if (given.has(id)) return total; const av = (docs.get(id) || {}).avatars || {}; return Avatars.LIST.filter((a) => av[a.id] > 0).length; };
      el.innerHTML = `
        <div class="card"><div class="sr-head"><h3>${icon("play")} Preview pack openings</h3><span class="hint">nothing is spent or given</span></div>
          <p class="hint" style="margin-top:0">Plays the opening show for a rarity (a random bagel of it), or for one bagel.</p>
          <div class="sh-chips">${Avatars.RARITIES.map((r) => `<button class="sh-chip on" style="--rc:${r.color}" data-prev="${r.key}">${icon("play")} ${esc(r.label)}</button>`).join("")}</div>
          <div class="btn-row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
            <select id="saPick" style="flex:1;min-width:200px">${Avatars.RARITIES.map((r) => `<optgroup label="${esc(r.label)}">${Avatars.LIST.filter((a) => a.rarity === r.key).map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</optgroup>`).join("")}</select>
            <button class="btn primary sm" id="saPlay">${icon("play")} Play this bagel</button>
          </div></div>
        <div class="card"><div class="sr-head"><h3>${icon("bagel")} Give bagels</h3><span class="hint">writes to their account</span></div>
          <p class="hint" style="margin-top:0">Gives a member one of every bagel. Bagels they already have keep their counts.</p>
          ${db() ? `<label class="ds-search ab-hostq">${icon("search")}<input type="search" id="saQ" placeholder="Find a member…" value="${esc(q)}" autocomplete="off" /></label>
          <div class="sa-people">${people.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).map((p) => {
            const n = got(p.id);
            return `<div class="sa-row">${H.scouterAvatar({ id: p.id, ...(docs.get(p.id) || {}) }, "sc-avatar sm")}<span class="sa-name">${esc(p.name)}</span>
              <span class="sa-count${n >= total ? " full" : ""}">${n}/${total}</span>
              <button class="btn ${n >= total ? "ghost" : "primary"} sm" data-giveall="${esc(p.id)}" data-name="${esc(p.name)}"${n >= total ? " disabled" : ""}>${n >= total ? "Has them all" : `Give all ${total}`}</button></div>`;
          }).join("") || `<p class="hint">No members match.</p>`}</div>`
          : `<p class="hint"><span class="badge red dot">Cloud off</span> Giving bagels needs cloud sync.</p>`}
        </div>`;
      el.querySelectorAll("[data-prev]").forEach((b) => { b.onclick = () => preview(b.dataset.prev); });
      el.querySelector("#saPlay").onclick = () => preview(el.querySelector("#saPick").value);
      const qi = el.querySelector("#saQ");
      if (qi) qi.oninput = () => { q = qi.value; draw(); const again = el.querySelector("#saQ"); again.focus(); again.setSelectionRange(q.length, q.length); };
      el.querySelectorAll("[data-giveall]").forEach((b) => { b.onclick = () => H.confirmDialog(`Give ${b.dataset.name} one of every bagel (${total})?`, async () => {
        b.disabled = true; b.textContent = "Giving…";
        try { await grantAllTx(b.dataset.giveall); given.add(b.dataset.giveall); H.toast(`${b.dataset.name} now has all ${total} bagels`); }
        catch (e) { H.toast(errMsg(e), "err"); }
        draw();
      }); });
    };
    draw();
  }

  /* ---- the reveal: one show per rarity, cooler the rarer -------------------
     Every pack drops in and shakes while the roll comes back, then bursts. What
     follows depends on the rarity:
       common     a puff of flour, the bagel bounces in
       uncommon   a green sparkle ring, the bagel spins in
       rare       a blue light pillar, the bagel rises through shockwaves
       epic       the room dims, a purple vortex pulls sparks in and detonates
       legendary  the screen quakes, gold god-rays, a coin shower, it descends
       mythic     a red rift tears open in a storm, it steps out, the title glitches
       secret     a fake-out, blackout, a galaxy forms, holographic reveal         */
  const Reveal = (() => {
    const T = { common: 900, uncommon: 1300, rare: 1800, epic: 2600, legendary: 3300, mythic: 4000, secret: 5600 };
    const COLORS = {
      common: ["#e8edf2", "#c9d1da", "#ffffff", "#aab4bf"], uncommon: ["#4ade80", "#bbf7d0", "#ffffff", "#22c55e"],
      rare: ["#38bdf8", "#bae6fd", "#ffffff", "#0ea5e9"], epic: ["#b06bff", "#e9d5ff", "#f0abfc", "#ffffff"],
      legendary: ["#fbbf24", "#fde68a", "#ffffff", "#f59e0b"], mythic: ["#ff4d6d", "#ff8fab", "#ffd1dc", "#ff2a55"],
      secret: ["#f0abfc", "#a5b4fc", "#67e8f9", "#86efac", "#ffffff", "#c4b5fd"],
    };

    function fx(canvas, origin) {
      const ctx = canvas.getContext("2d"), ps = [];
      let W = 0, Hh = 0, raf = 0, alive = true;
      const size = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; Hh = innerHeight; canvas.width = W * dpr; canvas.height = Hh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
      size(); addEventListener("resize", size);
      const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
      const O = () => origin ? origin() : [W / 2, Hh / 2];
      function add(o) { const [ox, oy] = O(); ps.push({ x: ox, y: oy, vx: 0, vy: 0, g: 0, drag: 0.98, life: 1, decay: 0.012, size: 4, color: "#fff", shape: "dot", rot: rnd(0, 6), vr: rnd(-0.2, 0.2), pull: 0, swirl: 0, ...o }); }
      function burst(n, o = {}) {
        for (let i = 0; i < n; i++) {
          const a = rnd(0, Math.PI * 2), sp = rnd(o.min || 2, o.max || 8);
          add({ ...o, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.lift || 0), color: pick(o.colors || ["#fff"]), size: rnd(o.s0 || 2, o.s1 || 6), decay: rnd(o.d0 || 0.01, o.d1 || 0.025) });
        }
      }
      function draw(p) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
        ctx.fillStyle = p.color;
        if (p.shape === "dot") { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); return; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        if (p.shape === "rect") { ctx.scale(1, Math.cos(p.rot * 3)); ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9); }
        else if (p.shape === "spark") { const s = p.size; ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.2, -s * 0.2, s, 0); ctx.quadraticCurveTo(s * 0.2, s * 0.2, 0, s); ctx.quadraticCurveTo(-s * 0.2, s * 0.2, -s, 0); ctx.quadraticCurveTo(-s * 0.2, -s * 0.2, 0, -s); ctx.fill(); }
        else if (p.shape === "coin") {
          const sx = Math.abs(Math.cos(p.rot * 2)) * 0.85 + 0.15;
          ctx.scale(sx, 1); ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fillStyle = "#b8760e"; ctx.fill();
          ctx.beginPath(); ctx.arc(0, 0, p.size * 0.8, 0, Math.PI * 2); ctx.fillStyle = "#fcc14a"; ctx.fill();
          ctx.fillStyle = "#fff6c8"; ctx.fillRect(-p.size * 0.15, -p.size * 0.5, p.size * 0.3, p.size);
        }
        ctx.restore();
      }
      function step() {
        ctx.clearRect(0, 0, W, Hh);
        for (let i = ps.length - 1; i >= 0; i--) {
          const p = ps[i];
          if (p.pull || p.swirl) { const [ox, oy] = O(), dx = ox - p.x, dy = oy - p.y, d = Math.hypot(dx, dy) || 1; p.vx += (dx / d) * p.pull - (dy / d) * p.swirl; p.vy += (dy / d) * p.pull + (dx / d) * p.swirl; }
          p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= p.decay;
          if (p.hue != null) { p.hue = (p.hue + 4) % 360; p.color = `hsl(${p.hue} 90% 75%)`; }
          if (p.life <= 0 || p.y > Hh + 40 || (p.pull > 0 && Math.hypot(O()[0] - p.x, O()[1] - p.y) < 10)) { ps.splice(i, 1); continue; }
          draw(p);
        }
        ctx.globalAlpha = 1;
        if (alive) raf = requestAnimationFrame(step);
      }
      raf = requestAnimationFrame(step);
      return {
        add, burst, rnd, W: () => W, H: () => Hh, cx: () => O()[0], cy: () => O()[1], clear: () => { ps.length = 0; },
        stop() { alive = false; cancelAnimationFrame(raf); removeEventListener("resize", size); ctx.clearRect(0, 0, W, Hh); },
      };
    }

    // particle shows, keyed by rarity; `at` is ms after the burst
    const SHOWS = {
      common: (P) => [[0, () => P.burst(34, { colors: COLORS.common, min: 1.5, max: 6, s0: 3, s1: 9, g: 0.04, drag: 0.94, d0: 0.012, d1: 0.022 })]],
      uncommon: (P) => [[0, () => P.burst(46, { colors: COLORS.uncommon, shape: "spark", min: 3, max: 10, s0: 3, s1: 7, drag: 0.95 })],
        [380, () => P.burst(30, { colors: COLORS.uncommon, shape: "rect", min: 2, max: 7, g: 0.12, lift: 3, s0: 3, s1: 5 })]],
      rare: (P) => [[0, () => P.burst(50, { colors: COLORS.rare, shape: "spark", min: 4, max: 12, s0: 3, s1: 7, drag: 0.95 })],
        [500, () => { for (let i = 0; i < 70; i++) P.add({ x: P.rnd(0, P.W()), y: P.rnd(-200, -10), vx: P.rnd(-1, 1), vy: P.rnd(1, 4), g: 0.05, drag: 0.995, decay: 0.004, shape: "rect", size: P.rnd(3, 6), color: COLORS.rare[i % 4], vr: P.rnd(-0.15, 0.15) }); }]],
      epic: (P) => [[-900, () => { for (let i = 0; i < 90; i++) { const a = P.rnd(0, Math.PI * 2), r = P.rnd(220, 480); P.add({ x: P.cx() + Math.cos(a) * r, y: P.cy() + Math.sin(a) * r, pull: 0.34, swirl: 0.22, drag: 0.94, decay: 0.004, shape: "spark", size: P.rnd(2, 5), color: COLORS.epic[i % 4] }); } }],
        [0, () => P.burst(90, { colors: COLORS.epic, shape: "spark", min: 5, max: 16, s0: 3, s1: 8, drag: 0.94 })],
        [250, () => P.burst(40, { colors: COLORS.epic, min: 2, max: 7, s0: 2, s1: 4, drag: 0.96 })]],
      legendary: (P) => [[0, () => P.burst(110, { colors: COLORS.legendary, shape: "spark", min: 5, max: 18, s0: 3, s1: 9, drag: 0.94 })],
        [200, () => { for (let i = 0; i < 80; i++) P.add({ x: P.rnd(0, P.W()), y: P.rnd(-400, -20), vx: P.rnd(-0.6, 0.6), vy: P.rnd(2, 5), g: 0.09, drag: 0.995, decay: 0.003, shape: "coin", size: P.rnd(6, 11), vr: P.rnd(0.03, 0.09) }); }],
        [1200, () => P.burst(50, { colors: COLORS.legendary, shape: "spark", min: 3, max: 9, s0: 2, s1: 5 })]],
      mythic: (P) => [[-200, () => { for (let i = 0; i < 160; i++) { const a = P.rnd(0, Math.PI * 2), r = P.rnd(60, 380); P.add({ x: P.cx() + Math.cos(a) * r, y: P.cy() + Math.sin(a) * r, swirl: 0.55, pull: 0.04, drag: 0.93, decay: 0.006, shape: i % 3 ? "dot" : "spark", size: P.rnd(1.5, 4), color: COLORS.mythic[i % 4] }); } }],
        [1100, () => P.burst(140, { colors: COLORS.mythic, shape: "spark", min: 6, max: 22, s0: 3, s1: 9, drag: 0.93 })],
        [1500, () => P.burst(60, { colors: COLORS.mythic, min: 2, max: 9, s0: 2, s1: 5 })]],
      secret: (P) => [[-1400, () => { for (let i = 0; i < 220; i++) { const a = P.rnd(0, Math.PI * 2), r = P.rnd(0, 40); P.add({ x: P.cx() + Math.cos(a) * r, y: P.cy() + Math.sin(a) * r, vx: Math.cos(a) * P.rnd(0.2, 2), vy: Math.sin(a) * P.rnd(0.2, 2), drag: 1.025, decay: 0.006, size: P.rnd(0.6, 2.2), color: "#fff" }); } }],
        [-300, () => { for (let i = 0; i < 140; i++) { const a = P.rnd(0, Math.PI * 2), r = P.rnd(140, 420); P.add({ x: P.cx() + Math.cos(a) * r, y: P.cy() + Math.sin(a) * r, swirl: 0.3, pull: 0.12, drag: 0.95, decay: 0.004, shape: "spark", size: P.rnd(2, 5), hue: P.rnd(180, 330) }); } }],
        [700, () => { for (let i = 0; i < 160; i++) { const a = P.rnd(0, Math.PI * 2), sp = P.rnd(4, 20); P.add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.94, decay: P.rnd(0.008, 0.02), shape: i % 2 ? "spark" : "dot", size: P.rnd(2, 8), hue: P.rnd(170, 340) }); } }],
        [1600, () => P.burst(70, { colors: COLORS.secret, shape: "spark", min: 2, max: 8, s0: 2, s1: 5 })]],
    };

    function start(pack, still) {
      const el = document.createElement("div");
      el.className = "po";
      el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Opening " + pack.name);
      el.innerHTML = `<canvas class="po-fx"></canvas><div class="po-flash"></div>
        <div class="po-stage">
          <div class="po-glow"></div><div class="po-rays"></div><div class="po-beam"></div><div class="po-vortex"></div><div class="po-rift"></div>
          <div class="po-rings"><i></i><i></i><i></i></div>
          <div class="po-packwrap">${packArt(pack, "po-pk")}</div>
          <div class="po-bagel"></div>
        </div>
        <div class="po-title" aria-live="polite"></div>
        <div class="po-card"></div>
        <button class="po-skip" type="button">Skip</button>`;
      document.body.appendChild(el);
      document.body.classList.add("po-open");
      const stage = el.querySelector(".po-stage");
      const P = still ? null : fx(el.querySelector(".po-fx"), () => { const r = stage.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      const timers = [], later = (ms, fn) => timers.push(setTimeout(fn, ms));
      const cls = (c, on = true) => el.classList.toggle(c, on);
      const t0 = Date.now();
      if (!still) { later(450, () => cls("shake1")); later(850, () => { cls("shake1", false); cls("shake2"); }); later(1250, () => { cls("shake2", false); cls("shake3"); }); }
      let finished = false, onKey = null;
      function close() {
        timers.forEach(clearTimeout);
        if (P) P.stop();
        if (onKey) document.removeEventListener("keydown", onKey);
        el.classList.add("out");
        document.body.classList.remove("po-open");
        setTimeout(() => el.remove(), 260);
      }
      return {
        cancel: close,
        reveal(res, act) {
          const a = Avatars.get(res.id), r = Avatars.rarity(a.rarity), rk = a.rarity;
          el.style.setProperty("--rc", r.color);
          el.querySelector(".po-bagel").innerHTML = Avatars.img(res.id, "po-av");
          el.querySelector(".po-title").innerHTML = `<span data-text="${esc(r.label)}">${esc(r.label)}</span>`;
          el.querySelector(".po-card").innerHTML = act.preview
            ? `<b class="po-name">${esc(a.name)}</b>
              <span class="po-meta"><span class="po-dup">Preview · nothing spent or given</span><span class="po-rar">${esc(r.label)} · ${r.odds}%</span></span>
              <div class="po-btns"><button class="btn primary" data-act="again">${icon("play")} Replay</button>
                <button class="btn ghost" data-act="done">Done</button></div>`
            : `<b class="po-name">${esc(a.name)}</b>
              <span class="po-meta">${res.isNew ? `<span class="po-new">New!</span>` : `<span class="po-dup">You have ${res.count}</span>`}<span class="po-rar">${esc(r.label)} · ${r.odds}%</span></span>
              <div class="po-btns"><button class="btn primary" data-act="equip">${icon("check")} Equip</button>
                <button class="btn ghost" data-act="again"${act.canAgain() ? "" : " disabled"}>${icon("shop")} Open another · ${act.price} BB</button>
                <button class="btn ghost" data-act="done">Done</button></div>`;
          const finish = () => {
            if (finished) return; finished = true;
            timers.forEach(clearTimeout);
            el.classList.remove("shake1", "shake2", "shake3");
            el.classList.add("burst", "reveal", "show-bagel", "show-title", "done");
            el.querySelector(".po-skip").hidden = true;
            const first = el.querySelector('[data-act="equip"]'); if (first) setTimeout(() => first.focus(), 60);
          };
          el.querySelectorAll("[data-act]").forEach((b) => { b.onclick = () => {
            const k = b.dataset.act; close();
            if (k === "again") act.again(); else { if (k === "equip") act.equip(); act.done(); }
          }; });
          el.querySelector(".po-skip").onclick = finish;
          el.addEventListener("click", (e) => { if (!finished && !e.target.closest(".po-card")) finish(); });
          onKey = (e) => { if (e.key === "Escape") { if (!finished) finish(); else { close(); act.done(); } } };
          document.addEventListener("keydown", onKey);
          if (still) { el.classList.add("r-" + rk); finish(); return; }
          // the burst waits for the shaking to finish (and at least one beat after the roll)
          const shake = Math.max(0, 1650 - (Date.now() - t0));
          const pre = { epic: 900, mythic: 200, secret: 1400 }[rk] || 0;
          later(shake, () => {
            cls("r-" + rk); cls("tease", Avatars.rarity(rk).tier >= 3);
            later(pre, () => {
              cls("shake3", false); cls("burst");
              SHOWS[rk](P).filter(([at]) => at >= 0).forEach(([at, fn]) => later(at, fn));
              later(120, () => cls("reveal"));
              later({ common: 120, uncommon: 160, rare: 260, epic: 120, legendary: 420, mythic: 900, secret: 700 }[rk], () => cls("show-bagel"));
              later(T[rk] - 500, () => cls("show-title"));
              later(T[rk], finish);
            });
          });
          // effects that start before the burst (charge-ups) are scheduled relative to it
          later(shake, () => SHOWS[rk](P).filter(([at]) => at < 0).forEach(([at, fn]) => later(pre + at, fn)));
        },
      };
    }
    return { start };
  })();

  return { init, page, refresh, admin, preview, bbMult, equipped: () => equipped(), BOOSTS };
})();

window.ShopUI = ShopUI;
