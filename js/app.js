/* =============================================================================
   app.js  —  Bagel Bytes Scouting (FRC 702) — router + all views
   ========================================================================== */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (name, cls = "ico") => `<svg class="${cls}" aria-hidden="true"><use href="#ic-${name}"/></svg>`;
  const fmt = (n, d = 1) => (n == null || isNaN(n)) ? "–" : Number(n).toFixed(d).replace(/\.0$/, "");
  // The scout's name is always the logged-in user (no manual field anymore).
  function scoutDisplayName() {
    const u = (window.Auth && Auth.currentUser && Auth.currentUser()) || null;
    return u ? `${u.first || ""} ${u.last || ""}`.trim() : (Store.getSettings().scoutName || "");
  }

  const view = $("#view");
  const app = $("#app");

  /* ---- Toast --------------------------------------------------------------- */
  function toast(msg, type = "ok") {
    const wrap = $("#toasts");
    const t = document.createElement("div");
    t.className = "toast " + (type === "err" ? "err" : type === "ok" ? "ok" : "");
    t.innerHTML = `${type === "err" ? icon("x") : icon("check")}<span>${esc(msg)}</span>`;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 250); }, 2600);
  }

  /* ---- Global scout popup (cloud activity feed) ---------------------------- */
  // Shows briefly (≤5s) whenever ANY scout on the team saves a match/pit record.
  function scoutPopup(a) {
    if (!a) return;
    let wrap = $("#scoutPops");
    if (!wrap) { wrap = document.createElement("div"); wrap.id = "scoutPops"; wrap.className = "scout-pops"; document.body.appendChild(wrap); }
    const name = a.scouterName || "Someone";
    const kind = a.type === "pit" ? "pit-scouted" : "scouted";
    const where = a.type === "match" && a.matchNumber ? ` in Q${esc(a.matchNumber)}` : "";
    const bb = a.bb ? `<span class="sp-bb">+${a.bb} ${BB}</span>` : "";
    const el = document.createElement("div");
    el.className = "scout-pop";
    el.innerHTML = `<span class="sp-ico">${icon(a.type === "pit" ? "clipboard" : "binoculars")}</span>
      <span class="sp-text"><b>${esc(name)}</b> ${kind} <b>Team ${esc(a.team || "?")}</b>${where}</span>${bb}`;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 5000);
  }

  /* ---- Modal --------------------------------------------------------------- */
  function modal(title, bodyHTML, onMount) {
    const root = $("#modalRoot");
    root.innerHTML = `
      <div class="modal-back" id="mback">
        <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <div class="modal-head"><h2>${esc(title)}</h2>
            <button class="x" id="mclose" aria-label="Close">${icon("x")}</button></div>
          <div class="modal-body">${bodyHTML}</div>
        </div>
      </div>`;
    const close = () => { root.innerHTML = ""; };
    $("#mclose").onclick = close;
    $("#mback").onclick = (e) => { if (e.target.id === "mback") close(); };
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", onEsc); }
    });
    if (onMount) onMount($(".modal-body", root), close);
    return close;
  }

  function confirmDialog(msg, onYes) {
    modal("Confirm", `<p>${esc(msg)}</p>
      <div class="btn-row" style="justify-content:flex-end;margin-top:16px">
        <button class="btn ghost" id="cno">Cancel</button>
        <button class="btn danger" id="cyes">Confirm</button></div>`,
      (body, close) => { $("#cno").onclick = close; $("#cyes").onclick = () => { close(); onYes(); }; });
  }

  /* ---- Square photo cropper (movable + resizable crop box, then confirm) ---- */
  function cropImageDialog(file, onConfirm) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); toast("Couldn't read that image", "err"); };
    img.onload = () => {
      const OUT = 320; // output square resolution (px)
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      modal("Crop photo", `
        <p class="hint" style="margin-top:0">Drag the box to move it, drag a corner to resize it, then confirm.</p>
        <div class="crop-stage" id="cropStage">
          <img id="cropImg" alt="" draggable="false" />
          <div class="crop-box" id="cropBox">
            <span class="crop-handle nw" data-h="nw"></span><span class="crop-handle ne" data-h="ne"></span>
            <span class="crop-handle sw" data-h="sw"></span><span class="crop-handle se" data-h="se"></span>
          </div>
        </div>
        <div class="btn-row" style="margin-top:14px;justify-content:flex-end">
          <button class="btn ghost" id="cropCancel">Cancel</button>
          <button class="btn primary" id="cropOk">${icon("check")} Confirm</button>
        </div>`, (body, close) => {
        const stage = $("#cropStage", body), imgEl = $("#cropImg", body), boxEl = $("#cropBox", body);
        imgEl.src = url;
        // Fit the whole image into a display area (no letterboxing: the stage is
        // sized to the fitted image, so box coords map straight to source px).
        const maxW = Math.min(360, (window.innerWidth || 360) * 0.78);
        const maxH = Math.min(340, (window.innerHeight || 500) * 0.5);
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const dispW = Math.round(img.width * scale), dispH = Math.round(img.height * scale);
        stage.style.width = dispW + "px"; stage.style.height = dispH + "px";
        const minSize = Math.min(48, dispW, dispH);
        // start: largest centered square
        let bs = Math.min(dispW, dispH), bx = (dispW - bs) / 2, by = (dispH - bs) / 2;
        const apply = () => { boxEl.style.left = bx + "px"; boxEl.style.top = by + "px"; boxEl.style.width = bs + "px"; boxEl.style.height = bs + "px"; };
        apply();

        let mode = null, hnd = null, sx = 0, sy = 0, sbx = 0, sby = 0, ax = 0, ay = 0;
        const ptr = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
        stage.addEventListener("pointerdown", (e) => {
          const isHandle = e.target.classList && e.target.classList.contains("crop-handle");
          const inBox = e.target === boxEl || (e.target.closest && e.target.closest("#cropBox"));
          if (!isHandle && !inBox) return;
          e.preventDefault();
          try { stage.setPointerCapture(e.pointerId); } catch {}
          const p = ptr(e); sx = p.x; sy = p.y; sbx = bx; sby = by;
          if (isHandle) {
            mode = "resize"; hnd = e.target.dataset.h;
            // anchor = the corner OPPOSITE the grabbed handle (it stays fixed)
            ax = hnd.includes("e") ? bx : bx + bs;
            ay = hnd.includes("s") ? by : by + bs;
          } else { mode = "move"; }
        });
        stage.addEventListener("pointermove", (e) => {
          if (!mode) return;
          const p = ptr(e);
          if (mode === "move") {
            bx = clamp(sbx + (p.x - sx), 0, dispW - bs);
            by = clamp(sby + (p.y - sy), 0, dispH - bs);
          } else {
            const dirX = hnd.includes("e") ? 1 : -1, dirY = hnd.includes("s") ? 1 : -1;
            const maxSize = Math.min(dirX > 0 ? dispW - ax : ax, dirY > 0 ? dispH - ay : ay);
            const desired = Math.max(dirX * (p.x - ax), dirY * (p.y - ay));
            bs = clamp(desired, minSize, maxSize);
            bx = dirX > 0 ? ax : ax - bs;
            by = dirY > 0 ? ay : ay - bs;
          }
          apply();
        });
        const up = () => { mode = null; };
        stage.addEventListener("pointerup", up);
        stage.addEventListener("pointercancel", up);

        $("#cropCancel", body).onclick = () => { URL.revokeObjectURL(url); close(); };
        $("#cropOk", body).onclick = () => {
          let dataUrl = "";
          try {
            const canvas = document.createElement("canvas");
            canvas.width = OUT; canvas.height = OUT;
            const inv = img.width / dispW; // display px → source px
            canvas.getContext("2d").drawImage(img, bx * inv, by * inv, bs * inv, bs * inv, 0, 0, OUT, OUT);
            dataUrl = canvas.toDataURL("image/jpeg", 0.72);
          } catch { dataUrl = ""; }
          URL.revokeObjectURL(url);
          close();
          if (dataUrl) onConfirm(dataUrl); else toast("Couldn't process that image", "err");
        };
      });
    };
    img.src = url;
  }

  /* ---- Field rendering (shared by match & pit forms) ----------------------- */
  function renderField(f, val) {
    const help = f.help ? `<span class="help">${esc(f.help)}</span>` : "";
    let control = "";
    switch (f.type) {
      case "bool": {
        const on = !!val;
        control = `<label class="switch"><input type="checkbox" ${on ? "checked" : ""}
          aria-label="${esc(f.label)}"><span class="slider"></span></label>`;
        return `<div class="field bool-field" data-key="${f.key}" data-type="bool">
          <label>${esc(f.label)}</label>${help}${control}</div>`;
      }
      case "counter": {
        const v = Number(val || 0);
        control = `<div class="counter" data-val="${v}">
          <button type="button" data-step="-1" aria-label="Decrease ${esc(f.label)}">−</button>
          <input class="count" type="number" inputmode="numeric" min="${f.min != null ? f.min : 0}" value="${v}" aria-label="${esc(f.label)}" />
          <button type="button" data-step="1" aria-label="Increase ${esc(f.label)}">+</button></div>`;
        break;
      }
      case "rating": {
        const max = f.max || 5, v = Number(val || 0);
        let stars = "";
        for (let i = 1; i <= max; i++)
          stars += `<button type="button" class="star ${i <= v ? "on" : ""}" data-idx="${i}"
            aria-label="${i} of ${max}">${icon("star", "ico")}</button>`;
        control = `<div class="rating" data-val="${v}">${stars}</div>`;
        break;
      }
      case "select": {
        control = `<select aria-label="${esc(f.label)}">` +
          f.options.map((o) => `<option ${String(val) === String(o) ? "selected" : ""}>${esc(o)}</option>`).join("") +
          `</select>`;
        break;
      }
      case "number":
        control = `<input type="number" ${f.min != null ? `min="${f.min}"` : ""} value="${val ?? ""}" inputmode="numeric" />`;
        break;
      case "text":
        control = `<textarea placeholder="${esc(f.placeholder || "")}">${esc(val || "")}</textarea>`;
        break;
      default:
        control = `<input type="text" value="${esc(val || "")}" />`;
    }
    return `<div class="field" data-key="${f.key}" data-type="${f.type}">
      <label>${esc(f.label)}</label>${help}${control}</div>`;
  }

  function wireFields(container) {
    // counters (± buttons AND a typeable number field)
    $$(".counter", container).forEach((c) => {
      const inp = c.querySelector(".count");
      const set = (v) => { v = Math.max(0, Math.floor(Number(v) || 0)); c.dataset.val = v; if (inp) inp.value = v; };
      c.querySelectorAll("button").forEach((b) => {
        b.onclick = () => set(Number(c.dataset.val || 0) + Number(b.dataset.step));
      });
      if (inp) {
        inp.oninput = () => { c.dataset.val = Math.max(0, Math.floor(Number(inp.value) || 0)); };
        inp.onblur = () => set(inp.value); // normalise (e.g. empty → 0) when they leave the field
      }
    });
    // ratings (tap same star to clear)
    $$(".rating", container).forEach((r) => {
      r.querySelectorAll(".star").forEach((s) => {
        s.onclick = () => {
          const idx = Number(s.dataset.idx);
          let v = Number(r.dataset.val || 0);
          v = (v === idx) ? idx - 1 : idx;
          r.dataset.val = v;
          r.querySelectorAll(".star").forEach((x) =>
            x.classList.toggle("on", Number(x.dataset.idx) <= v));
        };
      });
    });
  }

  function readForm(container) {
    const out = {};
    $$("[data-key]", container).forEach((wrap) => {
      const key = wrap.dataset.key, type = wrap.dataset.type;
      if (type === "bool") out[key] = wrap.querySelector("input[type=checkbox]").checked;
      else if (type === "counter") { const c = wrap.querySelector(".counter"), inp = c.querySelector(".count"); out[key] = Math.max(0, Math.floor(Number((inp ? inp.value : c.dataset.val)) || 0)); }
      else if (type === "rating") out[key] = Number(wrap.querySelector(".rating").dataset.val || 0);
      else if (type === "select") out[key] = wrap.querySelector("select").value;
      else if (type === "number") { const v = wrap.querySelector("input").value; out[key] = v === "" ? null : Number(v); }
      else if (type === "text") out[key] = wrap.querySelector("textarea").value.trim();
      else out[key] = wrap.querySelector("input").value.trim();
    });
    return out;
  }

  /* ---- Event / team helpers ----------------------------------------------- */
  function eventTeams() {
    const s = Store.getSettings();
    if (!s.eventKey) return [];
    const c = Store.getCache("teams." + s.eventKey, null);
    return c ? c.data : [];
  }
  function teamName(num) {
    const t = eventTeams().find((t) => String(t.team_number) === String(num));
    if (t) return t.nickname || t.name || "";
    const pit = allPits()[num];
    return pit && pit.nickname ? pit.nickname : "";
  }
  function allScoutedTeams() {
    // union of teams appearing in match data + pit data (cloud + local, whole team)
    const set = new Set();
    allMatches().forEach((m) => set.add(String(m.team)));
    Object.keys(allPits()).forEach((t) => set.add(String(t)));
    return [...set].filter(Boolean).sort((a, b) => Number(a) - Number(b));
  }

  /* ---- Stats aggregation --------------------------------------------------- */
  function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  function computeStats(team) {
    const ms = allMatches().filter((m) => String(m.team) === String(team));
    const n = ms.length;
    const cyclesOf = (m) => Number(m.autoCycles || 0) + Number(m.teleCycles || 0) + Number(m.teleCycles2 || 0) + Number(m.transCycles || 0) + Number(m.endCycles || 0);
    return {
      team, matches: n,
      avgCycles: avg(ms.map(cyclesOf)),
      avgBps: avg(ms.map((m) => Number(m.bps || 0))),
      avgFouls: avg(ms.map((m) => Number(m.fouls || 0))),
      defenseRate: n ? ms.filter((m) => m.playedDefense || m.playedDefense2 || m.endPlayedDefense).length / n : 0,
      diedRate: n ? ms.filter((m) => m.diedOrTipped).length / n : 0,
      avgDriver: avg(ms.map((m) => Number(m.driverSkill || 0)).filter((x) => x > 0)),
    };
  }

  /* ---- Test event (admin) -------------------------------------------------- */
  // A practice event that mirrors CA Glendale (same teams) with a synthesized
  // qualification schedule. The admin controls which qual is "about to start";
  // earlier quals are marked played, later ones upcoming. Everything lives in
  // the normal cache namespace so live mode, the match page and BagelStats all
  // treat it like a real event.
  const TEST_EVENT_KEY = "2026test";
  const TEST_EVENT_SRC = "2026cagle";
  const TEST_EVENT_NAME = "TEST · CA Glendale";
  const TEST_MATCH_ITV = 480; // seconds between quals (8 min)

  // Round-robin-ish schedule: 6 distinct teams per qual, ~one appearance each
  // per pass through the roster. Returns unplayed qual match stubs.
  function synthSchedule(teamNums) {
    const T = teamNums.length;
    if (T < 6) return [];
    // A real qual schedule gives each team ~12 matches, so total quals ≈ teams×12/6
    // = teams×2 (e.g. 37 teams → 74 quals). Cap kept generous for big events.
    const Q = Math.min(160, Math.max(12, T * 2));
    const quals = [];
    let idx = 0;
    for (let i = 0; i < Q; i++) {
      const picks = [], used = new Set();
      let guard = 0;
      while (picks.length < 6 && guard < T * 3) {
        const t = teamNums[idx % T]; idx++; guard++;
        if (!used.has(t)) { used.add(t); picks.push(t); }
      }
      quals.push({
        comp_level: "qm", match_number: i + 1,
        alliances: {
          red: { team_keys: picks.slice(0, 3).map((n) => "frc" + n) },
          blue: { team_keys: picks.slice(3, 6).map((n) => "frc" + n) },
        },
      });
    }
    return quals;
  }

  // Build (or rebuild) the test event from the source event's team list.
  async function buildTestEvent() {
    let teams = [];
    try { teams = (await API.getEventTeams(TEST_EVENT_SRC)).teams || []; }
    catch (e) { const c = Store.getCache("teams." + TEST_EVENT_SRC, null); teams = c ? c.data : []; }
    if (!teams || teams.length < 6) {
      throw new Error("Load CA Glendale (2026cagle) once with wifi first — its team list isn't cached yet.");
    }
    const quals = synthSchedule(teams.map((t) => t.team_number));
    Store.setCache("teams." + TEST_EVENT_KEY, { data: teams, ts: Date.now() });
    Store.setCache("testTemplate", { data: quals, ts: Date.now() });
    Store.setSettings({ testEvent: { currentQual: 1, total: quals.length, teams: teams.length, srcName: "CA Glendale", cloud: Cloud.enabled() } });
    applyTestTime(1);
    // Share it with the whole team so everyone rehearses on the same event.
    if (window.Cloud && Cloud.enabled()) {
      lastTestEventTs = Date.now();
      Cloud.pushTestEvent({ teams, template: quals, currentQual: 1, total: quals.length, srcName: "CA Glendale" });
    }
  }

  // Re-derive the test event's cached matches so qual N is "about to start":
  // quals < N are played (deterministic scores), quals >= N are upcoming.
  function applyTestTime(n) {
    const tpl = Store.getCache("testTemplate", null);
    const quals = tpl ? tpl.data : [];
    if (!quals.length) return;
    const total = quals.length;
    n = Math.max(1, Math.min(total + 1, Number(n) || 1));
    const now = Math.floor(Date.now() / 1000);
    const seeded = (mn) => 30 + ((mn * 37 + 13) % 90); // stable 30..119
    const data = quals.map((q) => {
      const mn = q.match_number;
      const m = {
        comp_level: "qm", match_number: mn,
        alliances: {
          red: { team_keys: q.alliances.red.team_keys.slice() },
          blue: { team_keys: q.alliances.blue.team_keys.slice() },
        },
      };
      if (mn < n) {
        m.alliances.red.score = seeded(mn);
        m.alliances.blue.score = seeded(mn * 7 + 3);
        m.actual_time = m.time = now - (n - mn) * TEST_MATCH_ITV;
      } else {
        m.alliances.red.score = -1;
        m.alliances.blue.score = -1;
        m.predicted_time = m.time = now + (mn - n) * TEST_MATCH_ITV + 120;
      }
      return m;
    });
    Store.setCache("matches." + TEST_EVENT_KEY, { data, ts: Date.now() });
    const te = Store.getSettings().testEvent || {};
    Store.setSettings({ testEvent: { ...te, currentQual: n, total } });
  }

  // Mirror the cloud-shared test event onto THIS device (teams + schedule + current
  // qual), so the whole team rehearses on the same synthetic event. Returns true
  // when something changed (so the caller can re-render). No-op when cloud is off.
  let lastTestEventTs = 0;      // updatedAt of the cloud test event we last applied
  let cloudTestSeen = false;    // have we ever applied a cloud test event this session?
  function applyCloudTestEvent() {
    if (!(window.Cloud && Cloud.enabled && Cloud.enabled())) return false;
    const cte = Cloud.getTestEvent && Cloud.getTestEvent();
    if (cte && Array.isArray(cte.template) && cte.template.length && Array.isArray(cte.teams) && cte.teams.length) {
      cloudTestSeen = true;
      if (cte.updatedAt && cte.updatedAt === lastTestEventTs) return false; // already applied
      lastTestEventTs = cte.updatedAt || Date.now();
      Store.setCache("teams." + TEST_EVENT_KEY, { data: cte.teams, ts: Date.now() });
      Store.setCache("testTemplate", { data: cte.template, ts: Date.now() });
      Store.setSettings({ testEvent: { currentQual: cte.currentQual || 1, total: cte.total || cte.template.length,
        teams: cte.teams.length, srcName: cte.srcName || "CA Glendale", cloud: true } });
      applyTestTime(cte.currentQual || 1);
      return true;
    }
    // Cloud test event was deleted → remove it locally too (only if we'd synced one).
    if (cloudTestSeen) {
      cloudTestSeen = false; lastTestEventTs = 0;
      const wasActive = Store.getSettings().eventKey === TEST_EVENT_KEY;
      Store.setSettings({ testEvent: null });
      Store.setCache("matches." + TEST_EVENT_KEY, null);
      Store.setCache("teams." + TEST_EVENT_KEY, null);
      Store.setCache("testTemplate", null);
      if (wasActive) Store.setSettings({ eventKey: "", eventName: "" });
      return true;
    }
    return false;
  }

  /* ---- Bagel Bucks gating -------------------------------------------------- */
  // An event is "live" when today falls inside its date range (from the cached
  // event list), or — as a fallback — when it has both played & unplayed matches.
  function eventIsLive() {
    const s = Store.getSettings();
    if (!s.eventKey) return false;
    // The admin test event is always "live" while it exists.
    if (s.eventKey === TEST_EVENT_KEY && s.testEvent) return true;
    const evc = Store.getCache("events." + GAME.season, null);
    const evs = evc ? evc.data : [];
    const e = Array.isArray(evs) ? evs.find((x) => x.key === s.eventKey) : null;
    const today = new Date().toISOString().slice(0, 10);
    if (e && e.start_date && e.end_date) return e.start_date <= today && today <= e.end_date;
    const c = Store.getCache("matches." + s.eventKey, null);
    const ms = c ? c.data : [];
    const scored = (m) => m.alliances && m.alliances.red.score >= 0 && m.alliances.blue.score >= 0;
    const played = ms.filter(scored).length, total = ms.length;
    return total > 0 && played > 0 && played < total;
  }
  // Admin approval is the single control: once the admin approves an event, EVERY
  // scout earns BB for it (on any device) until the admin turns it off. (Previously
  // this also required per-device "is live" detection, which could silently block
  // some scouts' earnings.)
  function canEarnBB() {
    const ek = Store.getSettings().eventKey;
    return !!ek && Store.isBBApproved(ek);
  }
  // Mirror my local BB to the authoritative cloud total. Returns true if it changed.
  function reconcileBB() {
    if (!(window.Cloud && Cloud.enabled && Cloud.enabled())) return false;
    const me = Store.getMe();
    const cm = (Cloud.getScouters() || []).find((s) => s.id === me.id);
    if (cm && typeof cm.bb === "number" && cm.bb !== (me.bb || 0)) { Store.setMe({ bb: cm.bb }); return true; }
    return false;
  }
  let pitPageRefresh = null; // set by renderPit; lets cloud updates refresh the pit list+map live
  const BB = "BB";

  // Cloud module is optional; fall back to safe no-ops if cloud.js is absent.
  const Cloud = window.Cloud || {
    enabled: () => false, init() {}, syncMe() {}, heartbeat() {},
    pushMatches() {}, pushPits() {}, pushPicklist() {}, pushTierlist() {},
    pushMatchForm() {}, pushPitForm() {}, clearMatchForm() {}, clearPitForm() {}, pushRoster() {},
    pushBBApproved() {}, pushAccessRequest() {}, addBB() {}, setBBValue() {},
    pushClaim() {}, releaseClaim() {}, releaseMyClaims() {}, getClaims: () => [],
    pushActivity() {}, onActivity() {},
    pushTestEvent() {}, pushTestQual() {}, clearTestEvent() {}, getTestEvent: () => null,
    deleteScouter: () => Promise.reject(new Error("cloud off")),
    getMatchForm: () => null, getPitForm: () => null, getRoster: () => null,
    clearAllScoutingData: () => Promise.reject(new Error("cloud off")),
    getScouters: () => [], getSharedBoards: () => [], getSharedTierlists: () => [],
    getAllMatches: () => null, getAllPits: () => null,
    onChange() {},
  };

  // Combined local + cloud records (local wins on conflict). Falls back to local
  // when cloud is off, so every view keeps working offline.
  function allMatches() {
    const local = Store.getMatches();
    const cloud = Cloud.getAllMatches ? Cloud.getAllMatches() : null;
    if (!cloud || !cloud.length) return local;
    const map = new Map(cloud.filter((m) => m && m.id).map((m) => [m.id, m]));
    local.forEach((m) => { if (m && m.id) map.set(m.id, m); });
    return [...map.values()];
  }
  function allPits() {
    const local = Store.getPits();
    const cloud = Cloud.getAllPits ? Cloud.getAllPits() : null;
    if (!cloud || !cloud.length) return local;
    const merged = {};
    cloud.forEach((p) => { if (p && p.team != null) merged[String(p.team)] = p; });
    Object.keys(local).forEach((k) => { merged[k] = local[k]; }); // local overrides
    return merged;
  }

  // Everyone we know about: cloud roster if available, otherwise just me.
  // Raw list — one entry per scouter *id* (may include legacy duplicates of the
  // same person from before deterministic ids). Used by the admin cleanup tool.
  function allScoutersRaw() {
    const me = Store.getMe();
    const byId = new Map();
    // every account that has logged in on THIS device (or arrived via an imported
    // backup) — so the leaderboard works on a shared device even fully offline
    Object.values(Store.getMeAccounts() || {}).forEach((s) => { if (s && s.id) byId.set(s.id, s); });
    // cloud records (the whole team) augment / override the local ones
    (Cloud.getScouters() || []).forEach((s) => { if (s && s.id) byId.set(s.id, { ...(byId.get(s.id) || {}), ...s }); });
    // my own record is authoritative + online
    byId.set(me.id, { ...(byId.get(me.id) || {}), ...me, online: true });
    return [...byId.values()];
  }
  // Display list — collapse any duplicate accounts that share a name into ONE
  // entry so the leaderboard / scouters list never shows the same person twice.
  function allScouters() {
    const byName = new Map();
    allScoutersRaw().forEach((s) => {
      const key = Store.nameKey(s.first, s.last);
      const cur = byName.get(key);
      if (!cur) { byName.set(key, { ...s, id: Store.scouterIdFor(s.first, s.last) }); return; }
      cur.bb = Math.max(cur.bb || 0, s.bb || 0);
      cur.matchCount = Math.max(cur.matchCount || 0, s.matchCount || 0);
      cur.pitCount = Math.max(cur.pitCount || 0, s.pitCount || 0);
      if (!cur.profilePic && s.profilePic) cur.profilePic = s.profilePic;
      if (!(cur.lastMatchTeams || []).length) cur.lastMatchTeams = s.lastMatchTeams || [];
      if (!(cur.lastPitTeams || []).length) cur.lastPitTeams = s.lastPitTeams || [];
      const teams = new Set([...(cur.pitScoutedTeams || []), ...(s.pitScoutedTeams || [])]);
      cur.pitScoutedTeams = [...teams];
      cur.lastSeen = Math.max(cur.lastSeen || 0, s.lastSeen || 0);
      cur.online = cur.online || s.online;
    });
    return [...byName.values()];
  }
  function scouterName(sc) { return `${sc.first || ""} ${sc.last || ""}`.trim() || "Unnamed scout"; }
  function isOnline(sc) {
    if (sc.online) return true;
    if (!sc.lastSeen) return false;
    return (Date.now() - sc.lastSeen) < 90 * 1000; // seen in the last 90s
  }
  // 702 bagel icon shown for any account without a custom photo — the default
  // profile picture for new accounts and everyone who hasn't uploaded their own.
  const DEFAULT_PFP = "media/702def.png";
  function scouterAvatar(sc, cls = "sc-avatar") {
    return `<img class="${cls}" src="${(sc && sc.profilePic) || DEFAULT_PFP}" alt="" />`;
  }

  /* ===========================================================================
     ROUTER
     ======================================================================== */
  const routes = {
    dashboard: { title: "Dashboard", render: renderDashboard },
    members: { title: "Members", render: renderMembers },
    teams: { title: "Events", render: renderEventsPage },
    match: { title: "Match Scouting", render: renderMatch },
    pit: { title: "Pit Scouting", render: renderPit },
    bagelstats: { title: "BagelStats", render: renderBagelStats },
    compare: { title: "Compare", render: renderCompare },
    matchup: { title: "Matchup", render: renderMatchup },
    picklist: { title: "Pick List", render: renderPicklist },
    data: { title: "Data", render: renderData },
    team: { title: "Team", render: renderTeamPage, navAs: "teams" },
    admin: { title: "Admin Panel", render: renderAdmin },
    settings: { title: "Settings", render: renderSettings },
  };

  function go(route) {
    if (!routes[route]) route = "dashboard";
    location.hash = "#/" + route;
  }
  function current() { return (location.hash.replace(/^#\/?/, "") || "dashboard").split("/")[0]; }

  let prevRoute = null;
  function router() {
    const r = current();
    // Leaving the match page drops my robot claim so it doesn't keep locking that
    // robot for everyone else (and so coming back + picking again doesn't double up).
    if (prevRoute === "match" && r !== "match" && window.Cloud) Cloud.releaseMyClaims();
    prevRoute = r;
    const route = routes[r] || routes.dashboard;
    $("#pageTitle").textContent = route.title;
    $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === (route.navAs || r)));
    app.classList.remove("nav-open");
    document.body.classList.remove("nav-lock");
    view.innerHTML = "";
    route.render(view);
    view.focus();
    refreshChrome();
  }

  function refreshChrome() {
    const s = Store.getSettings();
    const u = Auth.currentUser();
    $("#scoutTag").innerHTML = u ? `Signed in: <b>${esc(u.first)} ${esc(u.last)}</b>`
      : (s.scoutName ? `Scout: <b>${esc(s.scoutName)}</b>` : "");
    const altSeason = GAME.season !== (Number(window.CONFIG && CONFIG.defaultSeason) || 2026);
    $("#eventChip").innerHTML = `<span class="ec-season${altSeason ? " alt" : ""}">${esc(GAME.seasonLabel)}</span>` +
      (s.eventName ? `<b>${esc(s.eventName)}</b>` : `No event selected`);
    const themeBtn = $("#themeToggle");
    const dark = document.documentElement.getAttribute("data-theme") !== "light";
    themeBtn.querySelector("use").setAttribute("href", dark ? "#ic-moon" : "#ic-sun");
    // pending access-request badge on the Admin nav item
    const badge = $("#reqBadge");
    if (badge) {
      const n = Object.keys(Store.getRequests()).length;
      badge.hidden = !n; badge.textContent = n || "";
    }
    // user chip in sidebar foot
    const chip = $("#userChip");
    if (chip) { chip.hidden = !u; if (u) $("#userChipName").textContent = `${u.first} ${u.last}`; }
  }

  /* ---- Event selection (shared by dashboard, sidebar chip, settings) ------- */
  async function selectEvent(key, name) {
    Store.setSettings({ eventKey: key, eventName: name });
    refreshChrome();
    toast("Loading team list & schedule…");
    try {
      await API.getEventTeams(key);
      await API.getEventMatches(key);
      API.getTeamColors(eventTeams().map((t) => t.team_number));
      toast(`Event set: ${name}`);
    } catch (e) { toast("Event set — team list needs wifi to load", "err"); }
    router(); // re-render current view with the new event
  }

  function openEventPicker() {
    const year = GAME.season;
    const s = Store.getSettings();
    modal("Choose event", `
      <p class="hint">Pick your event to load its team list & match schedule (cached for offline use at the venue).</p>
      ${s.eventName ? `<div class="row between" style="margin-bottom:12px"><span class="badge yellow dot">Current: ${esc(s.eventName)}</span></div>` : ""}
      <input type="search" id="epFilter" placeholder="Filter by name, city, or code…" style="margin-bottom:12px" />
      <div id="epList"><div class="empty">${icon("calendar")}<p class="muted">Loading ${year} events…</p></div></div>`,
      (body, close) => {
        let events = [];
        const today = new Date().toISOString().slice(0, 10);
        const isLive = (e) => e.start_date && e.end_date && e.start_date <= today && today <= e.end_date;
        const isPinned = (e) => (Store.getSettings().pinnedEvents || []).includes(e.key);
        const draw = (filter = "") => {
          const f = filter.trim().toLowerCase();
          const list = events.filter((e) => !f || (e.name || "").toLowerCase().includes(f) ||
            (e.city || "").toLowerCase().includes(f) || (e.key || "").toLowerCase().includes(f))
            .sort((a, b) => (isPinned(b) - isPinned(a)) || (isLive(b) - isLive(a)) || (a.start_date || "").localeCompare(b.start_date || ""))
            .slice(0, 80);
          const el = $("#epList", body);
          // Shared/local test event appears at the very top so any device can pick it.
          const te = (window.Cloud && Cloud.enabled() && Cloud.getTestEvent()) || Store.getSettings().testEvent;
          const teN = te ? (Array.isArray(te.teams) ? te.teams.length : (te.teams || "?")) : 0;
          const teRow = te && (!f || TEST_EVENT_NAME.toLowerCase().includes(f) || "test".includes(f)) ? `
            <div class="ep-row live pinned">
              <button class="ep-item" data-ev="${TEST_EVENT_KEY}" data-name="${esc(TEST_EVENT_NAME)}">
                <span class="ep-name"><span class="badge green dot">TEST</span> ${esc(TEST_EVENT_NAME)}</span>
                <span class="ep-meta">Shared practice event · ${teN} teams</span>
              </button>
            </div>` : "";
          if (!list.length && !teRow) { el.innerHTML = `<p class="muted">${events.length ? "No matches." : "No events."}</p>`; return; }
          el.innerHTML = `<div class="ep-list">${teRow}${list.map((e) => `
            <div class="ep-row ${isLive(e) ? "live" : ""} ${isPinned(e) ? "pinned" : ""}">
              <button class="ep-item" data-ev="${esc(e.key)}" data-name="${esc(e.name || e.key)}">
                <span class="ep-name">${isPinned(e) ? `<span class="ep-pinmark">${icon("star")}</span>` : ""}${isLive(e) ? `<span class="badge green dot">LIVE</span> ` : ""}${esc(e.name || e.key)}</span>
                <span class="ep-meta">${esc([e.city, e.state_prov, e.country].filter(Boolean).join(", "))} · ${esc(e.start_date || "")}</span>
              </button>
              <button class="ep-pin ${isPinned(e) ? "on" : ""}" data-pin="${esc(e.key)}" title="${isPinned(e) ? "Unpin" : "Pin to top"}">${icon("star")}</button>
            </div>`).join("")}</div>`;
          $$("[data-ev]", el).forEach((b) => b.onclick = () => { close(); selectEvent(b.dataset.ev, b.dataset.name); });
          $$("[data-pin]", el).forEach((b) => b.onclick = (ev) => {
            ev.stopPropagation();
            const pinned = (Store.getSettings().pinnedEvents || []).slice();
            const k = b.dataset.pin, i = pinned.indexOf(k);
            if (i >= 0) pinned.splice(i, 1); else pinned.push(k);
            Store.setSettings({ pinnedEvents: pinned });
            draw($("#epFilter", body).value);
          });
        };
        API.getEvents(year).then(({ events: evs }) => { events = evs; draw($("#epFilter", body).value); })
          .catch((e) => {
            $("#epList", body).innerHTML = `<p style="color:var(--danger)">${e.message === "NO_KEY"
              ? "No TBA key set — paste one in js/config.js first." : "Couldn't load events (offline & no cache)."}</p>`;
          });
        $("#epFilter", body).oninput = (e) => draw(e.target.value);
      });
  }

  /* ===========================================================================
     VIEW: DASHBOARD
     ======================================================================== */
  function renderDashboard(root) {
    const matches = allMatches();
    const pits = allPits();
    const s = Store.getSettings();
    const teams = eventTeams();
    const stats = allScoutedTeams().map(computeStats).filter((x) => x.matches > 0);
    stats.sort((a, b) => b.avgCycles - a.avgCycles);

    const me = Store.getMe(), u = Auth.currentUser();
    const hr = new Date().getHours();
    const greet = hr < 5 ? "Up late" : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
    const pitN = Object.keys(pits).length;
    const actions = [
      ["match", "plus", "New match", "Scout a robot", "y"],
      ["pit", "wrench", "Pit scout", "Robot + photo", "c"],
      ["bagelstats", "chart", "BagelStats", "EPA rankings", "g"],
      ["data/spreadsheet", "download", "Export data", "Spreadsheet + CSV", "v"],
    ];
    root.innerHTML = `
      <section class="db-hero">
        <div class="db-hero-txt">
          <span class="pg-eyebrow">${esc(new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }))} · ${esc(GAME.seasonLabel)}</span>
          <h2 class="db-hello">${greet}${u ? `, <span>${esc(u.first)}</span>` : ""}</h2>
          <p class="pg-sub">${s.eventName ? `Scouting <b>${esc(s.eventName)}</b>.` : "Pick an event to load teams, the schedule and live stats."}</p>
        </div>
        <div class="db-hero-stats">
          <a class="db-chip y" href="#/members/profile"><b data-count="${me.bb || 0}">${me.bb || 0}</b><span>${BB}</span></a>
          <a class="db-chip" href="#/members/profile"><b data-count="${matchCountOf(me)}">${matchCountOf(me)}</b><span>your matches</span></a>
          <a class="db-chip" href="#/members/profile"><b data-count="${pitCountOf(me)}">${pitCountOf(me)}</b><span>your pits</span></a>
        </div>
      </section>

      <div class="db-actions">
        ${actions.map(([r, ic, t, sub, tone], i) => `<a class="db-act ${tone}" href="#/${r}" style="animation-delay:${i * 50}ms">
          <span class="db-act-ico">${icon(ic)}</span><span class="db-act-txt"><b>${t}</b><span>${sub}</span></span>${icon("chevron-right")}</a>`).join("")}
      </div>

      <section class="card db-event">
        <div class="db-event-txt">
          <span class="pg-eyebrow">${icon("calendar")} Current event</span>
          <span class="db-event-name">${s.eventName ? esc(s.eventName) : "No event selected"}</span>
          <span class="hint">${s.eventName ? (teams.length ? `${teams.length} teams loaded` : "Loaded") : "Choose your event to load teams, schedule & stats."}</span>
        </div>
        <div class="db-event-kpis">
          <div><b>${teams.length || "–"}</b><span>teams</span></div>
          <div><b>${stats.length}</b><span>with data</span></div>
          <div><b>${matches.length}</b><span>matches</span></div>
          <div><b>${pitN}</b><span>pits</span></div>
        </div>
        <div class="db-event-btns">
          ${s.eventName ? `<a class="btn ghost sm" href="#/teams">${icon("bagel")} Event page</a>` : ""}
          <button class="btn primary sm" id="chooseEvent">${icon("calendar")} ${s.eventName ? "Change" : "Choose event"}</button>
        </div>
      </section>

      ${countdownHTML()}

      <div id="liveSection"></div>

      <section class="section" id="spotlight"></section>`;

    const ce = $("#chooseEvent", root); if (ce) ce.onclick = openEventPicker;
    countUp(root);
    initCountdown(root);
    initSpotlight(root);
    loadLiveSection(root);
  }

  /* ---- Dashboard team spotlight: a random team every 10 s ------------------
     Pool = the current event's teams (else every scouted team). Shows the team in
     its colors with event rank/record, EPA, and what our scouts saw. */
  let spotTimer = null, spotIdx = 0, spotPool = null, spotKey = "";
  function initSpotlight(root) {
    const el = $("#spotlight", root);
    if (!el) return;
    const s = Store.getSettings();
    const base = eventTeams().map((t) => String(t.team_number));
    const pool = base.length ? base : allScoutedTeams();
    if (!pool.length) { el.innerHTML = ""; return; }
    const key = (s.eventKey || "") + ":" + pool.length;
    if (!spotPool || spotKey !== key) { // shuffle once per event so it keeps going where it left off
      spotPool = pool.slice().sort(() => Math.random() - 0.5);
      spotKey = key; spotIdx = 0;
    }
    const DUR = 10000;
    const ev = currentEventEpa();
    const rk = {}; ((Store.getCache("rankings." + s.eventKey, null) || {}).data || {}).rankings?.forEach((r) => { rk[r.team_key.replace("frc", "")] = r; });
    const lb = {}; (API.sbCachedLeaderboard(GAME.season) || []).forEach((r) => { lb[r.team] = r; });
    el.innerHTML = `
      <div class="sl-head">
        <h3>${icon("star")} Team spotlight</h3>
        <div class="sl-ctrl">
          <span class="hint" id="slCount"></span>
          <button class="cd-arrow sm" data-sl="-1" aria-label="Previous team">${icon("chevron-left")}</button>
          <button class="cd-arrow sm" data-sl="1" aria-label="Next team">${icon("chevron-right")}</button>
        </div>
      </div>
      <div class="sl-stage" id="slStage"></div>
      <div class="sl-bar"><i id="slBar"></i></div>`;
    const stage = $("#slStage", el), bar = $("#slBar", el);
    let started = 0, paused = false, left = DUR;
    const paint = (dir) => {
      const t = spotPool[spotIdx % spotPool.length];
      const st = computeStats(t), pit = allPits()[t], r = rk[t], e = ev && ev.byTeam[t], sb = lb[t];
      const stat = (label, val, sub) => `<div class="sl-stat"><span>${label}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
      stage.innerHTML = `<div class="sl-card thero${dir > 0 ? " cd-in-right" : dir < 0 ? " cd-in-left" : ""}" data-tfill="${esc(t)}">
        <span class="thero-mark" aria-hidden="true">${esc(t)}</span>
        <div class="sl-main">
          <img class="team-avatar thero-av" data-avatar="${esc(t)}" alt="" />
          <div class="thero-id">
            <span class="thero-num">${esc(t)}</span>
            <span class="thero-name">${esc(nameFor(t)) || "&nbsp;"}</span>
            <span class="thero-chips">
              ${r ? `<span class="thero-chip">${icon("trophy")} Rank ${r.rank}${r.record ? ` · ${r.record.wins}-${r.record.losses}-${r.record.ties}` : ""}</span>` : ""}
              <span class="thero-chip">${icon("binoculars")} ${st.matches} scouted</span>
              ${pit ? `<span class="thero-chip">${icon("clipboard")} Pit ✓</span>` : ""}
            </span>
          </div>
          ${pit && pit.photo ? `<img class="sl-photo" src="${esc(pit.photo)}" alt="Team ${esc(t)} robot" />` : ""}
        </div>
        <div class="sl-stats">
          ${stat("Event EPA", e ? fmt(e.epa) : "–", e ? `#${e.rank} of ${e.outOf}` : "on-device")}
          ${stat("Season EPA", sb ? fmt(sb.epa) : "–", sb && sb.worldRank ? `#${sb.worldRank} world` : "Statbotics")}
          ${stat("Avg cycles", st.matches && st.avgCycles ? fmt(st.avgCycles) : "–", "our scouting")}
          ${stat("Driver skill", st.avgDriver ? fmt(st.avgDriver) + "/5" : "–", st.matches ? `${Math.round(st.diedRate * 100)}% broke down` : "")}
        </div>
        <button class="sl-open" data-slopen="${esc(t)}">${icon("user")} Open profile ${icon("arrow-right")}</button>
        <span class="thero-accent"></span>
      </div>`;
      $("#slCount", el).textContent = `${(spotIdx % spotPool.length) + 1} / ${spotPool.length}`;
      $("[data-slopen]", stage).onclick = () => { location.hash = "#/team/" + t; };
      paintAvatars(stage, [t]); paintTeamFills(stage, [t]);
      started = performance.now(); left = DUR;
      bar.style.transition = "none"; bar.style.width = "0%"; void bar.offsetWidth;
      if (!paused) { bar.style.transition = `width ${DUR}ms linear`; bar.style.width = "100%"; }
    };
    const step = (d) => { spotIdx = (spotIdx + d + spotPool.length) % spotPool.length; paint(d); };
    $$("[data-sl]", el).forEach((b) => b.onclick = () => step(Number(b.dataset.sl)));
    // Pause while the pointer is over it (so people can read), resume on leave.
    el.onmouseenter = () => {
      paused = true; left = Math.max(0, left - (performance.now() - started));
      bar.style.transition = "none"; bar.style.width = (100 - left / DUR * 100) + "%";
    };
    el.onmouseleave = () => {
      paused = false; started = performance.now() - (DUR - left);
      bar.style.transition = `width ${left}ms linear`; bar.style.width = "100%";
    };
    clearInterval(spotTimer);
    spotTimer = setInterval(() => {
      if (!el.isConnected) { clearInterval(spotTimer); return; }
      if (!paused && !document.hidden && performance.now() - started >= DUR) step(1);
    }, 250);
    paint(0);
  }

  const matchLabel = (m) => (({ qm: "Q", ef: "EF", qf: "QF", sf: "SF", f: "F" })[m.comp_level] || String(m.comp_level).toUpperCase()) + m.match_number;
  function allianceTeams(m, col) { return (m.alliances[col].team_keys || []).map((k) => k.replace("frc", "")); }

  // Live section: only shown while an event is in progress (some matches unplayed).
  async function loadLiveSection(root) {
    const el = $("#liveSection", root);
    if (!el) return;
    const s = Store.getSettings();
    if (!s.eventKey) { el.innerHTML = ""; return; }
    let matches = [], ranks = [];
    try { matches = (await API.getEventMatches(s.eventKey)).matches || []; }
    catch (e) { const c = Store.getCache("matches." + s.eventKey, null); matches = c ? c.data : []; }
    if (!matches.length) { el.innerHTML = ""; return; }
    const scored = (m) => m.alliances && m.alliances.red.score >= 0 && m.alliances.blue.score >= 0;
    const played = matches.filter(scored);
    const unplayed = matches.filter((m) => m.alliances && !scored(m));
    const ongoing = unplayed.length > 0 && played.length > 0;
    if (!ongoing) { el.innerHTML = ""; return; }
    try { ranks = (await API.getEventRankings(s.eventKey)).rankings || []; } catch (e) { /* optional */ }

    const ord = (m) => ({ qm: 0, ef: 1, qf: 2, sf: 3, f: 4 })[m.comp_level] ?? 9;
    unplayed.sort((a, b) => (a.predicted_time || a.time || 1e15) - (b.predicted_time || b.time || 1e15) || ord(a) - ord(b) || a.match_number - b.match_number);
    const next = unplayed[0];
    played.sort((a, b) => (a.actual_time || a.time || 0) - (b.actual_time || b.time || 0));
    const last5 = played.slice(-5).reverse();

    const teamRow = (m, col) => allianceTeams(m, col).map((t) =>
      `<span class="team-num ${t === "702" ? "hl702" : ""}">${t}</span>`).join(" ");
    const nextCard = `
      <div class="card flush"><h3>${icon("calendar")} Next match</h3>
        <div class="nm-label">${matchLabel(next)}</div>
        <div class="nm-alliance red"><span class="alliance-dot alliance-red"></span>${teamRow(next, "red")}</div>
        <div class="nm-alliance blue"><span class="alliance-dot alliance-blue"></span>${teamRow(next, "blue")}</div>
      </div>`;
    const last5Card = `
      <div class="card flush"><h3>Last 5 matches</h3>
        <div class="table-wrap"><table><tbody>${last5.map((m) => {
          const rs = m.alliances.red.score, bs = m.alliances.blue.score;
          const redWin = rs > bs, tie = rs === bs;
          return `<tr>
            <td>${matchLabel(m)}</td>
            <td style="color:${tie ? "var(--text)" : redWin ? "var(--danger)" : "var(--primary)"}">${allianceTeams(m, "red").join(" ")}</td>
            <td class="num"><b>${rs}</b>–<b>${bs}</b></td>
            <td style="color:${tie ? "var(--text)" : !redWin ? "var(--primary)" : "var(--text-dim)"}">${allianceTeams(m, "blue").join(" ")}</td>
          </tr>`;
        }).join("")}</tbody></table></div></div>`;
    const ranksCard = `
      <div class="card flush"><h3>${icon("trophy")} Live rankings ${ranks.length ? "" : "<span class='hint'>(unavailable)</span>"}</h3>
        ${ranks.length ? `<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Team</th><th class="num">RP</th><th class="num">W-L-T</th></tr></thead>
          <tbody>${ranks.slice(0, 8).map((r) => {
            const t = r.team_key.replace("frc", "");
            return `<tr data-team="${t}" style="cursor:pointer">
              <td class="num rank-cell">${r.rank}</td>
              <td><span class="team-num ${t === "702" ? "hl702" : ""}">${t}</span></td>
              <td class="num">${r.sort_orders && r.sort_orders.length ? fmt(r.sort_orders[0], 2) : "–"}</td>
              <td class="num muted">${r.record ? `${r.record.wins}-${r.record.losses}-${r.record.ties}` : "–"}</td>
            </tr>`;
          }).join("")}</tbody></table></div>` : `<p class="muted">Rankings need wifi.</p>`}</div>`;

    el.innerHTML = `<div class="section">
      <div class="section-head"><h2 style="margin:0">${icon("chart")} Live — ${esc(s.eventName || s.eventKey)}</h2>
        <span class="badge green dot">In progress · ${played.length}/${matches.length} played</span></div>
      <div class="grid cols-3">${nextCard}${last5Card}${ranksCard}</div>
    </div>`;
    $$("[data-team]", el).forEach((r) => r.onclick = () => openTeam(r.dataset.team));
  }
  /* ---- Dashboard countdowns (CONFIG.countdowns) -----------------------------
     One card; ‹ › arrows (or dots / swipe / arrow keys) flip between upcoming
     dates with a slide animation, the day count rolls up, and a live h:m:s ticks. */
  let cdIndex = 0, cdTimer = null;
  function upcomingCountdowns() {
    const now = Date.now();
    return ((window.CONFIG && CONFIG.countdowns) || [])
      .map((c) => ({ ...c, t: new Date(c.at).getTime() }))
      .filter((c) => !isNaN(c.t) && c.t > now - 2 * 86400000) // stays up through the event weekend
      .sort((a, b) => a.t - b.t);
  }
  function countdownHTML() {
    const list = upcomingCountdowns();
    if (!list.length) return "";
    const multi = list.length > 1;
    return `<div class="section"><div class="card cd-card" id="cdCard" tabindex="0" aria-roledescription="carousel" aria-label="Countdowns">
      <div class="cd-info" id="cdInfo"></div>
      <div class="cd-right">
        ${multi ? `<button class="cd-arrow" data-cd="-1" aria-label="Previous countdown">${icon("chevron-left")}</button>` : ""}
        <div class="cd-num" id="cdNum"></div>
        ${multi ? `<button class="cd-arrow" data-cd="1" aria-label="Next countdown">${icon("chevron-right")}</button>` : ""}
      </div>
    </div></div>`;
  }
  function initCountdown(root) {
    const card = $("#cdCard", root);
    if (!card) return;
    const list = upcomingCountdowns();
    cdIndex = ((cdIndex % list.length) + list.length) % list.length;
    const pad = (n) => String(n).padStart(2, "0");
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rollToken = 0;
    const tick = (roll) => {
      const c = list[cdIndex], ms = c.t - Date.now();
      const daysEl = $("#cdDays", card), unitEl = $("#cdUnit", card), clockEl = $("#cdClock", card);
      if (!daysEl) return;
      if (ms <= 0) { daysEl.textContent = "LIVE"; unitEl.textContent = "it's here!"; clockEl.textContent = ""; return; }
      const d = Math.floor(ms / 864e5);
      unitEl.textContent = d === 1 ? "day to go" : "days to go";
      clockEl.textContent = `${pad(Math.floor(ms % 864e5 / 36e5))}h ${pad(Math.floor(ms % 36e5 / 6e4))}m ${pad(Math.floor(ms % 6e4 / 1e3))}s`;
      if (!roll || reduce) { if (!daysEl.dataset.rolling) daysEl.textContent = d; return; }
      // Count up from 0 to d (ease-out) so switching feels alive.
      const token = ++rollToken, start = performance.now(), dur = 650;
      daysEl.dataset.rolling = "1";
      const step = (now) => {
        if (token !== rollToken || !daysEl.isConnected) return;
        const p = Math.min(1, (now - start) / dur);
        daysEl.textContent = Math.round(d * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step); else delete daysEl.dataset.rolling;
      };
      requestAnimationFrame(step);
      // Background tabs pause rAF — make sure the roll always lands on the real number.
      setTimeout(() => { if (token === rollToken && daysEl.isConnected) { daysEl.textContent = d; delete daysEl.dataset.rolling; } }, dur + 150);
    };
    const paint = (dir) => {
      const c = list[cdIndex];
      const anim = dir > 0 ? " cd-in-right" : dir < 0 ? " cd-in-left" : "";
      const date = new Date(c.t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      $("#cdInfo", card).innerHTML = `<div class="cd-slide${anim}">
        <span class="cd-label">${icon("clock")} Countdown${list.length > 1 ? ` <span class="cd-count">${cdIndex + 1} / ${list.length}</span>` : ""}</span>
        <span class="cd-event">${esc(c.label)}</span>
        ${c.sub ? `<span class="cd-sub">${esc(c.sub)}</span>` : ""}
        <span class="cd-meta">${icon("calendar")} ${esc(date)}${c.where ? ` · ${esc(c.where)}` : ""}</span>
        ${list.length > 1 ? `<span class="cd-dots">${list.map((x, i) =>
          `<button class="cd-dot${i === cdIndex ? " on" : ""}" data-cdi="${i}" aria-label="Show ${esc(x.label)}"></button>`).join("")}</span>` : ""}
      </div>`;
      $("#cdNum", card).innerHTML = `<div class="cd-slide${anim}"><span class="cd-days" id="cdDays">0</span>
        <span class="cd-unit" id="cdUnit"></span><span class="cd-clock" id="cdClock"></span></div>`;
      $$("[data-cdi]", card).forEach((b) => b.onclick = (e) => { e.stopPropagation(); step(Number(b.dataset.cdi) - cdIndex); });
      tick(true);
    };
    const step = (d) => {
      if (!d || list.length < 2) return;
      cdIndex = (cdIndex + d + list.length * 4) % list.length;
      paint(d > 0 ? 1 : -1);
    };
    $$("[data-cd]", card).forEach((b) => b.onclick = () => step(Number(b.dataset.cd)));
    card.onkeydown = (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    };
    let sx = null; // swipe
    card.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") sx = e.clientX; });
    card.addEventListener("pointerup", (e) => {
      if (sx == null) return;
      const dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    });
    clearInterval(cdTimer);
    cdTimer = setInterval(() => { if (!card.isConnected) { clearInterval(cdTimer); return; } tick(false); }, 1000);
    paint(0);
  }
  function kpi(label, value, tone = "") {
    return `<div class="card"><div class="kpi">
      <span class="kpi-label">${esc(label)}</span>
      <span class="kpi-value ${tone}">${esc(value)}</span></div></div>`;
  }
  function emptyState(ic, title, sub) {
    return `<div class="empty">${icon(ic, "ico")}<h3>${esc(title)}</h3><p class="muted">${esc(sub)}</p></div>`;
  }
  // True before a season's competitions begin (no official matches → no EPA yet).
  const seasonUpcoming = () => Date.now() < Date.UTC(GAME.season, 2, 1);
  function recentMatchesTable(list) {
    if (!list.length) return emptyState("clipboard", "Nothing yet", "New match records show up here.");
    return `<div class="table-wrap"><table>
      <thead><tr><th>Match</th><th>Team</th><th>Notes</th></tr></thead>
      <tbody>${list.map((m) => `<tr data-team="${m.team}" style="cursor:pointer">
        <td>Q${esc(m.matchNumber || "?")}</td>
        <td><span class="alliance-dot alliance-${m.alliance === "red" ? "red" : "blue"}"></span><span class="team-num">${esc(m.team)}</span></td>
        <td>${esc(m.notes || "—")}</td></tr>`).join("")}</tbody></table></div>`;
  }

  /* ===========================================================================
     VIEW: MEMBERS (Profile / Leaderboard / Scouters)
     ======================================================================== */
  function memberSub() {
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    return { sub: parts[1] || "profile", id: parts[2] || "" };
  }
  function adminSub() {
    return location.hash.replace(/^#\/?/, "").split("/")[1] || "requests";
  }
  function timeAgo(ts) {
    if (!ts) return "";
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }
  function teamChips(list) {
    if (!list || !list.length) return `<p class="muted">Nothing yet.</p>`;
    return `<div class="team-chip-row">${list.map((t) =>
      `<button class="team-chip" data-team="${esc(t)}"><span class="team-num">${esc(t)}</span> <span class="muted">${esc(teamName(t))}</span></button>`).join("")}</div>`;
  }
  // Counts are derived from the SHARED cloud data (by scouterId) so they're the
  // same on every device; fall back to the stored per-device count only if there
  // are no cloud records tagged with this scouter (e.g. older data).
  // The stored per-device counters/lists predate seasons (they're 2026 numbers), so
  // they're only a fallback while viewing 2026 — other years start from zero.
  const baseSeason = () => Store.season === Store.BASE_SEASON;
  const matchCountOf = (sc) => {
    const id = sc && sc.id;
    const n = id ? allMatches().filter((m) => String(m.scouterId) === String(id)).length : 0;
    return n || (baseSeason() && sc && sc.matchCount) || 0;
  };
  const pitCountOf = (sc) => {
    const id = sc && sc.id;
    const n = id ? Object.values(allPits()).filter((p) => String(p.scouterId) === String(id)).length : 0;
    if (n || !baseSeason()) return n;
    return (sc && sc.pitScoutedTeams || []).length || (sc && sc.pitCount) || 0;
  };
  // "Last teams" lists, also derived from the SHARED cloud records (by scouterId)
  // so they show every team this account scouted across all its devices, newest
  // first. Falls back to the per-device stored list only when no cloud records.
  const lastTeamsFrom = (records, id) => {
    const mine = records
      .filter((r) => r && r.team != null && String(r.scouterId) === String(id))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const seen = new Set(), out = [];
    for (const r of mine) {
      const t = String(r.team);
      if (seen.has(t)) continue;
      seen.add(t); out.push(t);
      if (out.length >= 12) break;
    }
    return out;
  };
  const lastMatchTeamsOf = (sc) => {
    const id = sc && sc.id;
    const list = id ? lastTeamsFrom(allMatches(), id) : [];
    return list.length || !baseSeason() ? list : (sc && sc.lastMatchTeams) || [];
  };
  const lastPitTeamsOf = (sc) => {
    const id = sc && sc.id;
    const list = id ? lastTeamsFrom(Object.values(allPits()), id) : [];
    return list.length || !baseSeason() ? list : (sc && sc.lastPitTeams) || [];
  };

  /* ---- Shared revamp building blocks ---------------------------------------- */
  // Page header: icon tile + eyebrow + title + subtitle, with an optional right slot.
  function pageHero({ ic, eyebrow, title, sub, side }) {
    return `<header class="pg-hero">
      <span class="pg-hero-ico">${icon(ic || "dashboard")}</span>
      <div class="pg-hero-txt">
        ${eyebrow ? `<span class="pg-eyebrow">${eyebrow}</span>` : ""}
        <h2 class="pg-title">${title}</h2>
        ${sub ? `<p class="pg-sub">${sub}</p>` : ""}
      </div>
      ${side ? `<div class="pg-hero-side">${side}</div>` : ""}
    </header>`;
  }
  // A team as a button in its own frc-colors (paint with paintAvatars + paintTeamFills).
  function teamTileHTML(t, meta, opts = {}) {
    t = String(t);
    return `<button class="ds-team${opts.dim ? " dim" : ""}${opts.mini ? " mini" : ""}" data-tteam="${esc(t)}" data-tfill="${esc(t)}"${opts.style ? ` style="${opts.style}"` : ""}>
      <img class="team-avatar" data-avatar="${esc(t)}"${opts.ally ? ` data-ally="${opts.ally}"` : ""} alt="" />
      <span class="ds-num">${esc(t)}</span>
      <span class="ds-name">${esc(nameFor(t)) || "&nbsp;"}</span>
      ${meta ? `<span class="ds-meta">${meta}</span>` : ""}
    </button>`;
  }
  function wireTeamTiles(el, onPick) {
    const teams = $$("[data-tteam]", el).map((b) => b.dataset.tteam);
    $$("[data-tteam]", el).forEach((b) => b.onclick = () => (onPick || openTeam)(b.dataset.tteam));
    paintAvatars(el, teams);
    paintTeamFills(el, teams);
  }

  function renderMembers(root) {
    const { sub } = memberSub();
    const activeTab = ["profile", "leaderboard", "scouters"].includes(sub) ? sub : "profile";
    const tabs = [["profile", "Profile", "user"], ["leaderboard", "Leaderboard", "trophy"], ["scouters", "Scouters", "teams"]];
    root.innerHTML = `
      <div class="subtabs" id="memberTabs">
        ${tabs.map(([k, l, ic]) => `<a href="#/members/${k}" class="${activeTab === k ? "on" : ""}">${icon(ic)} ${esc(l)}</a>`).join("")}
      </div>
      ${Cloud.enabled() ? "" : `<div class="card cloud-note">${icon("globe")}
        <span>Cloud sync is off, so you'll only see yourself here. A lead can turn it on in <b>js/config.js</b> to share Bagel Bucks, the leaderboard, and live online status across the whole team.</span></div>`}
      <div id="memberBody"></div>`;
    const body = $("#memberBody", root);
    if (activeTab === "leaderboard") renderLeaderboard(body);
    else if (activeTab === "scouters") {
      const id = memberSub().id;
      if (id) renderScouterReport(body, decodeURIComponent(id), "#/members/scouters");
      else renderScoutersList(body);
    }
    else renderProfile(body, memberSub().id || Store.getMe().id);
  }

  function renderProfile(body, id) {
    const me = Store.getMe();
    const sc = allScouters().find((s) => s.id === id) || me;
    const isMe = sc.id === me.id;
    const online = isMe || isOnline(sc);
    const lastM = lastMatchTeamsOf(sc), lastP = lastPitTeamsOf(sc);
    const rank = allScouters().slice().sort((a, b) => (b.bb || 0) - (a.bb || 0)).findIndex((s) => s.id === sc.id) + 1;
    const tiles = (list, empty) => list.length
      ? `<div class="mb-tiles">${list.map((t, i) => teamTileHTML(t, "", { mini: true, style: `animation-delay:${i * 35}ms` })).join("")}</div>`
      : `<div class="mb-empty">${icon("binoculars")}<span>${empty}</span></div>`;
    body.innerHTML = `
      <section class="card mb-hero">
        <div class="mb-hero-av">
          ${scouterAvatar(sc, "ph-avatar")}
          <span class="mb-online ${online ? "on" : ""}" title="${online ? "Online now" : "Offline"}"></span>
          ${isMe ? `<button class="mb-pic" id="editPic" aria-label="Change profile photo">${icon("edit")}</button>
            <input type="file" id="picInput" accept="image/*" hidden />` : ""}
        </div>
        <div class="mb-hero-id">
          <span class="pg-eyebrow">${isMe ? "Your profile" : "Scouter"}${rank ? ` · #${rank} on the leaderboard` : ""}</span>
          <h2 class="mb-name">${esc(scouterName(sc))}${isMe ? ` <span class="badge cyan">You</span>` : ""}</h2>
          <span class="mb-status">${online ? "Online now" : (sc.lastSeen ? "Last seen " + timeAgo(sc.lastSeen) : "Offline")}</span>
        </div>
        <div class="mb-bb"><span class="mb-bb-num" data-count="${sc.bb || 0}">${sc.bb || 0}</span><span class="mb-bb-unit">Bagel Bucks</span></div>
      </section>
      <div class="mb-stats">
        <a class="tp-tile hl" href="#/members/leaderboard"><span class="tp-tile-l">Leaderboard</span><b class="tp-tile-v">${rank ? `#<span data-count="${rank}">${rank}</span>` : "–"}</b><span class="tp-tile-s">of ${allScouters().length} scouters</span></a>
        <div class="tp-tile"><span class="tp-tile-l">Matches scouted</span><b class="tp-tile-v"><span data-count="${matchCountOf(sc)}">${matchCountOf(sc)}</span></b><span class="tp-tile-s">this season</span></div>
        <div class="tp-tile"><span class="tp-tile-l">Teams pit scouted</span><b class="tp-tile-v"><span data-count="${pitCountOf(sc)}">${pitCountOf(sc)}</span></b><span class="tp-tile-s">this season</span></div>
      </div>
      <div class="grid cols-2 mb-lists">
        <div class="card"><div class="sr-head"><h3>${icon("binoculars")} Last teams scouted</h3><span class="hint">${lastM.length ? "newest first" : ""}</span></div>${tiles(lastM, "No matches scouted yet")}</div>
        <div class="card"><div class="sr-head"><h3>${icon("clipboard")} Last teams pit scouted</h3><span class="hint">${lastP.length ? "newest first" : ""}</span></div>${tiles(lastP, "No pits scouted yet")}</div>
      </div>
      <div class="btn-row" style="margin-top:14px"><a class="btn ghost sm" href="#/members/scouters/${encodeURIComponent(sc.id)}">${icon("list")} Everything ${isMe ? "you" : esc(sc.first || "they")} scouted</a></div>`;
    wireTeamTiles(body);
    countUp(body);
    if (isMe) {
      const pic = $("#picInput", body), btn = $("#editPic", body);
      if (btn) btn.onclick = () => pic.click();
      if (pic) pic.onchange = (e) => {
        const file = e.target.files[0]; if (!file) return;
        pic.value = ""; // allow re-picking the same file later
        cropImageDialog(file, (dataUrl) => {
          Store.setMe({ profilePic: dataUrl });
          Cloud.syncMe();
          toast("Profile photo updated");
          router();
        });
      };
    }
  }

  function renderLeaderboard(body) {
    const meId = Store.getMe().id;
    const scs = allScouters().slice().sort((a, b) =>
      (b.bb || 0) - (a.bb || 0) || scouterName(a).localeCompare(scouterName(b)));
    const top = scs[0] ? (scs[0].bb || 0) : 0;
    const podium = scs.slice(0, 3);
    const order = [1, 0, 2].filter((i) => podium[i]); // 2nd · 1st · 3rd
    const medal = ["gold", "silver", "bronze"];
    body.innerHTML = `
      ${podium.length ? `<section class="lb-podium">${order.map((i) => {
        const sc = podium[i];
        return `<button class="lb-pod ${medal[i]}${sc.id === meId ? " me" : ""}" data-id="${esc(sc.id)}" style="animation-delay:${[1, 0, 2].indexOf(i) * 90}ms">
          <span class="lb-pod-av">${scouterAvatar(sc, "lb-avatar")}<span class="lb-medal">${i + 1}</span></span>
          <span class="lb-pod-name">${esc(scouterName(sc))}</span>
          <span class="lb-pod-bb"><b data-count="${sc.bb || 0}">${sc.bb || 0}</b> ${BB}</span>
          <span class="lb-pod-sub">${matchCountOf(sc)} matches · ${pitCountOf(sc)} pits</span>
          <span class="lb-pod-step"><span>${i + 1}</span></span>
        </button>`;
      }).join("")}</section>` : ""}
      <div class="lb-list">${scs.slice(3).map((sc, j) => {
        const i = j + 3, online = sc.id === meId || isOnline(sc);
        const pct = top ? Math.round((sc.bb || 0) / top * 100) : 0;
        return `<button class="lb-row${sc.id === meId ? " me" : ""}" data-id="${esc(sc.id)}" style="animation-delay:${Math.min(j, 12) * 30}ms">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-av-wrap">${scouterAvatar(sc, "lb-avatar")}${online ? `<span class="mb-online on sm"></span>` : ""}</span>
          <span class="lb-mid">
            <span class="lb-name">${esc(scouterName(sc))}${sc.id === meId ? ` <span class="badge cyan">You</span>` : ""}</span>
            <span class="lb-track"><i style="width:${pct}%"></i></span>
          </span>
          <span class="lb-bbwrap">
            <span class="lb-bb-row"><span class="lb-bb">${sc.bb || 0}</span><span class="lb-bb-unit">${BB}</span></span>
            <span class="lb-sub">${matchCountOf(sc)} M · ${pitCountOf(sc)} P</span>
          </span>
        </button>`;
      }).join("")}</div>`;
    $$("[data-id]", body).forEach((r) => r.onclick = () => { location.hash = "#/members/profile/" + r.dataset.id; });
    countUp(body);
  }

  // Scouters subpage: every scouter as a tile (search by name) → their full report.
  let mbScoutQ = "";
  function renderScoutersList(body) {
    const meId = Store.getMe().id;
    const all = allScouters().map((sc) => ({ sc, m: matchCountOf(sc), p: pitCountOf(sc), on: sc.id === meId || isOnline(sc) }))
      .sort((a, b) => (b.m + b.p) - (a.m + a.p) || scouterName(a.sc).localeCompare(scouterName(b.sc)));
    body.innerHTML = `
      <div class="card ds-top">
        <label class="ds-search" for="mbScoutQ">${icon("search")}
          <input id="mbScoutQ" type="search" autocomplete="off" placeholder="Search a scouter's name…" value="${esc(mbScoutQ)}" />
        </label>
        <span class="hint">${all.filter((x) => x.on).length} online · ${all.length} scouters</span>
      </div>
      <div id="mbScoutList"></div>`;
    const list = $("#mbScoutList", body), input = $("#mbScoutQ", body);
    const draw = () => {
      const q = mbScoutQ.trim().toLowerCase();
      const rows = all.filter((x) => !q || scouterName(x.sc).toLowerCase().includes(q));
      list.innerHTML = rows.length ? `<div class="ds-sgrid">${rows.map((x, i) => `
        <button class="ds-scouter" data-dscouter="${esc(x.sc.id)}" style="animation-delay:${Math.min(i, 16) * 25}ms">
          <span class="lb-av-wrap">${scouterAvatar(x.sc, "sc-avatar")}${x.on ? `<span class="mb-online on sm"></span>` : ""}</span>
          <span class="ds-sname">${esc(scouterName(x.sc))}${x.sc.id === meId ? ` <span class="badge cyan">You</span>` : ""}</span>
          <span class="ds-meta"><b>${x.m}</b> matches · <b>${x.p}</b> pits</span>
        </button>`).join("")}</div>`
        : `<div class="card">${emptyState("user", "No scouters found", "Try a different name.")}</div>`;
      $$("[data-dscouter]", list).forEach((b) => b.onclick = () => { location.hash = "#/members/scouters/" + encodeURIComponent(b.dataset.dscouter); });
    };
    input.oninput = () => { mbScoutQ = input.value; draw(); };
    draw();
  }

  /* ===========================================================================
     VIEW: EVENTS (Teams list + Schedule subpages)
     ======================================================================== */
  let teamSort = "number"; // number | name | epa | rank | win

  // Season EPA map (Statbotics), shared by the teams list + schedule win-prob.
  function buildSeasonEpa() {
    const map = {};
    (API.sbCachedLeaderboard(GAME.season) || []).forEach((r) => { map[String(r.team)] = r.epa; });
    return map;
  }
  // EPA-based win probability (labeled estimate). Logistic on alliance EPA totals.
  function winProb(redEpa, blueEpa) {
    const diff = redEpa - blueEpa;
    const scale = Math.max(5, 0.2 * (redEpa + blueEpa));
    return 1 / (1 + Math.pow(10, -diff / scale));
  }

  function teamsSub() { const p = (location.hash.replace(/^#\/?/, "") || "").split("/"); return p[1] || "list"; }
  const OUR_TEAM = "702";
  let evView = "grid", evSchedFilter = "all", evSchedTeam = "";
  function currentEventInfo() {
    const s = Store.getSettings();
    const evc = Store.getCache("events." + GAME.season, null);
    return (evc && evc.data || []).find((e) => e.key === s.eventKey) || null;
  }
  function renderEventsPage(root) {
    const s = Store.getSettings();
    const own = [["list", "Teams", "bagel"], ["schedule", "Schedule", "calendar"], ["rankings", "Rankings", "trophy"]];
    const sub = own.some((t) => t[0] === teamsSub()) ? teamsSub() : "list";
    if (!s.eventKey) {
      root.innerHTML = pageHero({ ic: "calendar", eyebrow: "Events", title: "No event selected", sub: "Pick the event you're scouting to load its teams, schedule and rankings." }) +
        `<div class="card">${emptyState("calendar", "Choose an event", "Use the event chip in the sidebar, or the button below.")}
          <div class="btn-row" style="justify-content:center"><button class="btn primary" id="evChoose">${icon("calendar")} Choose event</button></div></div>`;
      $("#evChoose", root).onclick = openEventPicker;
      return;
    }
    const info = currentEventInfo();
    const cacheM = Store.getCache("matches." + s.eventKey, null);
    const all = (cacheM ? cacheM.data : []) || [];
    const played = all.filter((m) => m.alliances && m.alliances.red.score >= 0 && m.alliances.blue.score >= 0).length;
    const teams = eventTeams();
    const start = info && info.start_date ? new Date(info.start_date + "T12:00:00") : null;
    const end = info && info.end_date ? new Date(info.end_date + "T12:00:00") : null;
    const status = all.length && played === all.length ? ["done", "Completed"] : played ? ["live", "Live now"]
      : (start && start > new Date() ? ["soon", "Upcoming"] : ["soon", all.length ? "Not started" : "No schedule yet"]);
    const dateStr = start ? start.toLocaleDateString([], { month: "short", day: "numeric" }) + (end && end - start > 0 ? " – " + end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "") : "";
    const loc = info ? [info.city, info.state_prov, info.country].filter(Boolean).join(", ") : "";
    const pct = all.length ? played / all.length : 0;
    root.innerHTML = `
      <section class="ev-hero">
        <div class="ev-hero-main">
          <span class="ev-status ${status[0]}"><i></i>${status[1]}</span>
          <h2 class="ev-name">${esc(s.eventName || s.eventKey)}</h2>
          <span class="ev-meta">${dateStr ? `${icon("calendar")} ${esc(dateStr)}` : ""}${loc ? ` <span>${icon("map-pin")} ${esc(loc)}</span>` : ""}</span>
          <div class="ev-hero-btns">
            <button class="btn ghost sm" id="evChange">${icon("calendar")} Change event</button>
            ${s.eventKey !== "2026test" ? `<a class="btn ghost sm" href="https://www.thebluealliance.com/event/${esc(s.eventKey)}" target="_blank" rel="noopener">${icon("external")} TBA</a>` : ""}
          </div>
        </div>
        <div class="ev-hero-stats">
          <div><b data-count="${teams.length}">${teams.length}</b><span>teams</span></div>
          <div><b>${played}<small>/${all.length}</small></b><span>matches played</span></div>
          <div class="ev-ring">${ringSVG(pct, "Matches played")}<span>progress</span></div>
        </div>
      </section>
      <div class="subtabs ev-tabs" id="evTabs">
        ${own.map(([k, l, ic]) => `<a href="#/teams/${k}" class="${sub === k ? "on" : ""}">${icon(ic)} ${esc(l)}</a>`).join("")}
      </div>
      <div id="evBody"></div>`;
    $("#evChange", root).onclick = openEventPicker;
    countUp(root);
    const body = $("#evBody", root);
    if (sub === "schedule") renderSchedule(body);
    else if (sub === "rankings") renderEventRankings(body);
    else renderTeamsList(body);
  }

  function renderTeamsList(root) {
    const s = Store.getSettings();
    const teams = eventTeams();
    if (!teams.length) {
      root.innerHTML = `<div class="card">${emptyState("teams", "No team list loaded",
        "This event's team list loads from The Blue Alliance once you're online.")}</div>`;
      return;
    }
    let epaMap = buildSeasonEpa();
    const ev = currentEventEpa();
    const epaOf = (num) => (ev && ev.byTeam[num] ? ev.byTeam[num].epa : null) ?? epaMap[String(num)] ?? null;
    let rankMap = {}; // team# -> { rank, wr, rec }
    const sorts = [["number", "#"], ["name", "A–Z"], ["epa", "EPA"], ["rank", "Rank"], ["win", "Win %"]];
    root.innerHTML = `
      <div class="card ev-toolbar">
        <label class="ds-search" for="teamSearch">${icon("search")}<input type="search" id="teamSearch" placeholder="Search teams…" /></label>
        <div class="seg" id="teamSort">${sorts.map(([k, l]) => `<button data-s="${k}" class="${teamSort === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="seg" id="evView">
          <button data-v="grid" class="${evView === "grid" ? "on" : ""}" aria-label="Grid view">${icon("dashboard")}</button>
          <button data-v="list" class="${evView === "list" ? "on" : ""}" aria-label="List view">${icon("list")}</button>
        </div>
      </div>
      <div id="teamList"></div>`;

    const listEl = $("#teamList", root);
    function draw(filter = "") {
      const f = filter.toLowerCase();
      const pits = allPits();
      let list = teams.filter((t) => !f || String(t.team_number).includes(f) || (t.nickname || "").toLowerCase().includes(f));
      list = list.slice().sort((a, b) => {
        if (teamSort === "name") return (a.nickname || "").localeCompare(b.nickname || "");
        if (teamSort === "epa") return (epaOf(b.team_number) ?? -1e9) - (epaOf(a.team_number) ?? -1e9);
        if (teamSort === "rank") return ((rankMap[a.team_number] || {}).rank || 1e9) - ((rankMap[b.team_number] || {}).rank || 1e9);
        if (teamSort === "win") return ((rankMap[b.team_number] || {}).wr ?? -1) - ((rankMap[a.team_number] || {}).wr ?? -1);
        return a.team_number - b.team_number;
      });
      if (!list.length) { listEl.innerHTML = `<div class="card">${emptyState("search", "No matches", "Try another search.")}</div>`; return; }
      if (evView === "grid") {
        listEl.innerHTML = `<div class="ds-grid ev-grid">${list.map((t, i) => {
          const n = String(t.team_number), rk = rankMap[n] || {}, e = epaOf(n);
          return teamTileHTML(n, `${e != null ? `<span class="ev-pill">EPA <b>${fmt(e)}</b></span>` : ""}${rk.rank ? `<span class="ev-pill">#<b>${rk.rank}</b></span>` : ""}${rk.wr != null ? `<span class="ev-pill"><b>${Math.round(rk.wr * 100)}</b>%</span>` : ""}${pits[n] ? `<span class="ev-pill">${icon("check")}pit</span>` : ""}`,
            { style: `animation-delay:${Math.min(i, 30) * 15}ms` });
        }).join("")}</div>`;
        wireTeamTiles(listEl);
        return;
      }
      listEl.innerHTML = `<div class="team-list">${list.map((t) => {
        const n = t.team_number, e = epaOf(n), rk = rankMap[n] || {}, photo = (pits[n] || {}).photo;
        return `<button class="team-row" data-team="${n}" data-tfill="${n}">
          <img class="team-avatar tr-icon" data-avatar="${n}" alt="" />
          <span class="tr-robot">${photo ? `<img src="${esc(photo)}" alt="robot" />` : `<span class="tr-robot-ph">${icon("wrench")}</span>`}</span>
          <span class="tr-id"><span class="tr-num">${n}</span><span class="tr-name">${esc(t.nickname || t.name || "")}</span></span>
          <span class="tr-stat"><span class="trs-val">${e != null ? fmt(e, 1) : "–"}</span><span class="trs-label">EPA</span></span>
          <span class="tr-stat"><span class="trs-val">${rk.rank ? "#" + rk.rank : "–"}</span><span class="trs-label">Rank</span></span>
          <span class="tr-stat"><span class="trs-val">${rk.wr != null ? Math.round(rk.wr * 100) + "%" : "–"}</span><span class="trs-label">Win</span></span>
        </button>`;
      }).join("")}</div>`;
      $$("[data-team]", listEl).forEach((c) => c.onclick = () => openTeam(c.dataset.team));
      paintAvatars(listEl, list.map((t) => t.team_number));
      paintTeamFills(listEl, list.map((t) => String(t.team_number)));
    }
    draw();
    if (!Object.keys(epaMap).length) {
      API.sbYearLeaderboard(GAME.season).then((res) => {
        (res && res.rows || []).forEach((r) => { epaMap[String(r.team)] = r.epa; });
        if (Object.keys(epaMap).length && root.isConnected) draw($("#teamSearch", root).value);
      }).catch(() => {});
    }
    if (s.eventKey) API.getEventRankings(s.eventKey).then(({ rankings }) => {
      rankMap = {};
      (rankings || []).forEach((r) => {
        const tn = String(r.team_key).replace("frc", "");
        const rec = r.record || {}; const g = (rec.wins || 0) + (rec.losses || 0) + (rec.ties || 0);
        rankMap[tn] = { rank: r.rank, wr: g ? (rec.wins || 0) / g : null };
      });
      if (root.isConnected) draw($("#teamSearch", root).value);
    }).catch(() => {});

    $("#teamSearch", root).oninput = (e) => draw(e.target.value);
    $$("#teamSort button", root).forEach((b) => b.onclick = () => {
      teamSort = b.dataset.s;
      $$("#teamSort button", root).forEach((x) => x.classList.toggle("on", x === b));
      draw($("#teamSearch", root).value);
    });
    $$("#evView button", root).forEach((b) => b.onclick = () => {
      evView = b.dataset.v;
      $$("#evView button", root).forEach((x) => x.classList.toggle("on", x === b));
      draw($("#teamSearch", root).value);
    });
  }

  /* ---- Schedule subpage (quals + playoffs, click for match breakdown) ------ */
  const COMP_ORDER = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
  const COMP_LABEL = { qm: "Q", ef: "EF", qf: "QF", sf: "SF", f: "F" };
  function renderSchedule(root) {
    const s = Store.getSettings();
    const cache = s.eventKey ? Store.getCache("matches." + s.eventKey, null) : null;
    const all = (cache ? cache.data : []) || [];
    if (!all.length) {
      root.innerHTML = `<div class="card">${emptyState("calendar", "No schedule yet", "The match schedule loads once it's posted on The Blue Alliance (needs wifi to fetch).")}</div>`;
      return;
    }
    const byOrder = (a, b) => (COMP_ORDER[a.comp_level] - COMP_ORDER[b.comp_level]) ||
      ((a.set_number || 0) - (b.set_number || 0)) || (a.match_number - b.match_number);
    const sorted = all.slice().sort(byOrder);
    const fmtTime = (m) => { const u = m.actual_time || m.predicted_time || m.time; return u ? new Date(u * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""; };
    const teamsOf = (m, c) => (m.alliances[c].team_keys || []).map((k) => k.replace("frc", ""));
    const played = (m) => m.alliances && m.alliances.red.score >= 0 && m.alliances.blue.score >= 0;
    const label = (m) => COMP_LABEL[m.comp_level] + (m.comp_level === "qm" ? m.match_number : (m.set_number || m.match_number));
    const ev = currentEventEpa();
    const epaOf = (t) => (ev && ev.byTeam[t]) ? ev.byTeam[t].epa : null;
    const probOf = (m) => {
      const r = teamsOf(m, "red"), b = teamsOf(m, "blue");
      if (![...r, ...b].every((t) => epaOf(t) != null)) return null;
      return winProb(r.reduce((x, t) => x + epaOf(t), 0), b.reduce((x, t) => x + epaOf(t), 0));
    };
    const filters = [["all", "All"], ["qm", "Quals"], ["po", "Playoffs"], ["us", OUR_TEAM], ["up", "Upcoming"], ["done", "Played"]];
    root.innerHTML = `
      <div class="card ev-toolbar">
        <label class="ds-search" for="schedTeam">${icon("search")}<input type="search" id="schedTeam" placeholder="Find a team's matches…" value="${esc(evSchedTeam)}" inputmode="numeric" /></label>
        <div class="seg wrap" id="schedFilter">${filters.map(([k, l]) => `<button data-f="${k}" class="${evSchedFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <button class="btn primary sm" id="schedNext">${icon("arrow-right")} Next match</button>
      </div>
      <div id="schedBody"></div>`;
    const bodyEl = $("#schedBody", root);
    const draw = () => {
      const q = evSchedTeam.trim();
      const keep = (m) => {
        const ts = [...teamsOf(m, "red"), ...teamsOf(m, "blue")];
        if (q && !ts.some((t) => t === q || t.startsWith(q))) return false;
        if (evSchedFilter === "qm") return m.comp_level === "qm";
        if (evSchedFilter === "po") return m.comp_level !== "qm";
        if (evSchedFilter === "us") return ts.includes(OUR_TEAM);
        if (evSchedFilter === "up") return !played(m);
        if (evSchedFilter === "done") return played(m);
        return true;
      };
      const list = sorted.filter(keep);
      const row = (m) => {
        const red = teamsOf(m, "red"), blue = teamsOf(m, "blue"), done = played(m);
        const rWon = done && m.alliances.red.score > m.alliances.blue.score;
        const bWon = done && m.alliances.blue.score > m.alliances.red.score;
        const p = probOf(m), ours = red.includes(OUR_TEAM) || blue.includes(OUR_TEAM);
        const chip = (t) => `<span class="sr-team${t === q || t === OUR_TEAM ? " hl" : ""}">${t}</span>`;
        return `<button class="sched-row${ours ? " ours" : ""}${done ? "" : " upcoming"}" data-mi="${all.indexOf(m)}" data-mkey="${esc(m.key || "")}">
          <span class="sr-label">${esc(label(m))}<small>${done ? "final" : esc(fmtTime(m))}</small></span>
          <span class="sr-alliance red ${rWon ? "won" : ""}">${red.map(chip).join("")}</span>
          <span class="sr-score">${done ? `<b class="${rWon ? "w" : ""}">${m.alliances.red.score}</b><span class="sr-dash">–</span><b class="${bWon ? "w" : ""}">${m.alliances.blue.score}</b>` : `<span class="sr-vs">vs</span>`}</span>
          <span class="sr-alliance blue ${bWon ? "won" : ""}">${blue.map(chip).join("")}</span>
          ${p != null ? `<span class="sr-prob" title="Win probability (event EPA)"><i style="width:${Math.round(p * 100)}%"></i></span>` : ""}
        </button>`;
      };
      const quals = list.filter((m) => m.comp_level === "qm"), po = list.filter((m) => m.comp_level !== "qm");
      bodyEl.innerHTML = list.length ? `
        ${quals.length ? `<section class="card ev-sched"><div class="sr-head"><h3>${icon("list")} Qualifications</h3><span class="hint">${quals.length} matches</span></div>
          <div class="sched-list">${quals.map(row).join("")}</div></section>` : ""}
        ${po.length ? `<section class="card ev-sched" style="margin-top:16px"><div class="sr-head"><h3>${icon("trophy")} Playoffs</h3><span class="hint">${po.length} matches</span></div>
          <div class="sched-list">${po.map(row).join("")}</div></section>` : ""}`
        : `<div class="card">${emptyState("search", "No matches", q ? `No matches for team ${q} with this filter.` : "Nothing matches this filter.")}</div>`;
      $$(".sched-row", bodyEl).forEach((b) => b.onclick = () => openMatchDetail(all[+b.dataset.mi]));
    };
    draw();
    $("#schedTeam", root).oninput = (e) => { evSchedTeam = e.target.value.replace(/\D/g, ""); draw(); };
    $$("#schedFilter button", root).forEach((b) => b.onclick = () => {
      evSchedFilter = b.dataset.f;
      $$("#schedFilter button", root).forEach((x) => x.classList.toggle("on", x === b));
      draw();
    });
    $("#schedNext", root).onclick = () => {
      let next = $(".sched-row.upcoming", bodyEl);
      if (!next) { evSchedFilter = "all"; evSchedTeam = ""; renderSchedule(root); next = $(".sched-row.upcoming", root); }
      if (!next) { toast("Every match has been played"); return; }
      next.scrollIntoView({ behavior: "smooth", block: "center" });
      next.classList.add("flash"); setTimeout(() => next.classList.remove("flash"), 1600);
    };
  }

  /* ---- Rankings subpage (TBA rankings + on-device event EPA) --------------- */
  function renderEventRankings(root) {
    const s = Store.getSettings();
    root.innerHTML = `<div class="card tp-loading"><span class="tp-spin"></span>Loading rankings…</div>`;
    API.getEventRankings(s.eventKey).then(({ rankings, fromCache }) => {
      if (!root.isConnected) return;
      if (!rankings || !rankings.length) { root.innerHTML = `<div class="card">${emptyState("trophy", "No rankings yet", "Rankings appear once qualification matches are played.")}</div>`; return; }
      const ev = currentEventEpa();
      const rps = rankings.map((r) => (r.sort_orders && r.sort_orders[0]) || 0);
      const maxRp = Math.max(0.01, ...rps);
      root.innerHTML = `<section class="card ev-ranks">
        <div class="sr-head"><h3>${icon("trophy")} Qualification rankings</h3><span class="hint">${fromCache ? "cached · " : ""}top 8 are usually alliance captains</span></div>
        <div class="er-list">${rankings.map((r, i) => {
          const t = String(r.team_key).replace("frc", ""), rec = r.record || {}, rp = (r.sort_orders && r.sort_orders[0]) || 0;
          const e = ev && ev.byTeam[t];
          return `<button class="er-row${r.rank <= 8 ? " cap" : ""}${t === OUR_TEAM ? " ours" : ""}" data-team="${esc(t)}" data-tfill="${esc(t)}" style="animation-delay:${Math.min(i, 24) * 18}ms">
            <span class="er-rank">${r.rank}</span>
            <img class="team-avatar" data-avatar="${esc(t)}" alt="" />
            <span class="er-id"><b>${esc(t)}</b><span>${esc(nameFor(t))}</span></span>
            <span class="er-rp"><span class="er-track"><i style="width:${Math.round(rp / maxRp * 100)}%"></i></span><b>${fmt(rp, 2)}</b><small>RP</small></span>
            <span class="er-rec">${rec.wins ?? 0}-${rec.losses ?? 0}-${rec.ties ?? 0}</span>
            <span class="er-epa">${e ? fmt(e.epa) : "–"}<small>EPA</small></span>
          </button>`;
        }).join("")}</div></section>`;
      const ts = rankings.map((r) => String(r.team_key).replace("frc", ""));
      paintAvatars(root, ts); paintTeamFills(root, ts);
      $$("[data-team]", root).forEach((b) => b.onclick = () => openTeam(b.dataset.team));
    }).catch(() => { if (root.isConnected) root.innerHTML = `<div class="card">${emptyState("globe", "Rankings need wifi", "Connect once to load this event's rankings.")}</div>`; });
  }

  function openMatchDetail(m) {
    if (!m) return;
    // Win probability is based on this EVENT's EPA (computed on-device from played
    // qual matches). If any team on the match has no event EPA yet → "Unknown".
    const ev = currentEventEpa();
    const epaOf = (t) => (ev && ev.byTeam[t]) ? ev.byTeam[t].epa : null;
    const teamsOf = (c) => (m.alliances[c].team_keys || []).map((k) => k.replace("frc", ""));
    const red = teamsOf("red"), blue = teamsOf("blue");
    const haveAll = [...red, ...blue].every((t) => epaOf(t) != null);
    const redEpa = red.reduce((s, t) => s + (epaOf(t) || 0), 0);
    const blueEpa = blue.reduce((s, t) => s + (epaOf(t) || 0), 0);
    const pct = haveAll ? Math.round(winProb(redEpa, blueEpa) * 100) : null;
    const played = m.alliances && m.alliances.red.score >= 0 && m.alliances.blue.score >= 0;
    const label = (COMP_LABEL[m.comp_level] || "") + (m.comp_level === "qm" ? m.match_number : (m.set_number || m.match_number));
    const maxEpa = Math.max(1, ...[...red, ...blue].map((t) => epaOf(t) || 0));
    const teamLine = (t, col) => {
      const e = epaOf(t);
      return `<button class="md-team" data-team="${t}">
        <img class="team-avatar" data-avatar="${t}" data-ally="${col}" alt="" />
        <span class="md-tinfo"><span class="md-tnum">${t}</span><span class="md-tname">${esc(teamName(t))}</span></span>
        <span class="md-ebar"><span class="md-ebar-fill" style="width:${Math.round((e || 0) / maxEpa * 100)}%"></span></span>
        <span class="md-eval">${e != null ? fmt(e, 1) : "–"}</span>
      </button>`;
    };
    modal(`${m.comp_level === "qm" ? "Qualification " + m.match_number : label}`, `
      <div class="md-wrap">
        <div class="md-prob">
          ${pct != null ? `
          <div class="md-prob-head"><span class="md-prob-red">${pct}%</span>
            <span class="md-prob-mid">win probability${played ? "" : " · estimate"}</span>
            <span class="md-prob-blue">${100 - pct}%</span></div>
          <div class="md-prob-bar"><span class="mpb-red" style="width:${pct}%"></span><span class="mpb-blue" style="width:${100 - pct}%"></span></div>
          <p class="hint" style="margin:6px 0 0;text-align:center">Estimate from this event's on-device EPA (not an official prediction).</p>
          ` : `
          <div class="md-prob-head" style="justify-content:center"><span class="md-prob-mid" style="font-size:1rem">Win probability · Unknown</span></div>
          <p class="hint" style="margin:6px 0 0;text-align:center">No event EPA yet — it appears once these teams have played qualification matches at this event.</p>
          `}
        </div>
        ${played ? `<div class="md-final"><span class="mf-red">${m.alliances.red.score}</span><span class="mf-vs">final</span><span class="mf-blue">${m.alliances.blue.score}</span></div>` : ""}
        <div class="md-alliances">
          <div class="md-ally red"><div class="md-ally-head"><span class="alliance-dot alliance-red"></span>Red · ${fmt(redEpa, 0)} EPA</div>${red.map((t) => teamLine(t, "red")).join("")}</div>
          <div class="md-ally blue"><div class="md-ally-head"><span class="alliance-dot alliance-blue"></span>Blue · ${fmt(blueEpa, 0)} EPA</div>${blue.map((t) => teamLine(t, "blue")).join("")}</div>
        </div>
      </div>`,
      (body, close) => {
        paintAvatars(body, [...red, ...blue]);
        $$(".md-team", body).forEach((b) => b.onclick = () => { close(); openTeam(b.dataset.team); });
      });
  }

  async function paintSwatches(teamNums) {
    try {
      const colors = await API.getTeamColors(teamNums);
      teamNums.forEach((n) => {
        const sw = $(`[data-swatch="${n}"]`);
        if (!sw) return;
        const c = colors[n];
        const bars = sw.querySelectorAll("i");
        if (c && c.primary) bars[0].style.background = c.primary;
        if (c && c.secondary) bars[1].style.background = c.secondary;
      });
    } catch (e) { /* keep team-702 fallback colors */ }
  }

  // Accent elements with each team's frc-colors: [data-tring] gets a colored avatar
  // ring (primary border + secondary glow). We DON'T tint text — some teams' primary
  // is white/very light and would be unreadable.
  function paintTeamColors(el, teamNums) {
    if (!teamNums || !teamNums.length) return;
    API.getTeamColors(teamNums).then((colors) => {
      teamNums.forEach((n) => {
        const c = colors[n]; if (!c || !c.primary) return;
        $$(`[data-tring="${n}"]`, el).forEach((x) => {
          x.style.border = `2.5px solid ${c.primary}`;
          if (c.secondary) x.style.boxShadow = `0 0 0 1.5px ${c.secondary}`;
        });
      });
    }).catch(() => {});
  }

  /* ---- Team detail modal --------------------------------------------------- */
  function openTeam(team) {
    const st = computeStats(team);
    const pit = allPits()[team];
    const ms = allMatches().filter((m) => String(m.team) === String(team));

    const statRows = [
      ["Matches scouted", st.matches],
      ["Broke down / tipped", Math.round(st.diedRate * 100) + "%"],
      ["Plays defense", Math.round(st.defenseRate * 100) + "%"],
      ["Avg driver skill", st.avgDriver ? fmt(st.avgDriver) + " / 5" : "–"],
      ["Fouls committed", fmt(st.avgFouls)],
      ["Average bps", fmt(st.avgBps)],
      ["Cycles per match", fmt(st.avgCycles)],
    ];

    const pitHTML = pit ? `${pit.photo ? `<img class="pit-photo" src="${pit.photo}" alt="Team ${esc(team)} robot" />` : ""}<div class="table-wrap"><table><tbody>${
      pitFields().map((f) => pit[f.key] != null && pit[f.key] !== "" && f.key !== "photo" ?
        `<tr><td class="muted">${esc(f.label)}</td><td>${esc(pit[f.key] === true ? "Yes" : pit[f.key] === false ? "No" : pit[f.key])}</td></tr>` : "").join("")
      }</tbody></table></div>` : `<p class="muted">No pit data yet. <a data-act="pit">Pit scout this team →</a></p>`;

    // ---- BagelStats EPA block ----
    const sbRow = (API.sbCachedLeaderboard(GAME.season) || []).find((r) => r.team === String(team));
    const ev = currentEventEpa();
    const evRow = ev && ev.byTeam[team];
    const s2 = Store.getSettings();
    const evLabel = s2.eventName ? esc(s2.eventName) : "Event";
    const epaCard = `
      <div class="card flush epa-card">
        <div class="row" style="gap:10px;margin-bottom:10px">${icon("chart")}<h3 style="margin:0">BagelStats EPA</h3></div>
        <div class="epa-ranks">
          <button class="epa-rank" data-jump="world" ${sbRow ? "" : "disabled"}>
            <span class="er-label">${icon("globe")} World rank</span>
            <span class="er-val">${sbRow ? "#" + sbRow.worldRank : "—"}</span>
            ${sbRow ? `<span class="er-sub">${icon("chevron-right")}</span>` : ""}
          </button>
          <button class="epa-rank" data-jump="event" ${evRow ? "" : "disabled"}>
            <span class="er-label">${icon("chart")} ${evLabel} rank</span>
            <span class="er-val">${evRow ? "#" + evRow.rank + " / " + evRow.outOf : "—"}</span>
            ${evRow ? `<span class="er-sub">${icon("chevron-right")}</span>` : ""}
          </button>
        </div>
        <div class="epa-modes">
          <div class="epa-mode"><span class="em-label">All events (season)</span><span class="em-val">${sbRow ? fmt(sbRow.epa) : "—"}</span></div>
          <div class="epa-mode" id="lastEvtMode" title="Loading…"><span class="em-label">Last event</span><span class="em-val" id="lastEvtEpa">…</span></div>
          <div class="epa-mode"><span class="em-label">Ongoing event</span><span class="em-val">${evRow ? fmt(evRow.epa) : "—"}</span></div>
        </div>
        ${sbRow && sbRow.record ? `<div class="epa-record">Season record <b>${sbRow.record.w}–${sbRow.record.l}–${sbRow.record.t}</b> <span class="hint">(W–L–T)</span></div>` : ""}
        ${!sbRow ? `<p class="hint" style="margin:10px 0 0">World & season EPA come from Statbotics — open <b>BagelStats → World</b> while online to load them.</p>` : ""}
        <div class="epa-trend">
          <div class="row between" style="margin:14px 0 8px">
            <span class="er-label">EPA over time</span>
            <div class="pill-toggle" id="trendFilter">
              <button data-tf="season" class="on">Season</button>
              <button data-tf="event">Event</button>
            </div>
          </div>
          <div id="epaChart"><p class="hint">Loading trend…</p></div>
        </div>
      </div>`;

    modal(`Team ${team}${teamName(team) ? " · " + teamName(team) : ""}`, `
      <button class="tp-open" data-act="profile">
        <span class="tp-open-ico">${icon("user")}</span>
        <span class="tp-open-txt"><b>View full profile</b><span>Every event, win rate, EPA, awards &amp; all our scouting</span></span>
        ${icon("arrow-right")}
      </button>` + epaCard + `
      <div class="grid cols-2 team-detail-grid">
        <div class="card flush"><h3>Match performance</h3>
          ${st.matches ? `<div class="table-wrap"><table><tbody>${
            statRows.map(([k, v]) => `<tr><td class="muted">${esc(k)}</td><td class="num">${esc(v)}</td></tr>`).join("")
          }</tbody></table></div>` : `<p class="muted">No match records yet.</p>`}
        </div>
        <div class="card flush"><h3>Pit scouting</h3>${pitHTML}</div>
      </div>
      <div class="card flush" style="margin-top:14px"><h3>Notes from matches</h3>
        ${ms.filter((m) => m.notes).length ? ms.filter((m) => m.notes).map((m) =>
          `<p class="hint">Q${esc(m.matchNumber || "?")}: ${esc(m.notes)}</p>`).join("") : `<p class="muted">No notes logged.</p>`}
      </div>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn primary" data-act="match">${icon("plus")} Scout a match</button>
        <button class="btn secondary" data-act="pit">${icon("wrench")} Pit scout</button>
        <button class="btn ghost" data-act="compare">${icon("compare")} Compare</button>
      </div>`, (body, close) => {
      const jw = $('[data-jump="world"]', body);
      if (jw && !jw.disabled) jw.onclick = () => { close(); gotoBagel("world", String(team)); };
      const je = $('[data-jump="event"]', body);
      if (je && !je.disabled) je.onclick = () => { close(); gotoBagel("event", String(team)); };
      const lastEl = $("#lastEvtEpa", body);
      const lastMode = $("#lastEvtMode", body);
      if (lastEl) {
        API.sbTeamEvents(team, GAME.season).then(({ rows }) => {
          const withEpa = rows.filter((r) => r.epa != null);
          if (!withEpa.length) { lastEl.textContent = "—"; if (lastMode) lastMode.title = "No event EPA found"; return; }
          withEpa.sort((a, b) => (b.week || 0) - (a.week || 0));
          const le = withEpa[0];
          lastEl.textContent = fmt(le.epa);
          if (lastMode) lastMode.title = `${le.name || le.event || "Last event"} — EPA from Statbotics`;
        }).catch(() => { lastEl.textContent = "—"; if (lastMode) lastMode.title = "Statbotics offline"; });
      }
      // EPA-over-time trend chart (Season shows event dividers)
      const chartEl = $("#epaChart", body);
      if (chartEl) {
        let allMatches = null;
        const ek = Store.getSettings().eventKey;
        const drawTrend = (mode) => {
          if (!allMatches) return;
          const series = mode === "event" ? allMatches.filter((m) => m.event === ek) : allMatches;
          renderLineChart(chartEl, series.map((m) => ({ epa: m.epa, event: m.event })), { dividers: mode !== "event" });
        };
        API.sbTeamMatches(team, GAME.season).then((rows) => {
          allMatches = rows;
          drawTrend("season");
        }).catch(() => { chartEl.innerHTML = `<p class="hint">EPA trend needs Statbotics (offline).</p>`; });
        $$("#trendFilter button", body).forEach((b) => b.onclick = () => {
          $$("#trendFilter button", body).forEach((x) => x.classList.toggle("on", x === b));
          drawTrend(b.dataset.tf);
        });
      }
      // Wire EVERY element carrying a data-act (there can be more than one per
      // action — e.g. both the "Pit scout this team →" link inside the pit card
      // and the Pit scout button share data-act="pit").
      const onAct = (name, fn) => $$(`[data-act="${name}"]`, body).forEach((el) => el.onclick = (e) => { e.preventDefault(); fn(); });
      onAct("match", () => { close(); go("match"); setTimeout(() => prefillMatchTeam(team), 60); });
      onAct("pit", () => { close(); go("pit"); setTimeout(() => prefillPitTeam(team), 60); });
      onAct("compare", () => { close(); addToCompare(String(team)); });
      onAct("profile", () => { close(); location.hash = "#/team/" + team; });
    });
  }

  /* ===========================================================================
     VIEW: TEAM PROFILE  (#/team/<number>[/<year>])
     Full-page version of the team popup: TBA profile + every event of the season
     (rank, record, win rate, alliance, playoff result, awards, all matches),
     Statbotics ranks/EPA, the EPA trend, and our own scouting report.
     ======================================================================== */
  let teamPageTab = "events", tpResize = null;
  // TBA award types that earn a blue banner: Impact/Chairman's (0), Winner (1), Engineering Inspiration (9).
  const BANNER_TYPES = [0, 1, 9];
  const FIRST_MARK = `<span class="bb-badge" aria-hidden="true"><img src="media/frclogo.png" alt="" /></span>`;
  const bannerName = (a) => a.award_type === 1
    ? (/division/i.test(a.name) ? "Division Winner" : /(championship|einstein)/i.test(a.name) && !/(regional|district|state)/i.test(a.name) ? "World Champion" : "Event Winner")
    : a.award_type === 0 ? (/impact/i.test(a.name) ? "Impact Award" : "Chairman's Award") : "Engineering Inspiration";
  const shortEventName = (n) => String(n || "").replace(/\s+presented by.*$/i, "").replace(/^FIRST\s+/i, "").replace(/\s+sponsored by.*$/i, "");
  const FRC_GAMES = { 2027: "BIOCORE", 2026: "REBUILT", 2025: "REEFSCAPE", 2024: "CRESCENDO", 2023: "CHARGED UP", 2022: "RAPID REACT",
    2021: "INFINITE RECHARGE", 2020: "INFINITE RECHARGE", 2019: "DESTINATION: DEEP SPACE", 2018: "FIRST POWER UP", 2017: "FIRST STEAMWORKS",
    2016: "FIRST STRONGHOLD", 2015: "RECYCLE RUSH", 2014: "AERIAL ASSIST", 2013: "ULTIMATE ASCENT", 2012: "REBOUND RUMBLE", 2011: "LOGO MOTION",
    2010: "BREAKAWAY", 2009: "LUNACY", 2008: "FIRST OVERDRIVE", 2007: "RACK 'N' ROLL", 2006: "AIM HIGH", 2005: "TRIPLE PLAY",
    2004: "FIRST FRENZY", 2003: "STACK ATTACK", 2002: "ZONE ZEAL", 2001: "DIABOLICAL DILEMMA", 2000: "CO-OPERTITION FIRST",
    1999: "DOUBLE TROUBLE", 1998: "LADDER LOGIC", 1997: "TOROID TERROR", 1996: "HEXAGON HYSTERIA", 1995: "RAMP 'N ROLL", 1994: "TOWER POWER",
    1993: "RUG RAGE", 1992: "MAIZE CRAZE" };
  function teamRoute() {
    const p = location.hash.replace(/^#\/?/, "").split("/");
    const history = p[2] === "history";
    return { team: String(p[1] || "").replace(/\D/g, ""), year: history ? GAME.season : (Number(p[2]) || GAME.season), history };
  }
  const COMP_NAME = { qm: "Qualifications", ef: "Eighth-finals", qf: "Quarterfinals", sf: "Semifinals", f: "Finals" };
  const playoffText = (p, dbl) => {
    if (!p) return "";
    if (p.status === "won") return p.level === "f" ? "Event winner" : `Won ${COMP_NAME[p.level] || "playoffs"}`;
    if (p.status === "eliminated") return dbl ? `Out in ${dbl}` : `Out in ${COMP_NAME[p.level] || "playoffs"}`;
    if (p.status === "playing") return `Playing ${COMP_NAME[p.level] || "playoffs"}`;
    return "";
  };
  const allianceText = (a) => {
    if (!a || a.number == null) return "";
    const role = a.pick === 0 ? "Captain" : a.pick === 1 ? "1st pick" : a.pick === 2 ? "2nd pick" : a.pick === 3 ? "3rd pick" : "Backup";
    return `${role} · Alliance ${a.number}`;
  };
  function ringSVG(frac, label) {
    const r = 22, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
    return `<svg class="tp-ring" viewBox="0 0 56 56" role="img" aria-label="${esc(label)}">
      <circle cx="28" cy="28" r="${r}" class="tp-ring-bg"/>
      <circle cx="28" cy="28" r="${r}" class="tp-ring-fg" style="stroke-dasharray:${(c * f).toFixed(1)} ${c.toFixed(1)}"/>
      <text x="28" y="32" text-anchor="middle">${Math.round(f * 100)}%</text></svg>`;
  }
  // Count numbers up from 0 for elements carrying data-count="<value>" data-dec="<decimals>".
  function countUp(el) {
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    $$("[data-count]", el).forEach((n) => {
      const to = Number(n.dataset.count), dec = Number(n.dataset.dec || 0), pre = n.dataset.pre || "";
      const out = (v) => pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString());
      if (reduce || !isFinite(to)) { n.textContent = out(to); return; }
      const start = performance.now(), dur = 800;
      const step = (now) => {
        if (!n.isConnected) return;
        const p = Math.min(1, (now - start) / dur);
        n.textContent = out(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      setTimeout(() => { if (n.isConnected) n.textContent = out(to); }, dur + 200);
    });
  }

  function renderTeamPage(root) {
    const { team, year, history } = teamRoute();
    if (history) teamPageTab = "history";
    if (!team) { root.innerHTML = `<div class="card">${emptyState("search", "No team", "Open a team from Events, BagelStats or Data.")}</div>`; return; }
    $("#pageTitle").textContent = "Team " + team;
    const pit = Store.season === year || GAME.season === year ? allPits()[team] : null;
    const ourMatches = allMatches().filter((m) => String(m.team) === team).length;
    root.innerHTML = `
      <div class="tp">
        <section class="thero tp-hero" data-tfill="${esc(team)}">
          <span class="thero-mark" aria-hidden="true">${esc(team)}</span>
          <div class="tp-hero-main">
            <img class="team-avatar thero-av tp-av" data-avatar="${esc(team)}" alt="" />
            <div class="thero-id">
              <span class="thero-num">${esc(team)}</span>
              <span class="thero-name" id="tpName">${esc(nameFor(team)) || "&nbsp;"}</span>
              <span class="tp-loc" id="tpLoc"></span>
              <span class="thero-chips">
                <span class="thero-chip">${icon("binoculars")} ${ourMatches} scouted by us</span>
                <span class="thero-chip">${icon("clipboard")} ${allPits()[team] ? "Pit scouted" : "No pit data"}</span>
              </span>
            </div>
          </div>
          <div class="tp-hero-side">
            ${pit && pit.photo ? `<button class="tp-robot" id="tpRobot" aria-label="View robot photo"><img src="${esc(pit.photo)}" alt="Team ${esc(team)} robot" /></button>` : ""}
            <div class="tp-links">
              <label class="tp-year">${icon("calendar")}<select id="tpYear" aria-label="Season"><option>${year}</option></select></label>
              <a class="tp-link" href="https://www.thebluealliance.com/team/${esc(team)}/${year}" target="_blank" rel="noopener">${icon("external")} TBA</a>
              <a class="tp-link" href="https://www.statbotics.io/team/${esc(team)}" target="_blank" rel="noopener">${icon("external")} Statbotics</a>
              <span id="tpWeb"></span>
            </div>
          </div>
          <span class="thero-accent"></span>
        </section>

        <div class="tp-tiles" id="tpTiles">${Array.from({ length: 6 }, () => `<div class="tp-tile skel"></div>`).join("")}</div>
        <div class="card tp-epa" id="tpEpa" hidden></div>
        <section class="card tp-banners" id="tpBanners" hidden></section>

        <div class="tp-tabbar" role="tablist" id="tpTabs">
          <button data-tp="events" role="tab">${icon("calendar")} Events <b id="tpEvCount"></b></button>
          <button data-tp="scouting" role="tab">${icon("binoculars")} Our scouting</button>
          <button data-tp="trend" role="tab">${icon("linegraph")} EPA trend</button>
          <button data-tp="awards" role="tab">${icon("trophy")} Awards <b id="tpAwCount"></b></button>
          <button data-tp="history" role="tab">${icon("clock")} History</button>
          <span class="tp-ink" aria-hidden="true"></span>
        </div>
        <div id="tpPanel" class="tp-panel"></div>

        <div class="btn-row tp-actions">
          <button class="btn primary" data-tact="match">${icon("plus")} Scout a match</button>
          <button class="btn secondary" data-tact="pit">${icon("wrench")} Pit scout</button>
          <button class="btn ghost" data-tact="compare">${icon("compare")} Compare</button>
          <button class="btn ghost" data-tact="data">${icon("database")} Data report</button>
        </div>
      </div>`;
    paintAvatars(root, [team]);
    paintTeamFills(root, [team]);

    const robot = $("#tpRobot", root);
    if (robot) robot.onclick = () => modal(`Team ${team} robot`, `<img class="sr-photo-full" src="${esc(pit.photo)}" alt="Team ${esc(team)} robot" />`);
    $$("[data-tact]", root).forEach((b) => b.onclick = () => {
      const a = b.dataset.tact;
      if (a === "match") { go("match"); setTimeout(() => prefillMatchTeam(team), 60); }
      else if (a === "pit") { go("pit"); setTimeout(() => prefillPitTeam(team), 60); }
      else if (a === "compare") addToCompare(team);
      else location.hash = "#/data/search/team/" + team;
    });

    // ---- Tabs (sliding ink + animated panel) ----
    const state = { season: null, sbEvents: [], sbYear: null, trend: null, loadErr: false };
    const tabs = $("#tpTabs", root), panel = $("#tpPanel", root);
    const moveInk = () => {
      const on = $(`[data-tp="${teamPageTab}"]`, tabs), ink = $(".tp-ink", tabs);
      if (!on || !ink) return;
      ink.style.width = on.offsetWidth + "px";
      ink.style.transform = `translateX(${on.offsetLeft}px)`;
    };
    const order = ["events", "scouting", "trend", "awards", "history"];
    const showTab = (name, dir) => {
      teamPageTab = name;
      $$("[data-tp]", tabs).forEach((b) => { const on = b.dataset.tp === name; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
      moveInk();
      panel.className = "tp-panel " + (dir > 0 ? "in-right" : dir < 0 ? "in-left" : "in");
      void panel.offsetWidth;
      drawPanel();
    };
    $$("[data-tp]", tabs).forEach((b) => b.onclick = () => {
      if (b.dataset.tp === teamPageTab) return;
      showTab(b.dataset.tp, order.indexOf(b.dataset.tp) - order.indexOf(teamPageTab));
    });
    if (tpResize) window.removeEventListener("resize", tpResize);
    tpResize = moveInk;
    window.addEventListener("resize", tpResize, { passive: true });

    const loading = (what) => `<div class="card tp-loading"><span class="tp-spin"></span>Loading ${esc(what)}…</div>`;
    function drawPanel() {
      if (teamPageTab === "scouting") {
        panel.innerHTML = (year !== GAME.season ? `<div class="card tp-note">${icon("clock")} Our scouting below is from the <b>${GAME.season}</b> season you're viewing in the app.</div>` : "") + scoutReportHTML(team);
        wireScoutReport(panel, team);
        return;
      }
      if (teamPageTab === "trend") return drawTrend();
      if (teamPageTab === "awards") return drawAwards();
      if (teamPageTab === "history") return drawHistory();
      return drawEvents();
    }

    function drawEvents() {
      const s = state.season;
      if (!s) { panel.innerHTML = state.loadErr ? `<div class="card">${emptyState("globe", "Couldn't load events", "The Blue Alliance needs wifi the first time. Try again online.")}</div>` : loading("events"); return; }
      const evs = s.events.slice().sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
      if (!evs.length) { panel.innerHTML = `<div class="card">${emptyState("calendar", `No ${year} events`, seasonUpcoming() && year === GAME.season ? "Events appear once they're scheduled with this team registered." : "This team didn't compete this season.")}</div>`; return; }
      const sbBy = {}; state.sbEvents.forEach((r) => { sbBy[r.event] = r; });
      const lvl = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
      const tk = "frc" + team;
      const dateRange = (e) => {
        const a = e.start_date ? new Date(e.start_date + "T12:00:00") : null, b = e.end_date ? new Date(e.end_date + "T12:00:00") : null;
        if (!a) return "";
        const f = (d, o) => d.toLocaleDateString([], o);
        return b && b - a > 0 ? `${f(a, { month: "short", day: "numeric" })} – ${f(b, a.getMonth() === b.getMonth() ? { day: "numeric" } : { month: "short", day: "numeric" })}` : f(a, { month: "short", day: "numeric" });
      };
      panel.innerHTML = `<div class="tp-timeline">${evs.map((e, idx) => {
        const st = s.statuses[e.key] || {}, q = (st.qual && st.qual.ranking) || null, sb = sbBy[e.key];
        const ms = s.matches.filter((m) => m.event_key === e.key)
          .sort((a, b) => (lvl[a.comp_level] - lvl[b.comp_level]) || (a.set_number - b.set_number) || (a.match_number - b.match_number));
        let w = 0, l = 0, t = 0;
        ms.forEach((m) => {
          const rs = m.alliances.red.score, bs = m.alliances.blue.score;
          if (rs < 0 || bs < 0 || rs == null) return;
          const mine = m.alliances.red.team_keys.includes(tk) ? "red" : "blue";
          if (rs === bs) t++; else if ((rs > bs) === (mine === "red")) w++; else l++;
        });
        const played = w + l + t, wr = played ? w / played : null;
        const awards = s.awards.filter((a) => a.event_key === e.key);
        const po = playoffText(st.playoff, st.playoff && st.playoff.double_elim_round);
        const won = st.playoff && st.playoff.status === "won" && st.playoff.level === "f";
        const week = e.week != null ? `Week ${e.week + 1}` : (e.event_type === 3 || e.event_type === 4 ? "Championship" : (e.event_type_string || "Offseason"));
        const label = (m) => (m.comp_level === "qm" ? "Q" : m.comp_level === "f" ? "F" : m.comp_level.toUpperCase()) + (m.comp_level === "qm" ? m.match_number : (m.comp_level === "sf" ? m.set_number : m.match_number));
        const chips = (keys) => keys.map((k) => { const n = k.replace("frc", ""); return `<button class="tp-tchip${k === tk ? " me" : ""}" data-goteam="${n}">${n}</button>`; }).join("");
        const rows = ms.map((m) => {
          const rs = m.alliances.red.score, bs = m.alliances.blue.score, done = rs != null && rs >= 0 && bs >= 0;
          const mine = m.alliances.red.team_keys.includes(tk) ? "red" : "blue";
          const res = !done ? "" : rs === bs ? "T" : ((rs > bs) === (mine === "red") ? "W" : "L");
          return `<tr class="${mine}">
            <td class="tp-ml">${label(m)}</td>
            <td><span class="tp-ally red">${chips(m.alliances.red.team_keys)}</span></td>
            <td><span class="tp-ally blue">${chips(m.alliances.blue.team_keys)}</span></td>
            <td class="tp-score">${done ? `<span class="${rs > bs ? "win" : ""}">${rs}</span><i>–</i><span class="${bs > rs ? "win" : ""}">${bs}</span>` : `<span class="muted">upcoming</span>`}</td>
            <td>${res ? `<span class="tp-res ${res}">${res}</span>` : ""}</td></tr>`;
        }).join("");
        return `<article class="tp-event${won ? " winner" : ""}" style="--i:${idx}">
          <div class="tp-ev-dot" aria-hidden="true"></div>
          <div class="tp-ev-card">
            <header class="tp-ev-head">
              <div>
                <span class="tp-ev-week">${esc(week)} · ${esc(dateRange(e))}</span>
                <h3 class="tp-ev-name">${esc(e.name)}</h3>
                <span class="tp-ev-loc">${icon("map-pin")} ${esc([e.city, e.state_prov, e.country].filter(Boolean).join(", "))}</span>
              </div>
              ${po ? `<span class="tp-po${won ? " gold" : ""}">${won ? icon("trophy") : icon("flag")} ${esc(po)}</span>` : ""}
            </header>
            <div class="tp-ev-stats">
              <div class="tp-stat"><span>Rank</span><b>${q ? `${q.rank}<small>/${st.qual.num_teams || "?"}</small>` : (sb && sb.rank ? `${sb.rank}<small>/${sb.numTeams || "?"}</small>` : "–")}</b></div>
              <div class="tp-stat"><span>Record</span><b>${played ? `${w}-${l}-${t}` : "–"}</b></div>
              <div class="tp-stat ring">${wr != null ? ringSVG(wr, "Win rate") : `<b>–</b>`}<span>Win rate</span></div>
              <div class="tp-stat"><span>Event EPA</span><b>${sb && sb.epa != null ? fmt(sb.epa) : "–"}</b></div>
              <div class="tp-stat wide"><span>Alliance</span><b class="small">${esc(allianceText(st.alliance)) || "Not selected"}</b></div>
            </div>
            ${awards.length ? `<div class="tp-awards">${awards.map((a) => `<span class="tp-award">${icon("trophy")} ${esc(a.name)}</span>`).join("")}</div>` : ""}
            ${ms.length ? `<details class="tp-matches"${idx === evs.length - 1 ? " open" : ""}>
              <summary>${icon("list")} ${ms.length} matches ${icon("chevron-right")}</summary>
              <div class="table-wrap"><table class="tp-mtable">
                <thead><tr><th>Match</th><th>Red</th><th>Blue</th><th>Score</th><th></th></tr></thead>
                <tbody>${rows}</tbody></table></div>
            </details>` : `<p class="hint" style="margin:10px 0 0">No matches posted yet.</p>`}
          </div>
        </article>`;
      }).join("")}</div>`;
      $$("[data-goteam]", panel).forEach((b) => b.onclick = () => { location.hash = "#/team/" + b.dataset.goteam + (year !== GAME.season ? "/" + year : ""); });
    }

    // ---- Blue banners (event wins, Impact/Chairman's, Engineering Inspiration) ----
    function drawBanners() {
      const el = $("#tpBanners", root), h = state.hist;
      if (!el || !h) return;
      const ban = h.awards.filter((a) => BANNER_TYPES.includes(a.award_type)).sort((a, b) => a.year - b.year);
      if (!ban.length) { el.hidden = true; return; }
      const evName = {}; h.events.forEach((e) => { evName[e.key] = e.name; });
      el.hidden = false;
      el.innerHTML = `<div class="sr-head"><h3>${icon("flag")} Blue banners <span class="muted">${ban.length}</span></h3>
          <span class="hint">event wins, Impact / Chairman's &amp; Engineering Inspiration</span></div>
        <div class="bb-strip">${ban.map((a, i) => `
          <a class="bb-banner" href="#/team/${esc(team)}/${a.year}" style="--i:${i}" title="${esc(a.name)} · ${esc(evName[a.event_key] || a.event_key)}">
            ${FIRST_MARK}
            <b>${esc(bannerName(a))}</b>
            <span class="bb-year">${a.year}</span>
            <small>${esc(shortEventName(evName[a.event_key] || a.event_key))}</small>
          </a>`).join("")}</div>`;
      $$(".bb-banner", el).forEach((a) => a.addEventListener("click", () => { teamPageTab = "events"; }));
    }

    // ---- History tab: every season, all-time totals, normalized EPA by year ----
    function loadHistory() {
      if (state.histLoading || state.histYears) return;
      state.histLoading = true;
      API.sbTeamHistory(team).then((ys) => { state.histYears = ys; })
        .catch(() => { state.histYears = []; })
        .finally(() => { state.histLoading = false; if (root.isConnected && teamPageTab === "history") drawPanel(); });
    }
    function drawHistory() {
      if (!state.histYears || !state.hist) { panel.innerHTML = loading("team history"); loadHistory(); return; }
      const ys = state.histYears, h = state.hist;
      const by = {};
      const slot = (y) => (by[y] = by[y] || { events: [], awards: [] });
      h.events.forEach((e) => slot(e.year).events.push(e));
      h.awards.forEach((a) => slot(a.year).awards.push(a));
      ys.forEach((y) => slot(y.year));
      const years = Object.keys(by).map(Number).sort((a, b) => b - a);
      if (!years.length) { panel.innerHTML = `<div class="card">${emptyState("clock", "No history found", "The Blue Alliance and Statbotics have nothing for this team yet.")}</div>`; return; }
      const sb = {}; ys.forEach((y) => { sb[y.year] = y; });
      const rec = ys.reduce((t, y) => ({ w: t.w + y.record.w, l: t.l + y.record.l, t: t.t + y.record.t }), { w: 0, l: 0, t: 0 });
      const games = rec.w + rec.l + rec.t;
      const banners = h.awards.filter((a) => BANNER_TYPES.includes(a.award_type));
      const withNorm = ys.filter((y) => y.norm != null);
      const best = withNorm.slice().sort((a, b) => b.norm - a.norm)[0];
      const rookie = (state.info && state.info.rookie_year) || years[years.length - 1];
      const tile = (l, v, s2, hl) => `<div class="tp-tile${hl ? " hl" : ""}"><span class="tp-tile-l">${l}</span><b class="tp-tile-v">${v}</b><span class="tp-tile-s">${s2 || "&nbsp;"}</span></div>`;

      // Normalized-EPA bar chart (1500 ≈ an average team in any year).
      let chart = "";
      if (withNorm.length) {
        const pts = withNorm, n = pts.length, W = Math.max(560, n * 34), H = 210, pad = { l: 40, r: 10, t: 16, b: 30 };
        const lo = Math.min(1400, ...pts.map((y) => y.norm)) - 40, hi = Math.max(1650, ...pts.map((y) => y.norm)) + 20;
        const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
        const bw = (W - pad.l - pad.r) / n;
        const banYears = new Set(banners.map((a) => a.year));
        chart = `<svg class="th-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Normalized EPA by season">
          <line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(1500).toFixed(1)}" y2="${Y(1500).toFixed(1)}" class="th-avg"/>
          <text x="${pad.l - 6}" y="${(Y(1500) + 4).toFixed(1)}" class="th-axis" text-anchor="end">1500</text>
          <text x="${W - pad.r}" y="${(Y(1500) - 5).toFixed(1)}" class="th-axis" text-anchor="end">average team</text>
          ${pts.map((y, i) => {
            const x = pad.l + i * bw + bw * 0.16, w = bw * 0.68, top = Y(y.norm), base = H - pad.b;
            return `<g class="th-bar${best && y.year === best.year ? " best" : ""}${y.year === year ? " cur" : ""}" data-hyear="${y.year}" style="--i:${i}">
              <title>${y.year} · normalized EPA ${Math.round(y.norm)}${y.epa != null ? ` (${fmt(y.epa)} pts)` : ""}</title>
              <rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(2, base - top).toFixed(1)}" rx="4"/>
              ${banYears.has(y.year) ? `<path class="th-flag" d="M${(x + w / 2 - 5).toFixed(1)} ${(top - 14).toFixed(1)}h10v9l-5-3-5 3z"/>` : ""}
              <text x="${(x + w / 2).toFixed(1)}" y="${H - 10}" class="th-axis" text-anchor="middle">'${String(y.year).slice(2)}</text>
            </g>`;
          }).join("")}
        </svg>`;
      }
      panel.innerHTML = `
        <div class="tp-tiles th-tiles">
          ${tile("Rookie year", rookie || "–", rookie ? `${new Date().getFullYear() - rookie} years ago` : "")}
          ${tile("Seasons", years.length, `${years[years.length - 1]}–${years[0]}`)}
          ${tile("All-time record", games ? `${rec.w}-${rec.l}-${rec.t}` : "–", games ? `${Math.round(rec.w / games * 100)}% win rate` : "")}
          ${tile("Events", h.events.length, "competed at")}
          ${tile("Awards", h.awards.length, `${banners.length} blue banner${banners.length === 1 ? "" : "s"}`, banners.length > 0)}
          ${tile("Best season", best ? best.year : "–", best ? `${Math.round(best.norm)} normalized EPA` : "")}
        </div>
        ${chart ? `<section class="card th-chart-card"><div class="sr-head"><h3>${icon("chart")} Strength by season</h3>
            <span class="hint">normalized EPA, so different games compare fairly · ${icon("flag")} = blue banner · tap a bar</span></div>
            <div class="th-chart-wrap">${chart}</div></section>` : ""}
        <div class="th-list">${years.map((y, i) => {
          const d = by[y], st = sb[y], g = st ? st.record.w + st.record.l + st.record.t : 0;
          const bans = d.awards.filter((a) => BANNER_TYPES.includes(a.award_type));
          return `<a class="th-year${y === year ? " cur" : ""}" href="#/team/${esc(team)}/${y}" style="animation-delay:${Math.min(i, 20) * 25}ms">
            <div class="th-y"><b>${y}</b><span>${esc(FRC_GAMES[y] || "")}</span></div>
            <div class="th-mid">
              ${d.events.length ? `<div class="th-evs">${d.events.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || "")).map((e) =>
                `<span class="th-ev">${esc(shortEventName(e.name))}</span>`).join("")}</div>` : `<span class="hint">No events listed</span>`}
              ${d.awards.length ? `<div class="th-aws">${d.awards.map((a) => `<span class="tp-award${BANNER_TYPES.includes(a.award_type) ? " blue" : ""}">${icon(BANNER_TYPES.includes(a.award_type) ? "flag" : "trophy")} ${esc(a.name)}</span>`).join("")}</div>` : ""}
            </div>
            <div class="th-stats">
              ${st && st.norm != null ? `<div><b>${Math.round(st.norm)}</b><span>norm EPA</span></div>` : ""}
              ${g ? `<div><b>${st.record.w}-${st.record.l}-${st.record.t}</b><span>${Math.round(st.record.w / g * 100)}% wins</span></div>` : ""}
              ${st && st.pct != null ? `<div><b>${Math.max(1, Math.round((1 - st.pct) * 100))}%</b><span>top of world</span></div>` : ""}
              ${bans.length ? `<div class="bn"><b>${bans.length}</b><span>banner${bans.length === 1 ? "" : "s"}</span></div>` : ""}
            </div>
            ${icon("chevron-right")}
          </a>`;
        }).join("")}</div>`;
      $$("[data-hyear]", panel).forEach((g) => g.onclick = () => { teamPageTab = "events"; location.hash = "#/team/" + team + "/" + g.dataset.hyear; });
      $$(".th-year", panel).forEach((a) => a.addEventListener("click", () => { teamPageTab = "events"; }));
    }

    function drawAwards() {
      const s = state.season;
      if (!s) { panel.innerHTML = loading("awards"); return; }
      if (!s.awards.length) { panel.innerHTML = `<div class="card">${emptyState("trophy", `No ${year} awards`, "Awards show up here as events finish.")}</div>`; return; }
      const evName = {}; s.events.forEach((e) => { evName[e.key] = e.name; });
      panel.innerHTML = `<div class="tp-award-grid">${s.awards.map((a, i) => `
        <div class="card tp-award-card" style="--i:${i}">${icon("trophy")}<b>${esc(a.name)}</b><span>${esc(evName[a.event_key] || a.event_key)}</span></div>`).join("")}</div>`;
    }

    function drawTrend() {
      panel.innerHTML = `<div class="card"><div class="sr-head"><h3>${icon("linegraph")} EPA over the season</h3>
          <span class="hint">every match · dividers mark events</span></div><div id="tpChart">${state.trend ? "" : `<p class="hint">Loading trend…</p>`}</div></div>
        <div class="card" style="margin-top:14px"><div class="sr-head"><h3>${icon("chart")} EPA by event</h3></div><div id="tpEvBars"></div></div>`;
      const chart = $("#tpChart", panel);
      if (state.trend) renderLineChart(chart, state.trend.map((m) => ({ epa: m.epa, event: m.event })), { dividers: true });
      else if (state.trendErr) chart.innerHTML = `<p class="hint">${seasonUpcoming() && year === GAME.season ? `No ${year} matches yet.` : "EPA trend needs Statbotics (offline?)."}</p>`;
      const bars = $("#tpEvBars", panel);
      const rows = state.sbEvents.filter((r) => r.epa != null).sort((a, b) => (a.week ?? 99) - (b.week ?? 99));
      if (!rows.length) { bars.innerHTML = `<p class="muted">No event EPA yet.</p>`; return; }
      const hi = Math.max(...rows.map((r) => r.epa));
      bars.innerHTML = rows.map((r) => `<div class="tp-evbar"><span class="tp-evbar-name">${esc(r.name || r.event)}</span>
        <span class="tp-evbar-track"><i style="width:${Math.round(r.epa / hi * 100)}%"></i></span><b>${fmt(r.epa)}</b></div>`).join("");
    }

    function drawTiles() {
      const y = state.sbYear, tilesEl = $("#tpTiles", root);
      if (!y) {
        tilesEl.innerHTML = `<div class="card tp-note">${icon("chart")} ${seasonUpcoming() && year === GAME.season
          ? `No ${year} EPA yet. Statbotics ranks start once the season's matches begin.` : "Season stats need Statbotics (offline?)."}</div>`;
        return;
      }
      const rk = (o, label) => `<div class="tp-tile"><span class="tp-tile-l">${esc(label)}</span>
        <b class="tp-tile-v">${o ? `<span data-count="${o.rank}" data-pre="#">#${o.rank}</span>` : "–"}</b>
        <span class="tp-tile-s">${o ? `of ${o.count.toLocaleString()}${o.pct != null ? ` · top ${Math.max(1, Math.round((1 - o.pct) * 100))}%` : ""}` : "&nbsp;"}</span></div>`;
      const rec = y.record, games = rec.w + rec.l + rec.t;
      tilesEl.innerHTML = `
        <div class="tp-tile hl"><span class="tp-tile-l">Season EPA</span><b class="tp-tile-v"><span data-count="${y.epa || 0}" data-dec="1">${fmt(y.epa)}</span></b><span class="tp-tile-s">expected points</span></div>
        ${rk(y.ranks.world, "World")}
        ${rk(y.ranks.country, y.country || "Country")}
        ${rk(y.ranks.state, y.state || "State")}
        ${y.ranks.district && String(y.district || "").toLowerCase() !== String(y.state || "").toLowerCase()
          ? rk(y.ranks.district, (y.district || "District").toUpperCase()) : ""}
        <div class="tp-tile"><span class="tp-tile-l">Record</span><b class="tp-tile-v">${games ? `${rec.w}-${rec.l}-${rec.t}` : "–"}</b>
          <span class="tp-tile-s">${games ? `${Math.round((rec.winrate != null ? rec.winrate : rec.w / games) * 100)}% win rate` : "&nbsp;"}</span></div>`;
      countUp(tilesEl);
      const b = y.breakdown || {}, parts = [["Auto", b.auto, "a"], ["Teleop", b.teleop, "t"], ["Endgame", b.endgame, "e"]].filter((p) => p[1] != null);
      const epaEl = $("#tpEpa", root);
      if (!parts.length) return;
      const total = parts.reduce((s2, p) => s2 + Math.max(0, p[1]), 0) || 1;
      // Percentile of each phase vs. the season leaderboard (when it's cached).
      const lb = API.sbCachedLeaderboard(year) || [];
      const pctOf = (key, v) => {
        const vals = lb.map((r) => r.breakdown && r.breakdown[key]).filter((x) => x != null);
        if (vals.length < 20) return null;
        return vals.filter((x) => x < v).length / vals.length;
      };
      epaEl.hidden = false;
      epaEl.innerHTML = `<div class="sr-head"><h3>${icon("chart")} Where their points come from</h3><span class="hint">Statbotics EPA breakdown</span></div>
        <div class="tp-stack">${parts.map(([k, v, c]) => `<span class="tp-seg ${c}" style="flex:${Math.max(0.0001, v) / total}" title="${k} ${fmt(v)}"></span>`).join("")}</div>
        <div class="tp-phases">${parts.map(([k, v, c]) => {
          const key = k.toLowerCase(), p = pctOf(key, v);
          return `<div class="tp-phase"><span class="tp-key ${c}"></span><span class="tp-phase-l">${k}</span>
            <b>${fmt(v)}</b>${p != null ? `<span class="tp-pct">better than ${Math.round(p * 100)}%</span>` : ""}</div>`;
        }).join("")}</div>`;
    }

    // ---- Load everything (each piece fills in as it arrives) ----
    showTab(teamPageTab, 0);
    API.getTeamHistory(team).then((h) => { state.hist = h; })
      .catch(() => { state.hist = { awards: [], events: [] }; })
      .finally(() => { if (!root.isConnected) return; drawBanners(); if (teamPageTab === "history") drawPanel(); });
    API.getTeamInfo(team).then((info) => {
      if (!info || !root.isConnected) return;
      state.info = info;
      const nm = info.nickname || nameFor(team);
      $("#tpName", root).textContent = nm || " ";
      $("#pageTitle").textContent = `Team ${team}${nm ? " · " + nm : ""}`;
      $("#tpLoc", root).innerHTML = `${icon("map-pin")} ${esc([info.city, info.state_prov, info.country].filter(Boolean).join(", "))}${info.rookie_year ? ` · Rookie ${info.rookie_year}` : ""}${info.school_name ? ` · ${esc(info.school_name)}` : ""}`;
      if (info.website) {
        const href = /^https?:\/\//i.test(info.website) ? info.website : "https://" + info.website;
        $("#tpWeb", root).innerHTML = `<a class="tp-link" href="${esc(href)}" target="_blank" rel="noopener">${icon("globe")} Website</a>`;
      }
    }).catch(() => {});
    API.getTeamYears(team).then((years) => {
      if (!years.length || !root.isConnected) return;
      const sel = $("#tpYear", root);
      if (!years.includes(year)) years.unshift(year);
      sel.innerHTML = years.map((y) => `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`).join("");
      sel.onchange = () => { location.hash = "#/team/" + team + (Number(sel.value) !== GAME.season ? "/" + sel.value : ""); };
    }).catch(() => {});
    API.sbTeamYear(team, year).then((y) => { state.sbYear = y; if (root.isConnected) drawTiles(); })
      .catch(() => { if (root.isConnected) drawTiles(); });
    API.sbTeamEvents(team, year).then(({ rows }) => { state.sbEvents = rows; if (root.isConnected && ["events", "trend"].includes(teamPageTab)) drawPanel(); })
      .catch(() => {});
    API.getTeamSeason(team, year).then((s) => {
      state.season = s;
      if (!root.isConnected) return;
      $("#tpEvCount", root).textContent = s.events.length || "";
      $("#tpAwCount", root).textContent = s.awards.length || "";
      if (["events", "awards"].includes(teamPageTab)) drawPanel();
    }).catch(() => { state.loadErr = true; if (root.isConnected && ["events", "awards"].includes(teamPageTab)) drawPanel(); });
    API.sbTeamMatches(team, year).then((rows) => { state.trend = rows; if (root.isConnected && teamPageTab === "trend") drawPanel(); })
      .catch(() => { state.trendErr = true; if (root.isConnected && teamPageTab === "trend") drawPanel(); });
  }

  /* ===========================================================================
     VIEW: MATCH SCOUTING
     ======================================================================== */
  let matchEditId = null;
  let matchEditAlliance = "red";
  let lastTeamPick = 0; // timestamp of the last robot-pick, for the 5s switch cooldown
  // A robot in a match counts as "taken" when another scout has claimed it (live)
  // or a match record for it already exists. Claims older than this expire so an
  // Order the four alternating shift periods (two Active shifts + two Inactive)
  // between Transition and Endgame, based on "Won auto":
  //   won  → Auto, Transition, Inactive(1st), 1st Shift, Inactive(2nd), 2nd Shift, Endgame, Post
  //   lost → Auto, Transition, 1st Shift, Inactive(1st), 2nd Shift, Inactive(2nd), Endgame, Post
  // Reorders existing DOM nodes so entered values are preserved.
  function applyPhaseOrder(root) {
    const grid = $("#matchPhaseGrid", root); if (!grid) return;
    const wonInput = $('[data-key="wonAuto"] input', root);
    const won = !!(wonInput && wonInput.checked);
    const mid = won
      ? ["inactive1", "active1", "inactive2", "active2"]
      : ["active1", "inactive1", "active2", "inactive2"];
    const order = ["auto", "transition", ...mid, "endgame", "post"];
    order.forEach((id) => { const c = grid.querySelector(`[data-phase="${id}"]`); if (c) grid.appendChild(c); });
  }

  // abandoned selection never locks a robot forever.
  const CLAIM_TTL = 15 * 60 * 1000;
  function refreshRobotClaims() {
    const picker = document.querySelector("#robotPicker");
    if (!picker) return;
    const myId = Store.getMe().id;
    const ev = Store.getSettings().eventKey;
    const numEl = document.querySelector("#mNum");
    const num = numEl ? numEl.value : "";
    if (!num) return;
    const now = Date.now();
    const claims = (window.Cloud && Cloud.getClaims && Cloud.getClaims()) || [];
    const savedTeams = new Set((allMatches() || [])
      .filter((m) => String(m.event) === String(ev) && String(m.matchNumber) === String(num))
      .map((m) => String(m.team)));
    picker.querySelectorAll(".robot-pick").forEach((btn) => {
      const team = btn.dataset.team;
      const mineSel = btn.classList.contains("sel");
      const claim = claims.find((c) => String(c.eventKey) === String(ev) &&
        String(c.matchNumber) === String(num) && String(c.team) === String(team) &&
        (now - (c.ts || 0)) < CLAIM_TTL);
      const takenByOther = !mineSel && (((claim && claim.scouterId && claim.scouterId !== myId)) || savedTeams.has(team));
      btn.classList.toggle("claimed", !!takenByOther);
      btn.disabled = !!takenByOther;
      let tag = btn.querySelector(".rp-claim");
      if (takenByOther) {
        if (!tag) { tag = document.createElement("span"); tag.className = "rp-claim"; btn.appendChild(tag); }
        tag.textContent = savedTeams.has(team) ? "✓ scouted" : ("🔒 " + ((claim && claim.scouterName) || "taken"));
      } else if (tag) { tag.remove(); }
    });
  }

  function renderMatch(root) {
    const s = Store.getSettings();
    const teams = eventTeams();
    // Live mode: the selected event has upcoming (unplayed) qual matches
    const cacheM = s.eventKey ? Store.getCache("matches." + s.eventKey, null) : null;
    const upcomingQuals = (cacheM ? cacheM.data : []).filter((m) => m.comp_level === "qm" && m.alliances &&
        (m.alliances.red.score < 0 || m.alliances.blue.score < 0))
      .sort((a, b) => (a.predicted_time || a.time || 1e15) - (b.predicted_time || b.time || 1e15));
    const liveMode = upcomingQuals.length > 0 && !matchEditId;

    const teamControl = teams.length
      ? `<select id="mTeam"><option value="">Select team…</option>${
          teams.map((t) => `<option value="${t.team_number}">${t.team_number} · ${esc(t.nickname || "")}</option>`).join("")}</select>`
      : `<input type="number" id="mTeam" placeholder="Team #" inputmode="numeric" />`;

    const allFields = matchFields();
    const preFields = allFields.filter((f) => f.phase === "pre");
    const phases = GAME.matchPhases.filter((p) => p.id !== "pre").map((p) => {
      const fs = allFields.filter((f) => (f.phase || "post") === p.id);
      if (!fs.length) return "";
      return `<div class="card ms-phase" data-phase="${p.id}"><h3><span class="ms-phase-dot"></span>${esc(p.label)}</h3>
        <div class="form-grid">${fs.map((f) => renderField(f, "")).join("")}</div></div>`;
    }).join("");
    const preHTML = preFields.length ? `<div class="form-grid ms-pre-fields">${preFields.map((f) => renderField(f, "")).join("")}</div>` : "";

    const fmtTime = (unix) => unix ? " · " + new Date(unix * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    const topCard = liveMode ? `
      <section class="card ms-pre">
        <div class="sr-head"><h3>${icon("flag")} Pre-Match</h3><span class="badge green dot">Live · ${upcomingQuals.length} quals left</span></div>
        <div class="form-grid">
          <div class="field"><label>Match</label>
            <select id="mMatchSel"><option value="">Select match…</option>${upcomingQuals.map((m) =>
              `<option value="${m.match_number}">Q${m.match_number}${esc(fmtTime(m.predicted_time || m.time))}</option>`).join("")}</select></div>
        </div>
        <div id="robotPicker" class="robot-picker"><p class="hint">Pick a match above, then tap the robot you're scouting.</p></div>
        ${preHTML}
        <input type="hidden" id="mNum" /><input type="hidden" id="mTeam" />
      </section>` : `
      <section class="card ms-pre">
        <div class="sr-head"><h3>${icon("flag")} Pre-Match</h3>${matchEditId ? `<span class="badge yellow">Editing a record</span>` : ""}</div>
        <div class="form-grid">
          <div class="field"><label>Match #</label><input type="number" id="mNum" placeholder="e.g. 14" inputmode="numeric" /></div>
          <div class="field"><label>Team scouted</label>${teamControl}</div>
          <div class="field"><label>Alliance</label>
            <div class="pill-toggle ally" id="mAlliance">
              <button type="button" data-v="red" class="on">Red</button>
              <button type="button" data-v="blue">Blue</button></div></div>
        </div>
        ${preHTML}
      </section>`;

    root.innerHTML = `
      <form id="matchForm" class="ms-form" data-sig="${esc(formSig(allFields))}">
        ${topCard}
        <div class="ms-banner thero" id="msBanner" hidden></div>
        <div class="grid cols-2" id="matchPhaseGrid" style="margin-bottom:16px">${phases}</div>
        <div class="ms-savebar">
          <button type="submit" class="btn primary">${icon("check")} <span id="mSaveLabel">Save match</span></button>
          <button type="button" class="btn ghost" id="mReset">Clear form</button>
        </div>
      </form>

      <div class="section" style="margin-top:26px">
        <div class="section-head"><h2>This session · ${Store.getMatches().length} total records</h2></div>
        <div id="matchList"></div>
      </div>`;

    // Sticky "now scouting" banner: the team in its colors + an alliance band, and
    // the whole form takes the alliance accent.
    const form = $("#matchForm", root), banner = $("#msBanner", root);
    const setScouting = (team, ally) => {
      form.dataset.ally = ally || "";
      if (!team) { banner.hidden = true; banner.innerHTML = ""; return; }
      const num = $("#mNum", root).value;
      banner.hidden = false;
      banner.className = `ms-banner thero ${ally || ""}`;
      banner.dataset.tfill = team;
      banner.innerHTML = `<span class="ms-band" aria-hidden="true"></span>
        <img class="team-avatar thero-av" data-avatar="${esc(team)}" data-ally="${esc(ally || "")}" alt="" />
        <div class="thero-id"><span class="ms-eyebrow">Now scouting${num ? " · Q" + esc(num) : ""}</span>
          <span class="thero-num">${esc(team)}</span><span class="thero-name">${esc(nameFor(team)) || "&nbsp;"}</span></div>
        ${ally ? `<span class="ms-ally-pill ${ally}">${ally} alliance</span>` : ""}`;
      paintAvatars(banner, [team]);
      paintTeamFills(form, [team]);
    };

    if (liveMode) {
      const picker = $("#robotPicker", root);
      const renderRobots = (num) => {
        const m = upcomingQuals.find((x) => String(x.match_number) === String(num));
        setScouting(null);
        if (!m) { picker.innerHTML = `<p class="hint">Pick a match above, then tap the robot you're scouting.</p>`; return; }
        picker.innerHTML = ["red", "blue"].map((col) => `
          <div class="robot-group ${col}">
            <div class="rg-label"><span class="alliance-dot alliance-${col}"></span>${col} alliance</div>
            <div class="robot-row">${m.alliances[col].team_keys.map((k, i) => { const t = k.replace("frc", ""); return `
              <button type="button" class="robot-pick ${col}" data-team="${t}" data-alliance="${col}" data-tfill="${t}">
                <span class="rp-station">${col === "red" ? "R" : "B"}${i + 1}</span>
                <img class="team-avatar" data-avatar="${t}" data-ally="${col}" alt="" />
                <span class="rp-num">${t}</span><span class="rp-name">${esc(teamName(t))}</span></button>`; }).join("")}</div>
          </div>`).join("");
        const ts = ["red", "blue"].flatMap((c) => m.alliances[c].team_keys.map((k) => k.replace("frc", "")));
        paintAvatars(picker, ts);
        paintTeamFills(picker, ts);
        $$(".robot-pick", picker).forEach((b) => b.onclick = () => {
          if (b.classList.contains("sel")) return; // already the selected robot
          if (b.disabled) { toast("That robot is already being scouted by someone else", "err"); return; }
          // 5-second cooldown between switching the team you're scouting
          const prev = $(".robot-pick.sel", picker);
          if (prev) {
            const left = 5000 - (Date.now() - lastTeamPick);
            if (left > 0) { toast(`Wait ${Math.ceil(left / 1000)}s before switching teams`, "err"); return; }
          }
          lastTeamPick = Date.now();
          if (prev && prev !== b) Cloud.releaseClaim(s.eventKey, num, prev.dataset.team);
          $$(".robot-pick", picker).forEach((x) => x.classList.remove("sel"));
          b.classList.add("sel");
          $("#mTeam", root).value = b.dataset.team;
          setScouting(b.dataset.team, b.dataset.alliance);
          Cloud.pushClaim(s.eventKey, num, b.dataset.team, b.dataset.alliance);
          refreshRobotClaims();
        });
        refreshRobotClaims();
      };
      $("#mMatchSel", root).onchange = (e) => {
        // leaving a match: release the robot I had claimed there, reset the cooldown
        const prevNum = $("#mNum", root).value, prevSel = $(".robot-pick.sel", root);
        if (prevNum && prevSel) Cloud.releaseClaim(s.eventKey, prevNum, prevSel.dataset.team);
        lastTeamPick = 0;
        $("#mNum", root).value = e.target.value; renderRobots(e.target.value);
      };
    } else {
      const sync = () => {
        const t = String($("#mTeam", root).value || "").trim();
        const a = $("#mAlliance button.on", root);
        setScouting(t, a ? a.dataset.v : "red");
      };
      $$("#mAlliance button", root).forEach((b) => b.onclick = () => {
        $$("#mAlliance button", root).forEach((x) => x.classList.toggle("on", x === b));
        sync();
      });
      ["input", "change"].forEach((ev) => { $("#mTeam", root).addEventListener(ev, sync); $("#mNum", root).addEventListener(ev, sync); });
    }

    wireFields(root);
    watchDirty(form);
    drawMatchList();

    // Order the shift cards by the Won-auto toggle, and re-order live when it flips.
    applyPhaseOrder(root);
    const wonToggle = $('[data-key="wonAuto"] input', root);
    if (wonToggle) wonToggle.addEventListener("change", () => applyPhaseOrder(root));

    $("#mReset", root).onclick = () => { matchEditId = null; renderMatch(root); };

    $("#matchForm", root).onsubmit = (e) => {
      e.preventDefault();
      let team, alliance;
      if (liveMode) {
        const sel = $(".robot-pick.sel", root);
        if (!sel) { toast("Pick the robot you're scouting", "err"); return; }
        team = sel.dataset.team; alliance = sel.dataset.alliance;
      } else {
        team = $("#mTeam", root).value.trim();
        const a = $("#mAlliance button.on", root);
        alliance = matchEditId ? matchEditAlliance : (a ? a.dataset.v : "red");
      }
      if (!team) { toast("Pick a team first", "err"); return; }
      const fields = readForm($("#matchForm", root)); // phase cards + Pre-Match fields
      const entry = {
        id: matchEditId || undefined,
        event: s.eventKey, scout: scoutDisplayName(),
        matchNumber: $("#mNum", root).value.trim(), team, alliance, ...fields,
      };
      const isNew = !matchEditId;
      const ok = Store.saveMatch(entry);
      if (!ok) { toast("Couldn't save — device storage is full. Export & clear old data (Data tab).", "err"); return; }
      if (isNew) {
        const earn = canEarnBB();
        Store.recordMatchScouted(team, earn);
        if (earn) Cloud.addBB(10); // account-based BB, atomic on the cloud
        Cloud.syncMe();
        Cloud.pushMatches();
        Cloud.pushActivity({ type: "match", team, bb: earn ? 10 : 0, matchNumber: entry.matchNumber });
        // keep the claim so the robot stays locked for others until the record syncs
        toast(earn ? `Saved · Team ${team} · +10 BB` : `Saved · Team ${team}`);
      } else {
        Cloud.pushMatches();
        toast("Match updated");
      }
      matchEditId = null;
      renderMatch(root);
    };

    function drawMatchList() {
      const list = Store.getMatches().slice().reverse();
      const el = $("#matchList", root);
      if (!list.length) { el.innerHTML = `<div class="card">${emptyState("clipboard", "No records yet", "Fill the form above and save.")}</div>`; return; }
      const statCol = Store.getSettings().matchListStat || "";
      const statField = statCol ? matchFields().find((f) => f.key === statCol) : null;
      const statLabel = statField ? statField.label : "";
      const statVal = (m) => statField
        ? esc(m[statField.key] === true ? "Yes" : m[statField.key] === false ? "No" : (m[statField.key] ?? "–")) : "";
      el.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Match</th><th>Team</th><th>Alliance</th>${statField ? `<th class="num">${esc(statLabel)}</th>` : ""}<th>Scout</th><th></th></tr></thead>
        <tbody>${list.map((m) => `<tr>
          <td>Q${esc(m.matchNumber || "?")}</td>
          <td><span class="team-num">${esc(m.team)}</span></td>
          <td><span class="alliance-dot alliance-${m.alliance === "red" ? "red" : "blue"}"></span>${esc(m.alliance || "")}</td>
          ${statField ? `<td class="num">${statVal(m)}</td>` : ""}
          <td class="muted">${esc(m.scout || "")}</td>
          <td class="row" style="gap:6px;flex-wrap:nowrap">
            <button class="icon-btn" data-edit="${m.id}" aria-label="Edit">${icon("edit")}</button>
            <button class="icon-btn" data-del="${m.id}" aria-label="Delete">${icon("trash")}</button></td>
        </tr>`).join("")}</tbody></table></div>`;
      $$("[data-del]", el).forEach((b) => b.onclick = () =>
        confirmDialog("Delete this match record?", () => { Store.deleteMatch(b.dataset.del); toast("Deleted"); renderMatch(root); }));
      $$("[data-edit]", el).forEach((b) => b.onclick = () => loadMatchIntoForm(b.dataset.edit, root));
    }
  }

  function loadMatchIntoForm(id, root) {
    const m = Store.getMatches().find((x) => x.id === id);
    if (!m) return;
    matchEditId = id;
    matchEditAlliance = m.alliance || "red";
    renderMatch(root); // re-render in edit (non-live) mode so all inputs exist
    $("#mNum", root).value = m.matchNumber || "";
    if ($("#mTeam", root)) $("#mTeam", root).value = m.team || "";
    $$("#mAlliance button", root).forEach((x) => x.classList.toggle("on", x.dataset.v === m.alliance));
    // re-render field values
    matchFields().forEach((f) => {
      const wrap = $(`#matchForm [data-key="${f.key}"]`, root);
      if (!wrap) return;
      const v = m[f.key];
      if (f.type === "bool") wrap.querySelector("input").checked = !!v;
      else if (f.type === "counter") { wrap.querySelector(".counter").dataset.val = v || 0; wrap.querySelector(".count").value = v || 0; }
      else if (f.type === "rating") { const r = wrap.querySelector(".rating"); r.dataset.val = v || 0; r.querySelectorAll(".star").forEach((s) => s.classList.toggle("on", Number(s.dataset.idx) <= (v || 0))); }
      else if (f.type === "select") wrap.querySelector("select").value = v || wrap.querySelector("select").value;
      else if (f.type === "number") wrap.querySelector("input").value = v ?? "";
      else if (f.type === "text") wrap.querySelector("textarea").value = v || "";
    });
    applyPhaseOrder(root); // order the shifts to match this record's Won-auto value
    $("#mTeam", root).dispatchEvent(new Event("change")); // refresh the "now scouting" banner
    $("#mSaveLabel", root).textContent = "Update match";
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Editing — make changes and Update");
  }
  function prefillMatchTeam(team) { const t = $("#mTeam"); if (t) { t.value = team; } }

  /* ===========================================================================
     VIEW: PIT SCOUTING
     ======================================================================== */
  function renderPit(root) {
    const teams = eventTeams();
    const s = Store.getSettings();
    const pitsNow = allPits();
    const doneN = teams.filter((t) => pitsNow[t.team_number]).length;
    const teamControl = teams.length
      ? `<select id="pTeam"><option value="">Select team…</option>${
          teams.map((t) => `<option value="${t.team_number}">${t.team_number} · ${esc(t.nickname || "")}${pitsNow[t.team_number] ? " ✓" : ""}</option>`).join("")}</select>`
      : `<input type="number" id="pTeam" placeholder="Team #" inputmode="numeric" />`;
    const pct = teams.length ? doneN / teams.length : 0;

    root.innerHTML = `
      ${pageHero({ ic: "clipboard", eyebrow: "Pit scouting", title: s.eventName ? esc(s.eventName) : "No event selected",
        sub: teams.length ? `${doneN} of ${teams.length} pits scouted${doneN === teams.length ? " · every pit done!" : ""}` : "Pick an event in the sidebar to get the pit map.",
        side: teams.length ? ringSVG(pct, "Pits scouted") : "" })}
      <div id="pitMap"></div>
      <form id="pitForm" class="pf-form" data-sig="${esc(formSig(pitFields()))}">
        <section class="card pf-pick">
          <div class="sr-head"><h3>${icon("bagel")} Team</h3><span class="hint">tap a pit on the map, or pick below</span></div>
          <div class="form-grid">
            <div class="field"><label>Team</label>${teamControl}</div>
            <div class="field"><label>Robot photo</label>
              <label class="pf-drop" for="pPhoto">${icon("image")}<span><b>Add a robot photo</b><small>Tap to take or choose one</small></span></label>
              <input type="file" id="pPhoto" accept="image/*" hidden />
              <div id="pPhotoPreview" class="photo-preview"></div></div>
          </div>
        </section>
        <div class="ms-banner thero" id="pfBanner" hidden></div>
        <section class="card pf-fields" id="pitFieldsCard"><h3>${icon("wrench")} Robot</h3>
          <div class="form-grid">${pitFields().map((f) => renderField(f, "")).join("")}</div>
        </section>
        <div class="ms-savebar">
          <button type="submit" class="btn primary">${icon("check")} Save pit data</button>
          <button type="button" class="btn ghost" id="pReset">Clear</button>
        </div>
      </form>
      <div class="section" style="margin-top:26px">
        <div class="section-head"><h2>Pit-scouted teams</h2><span class="hint">${Object.keys(pitsNow).length} teams</span></div>
        <div id="pitList"></div>
      </div>`;

    wireFields(root);
    watchDirty($("#pitForm", root));
    drawPitList();
    loadPitMap(root);
    // Let cloud updates refresh the shared pit list + map live without touching the form.
    pitPageRefresh = () => { try { drawPitList(); loadPitMap(root); } catch (e) {} };

    // Selected team → colored banner (+ "edit what's already saved" if it was scouted).
    const pfBanner = $("#pfBanner", root);
    const syncTeam = () => {
      const t = String($("#pTeam", root).value || "").trim();
      pitSelected = t;
      $$(".pm-cell", root).forEach((c) => c.classList.toggle("sel", c.dataset.team === t));
      if (!t) { pfBanner.hidden = true; pfBanner.innerHTML = ""; return; }
      const prev = allPits()[t];
      pfBanner.hidden = false;
      pfBanner.className = "ms-banner thero";
      pfBanner.dataset.tfill = t;
      pfBanner.innerHTML = `<img class="team-avatar thero-av" data-avatar="${esc(t)}" alt="" />
        <div class="thero-id"><span class="ms-eyebrow">${prev ? "Already pit scouted" + (prev.scout ? " by " + esc(prev.scout) : "") : "Pit scouting"}</span>
          <span class="thero-num">${esc(t)}</span><span class="thero-name">${esc(nameFor(t)) || "&nbsp;"}</span></div>
        ${prev ? `<button type="button" class="ms-ally-pill" id="pfLoad">${icon("edit")} Load saved data</button>` : ""}`;
      paintAvatars(pfBanner, [t]);
      paintTeamFills(pfBanner.parentNode, [t]);
      const ld = $("#pfLoad", pfBanner); if (ld) ld.onclick = () => loadPitIntoForm(t, root);
    };
    ["input", "change"].forEach((ev) => $("#pTeam", root).addEventListener(ev, syncTeam));

    let pitPhoto = null; // dataURL of the current robot photo
    const photoInput = $("#pPhoto", root);
    if (photoInput) photoInput.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try { pitPhoto = await compressImage(file); showPhotoPreview(pitPhoto); }
      catch (err) { toast("Couldn't read that image", "err"); }
    };
    function showPhotoPreview(dataUrl) {
      const p = $("#pPhotoPreview", root);
      p.innerHTML = dataUrl ? `<img src="${dataUrl}" alt="robot photo" /><button type="button" class="btn ghost sm" id="pPhotoClear">Remove photo</button>` : "";
      $(".pf-drop", root).hidden = !!dataUrl;
      const clr = $("#pPhotoClear", root); if (clr) clr.onclick = () => { pitPhoto = null; $("#pPhoto", root).value = ""; showPhotoPreview(null); };
    }

    $("#pReset", root).onclick = () => { pitSelected = ""; renderPit(root); };
    $("#pitForm", root).onsubmit = (e) => {
      e.preventDefault();
      const team = $("#pTeam", root).value.trim();
      if (!team) { toast("Pick a team first", "err"); return; }
      const fields = readForm($("#pitFieldsCard", root));
      const data = { ...fields, scout: scoutDisplayName(), event: Store.getSettings().eventKey, nickname: teamName(team) };
      if (pitPhoto) data.photo = pitPhoto; // keep existing photo if none newly chosen
      const isNewPit = !allPits()[team]; // BB only for a team not already pit-scouted (by anyone)
      const ok = Store.savePit(team, data);
      if (!ok) { toast("Couldn't save — storage full. Remove the photo or export & clear old data (Data tab).", "err"); return; }
      if (isNewPit) {
        const earn = canEarnBB();
        Store.recordPitScouted(team, earn);
        if (earn) Cloud.addBB(5); // account-based BB, atomic on the cloud
        Cloud.syncMe();
        Cloud.pushPits();
        Cloud.pushActivity({ type: "pit", team, bb: earn ? 5 : 0 });
        toast(earn ? `Pit data saved · Team ${team} · +5 BB` : `Pit data saved · Team ${team}`);
      } else {
        Cloud.pushPits();
        toast(`Pit data saved · Team ${team}`);
      }
      pitSelected = "";
      renderPit(root);
    };
    // expose for loadPitIntoForm
    renderPit._setPhoto = (dataUrl) => { pitPhoto = dataUrl; showPhotoPreview(dataUrl); };
    if (pitSelected) { $("#pTeam", root).value = pitSelected; syncTeam(); }

    function drawPitList() {
      const pits = allPits();
      const teamsArr = Object.values(pits).sort((a, b) => Number(a.team) - Number(b.team));
      const el = $("#pitList", root);
      if (!teamsArr.length) { el.innerHTML = `<div class="card">${emptyState("wrench", "No pit data yet", "Fill the form and save.")}</div>`; return; }
      el.innerHTML = `<div class="pl-grid">${teamsArr.map((p, i) => `
        <article class="pl-card" data-open="${esc(p.team)}" data-tfill="${esc(p.team)}" style="animation-delay:${Math.min(i, 20) * 20}ms">
          <div class="pl-photo">${p.photo ? `<img src="${p.photo}" alt="Team ${esc(p.team)} robot" />` : icon("image")}</div>
          <div class="pl-body">
            <div class="pl-id"><img class="team-avatar" data-avatar="${esc(p.team)}" alt="" /><b>${esc(p.team)}</b><span>${esc(p.nickname || nameFor(p.team) || "")}</span></div>
            <div class="pl-tags">
              ${p.drivetrain ? `<span class="sr-chip">${esc(p.drivetrain)}</span>` : ""}
              ${p.shooterType && p.shooterType !== "No shooter" ? `<span class="sr-chip">${esc(p.shooterType)}</span>` : ""}
              ${p.canClimb ? `<span class="sr-chip">Climbs</span>` : ""}
              ${p.shotblocker ? `<span class="sr-chip">Shotblocker</span>` : ""}
            </div>
            <div class="pl-foot"><span class="hint">${p.scout ? "by " + esc(p.scout) : ""}</span>
              <span class="row" style="gap:6px"><button class="btn sm ghost" data-load="${esc(p.team)}">${icon("edit")} Edit</button>
              <button class="icon-btn" data-del="${esc(p.team)}" aria-label="Delete">${icon("trash")}</button></span></div>
          </div>
        </article>`).join("")}</div>`;
      const ts = teamsArr.map((p) => String(p.team));
      paintAvatars(el, ts); paintTeamFills(el, ts);
      $$("[data-open]", el).forEach((c) => c.onclick = (e) => { if (e.target.closest("button")) return; openTeam(c.dataset.open); });
      $$("[data-load]", el).forEach((b) => b.onclick = () => loadPitIntoForm(b.dataset.load, root));
      $$("[data-del]", el).forEach((b) => b.onclick = () =>
        confirmDialog(`Delete pit data for team ${b.dataset.del}?`, () => { Store.deletePit(b.dataset.del); toast("Deleted"); renderPit(root); }));
    }
  }
  function loadPitIntoForm(team, root) {
    const p = allPits()[team]; if (!p) return;
    $("#pTeam", root).value = team;
    pitFields().forEach((f) => {
      const wrap = $(`#pitFieldsCard [data-key="${f.key}"]`, root);
      if (!wrap) return; const v = p[f.key];
      if (f.type === "bool") wrap.querySelector("input").checked = !!v;
      else if (f.type === "select") wrap.querySelector("select").value = v || wrap.querySelector("select").value;
      else if (f.type === "number") wrap.querySelector("input").value = v ?? "";
      else if (f.type === "text") wrap.querySelector("textarea").value = v || "";
      else if (f.type === "counter") { const cc = wrap.querySelector(".counter"); cc.dataset.val = v || 0; cc.querySelector(".count").value = v || 0; }
      else if (f.type === "rating") { const rr = wrap.querySelector(".rating"); rr.dataset.val = v || 0; rr.querySelectorAll(".star").forEach((sx) => sx.classList.toggle("on", Number(sx.dataset.idx) <= (v || 0))); }
    });
    if (renderPit._setPhoto) renderPit._setPhoto(p.photo || null);
    $("#pTeam", root).dispatchEvent(new Event("change"));
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Editing pit data — Save to update");
  }
  function prefillPitTeam(team) { const t = $("#pTeam"); if (t) { t.value = team; t.dispatchEvent(new Event("change")); } }

  // Fingerprint of a form schema (keys + phases + labels) to notice when it changes.
  const formSig = (fields) => (fields || []).map((f) => f.key + ":" + (f.phase || "") + ":" + f.label).join("|");
  // Mark a scouting form "dirty" on the first real input so cloud updates never rebuild it.
  function watchDirty(form) { if (!form) return; const mark = () => { form.dataset.dirty = "1"; }; form.addEventListener("input", mark); form.addEventListener("change", mark); form.addEventListener("click", (e) => { if (e.target.closest("button, .star, .robot-pick")) mark(); }); }

  // Active pit-scouting fields: admin-defined custom schema, or the season default.
  function pitFields() { return (Cloud.enabled() && Cloud.getPitForm()) || Store.getPitSchema() || GAME.pitFields; }

  // Active match-scouting fields: custom schema or the season default.
  function matchFields() { return (Cloud.enabled() && Cloud.getMatchForm()) || Store.getMatchSchema() || GAME.matchFields; }

  // Hand-laid pit layout for SoCal Showdown (matches the venue map). Each entry is
  // a pit row; a 2-number row is a double-wide column. Only teams + the Field label.
  // A2 pit = rookie team 11722 (EIA Robotics).
  const SOCAL_PITMAP = {
    colA: [[702, 8521], [9408, 968], [687, 7042], [9696, 1138], [589, 6904], [11024, 1148], [359, 6658], [11722, 1160], [294, 6220]],
    colB: [[2429], [6072], [2102], [5199], [1452], [5285], [1197]],
    colC: [[5805], [2637], [5124], [2710], [5089], [3473], [4999]],
    colD: [[3759, 4276], [4415, 4079], [3501, 4201], [4470, 4123], [3476, 4141]],
  };
  function isSocalShowdown(s) { return /socal\s*showdown/.test((s.eventName || "").toLowerCase()); }

  // Pit map: every team at the event as a tile — scouted pits in the team's colors
  // with a check, open pits dashed. Filter chips + a progress bar; tap a pit to
  // start scouting it. SoCal Showdown uses its hand-laid venue layout.
  let pmFilter = "all", pitSelected = "";
  function loadPitMap(root) {
    const container = $("#pitMap", root);
    if (!container) return;
    const s = Store.getSettings();
    const pits = allPits();
    const socal = isSocalShowdown(s);
    const teamNums = socal
      ? [].concat(...[].concat(...Object.values(SOCAL_PITMAP))).map(String)
      : eventTeams().map((t) => String(t.team_number)).sort((a, b) => a - b);
    if (!teamNums.length) { container.innerHTML = ""; return; }
    const done = teamNums.filter((t) => pits[t]);
    const shown = (t) => pmFilter === "all" || (pmFilter === "done" ? !!pits[t] : !pits[t]);
    const cell = (t) => `<button type="button" class="pm-cell ${pits[t] ? "done" : "todo"}${t === pitSelected ? " sel" : ""}${shown(t) ? "" : " out"}"
        data-team="${t}" ${pits[t] ? `data-tfill="${t}"` : ""} title="${esc(t + " " + nameFor(t))}">
        <img class="team-avatar" data-avatar="${t}" alt="" /><span class="pm-num">${t}</span>${pits[t] ? `<span class="pm-check">${icon("check")}</span>` : ""}</button>`;
    const col = (rows, wide) => `<div class="socal-col${wide ? " wide" : ""}">${rows.map((r) => `<div class="socal-row">${r.map((t) => cell(String(t))).join("")}</div>`).join("")}</div>`;
    const pct = Math.round(done.length / teamNums.length * 100);
    container.innerHTML = `
      <section class="card pm-card">
        <div class="sr-head">
          <h3>${icon("map-pin")} Pit map${socal ? " · SoCal Showdown" : ""}</h3>
          <div class="pm-filters" role="tablist">
            ${[["all", "All", teamNums.length], ["todo", "To do", teamNums.length - done.length], ["done", "Done", done.length]].map(([k, l, n]) =>
              `<button type="button" data-pm="${k}" class="${pmFilter === k ? "on" : ""}">${l} <b>${n}</b></button>`).join("")}
          </div>
        </div>
        <div class="pm-progress"><span class="pm-bar"><i style="width:${pct}%"></i></span><b>${pct}%</b></div>
        ${socal ? `<div class="socal-map-scroll"><div class="socal-map pm">
            <div class="socal-side">${col(SOCAL_PITMAP.colA, true)}${col(SOCAL_PITMAP.colB, false)}</div>
            <div class="socal-field"><span>FIELD</span></div>
            <div class="socal-side">${col(SOCAL_PITMAP.colC, false)}${col(SOCAL_PITMAP.colD, true)}</div>
          </div></div>`
          : `<div class="pm-grid">${teamNums.map(cell).join("")}</div>`}
      </section>`;
    paintAvatars(container, teamNums);
    paintTeamFills(container, done);
    $$("[data-pm]", container).forEach((b) => b.onclick = () => { pmFilter = b.dataset.pm; loadPitMap(root); });
    $$(".pm-cell", container).forEach((b) => b.onclick = () => {
      prefillPitTeam(b.dataset.team);
      const f = $("#pitForm", root); if (f) f.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* ===========================================================================
     VIEW: STRATEGY (match preview + team compare)
     ======================================================================== */
  function renderStrategy(root) {
    const s = Store.getSettings();
    const cache = s.eventKey ? Store.getCache("matches." + s.eventKey, null) : null;
    const matches = cache ? cache.data.filter((m) => m.comp_level === "qm") : [];
    root.innerHTML = `
      <div class="section">
        <div class="card"><h2>Match preview</h2>
          <p class="hint">Look up an upcoming qualification match to see both alliances with each team's scouted averages, then jot a game plan.</p>
          <div class="form-grid">
            <div class="field"><label>Qual match #</label>
              ${matches.length ? `<select id="stMatch"><option value="">Select match…</option>${
                matches.sort((a, b) => a.match_number - b.match_number).map((m) =>
                  `<option value="${m.match_number}">Q${m.match_number}</option>`).join("")}</select>`
                : `<input type="number" id="stMatch" placeholder="Match #" inputmode="numeric" />`}
            </div>
          </div>
          <div id="stPreview"></div>
        </div>
      </div>
      <div class="section">
        <div class="card"><h2>Compare teams</h2>
          <p class="hint">Pick teams to compare side-by-side.</p>
          <div class="field"><label>Teams (comma-separated #s)</label>
            <input type="text" id="cmpInput" placeholder="e.g. 702, 254, 1678" /></div>
          <button class="btn primary sm" id="cmpBtn">${icon("chess")} Compare</button>
          <div id="cmpOut" style="margin-top:14px"></div>
        </div>
      </div>`;

    const matchSel = $("#stMatch", root);
    const showPreview = () => {
      const num = matchSel.value.trim();
      const out = $("#stPreview", root);
      if (!num) { out.innerHTML = ""; return; }
      let red = [], blue = [];
      const m = matches.find((x) => String(x.match_number) === String(num));
      if (m && m.alliances) {
        red = m.alliances.red.team_keys.map((k) => k.replace("frc", ""));
        blue = m.alliances.blue.team_keys.map((k) => k.replace("frc", ""));
      }
      const strat = Store.getStrategy();
      out.innerHTML = `
        <div class="grid cols-2" style="margin-top:14px">
          ${allianceCard("Red alliance", red, "red")}
          ${allianceCard("Blue alliance", blue, "blue")}
        </div>
        <div class="field" style="margin-top:14px"><label>Game plan for Q${esc(num)}</label>
          <textarea id="stNotes" placeholder="Who to defend, scoring assignments, climb order…">${esc(strat[num] || "")}</textarea></div>
        <button class="btn secondary sm" id="stSave">${icon("check")} Save plan</button>`;
      const save = $("#stSave", out);
      if (save) save.onclick = () => { const st = Store.getStrategy(); st[num] = $("#stNotes", out).value; Store.setStrategy(st); toast("Plan saved"); };
      $$("[data-team]", out).forEach((r) => r.onclick = () => openTeam(r.dataset.team));
    };
    if (matchSel) matchSel.tagName === "SELECT" ? (matchSel.onchange = showPreview) : (matchSel.oninput = showPreview);

    $("#cmpBtn", root).onclick = () => {
      const nums = $("#cmpInput", root).value.split(",").map((x) => x.trim()).filter(Boolean);
      const out = $("#cmpOut", root);
      if (!nums.length) { out.innerHTML = `<p class="muted">Enter some team numbers.</p>`; return; }
      const stats = nums.map(computeStats);
      const rows = [
        ["Matches", (s) => s.matches],
        ["Cycles per match", (s) => fmt(s.avgCycles)],
        ["Average bps", (s) => fmt(s.avgBps)],
        ["Fouls committed", (s) => fmt(s.avgFouls)],
        ["Defense", (s) => Math.round(s.defenseRate * 100) + "%"],
        ["Breakdown rate", (s) => Math.round(s.diedRate * 100) + "%"],
        ["Avg driver skill", (s) => s.avgDriver ? fmt(s.avgDriver) + " / 5" : "–"],
      ];
      out.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Metric</th>${stats.map((s) => `<th class="num">${s.team}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(([label, fn]) => `<tr><td class="muted">${label}</td>${
          stats.map((s) => `<td class="num">${fn(s)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    };
  }
  function allianceCard(title, teams, tone) {
    return `<div class="card flush">
      <h3><span class="alliance-dot alliance-${tone}"></span>${esc(title)}</h3>
      ${teams.length ? teams.map((t) => {
        const s = computeStats(t);
        return `<div class="row between" data-team="${t}" style="cursor:pointer;padding:8px 0;border-bottom:1px solid var(--border)">
          <div><span class="team-num">${esc(t)}</span> <span class="muted">${esc(teamName(t))}</span></div>
          <div class="row"><span class="badge cyan">${fmt(s.avgCycles)} cyc/m</span>
            <span class="badge">${s.avgDriver ? fmt(s.avgDriver) + "/5 driver" : "no data"}</span></div></div>`;
      }).join("") : `<p class="muted">No alliance data. Enter teams via the schedule or type the match #.</p>`}</div>`;
  }

  /* ===========================================================================
     VIEW: PICK LIST — Alliance Selection board
     ======================================================================== */
  // Alliance selection tops out at a 3rd pick — 4th picks don't exist in FRC.
  const COL_NAMES = ["Captain", "1st Pick", "2nd Pick", "3rd Pick"];
  const MAX_COLS = COL_NAMES.length; // 4
  const TIERS = ["S", "A", "B", "C", "D", "F"];
  function getBoard() {
    const pl = Store.getPicklist() || {};
    let cols = (Array.isArray(pl.cols) && pl.cols.length) ? pl.cols.slice() : ["Captain", "1st Pick", "2nd Pick"];
    if (cols.length > MAX_COLS) cols = cols.slice(0, MAX_COLS); // enforce 3rd-pick cap on old data
    const grid = [];
    for (let a = 0; a < 8; a++) {
      const row = [];
      for (let c = 0; c < cols.length; c++) row.push(pl.grid && pl.grid[a] && pl.grid[a][c] != null ? String(pl.grid[a][c]) : null);
      grid.push(row);
    }
    return { cols, grid, dnp: Array.isArray(pl.dnp) ? pl.dnp.map(String) : [], submitted: !!pl.submitted, submittedAt: pl.submittedAt || null };
  }
  function saveBoard(b) { Store.setPicklist(b); }
  function markDNP(team) { const b = getBoard(); team = String(team);
    b.grid = b.grid.map((row) => row.map((c) => c === team ? null : c));
    if (!b.dnp.includes(team)) b.dnp.push(team); saveBoard(b); }
  function unmarkDNP(team) { const b = getBoard(); b.dnp = b.dnp.filter((t) => t !== String(team)); saveBoard(b); }
  function isOnBoard(team) { return getBoard().grid.some((row) => row.includes(String(team))); }

  let pickSelected = null;          // team selected for tap-to-place (alliance)
  let poolTraits = [];              // consolidated multiselect filter tokens
  let poolSearch = "";
  let tierSelected = null;          // team selected for tap-to-place (tier list)

  // Shared EPA lookup used across all pick-list subpages.
  function epaLookup() {
    const lb = API.sbCachedLeaderboard(GAME.season) || [];
    const map = {}; lb.forEach((r) => { map[r.team] = r.epa; });
    const ev = currentEventEpa();
    return (t) => map[String(t)] ?? (ev && ev.byTeam[t] ? ev.byTeam[t].epa : null);
  }

  /* ===========================================================================
     VIEW: MATCHUP — pick 6 teams, predict the match from EPA (Event + Global),
     with a time slider (Global = by week, Event = by qualification).
     ======================================================================== */
  let matchupRed = ["", "", ""], matchupBlue = ["", "", ""];
  let matchupWeek = 99;   // global slider (big = latest)
  let matchupQual = 999;  // event slider (big = latest)
  let matchupLbLoading = false;
  const matchupSeries = {}; // global: "year:team" -> sbTeamMatches rows (in-memory cache)
  let matchupYear = 0;      // global season (0 = the app's season)
  let muFocusNext = false;  // after picking a team, focus the next empty slot

  function matchupSub() { const p = (location.hash.replace(/^#\/?/, "") || "").split("/"); return p[1] === "event" ? "event" : "global"; }

  function renderMatchup(root) {
    const sub = matchupSub();
    const s = Store.getSettings();
    const year = sub === "event" ? GAME.season : (matchupYear || GAME.season);
    const teams = eventTeams();
    // Names: event roster for Event; that season's Statbotics leaderboard for Global.
    const lbRows = API.sbCachedLeaderboard(year) || [];
    const lbName = {}; lbRows.forEach((r) => { lbName[String(r.team)] = r.name; });
    const nameOf = (t) => (sub === "event" ? teamName(t) : (lbName[String(t)] || (year === GAME.season ? nameFor(t) : "")));
    const key = (t) => year + ":" + t;
    const years = []; for (let y = GAME.season; y >= 2002; y--) years.push(y);

    const slot = (col, i) => {
      const t = (col === "red" ? matchupRed : matchupBlue)[i];
      if (t) return `<div class="mu-slot filled" data-tfill="${esc(t)}" style="animation-delay:${i * 60}ms">
          <img class="team-avatar" data-avatar="${esc(t)}" data-ally="${col}" alt="" />
          <button class="mu-slot-id" data-team="${esc(t)}"><b>${esc(t)}</b><span>${esc(nameOf(t)) || "&nbsp;"}</span></button>
          <span class="mu-slot-epa" id="muEpa-${col}-${i}">–</span>
          <button class="mu-slot-x" data-clear="${col}-${i}" aria-label="Remove ${esc(t)}">${icon("x")}</button>
        </div>`;
      const ctrl = sub === "event"
        ? `<select class="mu-team" data-col="${col}" data-i="${i}" aria-label="${col} team ${i + 1}">
            <option value="">Pick team ${i + 1}…</option>
            ${teams.map((tm) => `<option value="${tm.team_number}">${tm.team_number} · ${esc(tm.nickname || "")}</option>`).join("")}
          </select>`
        : `<input type="number" class="mu-team" data-col="${col}" data-i="${i}" placeholder="Team # then Enter" inputmode="numeric" aria-label="${col} team ${i + 1}" />`;
      return `<div class="mu-slot empty"><span class="mu-slot-n">${col === "red" ? "R" : "B"}${i + 1}</span>${ctrl}</div>`;
    };
    const side = (col) => `<div class="mu-side ${col}">
        <div class="mu-side-head"><span class="alliance-dot alliance-${col}"></span>${col} alliance
          <span class="mu-side-total" id="muTot-${col}"></span></div>
        ${[0, 1, 2].map((i) => slot(col, i)).join("")}
      </div>`;
    root.innerHTML = `
      ${pageHero({ ic: "compare", eyebrow: sub === "event" ? `Matchup · ${esc(s.eventName || "event")}` : `Matchup · ${year} ${FRC_GAMES[year] || ""}`,
        title: "Predict any match",
        sub: sub === "event" ? "This event's on-device EPA. Rewind to any qualification with the slider."
          : "Statbotics EPA for any season. Pick a year, drop in six teams, and rewind by week.",
        side: sub === "global" ? `<label class="bs-year">${icon("calendar")}<select id="muYear" aria-label="Season">${years.map((y) => `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select></label>` : "" })}
      <div class="subtabs" id="muTabs">
        <a href="#/matchup/global" class="${sub === "global" ? "on" : ""}">${icon("globe")} Global</a>
        <a href="#/matchup/event" class="${sub === "event" ? "on" : ""}">${icon("calendar")} Event</a>
        ${[...matchupRed, ...matchupBlue].some(Boolean) ? `<button id="muSwap" title="Swap alliances">${icon("compare")} Swap</button><button id="muReset">${icon("x")} Clear</button>` : ""}
      </div>
      ${sub === "event" && !teams.length
        ? `<div class="card">${emptyState("calendar", "No event selected", "Choose your event in the sidebar to pick its teams.")}</div>`
        : `<section class="mu-arena">${side("red")}<div class="mu-center" id="muCenter"></div>${side("blue")}</section>
        <div class="card mu-time" id="muTime"></div>
        <div id="muResults"></div>`}`;
    const ySel = $("#muYear", root);
    if (ySel) ySel.onchange = () => { matchupYear = Number(ySel.value); matchupWeek = 99; renderMatchup(root); };
    const sw = $("#muSwap", root); if (sw) sw.onclick = () => { [matchupRed, matchupBlue] = [matchupBlue, matchupRed]; renderMatchup(root); };
    const rs = $("#muReset", root); if (rs) rs.onclick = () => { matchupRed = ["", "", ""]; matchupBlue = ["", "", ""]; renderMatchup(root); };
    if (sub === "event" && !teams.length) return;
    const picked = [...matchupRed, ...matchupBlue].filter(Boolean);
    paintAvatars(root, picked);
    paintTeamFills(root, picked);

    // ---- EPA lookups ------------------------------------------------------
    const eventLookup = (qual) => {
      const cache = s.eventKey ? Store.getCache("matches." + s.eventKey, null) : null;
      const all = (cache ? cache.data : []) || [];
      const ev = EPA.computeEvent(all.filter((m) => m.comp_level === "qm" && (Number(m.match_number) || 0) <= qual));
      return (t) => { const r = ev.byTeam[t]; if (!r) return null; const b = r.breakdown || {}; return { total: r.epa, auto: b.auto, teleop: b.teleop, endgame: b.endgame }; };
    };
    const globalLookup = (week) => (t) => {
      const rows = matchupSeries[key(t)];
      if (!rows || !rows.length) return null;
      let best = null; rows.forEach((r) => { if (r.week != null && r.week <= week) best = r; });
      if (!best) best = rows.filter((r) => r.week == null).slice(-1)[0] || null;
      if (!best) return null;
      return { total: best.epa, auto: best.auto, teleop: best.teleop, endgame: best.endgame };
    };
    const maxQual = () => {
      const cache = s.eventKey ? Store.getCache("matches." + s.eventKey, null) : null;
      return ((cache ? cache.data : []) || []).filter((m) => m.comp_level === "qm").reduce((mx, m) => Math.max(mx, Number(m.match_number) || 0), 0);
    };
    const maxWeek = () => picked.reduce((mx, t) => (matchupSeries[key(t)] || []).reduce((m2, r) => (r.week != null ? Math.max(m2, r.week) : m2), mx), 0);

    function drawTime() {
      const el = $("#muTime", root); if (!el) return;
      const mx = sub === "event" ? maxQual() : maxWeek();
      if (!mx) { el.innerHTML = `<p class="hint" style="margin:0">${sub === "event" ? "Load this event's matches (needs wifi) to use the qualification slider." : "Add teams to load their season EPA, then rewind by week here."}</p>`; return; }
      if (sub === "event" && matchupQual > mx) matchupQual = mx;
      if (sub === "global" && matchupWeek > mx) matchupWeek = mx;
      const v = sub === "event" ? matchupQual : matchupWeek;
      const lbl = (x) => sub === "event" ? (x >= mx ? `Q${mx} · latest` : `After Q${x}`) : (x >= mx ? `Week ${mx} · latest` : `Week ${x}`);
      el.innerHTML = `<div class="mu-time-head"><span class="mu-time-label">${icon("clock")} ${sub === "event" ? "Rewind by qualification" : "Rewind by week"}</span>
          <span class="mu-time-val" id="muTimeVal">${lbl(v)}</span></div>
        <input type="range" id="muSlider" min="1" max="${mx}" value="${v}" />
        <div class="mu-ticks"><span>${sub === "event" ? "Q1" : "Week 1"}</span><span>${sub === "event" ? "Q" + mx : "Week " + mx}</span></div>`;
      $("#muSlider", el).oninput = (e) => {
        const x = Number(e.target.value);
        if (sub === "event") matchupQual = x; else matchupWeek = x;
        $("#muTimeVal", el).textContent = lbl(x);
        drawResults(false);
      };
    }

    let lastScores = [0, 0];
    function drawResults(animate = true) {
      const el = $("#muResults", root), center = $("#muCenter", root); if (!el || !center) return;
      const getEpa = sub === "event" ? eventLookup(matchupQual) : globalLookup(matchupWeek);
      const data = (arr, col) => arr.map((t, i) => t ? { t, i, col, e: getEpa(t) } : null).filter(Boolean);
      const red = data(matchupRed, "red"), blue = data(matchupBlue, "blue");
      [...red, ...blue].forEach((x) => { const n = $(`#muEpa-${x.col}-${x.i}`, root); if (n) n.innerHTML = x.e ? `<b>${fmt(x.e.total)}</b><small>EPA</small>` : `<small>no EPA</small>`; });
      if (!red.length && !blue.length) {
        center.innerHTML = `<span class="mu-vs">VS</span><span class="mu-pred">Add teams to predict</span>`;
        el.innerHTML = "";
        return;
      }
      const sum = (side, k) => side.reduce((a, x) => a + (x.e && x.e[k] != null ? x.e[k] : 0), 0);
      const rT = sum(red, "total"), bT = sum(blue, "total");
      const pRed = Math.round(winProb(rT, bT) * 100);
      $("#muTot-red", root).textContent = red.length ? fmt(rT) + " EPA" : "";
      $("#muTot-blue", root).textContent = blue.length ? fmt(bT) + " EPA" : "";
      center.innerHTML = `<span class="mu-vs">VS</span>
        <div class="mu-scores"><b class="red" id="muSR">${Math.round(rT)}</b><span>–</span><b class="blue" id="muSB">${Math.round(bT)}</b></div>
        <span class="mu-pred">predicted score</span>
        <div class="mu-probbar"><i style="width:${pRed}%"></i></div>
        <div class="mu-probtxt"><span class="red">${pRed}%</span><span>${rT === bT ? "Toss-up" : rT > bT ? "Red favored" : "Blue favored"}</span><span class="blue">${100 - pRed}%</span></div>`;
      if (animate) {
        // roll the scores from where they were
        const from = lastScores.slice(), to = [Math.round(rT), Math.round(bT)], t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / 600), k = 1 - Math.pow(1 - p, 3);
          const a = $("#muSR", root), b = $("#muSB", root); if (!a || !b) return;
          a.textContent = Math.round(from[0] + (to[0] - from[0]) * k); b.textContent = Math.round(from[1] + (to[1] - from[1]) * k);
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        setTimeout(() => { const a = $("#muSR", root), b = $("#muSB", root); if (a && b) { a.textContent = to[0]; b.textContent = to[1]; } }, 700);
      }
      lastScores = [Math.round(rT), Math.round(bT)];
      const comps = [["auto", "Auto"], ["teleop", "Teleop"], ["endgame", "Endgame"], ["total", "Total"]];
      const all = [...red, ...blue], maxT = Math.max(1, ...all.map((x) => (x.e ? x.e.total : 0)));
      el.innerHTML = `
        <section class="card mu-phases">
          <div class="sr-head"><h3>${icon("chart")} Phase by phase</h3><span class="hint">who wins each part of the match</span></div>
          ${comps.map(([k, l]) => {
            const r = sum(red, k), b = sum(blue, k), m = Math.max(1, r, b);
            return `<div class="mu-ph${k === "total" ? " tot" : ""}">
              <span class="mu-ph-val red${r >= b ? " win" : ""}">${fmt(r)}</span>
              <span class="mu-ph-bar red"><i style="width:${r / m * 100}%"></i></span>
              <span class="mu-ph-l">${l}</span>
              <span class="mu-ph-bar blue"><i style="width:${b / m * 100}%"></i></span>
              <span class="mu-ph-val blue${b >= r ? " win" : ""}">${fmt(b)}</span>
            </div>`;
          }).join("")}
        </section>
        <div class="mu-pergrid">
          ${[["red", red], ["blue", blue]].map(([col, list]) => `<section class="card mu-teamcard ${col}">
            <div class="mu-side-head"><span class="alliance-dot alliance-${col}"></span>${col} contributions</div>
            ${list.length ? list.map((x) => `<button class="mu-trow" data-team="${esc(x.t)}" data-tfill="${esc(x.t)}">
                <img class="team-avatar mu-tav" data-avatar="${esc(x.t)}" data-ally="${col}" alt="" />
                <span class="mu-tnum">${esc(x.t)}</span><span class="mu-tname">${esc(nameOf(x.t))}</span>
                <span class="mu-tbar"><span class="mu-tbar-fill ${col}" style="width:${x.e ? Math.round(x.e.total / maxT * 100) : 0}%"></span></span>
                <span class="mu-tepa ${col}">${x.e ? fmt(x.e.total) : `<span class="muted">–</span>`}</span></button>`).join("") : `<p class="muted">No ${col} teams yet.</p>`}
          </section>`).join("")}
        </div>
        <p class="hint" style="margin:8px 2px 0">${sub === "event" ? "On-device event EPA from played quals, an estimate rather than an official prediction."
          : `Statbotics ${year} EPA. Predicted score ≈ each alliance's combined EPA.`}</p>`;
      paintAvatars(el, all.map((x) => x.t)); paintTeamFills(el, all.map((x) => x.t));
      $$("[data-team]", root).forEach((c) => c.onclick = () => (year === GAME.season ? openTeam(c.dataset.team) : (location.hash = "#/team/" + c.dataset.team + "/" + year)));
    }

    // ---- Wiring -----------------------------------------------------------
    const loadSeries = (cb) => {
      if (sub !== "global") return cb();
      const need = picked.filter((t) => !matchupSeries[key(t)]);
      if (!need.length) return cb();
      $("#muCenter", root).innerHTML = `<div class="tp-loading"><span class="tp-spin"></span>Loading ${year} EPA…</div>`;
      Promise.all(need.map((t) => API.sbTeamMatches(t, year).then((rows) => { matchupSeries[key(t)] = rows; }).catch(() => { matchupSeries[key(t)] = []; })))
        .then(() => { if (root.isConnected) cb(); });
    };
    const setSlot = (col, i, v) => { (col === "red" ? matchupRed : matchupBlue)[i] = v; muFocusNext = !!v; renderMatchup(root); };
    $$(".mu-team", root).forEach((ctrl) => {
      const commit = () => { const v = (ctrl.value || "").replace(/\D/g, ""); if (v) setSlot(ctrl.dataset.col, Number(ctrl.dataset.i), v); };
      if (ctrl.tagName === "SELECT") ctrl.onchange = commit;
      else { ctrl.onkeydown = (e) => { if (e.key === "Enter") commit(); }; ctrl.onblur = commit; }
    });
    $$("[data-clear]", root).forEach((b) => b.onclick = () => { const [col, i] = b.dataset.clear.split("-"); setSlot(col, Number(i), ""); });
    loadSeries(() => { drawTime(); drawResults(); });
    if (muFocusNext) { muFocusNext = false; const nx = $(".mu-slot.empty .mu-team", root); if (nx) nx.focus(); } // keep entering teams
    if (sub === "global" && !lbRows.length && !matchupLbLoading) {
      matchupLbLoading = true;
      API.sbYearLeaderboard(year).then(() => { matchupLbLoading = false; if (matchupSub() === "global" && current() === "matchup") renderMatchup(root); }).catch(() => { matchupLbLoading = false; });
    }
  }

  function picklistSub() {
    const s = location.hash.replace(/^#\/?/, "").split("/")[1] || "alliance";
    return ["alliance", "tierlist", "scouters"].includes(s) ? s : "alliance";
  }

  function renderPicklist(root) {
    const teams = eventTeams();
    const sub = picklistSub();
    const tabs = [["alliance", "Alliance selection", "chess"], ["tierlist", "Tier list", "list"], ["scouters", "Scouters' lists", "teams"]];
    const ev = Store.getSettings().eventName;
    const bar = pageHero({ ic: "list", eyebrow: "Pick list", title: ev ? esc(ev) : "No event selected",
        sub: ev ? "Your alliance board and tier list are saved for this event. Switch events and you get a fresh set; switch back and they return." : "Pick an event in the sidebar to start building lists." }) +
      `<div class="subtabs" id="pickTabs">
      ${tabs.map(([k, l, ic]) => `<a href="#/picklist/${k}" class="${sub === k ? "on" : ""}">${icon(ic)} ${esc(l)}</a>`).join("")}</div>`;

    if (!teams.length && sub !== "scouters") {
      root.innerHTML = bar + `<div class="card">${emptyState("list", "No event teams",
        "Pick your event on the Dashboard to build alliance selections and tier lists for the teams competing.")}
        <div class="btn-row" style="justify-content:center"><button class="btn primary" data-go="dashboard">${icon("calendar")} Choose event</button></div></div>`;
      const g = $("[data-go]", root); if (g) g.onclick = () => go("dashboard");
      return;
    }
    root.innerHTML = bar + `<div id="pickBody"></div>`;
    const body = $("#pickBody", root);
    if (sub === "tierlist") renderTierlist(body, teams);
    else if (sub === "scouters") renderScoutersLists(body);
    else renderAllianceSelection(body, teams);
  }

  /* ---- Sub: Alliance selection -------------------------------------------- */
  function renderAllianceSelection(root, teams) {
    const b = getBoard();
    const schema = pitFields();
    const boolFields = schema.filter((f) => f.type === "bool");
    const selectFields = schema.filter((f) => f.type === "select");
    // Build the consolidated trait list (one multiselect for every pit trait).
    const traitOpts = [
      ...boolFields.map((f) => ({ token: "b:" + f.key, label: f.label })),
      ...selectFields.flatMap((f) => f.options.map((o) => ({ token: "s:" + f.key + ":" + o, label: f.label + ": " + o }))),
      { token: "d", label: "Plays defense (>50%)" },
    ];
    const activeCount = poolTraits.length;

    root.innerHTML = `
      <div class="section-head">
        <h2 style="margin:0">Alliance selection</h2>
        <div class="btn-row">
          <button class="btn ghost sm" id="addCol" ${b.cols.length >= MAX_COLS ? "disabled" : ""}>${icon("plus")} Add pick column</button>
          <button class="btn ghost sm" id="delCol" ${b.cols.length <= 3 ? "disabled" : ""}>Remove last column</button>
          <button class="btn ghost sm" id="clearBoard">${icon("trash")} Clear list</button>
          <button class="btn primary sm" id="submitBoard">${icon("check")} ${b.submitted ? "Update selections" : "Submit selections"}</button>
        </div>
      </div>
      <p class="hint">Tap a team to view its BagelStats. Use ${icon("plus")} (or drag) to place a team, then tap a slot. Max pick is the 3rd pick.${b.submitted ? ` <span class="badge green dot">Submitted ${new Date(b.submittedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>` : ""}</p>
      <div class="place-banner" id="pickBanner" hidden></div>

      <div class="alliance-layout">
        <div class="card flush ab-wrap">
          <div class="table-wrap"><table class="ab-table">
            <thead><tr><th>#</th>${b.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
            <tbody id="abBody"></tbody>
          </table></div>
        </div>
        <div class="alliance-side">
          <div class="card pool-card">
            <div class="section-head" style="margin-bottom:10px"><h3 style="margin:0">Team pool</h3><span class="hint" id="poolCount"></span></div>
            <div class="pool-filters">
              <input type="search" id="poolSearch" placeholder="Search team…" value="${esc(poolSearch)}" />
              <details class="filter-multi" id="traitFilter">
                <summary>${icon("search")} Filter${activeCount ? ` <span class="badge cyan">${activeCount}</span>` : ""}</summary>
                <div class="fm-panel">
                  ${traitOpts.map((o) => `<label class="fm-opt"><input type="checkbox" data-token="${esc(o.token)}" ${poolTraits.includes(o.token) ? "checked" : ""} /> ${esc(o.label)}</label>`).join("")}
                </div>
              </details>
              ${activeCount || poolSearch ? `<button class="btn ghost sm" id="clearFilters">Clear filters</button>` : ""}
            </div>
            <div class="pool-list" id="poolList"></div>
          </div>
          <div class="card">
            <h3 style="color:var(--danger);margin-top:0">Do Not Pick (${b.dnp.length})</h3>
            <div class="dnp-zone" id="dnpZone"></div>
          </div>
        </div>
      </div>`;

    const epaOf = epaLookup();
    const abBody = $("#abBody", root);
    const poolList = $("#poolList", root);
    const dnpZone = $("#dnpZone", root);
    let dragTeam = null;

    function drawBoard() {
      const bb = getBoard();
      abBody.innerHTML = bb.grid.map((row, a) => `<tr>
        <td class="ab-num">${a + 1}</td>
        ${row.map((t, c) => t
          ? `<td class="ab-slot filled" data-a="${a}" data-c="${c}" data-team="${t}" data-tfill="${t}" draggable="true">
              <img class="team-avatar" data-avatar="${t}" alt="" /><span class="ab-team">${t}</span>
              <button class="slot-x" data-clear="${a}-${c}" aria-label="Clear">${icon("x")}</button></td>`
          : `<td class="ab-slot empty ${pickSelected ? "target" : ""}" data-a="${a}" data-c="${c}">${pickSelected ? "+" : "·"}</td>`).join("")}
      </tr>`).join("");
      paintAvatars(abBody, bb.grid.flat().filter(Boolean));
      paintTeamFills(abBody, bb.grid.flat().filter(Boolean));
      wireBoard();
    }
    function placeTeam(team, a, c) {
      const bb = getBoard(); team = String(team);
      bb.grid = bb.grid.map((row) => row.map((x) => x === team ? null : x));
      bb.dnp = bb.dnp.filter((t) => t !== team);
      bb.grid[a][c] = team;
      saveBoard(bb); pickSelected = null; drawBoard(); drawPool(); drawDnp();
    }
    function clearSlot(a, c) { const bb = getBoard(); bb.grid[a][c] = null; saveBoard(bb); drawBoard(); drawPool(); }
    function wireBoard() {
      $$(".ab-slot", abBody).forEach((slot) => {
        slot.addEventListener("dragover", (e) => { e.preventDefault(); slot.classList.add("over"); });
        slot.addEventListener("dragleave", () => slot.classList.remove("over"));
        slot.addEventListener("drop", (e) => { e.preventDefault(); slot.classList.remove("over");
          if (dragTeam) placeTeam(dragTeam, +slot.dataset.a, +slot.dataset.c); });
        slot.onclick = (e) => {
          if (e.target.closest(".slot-x")) return;
          if (slot.classList.contains("filled")) {
            if (pickSelected) placeTeam(pickSelected, +slot.dataset.a, +slot.dataset.c);
            else openTeam(slot.dataset.team);
          } else if (pickSelected) placeTeam(pickSelected, +slot.dataset.a, +slot.dataset.c);
        };
      });
      $$(".ab-slot.filled", abBody).forEach((slot) => {
        slot.addEventListener("dragstart", () => { dragTeam = slot.dataset.team; });
        slot.addEventListener("dragend", () => { dragTeam = null; });
      });
      $$("[data-clear]", abBody).forEach((x) => x.onclick = (e) => { e.stopPropagation();
        const [a, c] = x.dataset.clear.split("-").map(Number); clearSlot(a, c); });
    }

    function passes(team) {
      if (poolSearch) { const f = poolSearch.toLowerCase(); if (!String(team).includes(f) && !teamName(team).toLowerCase().includes(f)) return false; }
      if (!poolTraits.length) return true;
      const p = allPits()[team] || {};
      const selByKey = {};
      for (const tok of poolTraits) {
        if (tok === "d") { if (computeStats(team).defenseRate <= 0.5) return false; }
        else if (tok.startsWith("b:")) { if (!p[tok.slice(2)]) return false; }
        else if (tok.startsWith("s:")) {
          const rest = tok.slice(2); const i = rest.indexOf(":");
          const key = rest.slice(0, i), val = rest.slice(i + 1);
          (selByKey[key] = selByKey[key] || []).push(val);
        }
      }
      for (const [key, vals] of Object.entries(selByKey)) if (!vals.includes(p[key])) return false;
      return true;
    }
    function drawPool() {
      const bb = getBoard();
      const placed = new Set(bb.grid.flat().filter(Boolean));
      const dnpSet = new Set(bb.dnp);
      let pool = teams.map((t) => String(t.team_number)).filter((t) => !placed.has(t) && !dnpSet.has(t) && passes(t));
      pool.sort((a, z) => (epaOf(z) ?? -1e9) - (epaOf(a) ?? -1e9));
      $("#poolCount", root).textContent = pool.length + " teams";
      poolList.innerHTML = pool.length ? pool.map((t) => `
        <div class="pool-team ${pickSelected === t ? "sel" : ""}" draggable="true" data-team="${t}" data-tfill="${t}">
          <button class="pt-add" data-add="${t}" title="Add to an alliance slot" aria-label="Add ${t} to an alliance slot">${icon("plus")}</button>
          <button class="pt-main" data-stats="${t}">
            <img class="team-avatar" data-avatar="${t}" alt="" />
            <span class="pt-info"><span class="pt-num">${t}</span><span class="pt-name">${esc(teamName(t))}</span></span>
          </button>
          <span class="pt-epa">${epaOf(t) != null ? fmt(epaOf(t)) : "–"}</span>
          <button class="pt-dnp" data-dnp="${t}" title="Do Not Pick" aria-label="Do Not Pick">${icon("x")}</button>
        </div>`).join("") : `<p class="muted" style="padding:10px">No teams match these filters.</p>`;
      paintAvatars(poolList, pool);
      paintTeamFills(poolList, pool);
      $$(".pool-team", poolList).forEach((el) => {
        el.addEventListener("dragstart", () => { dragTeam = el.dataset.team; el.classList.add("dragging"); });
        el.addEventListener("dragend", () => { dragTeam = null; el.classList.remove("dragging"); });
      });
      $$("[data-stats]", poolList).forEach((el) => el.onclick = (e) => { e.stopPropagation(); openTeam(el.dataset.stats); });
      $$("[data-dnp]", poolList).forEach((x) => x.onclick = (e) => { e.stopPropagation(); markDNP(x.dataset.dnp); drawPool(); drawDnp(); });
      $$("[data-add]", poolList).forEach((x) => x.onclick = (e) => { e.stopPropagation();
        pickSelected = pickSelected === x.dataset.add ? null : x.dataset.add; drawBoard(); drawPool(); updateBanner(); });
      updateBanner();
    }
    function updateBanner() {
      const bn = $("#pickBanner", root); if (!bn) return;
      if (pickSelected) {
        bn.hidden = false;
        bn.innerHTML = `Placing <b>${esc(pickSelected)}</b> — tap an alliance slot below to drop it in, or <button class="link-btn" id="cancelPlace">cancel</button>.`;
        const cx = $("#cancelPlace", root); if (cx) cx.onclick = () => { pickSelected = null; drawBoard(); drawPool(); updateBanner(); };
      } else { bn.hidden = true; bn.innerHTML = ""; }
    }
    function drawDnp() {
      const bb = getBoard();
      dnpZone.innerHTML = bb.dnp.length ? bb.dnp.map((t) => `
        <div class="dnp-item" data-team="${t}" data-tfill="${t}"><img class="team-avatar" data-avatar="${t}" alt="" /><span>${t}</span>
          <button class="icon-btn sm" data-undnp="${t}" aria-label="Remove">${icon("x")}</button></div>`).join("")
        : `<p class="muted" style="padding:8px">Drag or tap-✕ teams here to exclude.</p>`;
      paintAvatars(dnpZone, bb.dnp); paintTeamFills(dnpZone, bb.dnp);
      $$("[data-undnp]", dnpZone).forEach((x) => x.onclick = () => { unmarkDNP(x.dataset.undnp); drawDnp(); drawPool(); });
      $$(".dnp-item", dnpZone).forEach((el) => el.onclick = (e) => { if (e.target.closest("button")) return; openTeam(el.dataset.team); });
    }
    dnpZone.addEventListener("dragover", (e) => { e.preventDefault(); dnpZone.classList.add("over"); });
    dnpZone.addEventListener("dragleave", () => dnpZone.classList.remove("over"));
    dnpZone.addEventListener("drop", (e) => { e.preventDefault(); dnpZone.classList.remove("over"); if (dragTeam) { markDNP(dragTeam); drawBoard(); drawPool(); drawDnp(); } });
    poolList.addEventListener("dragover", (e) => e.preventDefault());
    poolList.addEventListener("drop", (e) => { e.preventDefault(); if (dragTeam && isOnBoard(dragTeam)) { const bb = getBoard(); bb.grid = bb.grid.map((row) => row.map((x) => x === dragTeam ? null : x)); saveBoard(bb); drawBoard(); drawPool(); } });

    drawBoard(); drawPool(); drawDnp();

    $("#poolSearch", root).oninput = (e) => { poolSearch = e.target.value; drawPool(); };
    $$("#traitFilter input[data-token]", root).forEach((cb) => cb.onchange = () => {
      const tok = cb.dataset.token;
      if (cb.checked) { if (!poolTraits.includes(tok)) poolTraits.push(tok); }
      else poolTraits = poolTraits.filter((t) => t !== tok);
      drawPool();
    });
    const cf = $("#clearFilters", root); if (cf) cf.onclick = () => { poolTraits = []; poolSearch = ""; renderPicklist(view); };
    const ac = $("#addCol", root); if (ac) ac.onclick = () => {
      const bb = getBoard(); if (bb.cols.length >= MAX_COLS) return;
      bb.cols.push(COL_NAMES[bb.cols.length]); bb.grid.forEach((row) => row.push(null)); saveBoard(bb); renderPicklist(view);
    };
    const dc = $("#delCol", root); if (dc) dc.onclick = () => { const bb = getBoard(); if (bb.cols.length <= 3) return; bb.cols.pop(); bb.grid.forEach((row) => row.pop()); saveBoard(bb); renderPicklist(view); };
    const clr = $("#clearBoard", root); if (clr) clr.onclick = () => confirmDialog("Clear the whole alliance board? This empties every slot and the Do-Not-Pick list.", () => {
      const bb = getBoard(); bb.grid = bb.grid.map((row) => row.map(() => null)); bb.dnp = []; pickSelected = null;
      saveBoard(bb); renderPicklist(view); toast("Alliance board cleared");
    });
    $("#submitBoard", root).onclick = () => {
      const bb = getBoard(); bb.submitted = true; bb.submittedAt = Date.now(); saveBoard(bb);
      Cloud.pushPicklist();
      toast("Alliance selections submitted"); renderPicklist(view);
    };
  }

  /* ---- Sub: Tier list (S–F) ----------------------------------------------- */
  function getTiers() {
    const tl = Store.getTierlist() || {};
    const tiers = {};
    TIERS.forEach((t) => { tiers[t] = Array.isArray(tl.tiers && tl.tiers[t]) ? tl.tiers[t].map(String) : []; });
    return { tiers, submitted: !!tl.submitted, submittedAt: tl.submittedAt || null };
  }
  function saveTiers(tl) { Store.setTierlist(tl); }

  function renderTierlist(root, teams) {
    const epaOf = epaLookup();
    const allTeams = teams.map((t) => String(t.team_number));

    root.innerHTML = `
      <div class="section-head">
        <h2 style="margin:0">Tier list</h2>
        <div class="btn-row">
          <button class="btn ghost sm" id="autoRate">${icon("chart")} Auto-rate by EPA</button>
          <button class="btn ghost sm" id="clearTiers">${icon("trash")} Clear list</button>
          <button class="btn primary sm" id="submitTiers">${icon("check")} Submit</button>
        </div>
      </div>
      <p class="hint">Tap a team to view its BagelStats. Use ${icon("plus")} (or drag) to pick a team up, then tap a tier row to place it. <b>Auto-rate</b> sorts every team into S–F by EPA.</p>
      <div class="place-banner" id="tierBanner" hidden></div>
      <div class="tier-board" id="tierBoard"></div>
      <div class="card" style="margin-top:14px">
        <div class="section-head" style="margin-bottom:10px"><h3 style="margin:0">Unranked</h3><span class="hint" id="tierPoolCount"></span></div>
        <div class="tier-pool" id="tierPool"></div>
      </div>`;

    const board = $("#tierBoard", root);
    const poolEl = $("#tierPool", root);
    let dragTeam = null;

    const teamCard = (t, ph) => `
      <div class="tier-team ${tierSelected === t ? "sel" : ""}" draggable="true" data-team="${t}" data-tfill="${t}">
        ${ph ? `<button class="tt-add" data-add="${t}" title="Add to a tier" aria-label="Add ${t} to a tier">${icon("plus")}</button>` : ""}
        <button class="tt-main" data-stats="${t}"><img class="team-avatar" data-avatar="${t}" alt="" /><span class="tt-num">${t}</span></button>
        ${ph ? `` : `<button class="tt-x" data-remove="${t}" aria-label="Remove">${icon("x")}</button>`}
      </div>`;

    function draw() {
      const { tiers } = getTiers();
      const placed = new Set(Object.values(tiers).flat());
      board.innerHTML = TIERS.map((tier) => `
        <div class="tier-row" data-tier="${tier}">
          <div class="tier-label tier-${tier}">${tier}</div>
          <div class="tier-slots" data-tier="${tier}">${tiers[tier].map((t) => teamCard(t, false)).join("")}</div>
        </div>`).join("");
      const pool = allTeams.filter((t) => !placed.has(t)).sort((a, z) => (epaOf(z) ?? -1e9) - (epaOf(a) ?? -1e9));
      $("#tierPoolCount", root).textContent = pool.length + " teams";
      poolEl.innerHTML = pool.length ? pool.map((t) => teamCard(t, true)).join("") : `<p class="muted" style="padding:8px">Every team is ranked.</p>`;
      paintAvatars(board, [...placed]); paintTeamFills(board, [...placed]);
      paintAvatars(poolEl, pool); paintTeamFills(poolEl, pool);
      wire();
    }
    function placeInTier(team, tier) {
      team = String(team);
      const tl = getTiers();
      TIERS.forEach((t) => { tl.tiers[t] = tl.tiers[t].filter((x) => x !== team); });
      if (tier) tl.tiers[tier].push(team);
      saveTiers(tl); tierSelected = null; draw();
    }
    function wire() {
      $$(".tier-team", root).forEach((el) => {
        el.addEventListener("dragstart", () => { dragTeam = el.dataset.team; el.classList.add("dragging"); });
        el.addEventListener("dragend", () => { dragTeam = null; el.classList.remove("dragging"); });
      });
      $$("[data-stats]", root).forEach((el) => el.onclick = (e) => { e.stopPropagation(); openTeam(el.dataset.stats); });
      $$("[data-remove]", root).forEach((el) => el.onclick = (e) => { e.stopPropagation(); placeInTier(el.dataset.remove, null); });
      $$("[data-add]", poolEl).forEach((x) => x.onclick = (e) => { e.stopPropagation();
        tierSelected = tierSelected === x.dataset.add ? null : x.dataset.add; draw(); });
      $$(".tier-row", board).forEach((row) => {
        const tier = row.dataset.tier;
        row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("over"); });
        row.addEventListener("dragleave", () => row.classList.remove("over"));
        row.addEventListener("drop", (e) => { e.preventDefault(); row.classList.remove("over"); if (dragTeam) placeInTier(dragTeam, tier); });
        row.onclick = (e) => { if (e.target.closest(".tier-team")) return; if (tierSelected) placeInTier(tierSelected, tier); };
      });
      poolEl.addEventListener("dragover", (e) => e.preventDefault());
      poolEl.addEventListener("drop", (e) => { e.preventDefault(); if (dragTeam) placeInTier(dragTeam, null); });
      // Placement banner (mobile-friendly: no drag needed)
      const bn = $("#tierBanner", root);
      if (bn) {
        if (tierSelected) {
          bn.hidden = false;
          bn.innerHTML = `Placing <b>${esc(tierSelected)}</b> — tap a tier row (S–F) to drop it in, or <button class="link-btn" id="cancelTier">cancel</button>.`;
          const cx = $("#cancelTier", root); if (cx) cx.onclick = () => { tierSelected = null; draw(); };
        } else { bn.hidden = true; bn.innerHTML = ""; }
      }
    }

    draw();
    $("#autoRate", root).onclick = () => {
      const rated = allTeams.filter((t) => epaOf(t) != null).sort((a, z) => epaOf(z) - epaOf(a));
      const tl = getTiers();
      TIERS.forEach((t) => tl.tiers[t] = []);
      const per = Math.ceil(rated.length / TIERS.length) || 1;
      rated.forEach((t, i) => { tl.tiers[TIERS[Math.min(TIERS.length - 1, Math.floor(i / per))]].push(t); });
      saveTiers(tl); draw(); toast("Teams auto-rated by EPA");
    };
    $("#clearTiers", root).onclick = () => confirmDialog("Clear the whole tier list?", () => {
      const tl = getTiers(); TIERS.forEach((t) => tl.tiers[t] = []); saveTiers(tl); draw(); toast("Tier list cleared");
    });
    $("#submitTiers", root).onclick = () => {
      const tl = getTiers(); tl.submitted = true; tl.submittedAt = Date.now(); saveTiers(tl);
      Cloud.pushTierlist(); toast("Tier list submitted");
    };
  }

  /* ---- Sub: Scouters lists (what everyone submitted) ---------------------- */
  function sharedBoards() {
    const me = Store.getMe(), out = [];
    const myB = getBoard();
    if (myB.submitted) out.push({ scouterId: me.id, name: scouterName(me), cols: myB.cols, grid: myB.grid, submittedAt: myB.submittedAt });
    const ek = Store.getSettings().eventKey;
    (Cloud.getSharedBoards() || []).forEach((b) => {
      if (b.scouterId === me.id || (b.event && b.event !== ek)) return; // only this event's boards
      // Cloud stores the grid as row maps ({cells}); rebuild the 2D grid for display.
      const grid = b.grid || (b.rows || []).map((r) => (r && r.cells) || []);
      out.push({ ...b, grid });
    });
    return out.sort((a, z) => (z.submittedAt || 0) - (a.submittedAt || 0));
  }
  function sharedTierlists() {
    const me = Store.getMe(), out = [];
    const myT = Store.getTierlist();
    if (myT && myT.submitted) out.push({ scouterId: me.id, name: scouterName(me), tiers: myT.tiers, submittedAt: myT.submittedAt });
    const ek = Store.getSettings().eventKey;
    (Cloud.getSharedTierlists() || []).forEach((t) => { if (t.scouterId !== me.id && (!t.event || t.event === ek)) out.push(t); });
    return out.sort((a, z) => (z.submittedAt || 0) - (a.submittedAt || 0));
  }
  function renderScoutersLists(root) {
    const boards = sharedBoards();
    const tls = sharedTierlists();
    const stamp = (ts) => ts ? new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

    const boardCard = (b) => `
      <div class="card">
        <div class="section-head" style="margin-bottom:8px"><h3 style="margin:0">${esc(b.name || "Scout")}</h3><span class="hint">${esc(stamp(b.submittedAt))}</span></div>
        <div class="table-wrap"><table class="ab-table sl-table">
          <thead><tr><th>#</th>${(b.cols || []).map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>${(b.grid || []).map((row, a) => row.some(Boolean) ? `<tr><td class="ab-num">${a + 1}</td>${row.map((t) => `<td>${t ? `<span class="team-num" data-team="${esc(t)}" style="cursor:pointer">${esc(t)}</span>` : "·"}</td>`).join("")}</tr>` : "").join("")}</tbody>
        </table></div>
      </div>`;
    const tierCard = (t) => `
      <div class="card">
        <div class="section-head" style="margin-bottom:8px"><h3 style="margin:0">${esc(t.name || "Scout")}</h3><span class="hint">${esc(stamp(t.submittedAt))}</span></div>
        ${TIERS.map((tier) => { const arr = (t.tiers && t.tiers[tier]) || []; return arr.length ? `
          <div class="tier-row static"><div class="tier-label tier-${tier}">${tier}</div>
          <div class="tier-slots">${arr.map((tm) => `<span class="team-num" data-team="${esc(tm)}" style="cursor:pointer">${esc(tm)}</span>`).join(" ")}</div></div>` : ""; }).join("")}
      </div>`;

    root.innerHTML = `
      <p class="hint" style="margin-top:0">Lists other scouts submitted for this event.</p>
      ${Cloud.enabled() ? "" : `<div class="card cloud-note">${icon("globe")}<span>Cloud sync is off, so this shows only your own submitted lists. Enable it in <b>js/config.js</b> to see everyone's.</span></div>`}
      <div class="section">
        <div class="section-head"><h3 style="margin:0">${icon("chess")} Alliance predictions</h3><span class="hint">${boards.length} submitted</span></div>
        ${boards.length ? `<div class="grid cols-2">${boards.map(boardCard).join("")}</div>` : emptyState("chess", "No submissions yet", "Submit an alliance board to share it here.")}
      </div>
      <div class="section">
        <div class="section-head"><h3 style="margin:0">${icon("list")} Tier lists</h3><span class="hint">${tls.length} submitted</span></div>
        ${tls.length ? `<div class="grid cols-2">${tls.map(tierCard).join("")}</div>` : emptyState("list", "No submissions yet", "Submit a tier list to share it here.")}
      </div>`;
    $$("[data-team]", root).forEach((el) => el.onclick = () => openTeam(el.dataset.team));
  }

  /* ===========================================================================
     VIEW: DATA (export / import / clear)
     ======================================================================== */
  let dataViewTab = "matches";       // matches | pit — for the always-on data viewer
  let dataScouter = "";              // scouter filter ("" = all)
  let dataSearch = "";               // team search filter
  const dataSort = { matches: { key: "matchNumber", dir: 1 }, pit: { key: "team", dir: 1 } };

  function cellVal(v) { return v == null || v === "" ? "–" : v === true ? "Yes" : v === false ? "No" : String(v); }
  // Column sets for the Data viewer. get(r) returns the raw value for the column.
  function matchCols() {
    return [{ key: "matchNumber", label: "Match" }, { key: "team", label: "Team", team: true },
      { key: "alliance", label: "Alliance" }, { key: "scout", label: "Scout" },
      ...matchFields().map((f) => ({ key: f.key, label: f.label }))];
  }
  function pitCols() {
    return [{ key: "team", label: "Team", team: true }, { key: "nickname", label: "Name" },
      { key: "scout", label: "Scout" }, ...pitFields().map((f) => ({ key: f.key, label: f.label }))];
  }
  // Build a filtered + sorted data table for the given tab.
  function buildDataTable(tab, allRows) {
    const cols = tab === "pit" ? pitCols() : matchCols();
    const s = dataSort[tab];
    const f = dataSearch.trim().toLowerCase();
    let rows = allRows.filter((r) => {
      if (dataScouter && (r.scout || "") !== dataScouter) return false;
      if (f && !String(r.team ?? "").includes(f) && !String(r.nickname || "").toLowerCase().includes(f)) return false;
      return true;
    });
    rows.sort((a, b) => {
      const av = a[s.key], bv = b[s.key], na = Number(av), nb = Number(bv);
      const numeric = av !== "" && bv !== "" && av != null && bv != null && !isNaN(na) && !isNaN(nb);
      const cmp = numeric ? na - nb : String(av ?? "").localeCompare(String(bv ?? ""));
      return cmp * s.dir;
    });
    if (!rows.length) return `<div class="data-empty">${emptyState(tab === "pit" ? "wrench" : "clipboard",
      "Nothing to show", dataScouter || f ? "No records match these filters." : "Records show up here as scouts submit them.")}</div>`;
    const arrow = (k) => s.key === k ? (s.dir > 0 ? " ▲" : " ▼") : "";
    return `<div class="table-wrap scroll-y"><table class="data-table sortable">
      <thead><tr>${cols.map((c) => `<th data-sortkey="${esc(c.key)}" class="${s.key === c.key ? "sorted" : ""}">${esc(c.label)}${arrow(c.key)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c.team
        ? `<span class="team-num" data-team="${esc(String(r.team))}" style="cursor:pointer">${esc(String(r.team))}</span>`
        : esc(cellVal(r[c.key]))}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>
    <p class="hint" style="margin:8px 0 0">${rows.length} record${rows.length === 1 ? "" : "s"}${dataScouter ? ` · ${esc(dataScouter)}` : ""} · tap a column header to sort.</p>`;
  }

  /* ---- Data page: Search (default) + Spreadsheet ---------------------------
     #/data/search                 team & scouter browser
     #/data/search/team/<num>      one team's scouting report
     #/data/search/scouter/<id>    everything one scouter recorded
     #/data/spreadsheet            the full sortable tables + CSV export     */
  let dsQuery = "", lastDataSig = "";
  function dataRoute() {
    const p = location.hash.replace(/^#\/?/, "").split("/");
    return { sub: p[1] === "spreadsheet" ? "spreadsheet" : "search", kind: p[2] || "", id: decodeURIComponent(p[3] || "") };
  }
  // Cheap fingerprint of the shared scouting data, so cloud heartbeats don't
  // re-render (and scroll-jump) the Data page unless records actually changed.
  function dataSig() {
    const ms = allMatches(), ps = Object.values(allPits());
    return ms.length + ":" + ps.length + ":" + Math.max(0, ...ms.map((m) => m.ts || 0), ...ps.map((p) => p.ts || 0));
  }
  function renderData(root) {
    const r = dataRoute();
    root.innerHTML = `
      <div class="subtabs" id="dataSubtabs">
        <a href="#/data/search" class="${r.sub === "search" ? "on" : ""}">${icon("search")} Search</a>
        <a href="#/data/spreadsheet" class="${r.sub === "spreadsheet" ? "on" : ""}">${icon("database")} Spreadsheet</a>
      </div>
      <div id="dataBody"></div>`;
    const body = $("#dataBody", root);
    if (r.sub === "spreadsheet") renderDataSheet(body);
    else if (r.kind === "team" && r.id) renderDataTeam(body, r.id);
    else if (r.kind === "scouter" && r.id) { location.replace("#/members/scouters/" + encodeURIComponent(r.id)); return; } // moved to Members
    else renderDataSearch(body);
  }

  // Name for any team: event roster / pit record, then the Statbotics leaderboard,
  // then a cached TBA profile.
  let lbNameMap = null, lbNameMapAt = 0;
  function nameFor(t) {
    t = String(t);
    const n = teamName(t); if (n) return n;
    if (!lbNameMap || Date.now() - lbNameMapAt > 60000) {
      lbNameMap = {}; lbNameMapAt = Date.now();
      (API.sbCachedLeaderboard(GAME.season) || []).forEach((x) => { lbNameMap[x.team] = x.name; });
    }
    if (lbNameMap[t]) return lbNameMap[t];
    const ti = Store.getCache("teaminfo." + t, null);
    return (ti && ti.data && ti.data.nickname) || "";
  }
  // Give [data-tfill="<team>"] elements that team's frc-colors as CSS variables
  // (--tc primary, --tc2 secondary, --tcf readable text color on --tc).
  function paintTeamFills(el, teams) {
    const list = [...new Set(teams.map(String))].filter(Boolean);
    if (!list.length) return;
    API.getTeamColors(list).then((colors) => {
      list.forEach((t) => {
        const c = colors[t];
        if (!c || !c.primary) return;
        $$(`[data-tfill="${t}"]`, el).forEach((x) => {
          x.style.setProperty("--tc", c.primary);
          x.style.setProperty("--tc2", c.secondary || c.primary);
          x.style.setProperty("--tcf", contrastText(c.primary) || "#ffffff");
          x.classList.add("has-tc");
        });
      });
    }).catch(() => {});
  }
  const fieldVal = (v) => v === true ? "Yes" : v === false ? "No" : (v == null || v === "") ? "–" : String(v);
  const isYes = (v) => v === true || v === "true" || v === "Yes";

  function renderDataSearch(body) {
    const pits = allPits(), ms = allMatches();
    const scouted = allScoutedTeams();
    const mCount = {}; ms.forEach((m) => { const t = String(m.team); mCount[t] = (mCount[t] || 0) + 1; });
    const evOnly = eventTeams().map((t) => String(t.team_number)).filter((t) => !scouted.includes(t));
    body.innerHTML = `
      <div class="card ds-top">
        <label class="ds-search" for="dsInput">${icon("search")}
          <input id="dsInput" type="search" autocomplete="off" placeholder="Search a team number or name…" value="${esc(dsQuery)}" />
        </label>
        <span class="hint">${scouted.length} teams scouted · scouters are in <a href="#/members/scouters">Members → Scouters</a></span>
      </div>
      <div id="dsResults"></div>`;
    const res = $("#dsResults", body), input = $("#dsInput", body);
    const meta = (t, dim) => {
      const n = mCount[t] || 0, p = !!pits[t];
      return dim ? "No data yet" : `${n} match${n === 1 ? "" : "es"}${p ? ` · ${icon("check")} pit` : ""}`;
    };
    const draw = () => {
      const q = dsQuery.trim().toLowerCase();
      const tMatch = (t) => !q || t.includes(q) || nameFor(t).toLowerCase().includes(q);
      const tList = scouted.filter(tMatch), eList = evOnly.filter(tMatch);
      const html = (tList.length || eList.length) ? `
        ${tList.length ? `<div class="ds-section"><h3>${icon("bagel")} ${q ? "Teams" : "Scouted teams"} <span class="muted">${tList.length}</span></h3>
          <div class="ds-grid">${tList.map((t, i) => teamTileHTML(t, meta(t), { style: `animation-delay:${Math.min(i, 24) * 18}ms` })).join("")}</div></div>` : ""}
        ${eList.length ? `<div class="ds-section"><h3>${icon("calendar")} At this event, no data yet <span class="muted">${eList.length}</span></h3>
          <div class="ds-grid">${eList.map((t) => teamTileHTML(t, meta(t, true), { dim: true })).join("")}</div></div>` : ""}` : "";
      res.innerHTML = html || `<div class="card">${emptyState("search", q ? "No matches" : "Nothing scouted yet",
        q ? `Nothing matches “${dsQuery.trim()}”. Try a team number or name.` : "Teams appear here as soon as scouting data comes in.")}</div>`;
      wireTeamTiles(res, (t) => { location.hash = "#/data/search/team/" + t; });
    };
    input.oninput = () => { dsQuery = input.value; draw(); };
    input.onkeydown = (e) => {
      if (e.key !== "Enter") return;
      const q = dsQuery.trim();
      const tiles = $$("[data-tteam]", res);
      if (/^\d+$/.test(q) && scouted.concat(evOnly).includes(q)) location.hash = "#/data/search/team/" + q;
      else if (tiles.length === 1) tiles[0].click();
    };
    draw();
    // After the router's own view.focus(), put the cursor in the search box (desktop only).
    if (!(window.matchMedia && matchMedia("(pointer: coarse)").matches)) setTimeout(() => {
      if (input.isConnected) { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); }
    }, 0);
  }

  // Colored team banner used by the Data team report.
  function teamBannerHTML(t, extra) {
    return `<div class="thero ds-banner" data-tfill="${esc(t)}">
      <span class="thero-mark" aria-hidden="true">${esc(t)}</span>
      <img class="team-avatar thero-av" data-avatar="${esc(t)}" alt="" />
      <div class="thero-id">
        <span class="thero-num">${esc(t)}</span>
        <span class="thero-name">${esc(nameFor(t)) || "&nbsp;"}</span>
        ${extra || ""}
      </div>
      <span class="thero-accent"></span>
    </div>`;
  }

  function renderDataTeam(body, team) {
    team = String(team).replace(/\D/g, "");
    const n = allMatches().filter((m) => String(m.team) === team).length, pit = allPits()[team];
    body.innerHTML = `
      <div class="ds-crumbs">
        <button class="btn ghost sm" id="dsBack">${icon("chevron-left")} All teams</button>
        <div class="btn-row">
          <button class="btn primary sm" id="dsProfile">${icon("user")} Full team profile</button>
          <button class="btn ghost sm" id="dsCompare">${icon("compare")} Compare</button>
        </div>
      </div>
      ${teamBannerHTML(team, `<span class="thero-chips">
        <span class="thero-chip">${icon("binoculars")} ${n} match${n === 1 ? "" : "es"} scouted</span>
        <span class="thero-chip">${icon("clipboard")} ${pit ? "Pit scouted" : "No pit data"}</span></span>`)}
      ${scoutReportHTML(team)}`;
    $("#dsBack", body).onclick = () => { location.hash = "#/data/search"; };
    $("#dsProfile", body).onclick = () => { location.hash = "#/team/" + team; };
    $("#dsCompare", body).onclick = () => addToCompare(team);
    wireScoutReport(body, team);
    paintAvatars(body, [team]);
    paintTeamFills(body, [team]);
  }

  // One scouter's full record (Members → Scouters → a scouter). backHash = where "Back" goes.
  function renderScouterReport(body, id, backHash) {
    const sc = allScouters().find((s) => String(s.id) === String(id));
    if (!sc) { body.innerHTML = `<div class="card">${emptyState("user", "Scouter not found", "They may have been removed.")}</div>`; return; }
    const nm = scouterName(sc).toLowerCase();
    const mine = (r) => String(r.scouterId || "") === String(sc.id) || (!r.scouterId && String(r.scout || "").toLowerCase() === nm);
    const ms = allMatches().filter(mine).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const ps = Object.values(allPits()).filter(mine).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const teams = [...new Set([...ms.map((m) => String(m.team)), ...ps.map((p) => String(p.team))])].sort((a, b) => a - b);
    body.innerHTML = `
      <div class="ds-crumbs"><button class="btn ghost sm" id="dsBack">${icon("chevron-left")} All scouters</button>
        <a class="btn ghost sm" href="#/members/profile/${encodeURIComponent(sc.id)}">${icon("user")} Profile</a></div>
      <div class="card ds-shero">
        ${scouterAvatar(sc, "ph-avatar")}
        <div class="ds-shero-id">
          <span class="ds-shero-name">${esc(scouterName(sc))}</span>
          <span class="ds-shero-sub">${sc.lastSeen ? "Last seen " + esc(timeAgo(sc.lastSeen)) : "Scouter"}</span>
        </div>
        <div class="ds-shero-stats">
          <div><b data-count="${ms.length}">${ms.length}</b><span>matches</span></div>
          <div><b data-count="${ps.length}">${ps.length}</b><span>pits</span></div>
          <div><b data-count="${teams.length}">${teams.length}</b><span>teams</span></div>
          <div><b data-count="${sc.bb || 0}">${sc.bb || 0}</b><span>${BB}</span></div>
        </div>
      </div>
      ${teams.length ? `<div class="ds-section"><h3>${icon("bagel")} Teams they scouted <span class="muted">${teams.length}</span></h3>
        <div class="ds-grid">${teams.map((t) => {
          const n = ms.filter((m) => String(m.team) === t).length, p = ps.some((x) => String(x.team) === t);
          return `<button class="ds-team" data-dteam="${esc(t)}" data-tfill="${esc(t)}">
            <img class="team-avatar" data-avatar="${esc(t)}" alt="" /><span class="ds-num">${esc(t)}</span>
            <span class="ds-name">${esc(nameFor(t)) || "&nbsp;"}</span>
            <span class="ds-meta">${n ? `${n} match${n === 1 ? "" : "es"}` : ""}${n && p ? " · " : ""}${p ? `${icon("check")} pit` : ""}</span></button>`;
        }).join("")}</div></div>` : ""}
      <div class="grid cols-2 ds-split">
        <div class="card"><h3>${icon("binoculars")} Match entries <span class="muted">${ms.length}</span></h3>
          ${ms.length ? `<div class="ds-feed">${ms.map((m) => `
            <button class="ds-feed-row" data-dteam="${esc(String(m.team))}">
              <span class="ds-feed-q ${esc(m.alliance || "")}">Q${esc(m.matchNumber || "?")}</span>
              <span class="ds-feed-t">${esc(String(m.team))} <span class="muted">${esc(nameFor(m.team))}</span></span>
              <span class="ds-feed-when">${m.ts ? esc(timeAgo(m.ts)) : ""}</span>
              ${m.notes ? `<span class="ds-feed-note">“${esc(m.notes)}”</span>` : ""}
            </button>`).join("")}</div>` : `<p class="muted">No match entries this season.</p>`}
        </div>
        <div class="card"><h3>${icon("clipboard")} Pit entries <span class="muted">${ps.length}</span></h3>
          ${ps.length ? `<div class="ds-feed">${ps.map((p) => `
            <button class="ds-feed-row" data-dteam="${esc(String(p.team))}">
              ${p.photo ? `<img class="ds-feed-photo" src="${esc(p.photo)}" alt="" />` : `<span class="ds-feed-q">${icon("wrench")}</span>`}
              <span class="ds-feed-t">${esc(String(p.team))} <span class="muted">${esc(nameFor(p.team))}</span></span>
              <span class="ds-feed-when">${p.ts ? esc(timeAgo(p.ts)) : ""}</span>
            </button>`).join("")}</div>` : `<p class="muted">No pit entries this season.</p>`}
        </div>
      </div>`;
    $("#dsBack", body).onclick = () => { location.hash = backHash || "#/members/scouters"; };
    $$("[data-dteam]", body).forEach((b) => b.onclick = () => { location.hash = "#/data/search/team/" + b.dataset.dteam; });
    paintAvatars(body, teams);
    paintTeamFills(body, teams);
    countUp(body);
  }

  /* ---- Team scouting report (Data → Search team view, team profile) ----------
     Everything our scouts recorded on one team, laid out to be read at a glance:
     robot photo + pit facts, per-field averages grouped by game phase (bars are
     relative to the best scouted team), and a match-by-match timeline.
     Built from the active form schema, so it works for any season's form. */
  function scoutReportHTML(team) {
    team = String(team);
    const pit = allPits()[team];
    const fields = matchFields();
    const ms = allMatches().filter((m) => String(m.team) === team)
      .sort((a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0) || (a.ts || 0) - (b.ts || 0));

    // --- Pit card ---
    const pFields = pitFields().filter((f) => f.key !== "photo");
    const facts = pit ? pFields.filter((f) => f.type !== "text" && pit[f.key] != null && pit[f.key] !== "") : [];
    const pitTexts = pit ? pFields.filter((f) => f.type === "text" && pit[f.key]) : [];
    const pitCard = `
      <div class="card sr-pit">
        <div class="sr-head"><h3>${icon("clipboard")} Pit scouting</h3>
          ${pit ? `<span class="hint">${pit.scout ? "by " + esc(pit.scout) : ""}${pit.ts ? " · " + esc(timeAgo(pit.ts)) : ""}</span>` : ""}</div>
        ${pit ? `<div class="sr-pit-body">
          ${pit.photo ? `<button class="sr-photo" data-photo="1" aria-label="View robot photo"><img src="${esc(pit.photo)}" alt="Team ${esc(team)} robot" /></button>`
            : `<div class="sr-photo empty">${icon("image")}<span>No robot photo</span></div>`}
          <div class="sr-facts">${facts.map((f) => {
            const v = pit[f.key];
            const val = f.type === "bool"
              ? `<span class="sr-yn ${isYes(v) ? "yes" : "no"}">${icon(isYes(v) ? "check" : "x")} ${isYes(v) ? "Yes" : "No"}</span>`
              : `<b>${esc(fieldVal(v))}</b>`;
            return `<div class="sr-fact"><span>${esc(f.label)}</span>${val}</div>`;
          }).join("") || `<p class="muted">No pit details recorded.</p>`}</div>
        </div>
        ${pitTexts.map((f) => `<blockquote class="sr-quote"><span>${esc(f.label)}</span>${esc(pit[f.key])}</blockquote>`).join("")}`
        : `<p class="muted">Not pit scouted yet.</p><button class="btn secondary sm" data-act-pit="1">${icon("wrench")} Pit scout this team</button>`}
      </div>`;

    if (!ms.length) return `<div class="sr">${pitCard}
      <div class="card"><div class="sr-head"><h3>${icon("binoculars")} Match scouting</h3></div>
        <p class="muted">No matches scouted for this team yet.</p>
        <button class="btn primary sm" data-act-match="1">${icon("plus")} Scout a match</button></div></div>`;

    // --- Per-field aggregates, with bars relative to the best scouted team ---
    const byTeam = {};
    allMatches().forEach((m) => { (byTeam[String(m.team)] = byTeam[String(m.team)] || []).push(m); });
    const numAvg = (list, key) => {
      const v = list.map((m) => m[key]).filter((x) => x !== "" && x != null && !isNaN(Number(x))).map(Number);
      return v.length ? avg(v) : null;
    };
    const best = {};
    fields.forEach((f) => {
      if (f.type !== "counter" && f.type !== "number") return;
      best[f.key] = Math.max(0, ...Object.values(byTeam).map((list) => numAvg(list, f.key) || 0));
    });
    const agg = (f) => {
      const vals = ms.map((m) => m[f.key]).filter((v) => v !== undefined && v !== null && v !== "");
      if (!vals.length) return "";
      if (f.type === "bool") {
        const pct = vals.filter(isYes).length / vals.length;
        return `<div class="sr-row"><span class="sr-label">${esc(f.label)}</span>
          <span class="sr-bar"><i style="width:${Math.round(pct * 100)}%"></i></span><b class="sr-val">${Math.round(pct * 100)}%</b></div>`;
      }
      if (f.type === "rating") {
        const nums = vals.map(Number).filter((x) => !isNaN(x) && x > 0);
        if (!nums.length) return "";
        const a = avg(nums), max = f.max || 5;
        return `<div class="sr-row"><span class="sr-label">${esc(f.label)}</span>
          <span class="sr-dots" aria-label="${fmt(a)} out of ${max}">${Array.from({ length: max }, (_, i) =>
            `<i class="${a >= i + 0.75 ? "on" : a >= i + 0.25 ? "half" : ""}"></i>`).join("")}</span><b class="sr-val">${fmt(a)}</b></div>`;
      }
      if (f.type === "counter" || f.type === "number") {
        const a = numAvg(ms, f.key);
        if (a == null) return "";
        const hi = Math.max(...vals.map(Number).filter((x) => !isNaN(x)));
        const pct = best[f.key] ? Math.min(100, Math.round(a / best[f.key] * 100)) : 0;
        return `<div class="sr-row"><span class="sr-label">${esc(f.label)}</span>
          <span class="sr-bar num" title="Compared with the best scouted team (${fmt(best[f.key])})"><i style="width:${pct}%"></i></span>
          <b class="sr-val">${fmt(a)}<small>max ${fmt(hi, 0)}</small></b></div>`;
      }
      if (f.type === "select") {
        const counts = {}; vals.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return `<div class="sr-row sel"><span class="sr-label">${esc(f.label)}</span>
          <span class="sr-chips">${top.map(([v, c]) => `<span class="sr-chip">${esc(v)}${top.length > 1 || c > 1 ? ` <b>×${c}</b>` : ""}</span>`).join("")}</span></div>`;
      }
      return "";
    };
    const phases = [...((GAME.matchPhases) || [])];
    const known = new Set(phases.map((p) => p.id));
    if (fields.some((f) => !known.has(f.phase))) phases.push({ id: "__other", label: "Other" });
    const phaseCards = phases.map((ph) => {
      const rows = fields.filter((f) => f.type !== "text" && (ph.id === "__other" ? !known.has(f.phase) : f.phase === ph.id)).map(agg).filter(Boolean);
      return rows.length ? `<div class="sr-phase"><h4>${esc(ph.label)}</h4>${rows.join("")}</div>` : "";
    }).join("");

    // --- Headline numbers ---
    const st = computeStats(team);
    const tiles = [
      ["Matches scouted", ms.length],
      st.avgCycles ? ["Avg cycles", fmt(st.avgCycles)] : null,
      st.avgDriver ? ["Driver skill", fmt(st.avgDriver) + "/5"] : null,
      ["Played defense", Math.round(st.defenseRate * 100) + "%"],
      ["Broke down", Math.round(st.diedRate * 100) + "%"],
      st.avgFouls ? ["Fouls / match", fmt(st.avgFouls)] : null,
    ].filter(Boolean);

    // --- Match timeline ---
    const textKeys = fields.filter((f) => f.type === "text").map((f) => f.key);
    const highlight = (m) => fields.filter((f) => f.type !== "text").map((f) => {
      const v = m[f.key];
      if (v === undefined || v === null || v === "" ) return "";
      if (f.type === "bool") return isYes(v) ? `<span class="sr-tag">${esc(f.label)}</span>` : "";
      if ((f.type === "counter" || f.type === "number") && Number(v) > 0) return `<span class="sr-kv">${esc(f.label)} <b>${esc(String(v))}</b></span>`;
      if (f.type === "rating" && Number(v) > 0) return `<span class="sr-kv">${esc(f.label)} <b>${esc(String(v))}★</b></span>`;
      if (f.type === "select" && v !== "N/A") return `<span class="sr-kv">${esc(f.label)} <b>${esc(String(v))}</b></span>`;
      return "";
    }).filter(Boolean).join("");
    const timeline = ms.map((m) => `
      <details class="sr-match">
        <summary>
          <span class="sr-q ${esc(m.alliance || "")}">Q${esc(m.matchNumber || "?")}</span>
          <span class="sr-mby">${esc(m.scout || "Scout")}${m.ts ? ` · ${esc(timeAgo(m.ts))}` : ""}</span>
          ${textKeys.some((k) => m[k]) ? `<span class="sr-note-flag" title="Has notes">${icon("edit")}</span>` : ""}
          ${icon("chevron-right")}
        </summary>
        <div class="sr-mbody">
          <div class="sr-kvs">${highlight(m) || `<span class="muted">Nothing notable recorded.</span>`}</div>
          ${textKeys.filter((k) => m[k]).map((k) => `<blockquote class="sr-quote">${esc(m[k])}</blockquote>`).join("")}
        </div>
      </details>`).join("");

    return `<div class="sr">
      <div class="sr-tiles">${tiles.map(([k, v]) => `<div class="sr-tile"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join("")}</div>
      <div class="sr-cols">
        <div class="sr-col">
          ${pitCard}
          <div class="card"><div class="sr-head"><h3>${icon("list")} Match by match</h3><span class="hint">tap a match for details</span></div>
            <div class="sr-timeline">${timeline}</div></div>
        </div>
        <div class="sr-col">
          <div class="card"><div class="sr-head"><h3>${icon("chart")} Averages</h3><span class="hint">bars vs. the best scouted team</span></div>
            <div class="sr-phases">${phaseCards || `<p class="muted">No numeric fields recorded.</p>`}</div></div>
        </div>
      </div>
    </div>`;
  }
  function wireScoutReport(el, team) {
    const ph = $("[data-photo]", el);
    if (ph) ph.onclick = () => { const img = ph.querySelector("img"); if (img) modal(`Team ${team} robot`, `<img class="sr-photo-full" src="${esc(img.src)}" alt="Team ${esc(team)} robot" />`); };
    $$("[data-act-pit]", el).forEach((b) => b.onclick = () => { go("pit"); setTimeout(() => prefillPitTeam(team), 60); });
    $$("[data-act-match]", el).forEach((b) => b.onclick = () => { go("match"); setTimeout(() => prefillMatchTeam(team), 60); });
  }

  // Spreadsheet subpage: the full sortable tables + CSV export.
  function renderDataSheet(root) {
    const matches = allMatches(), pits = allPits();
    const storeOk = Store.storageAvailable();
    root.innerHTML = `
      ${!storeOk ? `<div class="card"><div class="badge red dot">Warning</div>
        <p>Your browser is blocking local storage (private window?). Data won't be saved between visits. Export often.</p></div>` : ""}
      <div class="grid cols-3 section">
        ${kpi("Match records", matches.length, "cyan")}
        ${kpi("Pit records", Object.keys(pits).length, "yellow")}
        ${kpi("Alliance picks", getBoard().grid.flat().filter(Boolean).length)}
      </div>
      <div class="card section">
        <div class="section-head" style="margin-bottom:10px">
          <h2 style="margin:0">${icon("database")} All scouting data</h2>
          <div class="subtabs inline" id="dataTabs">
            <button data-t="matches" class="${dataViewTab === "matches" ? "on" : ""}">Match data (${matches.length})</button>
            <button data-t="pit" class="${dataViewTab === "pit" ? "on" : ""}">Pit data (${Object.keys(pits).length})</button>
          </div>
        </div>
        <p class="hint">Everyone can read every record here — no export needed. New scouting adds to the bottom automatically.</p>
        <div id="dataViewer"></div>
      </div>
      <div class="card"><div class="section-head" style="margin-bottom:6px"><h3 style="margin:0">${icon("download")} Export (CSV)</h3>
        <div class="btn-row">
          <button class="btn ghost sm" id="expMatchCsv">${icon("download")} Matches</button>
          <button class="btn ghost sm" id="expPitCsv">${icon("download")} Pit data</button>
        </div></div>
        <p class="hint" style="margin:0">Full spreadsheet of every record, opens in Excel / Sheets.</p>
      </div>`;

    const viewer = $("#dataViewer", root);
    function drawViewer() {
      const tab = dataViewTab;
      const rows = tab === "pit" ? Object.values(allPits()) : allMatches();
      const scouters = [...new Set(rows.map((r) => r.scout).filter(Boolean))].sort();
      if (dataScouter && !scouters.includes(dataScouter)) dataScouter = "";
      viewer.innerHTML = `
        <div class="data-controls">
          <input type="search" id="dataSearch" placeholder="Search team…" value="${esc(dataSearch)}" />
          <select id="dataScouter" aria-label="Filter by scouter">
            <option value="">All scouters (${scouters.length})</option>
            ${scouters.map((sc) => `<option ${dataScouter === sc ? "selected" : ""}>${esc(sc)}</option>`).join("")}
          </select>
          <select id="dataSortSel" aria-label="Sort by">
            ${(tab === "pit" ? pitCols() : matchCols()).map((c) => `<option value="${esc(c.key)}" ${dataSort[tab].key === c.key ? "selected" : ""}>Sort: ${esc(c.label)}</option>`).join("")}
          </select>
          <button class="btn ghost sm" id="dataSortDir" title="Toggle ascending/descending">${dataSort[tab].dir > 0 ? "▲ Asc" : "▼ Desc"}</button>
        </div>
        <div id="dataTableWrap"></div>`;
      const drawTable = () => {
        $("#dataTableWrap", viewer).innerHTML = buildDataTable(tab, rows);
        $$("[data-team]", viewer).forEach((el) => el.onclick = () => openTeam(el.dataset.team));
        $$("th[data-sortkey]", viewer).forEach((th) => th.onclick = () => {
          const k = th.dataset.sortkey, st = dataSort[tab];
          if (st.key === k) st.dir *= -1; else { st.key = k; st.dir = 1; }
          $("#dataSortSel", viewer).value = st.key; $("#dataSortDir", viewer).textContent = st.dir > 0 ? "▲ Asc" : "▼ Desc";
          drawTable();
        });
      };
      $("#dataSearch", viewer).oninput = (e) => { dataSearch = e.target.value; drawTable(); };
      $("#dataScouter", viewer).onchange = (e) => { dataScouter = e.target.value; drawTable(); };
      $("#dataSortSel", viewer).onchange = (e) => { dataSort[tab].key = e.target.value; drawTable(); };
      $("#dataSortDir", viewer).onclick = () => { dataSort[tab].dir *= -1; $("#dataSortDir", viewer).textContent = dataSort[tab].dir > 0 ? "▲ Asc" : "▼ Desc"; drawTable(); };
      drawTable();
    }
    drawViewer();
    $$("#dataTabs button", root).forEach((b) => b.onclick = () => {
      dataViewTab = b.dataset.t;
      $$("#dataTabs button", root).forEach((x) => x.classList.toggle("on", x === b));
      drawViewer();
    });

    $("#expMatchCsv", root).onclick = () => {
      if (!matches.length) return toast("No match data", "err");
      download("matches.csv", matchesToCsv(matches), "text/csv");
    };
    $("#expPitCsv", root).onclick = () => {
      if (!Object.keys(pits).length) return toast("No pit data", "err");
      download("pit-scouting.csv", pitsToCsv(pits), "text/csv");
    };
  }

  function csvCell(v) { const s = v == null ? "" : String(v === true ? "Yes" : v === false ? "No" : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
  function matchesToCsv(matches) {
    const cols = ["matchNumber", "team", "alliance", "scout", ...matchFields().map((f) => f.key)];
    const header = ["Match", "Team", "Alliance", "Scout", ...matchFields().map((f) => f.label)];
    const rows = matches.map((m) => cols.map((c) => csvCell(m[c])).join(","));
    return [header.map(csvCell).join(","), ...rows].join("\n");
  }
  function pitsToCsv(pits) {
    const cols = ["team", "nickname", "scout", ...pitFields().map((f) => f.key)];
    const header = ["Team", "Name", "Scout", ...pitFields().map((f) => f.label)];
    const rows = Object.values(pits).map((p) => cols.map((c) => csvCell(p[c])).join(","));
    return [header.map(csvCell).join(","), ...rows].join("\n");
  }
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Downloaded " + name);
  }

  /* ===========================================================================
     VIEW: BAGELSTATS  (EPA — world / state / event)
     ======================================================================== */
  let bagelTab = "world";       // world | state | event
  let bagelFocusTeam = null;    // highlight after redirect from a team card
  let bagelState = "CA";        // selected state for the State tab
  let bagelDistrict = "";       // selected district for the District tab
  let bagelSort = { col: "rank", dir: "asc" };  // leaderboard sort
  let bagelYear = 0;            // 0 = the season the app is on; else a past season picked in BagelStats
  let bagelShown = 50;          // rows shown before "Show 50 more"

  function applyBagelSort(rows, mode) {
    const rankKey = mode === "state" ? "stateRank" : mode === "district" ? "districtRank"
      : mode === "event" ? "tbaRank" : "worldRank";
    const val = (r, col) => {
      if (col === "rank") return r[rankKey] ?? 1e9;
      if (col === "team") return Number(r.team);
      if (col === "epa") return r.epa ?? -1e9;
      if (col === "rp") return r.rp ?? -1e9;
      if (col === "win") { const g = r.record ? r.record.w + r.record.l + r.record.t : 0; return g ? r.record.w / g : -1; }
      return (r.breakdown && r.breakdown[col]) ?? -1e9; // auto/teleop/endgame
    };
    const { col, dir } = bagelSort;
    return rows.slice().sort((a, b) => {
      const d = val(a, col) - val(b, col);
      return dir === "asc" ? d : -d;
    });
  }

  // On-device EPA for the currently selected event (from cached TBA matches).
  function currentEventEpa() {
    const s = Store.getSettings();
    if (!s.eventKey) return null;
    const cache = Store.getCache("matches." + s.eventKey, null);
    if (!cache) return null;
    return EPA.computeEvent(cache.data);
  }

  // Readable text color on a background: whichever of white / near-black has the
  // higher WCAG contrast ratio against it.
  function contrastText(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    const onWhite = 1.05 / (L + 0.05), onDark = (L + 0.05) / 0.0565; // #08131a ≈ L 0.0065
    return onDark > onWhite ? "#08131a" : "#ffffff";
  }

  // Resize+compress an image File to a small JPEG dataURL (keeps localStorage light).
  function compressImage(file, maxDim = 700, quality = 0.62) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        try { resolve(c.toDataURL("image/jpeg", quality)); } catch (e) { reject(e); }
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  // Inline SVG line chart (no dependencies). series = [{epa, event}]; opts.dividers draws event boundaries.
  function renderLineChart(el, series, opts = {}) {
    if (!series || !series.length) { el.innerHTML = `<p class="muted" style="text-align:center;padding:16px 0">No matches for this filter.</p>`; return; }
    const W = 560, H = 168, pad = { l: 34, r: 12, t: 12, b: 26 };
    const ys = series.map((p) => p.epa);
    let mn = Math.min(...ys), mx = Math.max(...ys);
    if (mn === mx) { mn -= 1; mx += 1; }
    const range = mx - mn, n = series.length;
    const X = (i) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
    const Y = (v) => pad.t + (1 - (v - mn) / range) * (H - pad.t - pad.b);
    const pts = series.map((p, i) => `${X(i).toFixed(1)},${Y(p.epa).toFixed(1)}`).join(" ");
    const area = `${pad.l},${(H - pad.b).toFixed(1)} ${pts} ${X(n - 1).toFixed(1)},${(H - pad.b).toFixed(1)}`;
    const grid = [mn, (mn + mx) / 2, mx].map((v) =>
      `<line x1="${pad.l}" y1="${Y(v).toFixed(1)}" x2="${W - pad.r}" y2="${Y(v).toFixed(1)}" class="cg"/>
       <text x="2" y="${(Y(v) + 3).toFixed(1)}" class="cl">${v.toFixed(0)}</text>`).join("");
    const dots = series.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.epa).toFixed(1)}" r="${i === n - 1 ? 3.5 : 2}" class="cd"/>`).join("");
    // event dividers + labels
    let dividers = "";
    if (opts.dividers) {
      const segs = []; let st = 0;
      for (let i = 1; i <= n; i++) { if (i === n || series[i].event !== series[st].event) { segs.push({ s: st, e: i - 1, ev: series[st].event }); st = i; } }
      if (segs.length > 1) dividers = segs.map((sg, idx) => {
        const parts = [];
        if (idx > 0) { const x = X(sg.s - 0.5).toFixed(1); parts.push(`<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${(H - pad.b).toFixed(1)}" class="cdv"/>`); }
        const cx = X((sg.s + sg.e) / 2).toFixed(1);
        const code = String(sg.ev || "").replace(/^\d{4}/, "");
        parts.push(`<text x="${cx}" y="${H - 6}" text-anchor="middle" class="cev">${esc(code)}</text>`);
        return parts.join("");
      }).join("");
    }
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="epa-chart" role="img" aria-label="EPA over ${n} matches">
        ${grid}${dividers}
        <polygon points="${area}" class="ca"/>
        <polyline points="${pts}" class="cp"/>
        ${dots}
      </svg>
      <div class="hint" style="text-align:center;margin-top:2px">${n} matches · latest EPA ${series[n - 1].epa.toFixed(1)}</div>`;
  }
  // Load TBA avatars into <img data-avatar="team"> elements; fallback class if none.
  // Alliance background colors — must match the fills baked into the default
  // icons (media/redicon.png = #ff4040, blueicon.png = #4040ff, blackicon.png = #000).
  const ALLY_FILL = { red: "#ff4040", blue: "#4040ff", "": "#000" };
  const ALLY_ICON = { red: "media/redicon.png", blue: "media/blueicon.png", "": "media/blackicon.png" };
  async function paintAvatars(container, teamNums) {
    const uniq = [...new Set(teamNums.map(String))];
    await Promise.all(uniq.map(async (t) => {
      let url = null;
      try { url = await API.getTeamAvatar(t); } catch (e) {}
      container.querySelectorAll(`img[data-avatar="${t}"]`).forEach((el) => {
        const ally = el.dataset.ally || "";          // "red" | "blue" | "" (neutral → black)
        el.classList.remove("no-avatar");
        if (url) {
          // real avatar: fill behind it with the alliance color so avatars with a
          // transparent background pick up red/blue (or black when no alliance).
          el.src = url;
          el.style.backgroundColor = ALLY_FILL[ally] || "#000";
        } else {
          // no avatar at all: show the alliance-colored default bagel icon.
          el.src = ALLY_ICON[ally] || ALLY_ICON[""];
          el.style.backgroundColor = ALLY_FILL[ally] || "#000";
        }
      });
    }));
  }

  async function paintTeamChips(container, teamNums) {
    try {
      const colors = await API.getTeamColors(teamNums);
      teamNums.forEach((n) => {
        const el = container.querySelector(`[data-chip="${n}"]`);
        if (!el) return;
        const c = colors[n];
        if (c && c.primary) {
          el.style.background = c.primary;
          const tc = contrastText(c.primary); if (tc) el.style.color = tc;
          el.style.borderColor = "transparent";
        }
      });
    } catch (e) { /* keep default styling */ }
  }

  function renderBagelStats(root) {
    const year = bagelYear || GAME.season;
    const tabs = [["world", "World", "globe"], ["state", "State", "map-pin"], ["district", "District", "flag"], ["event", "Event", "calendar"]];
    const years = []; for (let y = GAME.season; y >= 2002; y--) years.push(y);
    const isEvent = bagelTab === "event";
    root.innerHTML = `
      ${pageHero({ ic: "chart", eyebrow: `BagelStats · ${isEvent ? "live event" : year + " " + (FRC_GAMES[year] || "")}`, title: "EPA leaderboards",
        sub: isEvent ? "On-device EPA from your event's played matches, with TBA ranks and ranking points."
          : "Expected points added for every team, from Statbotics. Tap a team to dig in.",
        side: `<label class="bs-year${isEvent ? " off" : ""}" title="${isEvent ? "The Event tab uses your selected event" : "Season"}">${icon("calendar")}
          <select id="bsYear" aria-label="Season" ${isEvent ? "disabled" : ""}>${years.map((y) => `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select></label>` })}
      <div class="subtabs" id="bagelTabs">
        ${tabs.map(([k, l, ic]) => `<button data-tab="${k}" class="${bagelTab === k ? "on" : ""}">${icon(ic)} ${l}</button>`).join("")}
      </div>
      <div id="bagelBody"><div class="card tp-loading"><span class="tp-spin"></span>Loading ${isEvent ? "event EPA" : year + " leaderboard"}…</div></div>`;
    $$("#bagelTabs button", root).forEach((b) => b.onclick = () => { bagelTab = b.dataset.tab; bagelShown = 50; renderBagelStats(root); });
    $("#bsYear", root).onchange = (e) => { bagelYear = Number(e.target.value); bagelShown = 50; renderBagelStats(root); };
    const body = $("#bagelBody", root);
    if (isEvent) renderBagelEvent(body);
    else renderBagelWorld(body, bagelTab, year);
  }

  // One leaderboard row. Bar = auto/teleop/endgame stacked, scaled to the list's top EPA.
  function bagelRowHTML(r, mode, maxEpa, i) {
    const rank = mode === "event" ? r.tbaRank : mode === "state" ? r.stateRank : mode === "district" ? r.districtRank : r.worldRank;
    const b = r.breakdown || {}, seg = (v) => Math.max(0, (v || 0) / maxEpa * 100).toFixed(1);
    const g = r.record ? r.record.w + r.record.l + r.record.t : 0;
    return `<button class="bs-row${r.team === OUR_TEAM ? " ours" : ""}" data-bteam="${esc(r.team)}" data-tfill="${esc(r.team)}" style="animation-delay:${Math.min(i, 20) * 14}ms">
      <span class="bs-rank">${rank || "–"}</span>
      <img class="team-avatar" data-avatar="${esc(r.team)}" alt="" />
      <span class="bs-id"><b>${esc(r.team)}</b><span>${esc(r.name || nameFor(r.team))}</span></span>
      <span class="bs-bar" title="Auto ${fmt(b.auto)} · Teleop ${fmt(b.teleop)} · Endgame ${fmt(b.endgame)}">${b.auto != null || b.teleop != null
        ? `<i class="a" style="width:${seg(b.auto)}%"></i><i class="t" style="width:${seg(b.teleop)}%"></i><i class="e" style="width:${seg(b.endgame)}%"></i>`
        : `<i class="t" style="width:${seg(r.epa)}%"></i>`}</span>
      <span class="bs-epa"><b>${fmt(r.epa)}</b><small>EPA</small></span>
      <span class="bs-rec">${mode === "event"
        ? `${r.rp != null ? fmt(r.rp, 2) : "–"}<small>${r.record ? `${r.record.w}-${r.record.l}-${r.record.t}` : "RP"}</small>`
        : g ? `${r.record.w}-${r.record.l}-${r.record.t}<small>${Math.round(r.record.w / g * 100)}% wins</small>` : `–<small>record</small>`}</span>
    </button>`;
  }
  function bagelPodiumHTML(top, mode) {
    const medal = ["gold", "silver", "bronze"];
    return `<section class="bs-podium">${[1, 0, 2].filter((i) => top[i]).map((i) => {
      const r = top[i];
      return `<button class="bs-pod ${medal[i]}" data-bteam="${esc(r.team)}" data-tfill="${esc(r.team)}" style="animation-delay:${[1, 0, 2].indexOf(i) * 90}ms">
        <span class="bs-pod-medal">${i + 1}</span>
        <img class="team-avatar" data-avatar="${esc(r.team)}" alt="" />
        <b class="bs-pod-num">${esc(r.team)}</b>
        <span class="bs-pod-name">${esc(r.name || nameFor(r.team))}</span>
        <span class="bs-pod-epa"><b>${fmt(r.epa)}</b> EPA${mode === "event" && r.rp != null ? ` · ${fmt(r.rp, 2)} RP` : ""}</span>
      </button>`;
    }).join("")}</section>`;
  }
  // Shared list renderer for world/state/district/event: toolbar, podium, rows, "show more".
  function drawBagelList(body, rows, mode, year, extraTool) {
    const sorts = [["rank", "Rank"], ["epa", "EPA"], ["auto", "Auto"], ["teleop", "Teleop"], ["endgame", "Endgame"], [mode === "event" ? "rp" : "win", mode === "event" ? "RP" : "Win %"]];
    body.innerHTML = `
      <div class="card ev-toolbar">
        ${extraTool || ""}
        <label class="ds-search" for="lbSearch">${icon("search")}<input type="search" id="lbSearch" placeholder="Search team # or name…" /></label>
        <div class="seg wrap" id="bsSort">${sorts.map(([k, l]) => `<button data-s="${k}" class="${bagelSort.col === k ? "on" : ""}">${l}${bagelSort.col === k ? (bagelSort.dir === "asc" ? " ↑" : " ↓") : ""}</button>`).join("")}</div>
        <button class="btn ghost sm" id="bsFind">${icon("search")} Find ${OUR_TEAM}</button>
      </div>
      <div id="bsPodium"></div>
      <div class="card bs-card"><div class="bs-list" id="lbList"></div>
        <div class="bs-more" id="bsMore"></div></div>`;
    const listEl = $("#lbList", body), moreEl = $("#bsMore", body), podEl = $("#bsPodium", body);
    const open = (t) => (year === GAME.season ? openTeam(t) : (location.hash = "#/team/" + t + "/" + year));
    let flash = null;
    function draw() {
      const f = $("#lbSearch", body).value.trim().toLowerCase();
      let r = f ? rows.filter((x) => x.team.includes(f) || (x.name || "").toLowerCase().includes(f)) : rows;
      r = applyBagelSort(r, mode);
      if (bagelFocusTeam) {
        const idx = r.findIndex((x) => x.team === bagelFocusTeam);
        if (idx >= 0) { bagelShown = Math.max(bagelShown, idx + 10); flash = bagelFocusTeam; }
        bagelFocusTeam = null;
      }
      const showPod = !f && r.length >= 3 && ((bagelSort.col === "rank" && bagelSort.dir === "asc") || (bagelSort.col === "epa" && bagelSort.dir === "desc"));
      podEl.innerHTML = showPod ? bagelPodiumHTML(r.slice(0, 3), mode) : "";
      const maxEpa = Math.max(1, ...r.map((x) => x.epa || 0));
      const shown = r.slice(0, bagelShown);
      listEl.innerHTML = shown.length ? shown.map((x, i) => bagelRowHTML(x, mode, maxEpa, i)).join("")
        : emptyState("search", "No teams", "Try another search.");
      moreEl.innerHTML = r.length > shown.length
        ? `<span class="hint">Showing ${shown.length} of ${r.length.toLocaleString()} teams</span><button class="btn ghost sm" id="bsMoreBtn">${icon("plus")} Show 50 more</button>`
        : `<span class="hint">${r.length.toLocaleString()} teams</span>`;
      const mb = $("#bsMoreBtn", moreEl); if (mb) mb.onclick = () => { bagelShown += 50; draw(); };
      const ts = [...shown.map((x) => x.team), ...(showPod ? r.slice(0, 3).map((x) => x.team) : [])];
      paintAvatars(body, ts); paintTeamFills(body, ts);
      $$("[data-bteam]", body).forEach((b) => b.onclick = () => open(b.dataset.bteam));
      if (flash) {
        const row = listEl.querySelector(`[data-bteam="${flash}"]`);
        if (row) { row.classList.add("flash"); row.scrollIntoView({ block: "center", behavior: "smooth" }); }
        flash = null;
      }
    }
    $("#lbSearch", body).oninput = () => { bagelShown = 50; draw(); };
    $$("#bsSort button", body).forEach((b) => b.onclick = () => {
      const col = b.dataset.s;
      if (bagelSort.col === col) bagelSort.dir = bagelSort.dir === "asc" ? "desc" : "asc";
      else { bagelSort.col = col; bagelSort.dir = col === "rank" ? "asc" : "desc"; }
      $$("#bsSort button", body).forEach((x) => { const on = x.dataset.s === bagelSort.col; x.classList.toggle("on", on);
        x.textContent = sorts.find((s2) => s2[0] === x.dataset.s)[1] + (on ? (bagelSort.dir === "asc" ? " ↑" : " ↓") : ""); });
      bagelShown = 50; draw();
    });
    $("#bsFind", body).onclick = () => {
      $("#lbSearch", body).value = "";
      if (!rows.some((x) => x.team === OUR_TEAM)) { toast(`${OUR_TEAM} isn't in this list`, "err"); return; }
      bagelFocusTeam = OUR_TEAM; draw();
    };
    draw();
  }

  async function renderBagelWorld(body, mode, year) {
    let lb = API.sbCachedLeaderboard(year);
    let note = lb ? "cached" : "";
    try {
      const res = await API.sbYearLeaderboard(year, 15 * 60000);
      lb = res.rows; note = res.fromCache ? "cached" : "live";
    } catch (e) {
      if (!lb && year === GAME.season && seasonUpcoming()) {
        body.innerHTML = `<div class="card">${emptyState("clock", `No ${year} EPA yet`,
          `Statbotics publishes ${year} EPA once the season's matches start. Check back after the first events in March, or pick an earlier year above.`)}</div>`;
        return;
      }
      if (!lb) {
        body.innerHTML = `<div class="card">${emptyState("globe", "Statbotics is unavailable",
          "The world, state and district leaderboards come from Statbotics, which isn't responding right now. Try again in a bit.")}</div>`;
        return;
      }
      note = "offline · cached";
    }
    if (!body.isConnected) return;
    if (!lb.length) { body.innerHTML = `<div class="card">${emptyState("chart", `No ${year} data`, "Statbotics has no teams for this season.")}</div>`; return; }
    let tool = "";
    let list = lb;
    if (mode === "state") {
      const states = [...new Set(lb.map((r) => r.state).filter(Boolean))].sort();
      if (!states.includes(bagelState)) bagelState = states.includes("CA") ? "CA" : (states[0] || "");
      tool = `<label class="bs-region">${icon("map-pin")}<select id="regionSel" aria-label="State">${states.map((s2) => `<option ${s2 === bagelState ? "selected" : ""}>${esc(s2)}</option>`).join("")}</select></label>`;
      list = lb.filter((r) => r.state === bagelState);
    } else if (mode === "district") {
      const dists = [...new Set(lb.map((r) => r.district).filter(Boolean))].sort();
      if (!dists.length) { body.innerHTML = `<div class="card">${emptyState("flag", "No districts", `No district data for ${year}.`)}</div>`; return; }
      if (!dists.includes(bagelDistrict)) bagelDistrict = dists.includes("ca") ? "ca" : dists[0];
      tool = `<label class="bs-region">${icon("flag")}<select id="regionSel" aria-label="District">${dists.map((d) => `<option value="${esc(d)}" ${d === bagelDistrict ? "selected" : ""}>${esc(d.toUpperCase())}</option>`).join("")}</select></label>`;
      list = lb.filter((r) => r.district === bagelDistrict);
    }
    if (bagelSort.col === "rp") bagelSort = { col: "rank", dir: "asc" };
    drawBagelList(body, list, mode, year, tool + `<span class="badge ${note === "live" ? "green" : ""} dot">${esc(note)}</span>`);
    const rs = $("#regionSel", body);
    if (rs) rs.onchange = () => { if (mode === "state") bagelState = rs.value; else bagelDistrict = rs.value; bagelShown = 50; renderBagelWorld(body, mode, year); };
  }

  async function renderBagelEvent(body) {
    const s = Store.getSettings();
    if (!s.eventKey) {
      body.innerHTML = `<div class="card">${emptyState("calendar", "No event selected", "Pick your event from the sidebar to see live event EPA, ranks and RP.")}
        <div class="row" style="justify-content:center"><button class="btn primary" id="pickEv">${icon("calendar")} Choose event</button></div></div>`;
      $("#pickEv", body).onclick = openEventPicker;
      return;
    }
    let fetchErr = null;
    try { await API.getEventMatches(s.eventKey); } catch (e) { fetchErr = e.message; }
    if (!body.isConnected) return;
    const epa = currentEventEpa();
    if (!epa || !epa.ranked.length) {
      const title = fetchErr === "NO_KEY" ? "No Blue Alliance key" : fetchErr === "BAD_KEY" ? "Blue Alliance key rejected" : fetchErr ? "Couldn't reach The Blue Alliance" : "No match data yet";
      const msg = fetchErr ? "Event EPA is built from TBA match results. Check your connection or key, then retry."
        : "No qualification matches have been scored yet. Results appear here as they post.";
      body.innerHTML = `<div class="card">${emptyState("chart", title, msg)}
        <div class="row" style="justify-content:center"><button class="btn primary" id="retryEv">${icon("search")} Retry now</button></div></div>`;
      $("#retryEv", body).onclick = () => renderBagelEvent(body);
      return;
    }
    let rankMap = {};
    try {
      const { rankings } = await API.getEventRankings(s.eventKey);
      rankings.forEach((r) => {
        rankMap[r.team_key.replace("frc", "")] = { rank: r.rank, rp: (r.sort_orders && r.sort_orders.length ? r.sort_orders[0] : null),
          record: r.record ? { w: r.record.wins, l: r.record.losses, t: r.record.ties } : null };
      });
    } catch (e) { /* rankings optional */ }
    if (!body.isConnected) return;
    const rows = epa.ranked.map((r) => {
      const tr = rankMap[r.team] || {};
      return { team: r.team, name: teamName(r.team), epa: r.epa, breakdown: r.breakdown, tbaRank: tr.rank ?? r.rank ?? null, rp: tr.rp ?? null, record: tr.record ?? null };
    });
    if (bagelSort.col === "win") bagelSort = { col: "rank", dir: "asc" };
    drawBagelList(body, rows, "event", GAME.season,
      `<span class="badge green dot">${esc(s.eventName || s.eventKey)} · ${epa.played} matches</span>`);
  }

  function gotoBagel(tab, team) {
    bagelTab = tab; bagelFocusTeam = team || null; bagelYear = 0;
    if (current() === "bagelstats") renderBagelStats($("#view")); else go("bagelstats");
  }

  /* ===========================================================================
     VIEW: COMPARE  (overlay multiple teams' EPA graphs + stat comparison)
     ======================================================================== */
  let compareTab = "global";     // global | event | charts
  let compareTeams = [];         // team numbers being compared

  function addToCompare(team) {
    team = String(team);
    if (!compareTeams.includes(team)) {
      if (compareTeams.length >= 6) { toast("Compare holds up to 6 teams", "err"); }
      else compareTeams.push(team);
    }
    if (current() === "compare") renderCompare($("#view")); else go("compare");
    toast(`Team ${team} added to Compare`);
  }
  const CMP_PALETTE = ["#5bbde2", "#ffc718", "#f2555a", "#4ade80", "#c084fc", "#fb923c"];

  // Overlaid multi-line chart with hover tooltip + match-number x-axis.
  // seriesList = [{team, color, points:[{epa}]}]
  function renderMultiLineChart(el, seriesList) {
    const all = seriesList.flatMap((s) => s.points.map((p) => p.epa));
    if (!all.length) { el.innerHTML = `<p class="muted" style="text-align:center;padding:16px 0">No EPA match data for these teams yet.</p>`; return; }
    const W = 580, H = 235, pad = { l: 34, r: 12, t: 12, b: 36 };
    let mn = Math.min(...all), mx = Math.max(...all); if (mn === mx) { mn -= 1; mx += 1; }
    const range = mx - mn, maxLen = Math.max(...seriesList.map((s) => s.points.length));
    const X = (i) => pad.l + (maxLen <= 1 ? (W - pad.l - pad.r) / 2 : (i / (maxLen - 1)) * (W - pad.l - pad.r));
    const Y = (v) => pad.t + (1 - (v - mn) / range) * (H - pad.t - pad.b);
    const grid = [mn, (mn + mx) / 2, mx].map((v) =>
      `<line x1="${pad.l}" y1="${Y(v).toFixed(1)}" x2="${W - pad.r}" y2="${Y(v).toFixed(1)}" class="cg"/>
       <text x="2" y="${(Y(v) + 3).toFixed(1)}" class="cl">${v.toFixed(0)}</text>`).join("");
    // x-axis: match numbers (1..maxLen), ~8 ticks, always include the last
    let xlabels = "";
    const ticks = Math.min(maxLen, 8), stepT = Math.max(1, Math.round((maxLen - 1) / Math.max(1, ticks - 1)));
    const shown = new Set();
    for (let i = 0; i < maxLen; i += stepT) shown.add(i);
    shown.add(maxLen - 1);
    [...shown].forEach((i) => { xlabels += `<text x="${X(i).toFixed(1)}" y="${H - 16}" text-anchor="middle" class="cxl">${i + 1}</text>`; });
    xlabels += `<text x="${((pad.l + (W - pad.r)) / 2).toFixed(1)}" y="${H - 3}" text-anchor="middle" class="cxt">Match number</text>`;
    const lines = seriesList.map((s) => {
      if (!s.points.length) return "";
      const pts = s.points.map((p, i) => `${X(i).toFixed(1)},${Y(p.epa).toFixed(1)}`).join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>`;
    }).join("");
    el.innerHTML = `<div class="cmp-chartwrap">
        <svg viewBox="0 0 ${W} ${H}" class="epa-chart cmp-svg" preserveAspectRatio="none" role="img" aria-label="EPA comparison">${grid}${xlabels}${lines}</svg>
        <div class="cmp-guide"></div>
        ${seriesList.map((s, i) => `<div class="cmp-dot" data-si="${i}" style="background:${s.color}"></div>`).join("")}
        <div class="cmp-tip"></div>
      </div>
      <div class="cmp-legend">${seriesList.map((s) => `<span class="cmp-leg"><i style="background:${s.color}"></i>${esc(s.team)} · ${s.points.length}m</span>`).join("")}</div>`;

    // ---- hover interaction ----
    const wrap = el.querySelector(".cmp-chartwrap");
    const svg = el.querySelector(".cmp-svg");
    const guide = el.querySelector(".cmp-guide");
    const tip = el.querySelector(".cmp-tip");
    const dots = [...el.querySelectorAll(".cmp-dot")];
    const hide = () => { guide.style.display = "none"; tip.style.display = "none"; dots.forEach((d) => d.style.display = "none"); };
    hide();
    const move = (clientX) => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const sx = ((clientX - rect.left) / rect.width) * W; // viewBox x
      let idx = Math.round(((sx - pad.l) / (W - pad.l - pad.r)) * (maxLen - 1));
      idx = Math.max(0, Math.min(maxLen - 1, idx));
      const px = (X(idx) / W) * rect.width;
      guide.style.display = "block"; guide.style.left = px + "px";
      guide.style.top = (pad.t / H * rect.height) + "px";
      guide.style.height = ((H - pad.t - pad.b) / H * rect.height) + "px";
      let rows = `<div class="tip-h">Match ${idx + 1}</div>`;
      seriesList.forEach((s, i) => {
        const p = s.points[idx];
        if (p) {
          dots[i].style.display = "block";
          dots[i].style.left = px + "px";
          dots[i].style.top = ((Y(p.epa) / H) * rect.height) + "px";
          rows += `<div class="tip-r"><i style="background:${s.color}"></i>${esc(s.team)}<b>${p.epa.toFixed(1)}</b></div>`;
        } else { dots[i].style.display = "none"; }
      });
      tip.innerHTML = rows; tip.style.display = "block";
      let tx = px + 12; if (tx > rect.width - 120) tx = px - 120;
      tip.style.left = Math.max(2, tx) + "px"; tip.style.top = "6px";
    };
    svg.addEventListener("mousemove", (e) => move(e.clientX));
    svg.addEventListener("mouseleave", hide);
    svg.addEventListener("touchstart", (e) => { if (e.touches[0]) move(e.touches[0].clientX); }, { passive: true });
    svg.addEventListener("touchmove", (e) => { if (e.touches[0]) move(e.touches[0].clientX); }, { passive: true });
  }

  function renderCompare(root) {
    const s = Store.getSettings();
    const tabs = [["global", "Global", "globe"], ["event", "Event", "calendar"], ["charts", "Charts", "chart"]];
    root.innerHTML = `
      ${pageHero({ ic: "linegraph", eyebrow: `Compare · ${esc(GAME.seasonLabel)}`, title: compareTab === "charts" ? "Charts" : "Head to head",
        sub: compareTab === "charts" ? "Every team this season on one chart. Hover a bubble for the team and its EPA."
          : "Stack up to 6 teams: EPA over time, where their points come from, and every stat side by side." })}
      <div class="subtabs" id="cmpTabs">${tabs.map(([k, l, ic]) => `<button data-t="${k}" class="${compareTab === k ? "on" : ""}">${icon(ic)} ${l}</button>`).join("")}</div>
      <div id="cmpBody"></div>`;
    $$("#cmpTabs button", root).forEach((b) => b.onclick = () => { compareTab = b.dataset.t; renderCompare(root); });
    const body = $("#cmpBody", root);
    if (compareTab === "charts") return renderCompareCharts(body);

    body.innerHTML = `
      <div class="card ev-toolbar cmp-add">
        ${compareTab === "event" && eventTeams().length
          ? `<label class="bs-region grow">${icon("plus")}<select id="cmpAdd" aria-label="Add a team"><option value="">Add a team from this event…</option>${
              eventTeams().filter((t) => !compareTeams.includes(String(t.team_number)))
                .map((t) => `<option value="${t.team_number}">${t.team_number} · ${esc(t.nickname || "")}</option>`).join("")}</select></label>`
          : `<label class="ds-search" for="cmpAdd">${icon("plus")}<input type="number" id="cmpAdd" placeholder="Add a team #" inputmode="numeric" /></label>
             <button class="btn primary sm" id="cmpAddBtn">${icon("plus")} Add</button>`}
        <button class="btn ghost sm" id="cmpTop5">${icon("trophy")} Top 5 by EPA</button>
        ${compareTeams.length ? `<button class="btn ghost sm" id="cmpClear">${icon("x")} Clear</button>` : ""}
      </div>
      <div id="cmpChips" class="cmp-tiles"></div>
      <section class="card cmp-card"><div class="sr-head"><h3>${icon("linegraph")} EPA over time</h3><span class="hint">hover to read every team at once</span></div>
        <div id="cmpChart"></div></section>
      <div class="grid cols-2 cmp-split">
        <section class="card cmp-card"><div class="sr-head"><h3>${icon("chart")} Where the points come from</h3><span class="hint">auto · teleop · endgame</span></div><div id="cmpBreak"></div></section>
        <section class="card cmp-card"><div class="sr-head"><h3>${icon("list")} Stat by stat</h3><span class="hint">best in each row is highlighted</span></div><div id="cmpStats"></div></section>
      </div>`;

    const addInput = $("#cmpAdd", body);
    const add = () => {
      const t = (addInput.value || "").replace(/\D/g, "");
      if (!t) return;
      if (!compareTeams.includes(t)) { if (compareTeams.length >= 6) { toast("Up to 6 teams", "err"); return; } compareTeams.push(t); }
      addInput.value = ""; renderCompare(root);
    };
    if ($("#cmpAddBtn", body)) $("#cmpAddBtn", body).onclick = add;
    addInput.onkeydown = (e) => { if (e.key === "Enter") add(); };
    if (addInput.tagName === "SELECT") addInput.onchange = add;
    const clr = $("#cmpClear", body); if (clr) clr.onclick = () => { compareTeams = []; renderCompare(root); };
    $("#cmpTop5", body).onclick = () => {
      let ranked;
      if (compareTab === "event") {
        const ev = currentEventEpa();
        ranked = eventTeams().map((t) => String(t.team_number)).filter((t) => ev && ev.byTeam[t]).sort((a, b) => ev.byTeam[b].epa - ev.byTeam[a].epa);
        if (!ranked.length) { toast("No event EPA yet — load the event's matches (needs wifi) first", "err"); return; }
      } else {
        const epaMap = buildSeasonEpa(), evTeams = eventTeams().map((t) => String(t.team_number));
        ranked = evTeams.length ? evTeams.filter((t) => epaMap[t] != null).sort((a, b) => epaMap[b] - epaMap[a])
          : (API.sbCachedLeaderboard(GAME.season) || []).map((r) => String(r.team));
        if (!ranked.length) { toast("Load World EPA first (BagelStats → World)", "err"); return; }
      }
      compareTeams = ranked.slice(0, 5);
      renderCompare(root);
      toast("Added the top 5 teams by EPA");
    };

    const colorOf = (i) => CMP_PALETTE[i % CMP_PALETTE.length];
    const chipsEl = $("#cmpChips", body);
    chipsEl.innerHTML = compareTeams.length ? compareTeams.map((t, i) => `
      <div class="cmp-tile" style="--line:${colorOf(i)}">
        ${teamTileHTML(t, `<span class="cmp-line"></span>line ${i + 1}`, { mini: true })}
        <button class="cmp-x" data-rm="${t}" aria-label="Remove ${t}">${icon("x")}</button>
      </div>`).join("")
      : `<div class="mb-empty">${icon("compare")}<span>Add teams above (or tap <b>Compare</b> on any team) to stack them up.</span></div>`;
    wireTeamTiles(chipsEl);
    $$("[data-rm]", chipsEl).forEach((b) => b.onclick = () => { compareTeams = compareTeams.filter((x) => x !== b.dataset.rm); renderCompare(root); });

    const chartEl = $("#cmpChart", body), statsEl = $("#cmpStats", body), breakEl = $("#cmpBreak", body);
    if (!compareTeams.length) {
      chartEl.innerHTML = `<p class="muted" style="text-align:center;padding:14px 0">Add teams to overlay their EPA graphs.</p>`;
      statsEl.innerHTML = breakEl.innerHTML = `<p class="muted">Nothing to compare yet.</p>`;
      return;
    }
    // ---- stats + breakdown (instant) ----
    const lbMap = {}; (API.sbCachedLeaderboard(GAME.season) || []).forEach((r) => { lbMap[r.team] = r; });
    const ev = currentEventEpa();
    const src = (t) => compareTab === "event" ? (ev && ev.byTeam[t] ? { epa: ev.byTeam[t].epa, breakdown: ev.byTeam[t].breakdown } : null) : lbMap[t] || null;
    const num = (v) => (v == null || isNaN(v)) ? null : Number(v);
    const rows = compareTab === "event" ? [
      ["Event EPA", (t) => num(src(t) && src(t).epa), 1],
      ["Auto EPA", (t) => num(src(t) && src(t).breakdown && src(t).breakdown.auto), 1],
      ["Teleop EPA", (t) => num(src(t) && src(t).breakdown && src(t).breakdown.teleop), 1],
      ["Endgame EPA", (t) => num(src(t) && src(t).breakdown && src(t).breakdown.endgame), 1],
      ["Event rank", (t) => num(ev && ev.byTeam[t] && ev.byTeam[t].rank), -1, "#"],
      ["Matches scouted", (t) => computeStats(t).matches, 1],
      ["Avg cycles (scouted)", (t) => num(computeStats(t).avgCycles) || null, 1],
    ] : [
      ["Season EPA", (t) => num(lbMap[t] && lbMap[t].epa), 1],
      ["Auto EPA", (t) => num(lbMap[t] && lbMap[t].breakdown && lbMap[t].breakdown.auto), 1],
      ["Teleop EPA", (t) => num(lbMap[t] && lbMap[t].breakdown && lbMap[t].breakdown.teleop), 1],
      ["Endgame EPA", (t) => num(lbMap[t] && lbMap[t].breakdown && lbMap[t].breakdown.endgame), 1],
      ["World rank", (t) => num(lbMap[t] && lbMap[t].worldRank), -1, "#"],
      ["State rank", (t) => num(lbMap[t] && lbMap[t].stateRank), -1, "#"],
      ["Win rate", (t) => { const r = lbMap[t] && lbMap[t].record; const g = r ? r.w + r.l + r.t : 0; return g ? Math.round(r.w / g * 100) : null; }, 1, "", "%"],
    ];
    statsEl.innerHTML = `<div class="table-wrap"><table class="cmp-table">
      <thead><tr><th>Stat</th>${compareTeams.map((t, i) => `<th class="num"><span class="cmp-th"><i style="background:${colorOf(i)}"></i>${t}</span></th>`).join("")}</tr></thead>
      <tbody>${rows.map(([label, fn, dir, pre = "", post = ""]) => {
        const vals = compareTeams.map(fn), real = vals.filter((v) => v != null);
        const best = real.length > 1 ? (dir > 0 ? Math.max(...real) : Math.min(...real)) : null;
        return `<tr><td class="muted">${label}</td>${vals.map((v) => `<td class="num${v != null && v === best ? " best" : ""}">${v == null ? "–" : pre + (Number.isInteger(v) ? v : fmt(v)) + post}</td>`).join("")}</tr>`;
      }).join("")}</tbody></table></div>`;
    const parts = [["auto", "Auto", "a"], ["teleop", "Teleop", "t"], ["endgame", "Endgame", "e"]];
    const maxTot = Math.max(1, ...compareTeams.map((t) => { const x = src(t); return x ? x.epa || 0 : 0; }));
    breakEl.innerHTML = `<div class="cmp-break">${compareTeams.map((t, i) => {
      const x = src(t), b = (x && x.breakdown) || {};
      return `<div class="cmp-brow"><span class="cmp-bteam"><i style="background:${colorOf(i)}"></i>${t}</span>
        <span class="tp-stack cmp-stack">${x ? parts.map(([k, l, c]) => `<span class="tp-seg ${c}" style="width:${Math.max(0, (b[k] || 0) / maxTot * 100)}%" title="${l} ${fmt(b[k])}"></span>`).join("") : ""}</span>
        <b>${x ? fmt(x.epa) : "–"}</b></div>`;
    }).join("")}</div>
      <div class="cmp-legend">${parts.map(([, l, c]) => `<span class="cmp-leg"><i class="tp-key ${c}"></i>${l}</span>`).join("")}</div>`;

    // ---- EPA over time (async) ----
    chartEl.innerHTML = `<div class="tp-loading"><span class="tp-spin"></span>Loading EPA graphs…</div>`;
    Promise.all(compareTeams.map((t) => API.sbTeamMatches(t, GAME.season).catch(() => [])))
      .then((all) => {
        if (!chartEl.isConnected) return;
        renderMultiLineChart(chartEl, compareTeams.map((t, i) => ({ team: t, color: colorOf(i),
          points: (compareTab === "event" ? all[i].filter((m) => m.event === s.eventKey) : all[i]).map((m) => ({ epa: m.epa })) })));
      });
  }

  /* ---- Compare → Charts: bubble chart of every team + distribution + top 20 ---- */
  const CHART_METRICS = {
    epa: ["Total EPA", (r) => r.epa],
    auto: ["Auto EPA", (r) => r.breakdown && r.breakdown.auto],
    teleop: ["Teleop EPA", (r) => r.breakdown && r.breakdown.teleop],
    endgame: ["Endgame EPA", (r) => r.breakdown && r.breakdown.endgame],
    wins: ["Wins", (r) => (r.record ? r.record.w : null)],
    winrate: ["Win rate %", (r) => { const g = r.record ? r.record.w + r.record.l + r.record.t : 0; return g ? r.record.w / g * 100 : null; }],
  };
  let chartOpts = { x: "teleop", y: "auto", size: "epa", scope: "world", year: 0, offseason: false, find: "" };
  async function renderCompareCharts(body) {
    const year = chartOpts.year || GAME.season;
    const years = []; for (let y = GAME.season; y >= 2002; y--) years.push(y);
    const metricOpts = (sel) => Object.entries(CHART_METRICS).map(([k, [l]]) => `<option value="${k}" ${sel === k ? "selected" : ""}>${l}</option>`).join("");
    body.innerHTML = `
      <div class="card ch-tools">
        <label class="bs-region">${icon("calendar")}<select id="chYear" aria-label="Season">${years.map((y) => `<option ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select></label>
        <div class="seg" id="chScope">${[["world", "World"], ["state", "My state"], ["district", "My district"], ["event", "Event"]].map(([k, l]) =>
          `<button data-sc="${k}" class="${chartOpts.scope === k ? "on" : ""}" ${k === "event" && year !== GAME.season ? "disabled" : ""}>${l}</button>`).join("")}</div>
        <label class="ch-sel"><span>X axis</span><select id="chX">${metricOpts(chartOpts.x)}</select></label>
        <label class="ch-sel"><span>Y axis</span><select id="chY">${metricOpts(chartOpts.y)}</select></label>
        <label class="ch-sel"><span>Bubble size</span><select id="chSize"><option value="epa" ${chartOpts.size === "epa" ? "selected" : ""}>Total EPA</option><option value="none" ${chartOpts.size === "none" ? "selected" : ""}>Same size</option></select></label>
        <label class="ch-toggle"><input type="checkbox" id="chOff" ${chartOpts.offseason ? "checked" : ""}/><span class="ch-switch"></span>Include offseason</label>
        <label class="ds-search ch-find" for="chFind">${icon("search")}<input id="chFind" type="search" placeholder="Highlight a team…" value="${esc(chartOpts.find)}" inputmode="numeric" /></label>
      </div>
      <section class="card ch-card"><div class="sr-head"><h3>${icon("chart")} <span id="chTitle"></span></h3><span class="hint" id="chCount"></span></div>
        <div class="ch-wrap" id="chWrap"><div class="tp-loading"><span class="tp-spin"></span>Loading ${year} teams…</div></div>
        <div class="ch-legend" id="chLegend"></div></section>
      <div class="grid cols-2 cmp-split">
        <section class="card ch-card"><div class="sr-head"><h3>${icon("chart")} EPA distribution</h3><span class="hint" id="histNote"></span></div><div id="chHist"></div></section>
        <section class="card ch-card"><div class="sr-head"><h3>${icon("trophy")} Top 20 by EPA</h3><span class="hint">auto · teleop · endgame</span></div><div id="chTop"></div></section>
      </div>`;
    const rerun = () => renderCompareCharts(body);
    $("#chYear", body).onchange = (e) => { chartOpts.year = Number(e.target.value); if (chartOpts.year !== GAME.season && chartOpts.scope === "event") chartOpts.scope = "world"; rerun(); };
    $$("#chScope button", body).forEach((b) => b.onclick = () => { chartOpts.scope = b.dataset.sc; rerun(); });
    $("#chX", body).onchange = (e) => { chartOpts.x = e.target.value; draw(); };
    $("#chY", body).onchange = (e) => { chartOpts.y = e.target.value; draw(); };
    $("#chSize", body).onchange = (e) => { chartOpts.size = e.target.value; draw(); };
    $("#chOff", body).onchange = (e) => { chartOpts.offseason = e.target.checked; draw(); };
    $("#chFind", body).oninput = (e) => { chartOpts.find = e.target.value.replace(/\D/g, ""); draw(); };

    let lb = null;
    try { lb = (await API.sbYearLeaderboard(year, 15 * 60000)).rows; } catch (e) { lb = API.sbCachedLeaderboard(year); }
    if (!body.isConnected) return;
    if (!lb || !lb.length) {
      $("#chWrap", body).innerHTML = emptyState("chart", `No ${year} data`, year === GAME.season && seasonUpcoming()
        ? "Statbotics publishes EPA once the season's matches start. Pick an earlier year above." : "Statbotics isn't responding. Try again in a bit.");
      return;
    }
    const me = lb.find((r) => r.team === OUR_TEAM);
    const evSet = new Set(eventTeams().map((t) => String(t.team_number)));
    const cmpIdx = {}; compareTeams.forEach((t, i) => { cmpIdx[t] = i; });

    function draw() {
      let rows = lb;
      if (!chartOpts.offseason) rows = rows.filter((r) => r.record && (r.record.w + r.record.l + r.record.t) > 0);
      if (chartOpts.scope === "state") rows = rows.filter((r) => me && r.state === me.state);
      else if (chartOpts.scope === "district") rows = rows.filter((r) => me && me.district && r.district === me.district);
      else if (chartOpts.scope === "event") rows = rows.filter((r) => evSet.has(r.team));
      const [xl, xf] = CHART_METRICS[chartOpts.x], [yl, yf] = CHART_METRICS[chartOpts.y];
      const pts = rows.map((r) => ({ r, x: xf(r), y: yf(r) })).filter((p) => p.x != null && p.y != null && !isNaN(p.x) && !isNaN(p.y));
      $("#chTitle", body).textContent = `${yl} vs ${xl}`;
      $("#chCount", body).textContent = `${pts.length.toLocaleString()} teams · ${year}`;
      const wrap = $("#chWrap", body);
      if (!pts.length) { wrap.innerHTML = emptyState("chart", "Nothing to plot", "No teams have both of these numbers. Try different axes."); return; }
      const W = 900, H = 520, pad = { l: 56, r: 18, t: 16, b: 48 };
      const ext = (arr) => { let lo = Math.min(...arr), hi = Math.max(...arr); if (lo === hi) { lo -= 1; hi += 1; } const m = (hi - lo) * 0.05; return [lo - m, hi + m]; };
      const [x0, x1] = ext(pts.map((p) => p.x)), [y0, y1] = ext(pts.map((p) => p.y));
      const X = (v) => pad.l + (v - x0) / (x1 - x0) * (W - pad.l - pad.r);
      const Y = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
      const eps = pts.map((p) => p.r.epa || 0), e0 = Math.min(...eps), e1 = Math.max(...eps);
      const R = (p) => chartOpts.size === "none" ? 4.5 : 2.5 + 10 * Math.sqrt(Math.max(0, ((p.r.epa || 0) - e0) / ((e1 - e0) || 1)));
      const ticks = (a, b) => Array.from({ length: 5 }, (_, i) => a + (b - a) * i / 4);
      const find = chartOpts.find;
      const kind = (t) => t === find ? "find" : cmpIdx[t] != null ? "cmp" : t === OUR_TEAM ? "us" : evSet.has(t) && chartOpts.scope !== "event" ? "ev" : "";
      const sorted = pts.map((p, i) => ({ ...p, i, k: kind(p.r.team) })).sort((a, b) => (a.k ? 1 : 0) - (b.k ? 1 : 0) || R(b) - R(a));
      wrap.innerHTML = `<svg class="ch-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yl)} vs ${esc(xl)} bubble chart">
          ${ticks(x0, x1).map((v) => `<line class="cg" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${pad.t}" y2="${H - pad.b}"/><text class="ch-ax" x="${X(v).toFixed(1)}" y="${H - pad.b + 18}" text-anchor="middle">${fmt(v, 0)}</text>`).join("")}
          ${ticks(y0, y1).map((v) => `<line class="cg" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="ch-ax" x="${pad.l - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fmt(v, 0)}</text>`).join("")}
          <text class="ch-axt" x="${(pad.l + W - pad.r) / 2}" y="${H - 8}" text-anchor="middle">${esc(xl)} →</text>
          <text class="ch-axt" x="14" y="${(pad.t + H - pad.b) / 2}" text-anchor="middle" transform="rotate(-90 14 ${(pad.t + H - pad.b) / 2})">${esc(yl)} →</text>
          <g class="ch-dots">${sorted.map((p) => `<circle data-i="${p.i}" class="ch-b ${p.k}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${R(p).toFixed(1)}"${p.k === "cmp" ? ` style="--c:${CMP_PALETTE[cmpIdx[p.r.team] % CMP_PALETTE.length]}"` : ""}/>`).join("")}</g>
          ${sorted.filter((p) => p.k && p.k !== "ev").map((p) => `<text class="ch-lbl" x="${(X(p.x) + R(p) + 3).toFixed(1)}" y="${(Y(p.y) + 4).toFixed(1)}">${esc(p.r.team)}</text>`).join("")}
        </svg><div class="ch-tip" hidden></div>`;
      $("#chLegend", body).innerHTML = `<span><i class="ch-key"></i>Every team</span>${evSet.size && chartOpts.scope !== "event" ? `<span><i class="ch-key ev"></i>At your event</span>` : ""}
        <span><i class="ch-key us"></i>${OUR_TEAM}</span>${compareTeams.length ? `<span><i class="ch-key cmp"></i>In Compare</span>` : ""}${find ? `<span><i class="ch-key find"></i>${esc(find)}</span>` : ""}`;
      const svg = $("svg", wrap), tip = $(".ch-tip", wrap);
      const show = (c) => {
        const p = pts[+c.dataset.i]; if (!p) return;
        const rect = wrap.getBoundingClientRect(), cr = c.getBoundingClientRect();
        tip.hidden = false;
        tip.innerHTML = `<b>${esc(p.r.team)}</b> ${esc(p.r.name || "")}<span>EPA <b>${fmt(p.r.epa)}</b></span><span>${esc(xl)} <b>${fmt(p.x)}</b> · ${esc(yl)} <b>${fmt(p.y)}</b></span>`;
        let left = cr.left - rect.left + cr.width / 2 + 12, top = cr.top - rect.top - 10;
        if (left > rect.width - 220) left = cr.left - rect.left - 222;
        tip.style.left = Math.max(4, left) + "px"; tip.style.top = Math.max(4, top) + "px";
        c.classList.add("hov");
      };
      svg.addEventListener("pointerover", (e) => { const c = e.target.closest("circle[data-i]"); if (c) show(c); });
      svg.addEventListener("pointerout", (e) => { const c = e.target.closest("circle[data-i]"); if (c) { c.classList.remove("hov"); tip.hidden = true; } });
      svg.addEventListener("click", (e) => {
        const c = e.target.closest("circle[data-i]"); if (!c) return;
        const t = pts[+c.dataset.i].r.team;
        if (year === GAME.season) openTeam(t); else location.hash = "#/team/" + t + "/" + year;
      });

      // ---- distribution of total EPA ----
      const all = rows.map((r) => r.epa).filter((v) => v != null);
      const hist = $("#chHist", body);
      if (all.length) {
        const B = 24, lo = Math.min(...all), hi = Math.max(...all), bw = (hi - lo) / B || 1;
        const bins = Array(B).fill(0); all.forEach((v) => { bins[Math.min(B - 1, Math.floor((v - lo) / bw))]++; });
        const mx = Math.max(...bins), HW = 460, HH = 210, hp = { l: 8, r: 8, t: 22, b: 26 };
        const bx = (v) => hp.l + (v - lo) / (hi - lo || 1) * (HW - hp.l - hp.r);
        const marks = [me && me.epa != null && rows.includes(me) ? { t: OUR_TEAM, v: me.epa, c: "us" } : null,
          ...compareTeams.map((t, i) => { const r = rows.find((x) => x.team === t); return r && r.epa != null ? { t, v: r.epa, c: "cmp", col: CMP_PALETTE[i % CMP_PALETTE.length] } : null; })].filter(Boolean);
        hist.innerHTML = `<svg class="ch-svg" viewBox="0 0 ${HW} ${HH}" role="img" aria-label="EPA distribution">
          ${bins.map((n, i) => { const h = n / mx * (HH - hp.t - hp.b); return `<rect class="ch-hbar" x="${(hp.l + i * (HW - hp.l - hp.r) / B + 1).toFixed(1)}" y="${(HH - hp.b - h).toFixed(1)}" width="${((HW - hp.l - hp.r) / B - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2"><title>${fmt(lo + i * bw, 0)}–${fmt(lo + (i + 1) * bw, 0)} EPA: ${n} teams</title></rect>`; }).join("")}
          ${marks.map((m) => `<line class="ch-mark ${m.c}" x1="${bx(m.v).toFixed(1)}" x2="${bx(m.v).toFixed(1)}" y1="${hp.t - 6}" y2="${HH - hp.b}"${m.col ? ` style="stroke:${m.col}"` : ""}/><text class="ch-lbl" x="${bx(m.v).toFixed(1)}" y="${hp.t - 9}" text-anchor="middle">${esc(m.t)}</text>`).join("")}
          <text class="ch-ax" x="${hp.l}" y="${HH - 8}">${fmt(lo, 0)}</text><text class="ch-ax" x="${HW - hp.r}" y="${HH - 8}" text-anchor="end">${fmt(hi, 0)} EPA</text>
        </svg>`;
        const mine = me && rows.includes(me) && me.epa != null ? all.filter((v) => v < me.epa).length / all.length : null;
        $("#histNote", body).textContent = mine != null ? `${OUR_TEAM} is better than ${Math.round(mine * 100)}% of these teams` : `${all.length} teams`;
      } else hist.innerHTML = `<p class="muted">No EPA data.</p>`;

      // ---- top 20 stacked ----
      const top = rows.filter((r) => r.epa != null).slice().sort((a, b) => b.epa - a.epa).slice(0, 20);
      const tmax = Math.max(1, ...top.map((r) => r.epa));
      $("#chTop", body).innerHTML = `<div class="ch-top">${top.map((r, i) => {
        const b = r.breakdown || {}, w = (v) => Math.max(0, (v || 0) / tmax * 100).toFixed(1);
        return `<button class="ch-trow${r.team === OUR_TEAM ? " ours" : ""}" data-ct="${esc(r.team)}" style="animation-delay:${i * 25}ms">
          <span class="ch-tr">${i + 1}</span><span class="ch-tn">${esc(r.team)}</span>
          <span class="tp-stack ch-tstack">${b.auto != null ? `<span class="tp-seg a" style="width:${w(b.auto)}%"></span><span class="tp-seg t" style="width:${w(b.teleop)}%"></span><span class="tp-seg e" style="width:${w(b.endgame)}%"></span>` : `<span class="tp-seg t" style="width:${w(r.epa)}%"></span>`}</span>
          <b>${fmt(r.epa)}</b></button>`;
      }).join("")}</div>`;
      $$("[data-ct]", body).forEach((b) => b.onclick = () => (year === GAME.season ? openTeam(b.dataset.ct) : (location.hash = "#/team/" + b.dataset.ct + "/" + year)));
    }
    draw();
  }

  /* ===========================================================================
     VIEW: ADMIN PANEL (member roster + access requests)
     ======================================================================== */
  let adminUnlocked = false;
  let adminCredIds = null, adminCredLoading = false; // Set of scouter ids that have a password
  function loadAdminCreds(root) {
    if (adminCredLoading || !Cloud.enabled()) return;
    adminCredLoading = true;
    Cloud.listCredIds().then((ids) => { adminCredIds = new Set(ids); })
      .catch(() => { adminCredIds = new Set(); })
      .finally(() => { adminCredLoading = false; if (current() === "admin") renderAdmin(root); });
  }
  function renderAdmin(root) {
    const pin = (window.CONFIG && window.CONFIG.adminPin) || "";
    if (pin && !adminUnlocked) {
      root.innerHTML = `
        <div class="card ad-lock">
          <span class="ad-lock-ico">${icon("lock")}</span>
          <h2>Admin panel</h2>
          <p class="hint">Enter the admin PIN to manage members, passwords, forms and Bagel Bucks.</p>
          <label class="auth-field" for="adminPin"><span class="auth-label">Admin PIN</span>
            <span class="auth-input">${icon("key")}<input type="password" id="adminPin" placeholder="••••" inputmode="numeric" autocomplete="off" /></span></label>
          <div class="login-error" id="adminErr" hidden></div>
          <button class="auth-btn" id="adminUnlock"><span class="auth-btn-label">Unlock</span>${icon("arrow-right")}</button>
        </div>`;
      const tryUnlock = () => {
        if ($("#adminPin", root).value === pin) { adminUnlocked = true; renderAdmin(root); }
        else { const e = $("#adminErr", root); e.textContent = "Wrong PIN."; e.hidden = false;
          const c = $(".ad-lock", root); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake"); }
      };
      $("#adminUnlock", root).onclick = tryUnlock;
      $("#adminPin", root).onkeydown = (e) => { if (e.key === "Enter") tryUnlock(); };
      $("#adminPin", root).focus();
      return;
    }

    if (!adminCredIds) loadAdminCreds(root);
    const requests = Store.getRequests();
    const reqKeys = Object.keys(requests).sort((a, b) => requests[b].ts - requests[a].ts);
    const members = Store.getMembers();
    const memKeys = Object.keys(members).sort((a, b) => (members[a].first || "").localeCompare(members[b].first || ""));
    const dt = (ts) => ts ? new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "–";
    const tabs = [
      ["requests", "Members", "teams"],
      ["scouters", "Scouters", "user"],
      ["bagelbucks", "Bagel Bucks", "bagel"],
      ["matchform", "Match form", "binoculars"],
      ["pitform", "Pit form", "clipboard"],
      ["testevent", "Test event", "flag"],
      ["data", "Data", "database"],
    ];
    const sub = adminSub();
    const active = tabs.some((t) => t[0] === sub) ? sub : "requests";

    // ---- Section: Requests & members ----
    const requestsHTML = `
      ${reqKeys.length ? `
      <div class="card request-banner" style="margin-bottom:18px">
        <div class="row between" style="align-items:flex-start">
          <div class="row" style="gap:10px">${icon("bell")}
            <div><h2 style="margin:0">${reqKeys.length} access request${reqKeys.length > 1 ? "s" : ""} pending</h2>
              <p class="hint" style="margin:4px 0 0">These people registered with the Registry Key. Approve to let them create their password, or deny to dismiss.</p></div>
          </div>
        </div>
        <div class="req-list" style="margin-top:14px">
          ${reqKeys.map((key) => `<div class="req-item">
            <div class="row" style="gap:10px">${icon("user")}
              <div><b>${esc(requests[key].first)} ${esc(requests[key].last)}</b>
                <div class="hint">signed in ${esc(dt(requests[key].ts))}</div></div></div>
            <div class="btn-row" style="flex-wrap:nowrap">
              <button class="btn secondary sm" data-approve="${esc(key)}">${icon("check")} Approve</button>
              <button class="btn danger sm" data-deny="${esc(key)}">${icon("x")} Deny</button>
            </div></div>`).join("")}
        </div>
      </div>` : `
      <div class="card" style="margin-bottom:18px"><div class="row" style="gap:10px">
        <span class="badge green dot">All clear</span><span class="hint">No pending access requests.</span></div></div>`}

      <div class="card">
        <div class="section-head">
          <div class="row" style="gap:10px">${icon("teams")}<h2 style="margin:0">Registered members (${memKeys.length})</h2></div>
          <button class="btn ghost sm" id="addMemberBtn">${icon("plus")} Add member</button>
        </div>
        ${memKeys.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Password</th><th>First seen</th><th>Last seen</th><th></th></tr></thead>
          <tbody>${memKeys.map((key) => {
            const sid = Store.scouterIdFor(members[key].first, members[key].last);
            const hasPw = adminCredIds ? adminCredIds.has(sid) : null;
            return `<tr>
            <td><b>${esc(members[key].first)} ${esc(members[key].last)}</b></td>
            <td>${hasPw == null ? `<span class="muted">${Cloud.enabled() ? "…" : "–"}</span>` : hasPw
              ? `<span class="badge green">Set</span> <button class="btn ghost sm" data-resetpw="${esc(sid)}" data-name="${esc(members[key].first + " " + members[key].last)}">${icon("key")} Reset</button>`
              : `<span class="badge">Not set</span>`}</td>
            <td class="muted">${esc(dt(members[key].firstSeen))}</td>
            <td class="muted">${esc(dt(members[key].lastSeen))}</td>
            <td><button class="icon-btn" data-remove="${esc(key)}" aria-label="Remove member">${icon("trash")}</button></td>
          </tr>`; }).join("")}</tbody></table></div>
          <p class="hint" style="margin:10px 2px 0">Reset clears a member's password and signs them out everywhere. They create a new one on their next login.</p>`
          : emptyState("user", "No members yet", "Approve access requests above, or add members manually.")}
      </div>

      <div class="card" style="margin-top:16px">
        <div class="row" style="gap:10px;margin-bottom:6px">${icon("database")}<h3 style="margin:0">Shared roster & forms</h3></div>
        <p class="hint">The roster, match form and pit form are <b>synced through the cloud</b>, so every scout
        shares the same members, access requests and questions in realtime. Approvals and new questions you make
        here appear on everyone's device automatically.</p>
      </div>`;

    // ---- Section: Bagel Bucks ----
    const bagelBucksHTML = (() => {
      const s = Store.getSettings();
      const evk = s.eventKey || "";
      const approved = Store.isBBApproved(evk);
      const scs = allScouters().slice().sort((a, b) => (b.bb || 0) - (a.bb || 0) || scouterName(a).localeCompare(scouterName(b)));
      return `<div class="card">
        <div class="section-head"><div class="row" style="gap:10px">${icon("star")}<h2 style="margin:0">Bagel Bucks (BB)</h2></div>
          ${evk ? `<span class="badge ${approved ? "green" : ""} dot">${approved ? "Approved" : "Not approved"}</span>` : ""}</div>
        <p class="hint">Once you approve an event, <b>every</b> scout earns <b>BB</b> on any device — 10 BB per match, 5 BB per new team pit-scouted — until you turn it off. BB is tied to the account and shared across devices.</p>
        ${evk ? `<div class="row between" style="align-items:center;gap:12px;flex-wrap:wrap">
          <div><b>${esc(evk)}</b></div>
          <button class="btn ${approved ? "danger" : "primary"} sm" id="bbApproveBtn">${approved ? "Turn off earning" : "Approve for BB earning (everyone)"}</button>
        </div>`
          : `<p class="hint">Pick an event on the Dashboard first, then approve it here.</p>`}
      </div>
      <div class="card" style="margin-top:16px">
        <div class="row" style="gap:10px;margin-bottom:6px">${icon("star")}<h3 style="margin:0">Adjust a scouter's BB</h3></div>
        <p class="hint">Manually add or remove Bagel Bucks from any account. Applies to that account on every device.</p>
        ${scs.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Scouter</th><th class="num">BB</th><th>Adjust</th></tr></thead>
          <tbody>${scs.map((sc) => `<tr>
            <td><b>${esc(scouterName(sc))}</b></td>
            <td class="num">${sc.bb || 0}</td>
            <td><div class="row" style="gap:6px;flex-wrap:nowrap;align-items:center">
              <input type="number" class="bb-amt" value="10" style="width:68px;min-width:0" aria-label="Amount" />
              <button class="btn secondary sm" data-bbadd="${esc(sc.id)}">+ Add</button>
              <button class="btn ghost sm" data-bbsub="${esc(sc.id)}">− Remove</button>
            </div></td></tr>`).join("")}</tbody></table></div>`
          : `<p class="hint">No scouters yet.</p>`}
      </div>`;
    })();

    // ---- Section: Scouters (remove accounts / clean up duplicates) ----
    const scoutersHTML = (() => {
      const meId = Store.getMe().id;
      const scs = allScoutersRaw().slice().sort((a, b) =>
        scouterName(a).localeCompare(scouterName(b)) || (b.lastSeen || 0) - (a.lastSeen || 0));
      const nameCount = {};
      scs.forEach((s) => { const kk = Store.nameKey(s.first, s.last); nameCount[kk] = (nameCount[kk] || 0) + 1; });
      return `<div class="card">
        <div class="section-head">
          <div class="row" style="gap:10px">${icon("user")}<h2 style="margin:0">Scouter accounts (${scs.length})</h2></div>
        </div>
        <p class="hint">Every scouter profile that shows up on the Members leaderboard. Use this to
          delete unwanted or leftover <b>duplicate</b> accounts — removing one deletes its cloud
          profile plus any pick list / tier list it submitted. Match &amp; pit records are kept.
          ${Cloud.enabled() ? "" : `<br><span class="badge red dot">Cloud off</span> Deletes apply to this device only until cloud sync is on.`}</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>${BB}</th><th>Matches</th><th>Pits</th><th>Last seen</th><th></th></tr></thead>
          <tbody>${scs.map((s) => {
            const dup = nameCount[Store.nameKey(s.first, s.last)] > 1;
            const isMe = s.id === meId;
            return `<tr>
              <td><div class="row" style="gap:8px;align-items:center">${scouterAvatar(s, "sc-avatar sm")}
                <b>${esc(scouterName(s))}</b>${isMe ? ` <span class="badge cyan">You</span>` : ""}${dup ? ` <span class="badge">dup</span>` : ""}</div></td>
              <td class="num">${s.bb || 0}</td>
              <td class="num">${matchCountOf(s)}</td>
              <td class="num">${pitCountOf(s)}</td>
              <td class="muted">${s.lastSeen ? esc(timeAgo(s.lastSeen)) : "–"}</td>
              <td><button class="icon-btn" data-del-scouter="${esc(s.id)}" data-scouter-name="${esc(scouterName(s))}" aria-label="Remove scouter">${icon("trash")}</button></td>
            </tr>`;
          }).join("")}</tbody></table></div>
      </div>`;
    })();

    // ---- Section: Pit form ----
    const pitFormHTML = `
      <div class="card">
        <div class="section-head">
          <div class="row" style="gap:10px">${icon("wrench")}<h2 style="margin:0">Pit scouting form</h2></div>
          <div class="btn-row">
            <button class="btn ghost sm" id="addPitField">${icon("plus")} Add question</button>
            ${Store.getPitSchema() ? `<button class="btn ghost sm" id="resetPitForm">Reset to default</button>` : ""}
          </div>
        </div>
        <p class="hint">${Store.getPitSchema() ? "<b>Custom form active.</b>" : "Using the default form."}
          Build your own pit questions — text, numbers, dropdowns, counters, ratings and yes/no toggles.
          Changes sync to every scout's device through the cloud.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Question</th><th>Type</th><th>Options</th><th></th></tr></thead>
          <tbody>${pitFields().map((f, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td><b>${esc(f.label)}</b>${f.help ? `<br><span class="hint">${esc(f.help)}</span>` : ""}</td>
            <td><span class="badge">${esc(f.type)}</span></td>
            <td class="muted">${f.options ? esc(f.options.join(", ")) : "–"}</td>
            <td class="row" style="gap:6px;flex-wrap:nowrap">
              <button class="icon-btn sm" data-pf-up="${i}" aria-label="Move up">↑</button>
              <button class="icon-btn sm" data-pf-down="${i}" aria-label="Move down">↓</button>
              <button class="icon-btn sm" data-pf-edit="${i}" aria-label="Edit">${icon("edit")}</button>
              <button class="icon-btn sm" data-pf-del="${i}" aria-label="Delete">${icon("trash")}</button>
            </td></tr>`).join("")}</tbody></table></div>
      </div>`;

    // ---- Section: Match form ----
    const matchFormHTML = `
      <div class="card">
        <div class="section-head">
          <div class="row" style="gap:10px">${icon("clipboard")}<h2 style="margin:0">Match scouting form</h2></div>
          <div class="btn-row">
            <button class="btn ghost sm" id="addMatchField">${icon("plus")} Add question</button>
            ${Store.getMatchSchema() ? `<button class="btn ghost sm" id="resetMatchForm">Reset to default</button>` : ""}
          </div>
        </div>
        <p class="hint">${Store.getMatchSchema() ? "<b>Custom form active.</b>" : "Using the default REBUILT form."}
          Edit the questions scouts fill in during matches. Changes sync to every scout's device through the cloud.</p>
        <div class="field" style="max-width:340px">
          <label>Match-list summary column</label>
          <span class="help">Extra column shown in the match records list.</span>
          <select id="matchListStatSel">
            <option value="" ${!Store.getSettings().matchListStat ? "selected" : ""}>None</option>
            ${matchFields().map((f) => `<option value="${esc(f.key)}" ${Store.getSettings().matchListStat === f.key ? "selected" : ""}>${esc(f.label)}</option>`).join("")}
          </select>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Question</th><th>Phase</th><th>Type</th><th>Options</th><th></th></tr></thead>
          <tbody>${matchFields().map((f, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td><b>${esc(f.label)}</b>${f.help ? `<br><span class="hint">${esc(f.help)}</span>` : ""}</td>
            <td><span class="badge cyan">${esc(f.phase || "post")}</span></td>
            <td><span class="badge">${esc(f.type)}</span></td>
            <td class="muted">${f.options ? esc(f.options.join(", ")) : "–"}</td>
            <td class="row" style="gap:6px;flex-wrap:nowrap">
              <button class="icon-btn sm" data-mf-up="${i}" aria-label="Move up">↑</button>
              <button class="icon-btn sm" data-mf-down="${i}" aria-label="Move down">↓</button>
              <button class="icon-btn sm" data-mf-edit="${i}" aria-label="Edit">${icon("edit")}</button>
              <button class="icon-btn sm" data-mf-del="${i}" aria-label="Delete">${icon("trash")}</button>
            </td></tr>`).join("")}</tbody></table></div>
      </div>`;

    // ---- Section: Test event ----
    const testEventHTML = (() => {
      const s = Store.getSettings();
      const te = s.testEvent;
      const isActive = s.eventKey === TEST_EVENT_KEY;
      return `<div class="card">
        <div class="section-head"><div class="row" style="gap:10px">${icon("flag")}<h2 style="margin:0">Test event</h2></div>
          ${te ? `<span class="badge ${isActive ? "green" : ""} dot">${isActive ? "Active now" : "Ready"}</span>` : ""}</div>
        <p class="hint">Builds a practice event that mirrors <b>CA Glendale (2026cagle)</b> — the same teams, with a synthesized qualification schedule — so you can rehearse the live match flow. Pick which qualification is <b>about to start</b>: earlier quals are marked played (with sample scores), later ones show as upcoming.</p>
        ${te ? `
          <div class="row between" style="align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
            <div><b>${esc(te.srcName || "CA Glendale")}</b> <span class="hint">· ${te.teams} teams · ${te.total} quals</span></div>
            ${isActive ? `<span class="badge green dot">Selected as current event</span>`
              : `<button class="btn primary sm" id="teActivate">Activate this event</button>`}
          </div>
          <div class="field" style="max-width:460px">
            <label>Qualification about to start</label>
            <span class="help">Q${te.currentQual} is next; Q1–Q${Math.max(0, te.currentQual - 1)} are marked played.</span>
            <div class="row" style="gap:8px;align-items:center">
              <button class="btn ghost sm" id="teMinus" aria-label="Previous qual">−</button>
              <input type="number" id="teQual" value="${te.currentQual}" min="1" max="${te.total + 1}" style="max-width:110px;text-align:center" />
              <button class="btn ghost sm" id="tePlus" aria-label="Next qual">+</button>
              <button class="btn secondary sm" id="teSetQual">${icon("check")} Set</button>
            </div>
          </div>
          <div class="btn-row" style="margin-top:16px">
            <button class="btn ghost sm" id="teRebuild">Rebuild from CA Glendale</button>
            <button class="btn danger sm" id="teDelete">${icon("trash")} Delete test event</button>
          </div>`
        : `<div class="btn-row"><button class="btn primary" id="teCreate">${icon("plus")} Create test event</button></div>
           <p class="hint" style="margin-top:10px">Needs CA Glendale's team list cached first — open the event picker and load <b>2026cagle</b> once (with wifi).</p>`}
      </div>`;
    })();

    // ---- Section: Data / danger zone ----
    const dataHTML = (() => {
      const cloudOn = Cloud.enabled();
      return `<div class="card" style="border-color:rgba(255,90,90,.4)">
        <div class="row" style="gap:10px;margin-bottom:6px">${icon("trash")}<h2 style="margin:0">Danger zone</h2></div>
        <p class="hint">Permanently deletes <b>all shared scouting data</b> from the cloud — every match record, pit record, submitted pick list and tier list, across every device. The roster and form questions are kept. This can't be undone.</p>
        ${cloudOn
          ? `<button class="btn danger" id="clearCloudBtn">${icon("trash")} Clear all cloud scouting data</button>`
          : `<p class="hint"><span class="badge red dot">Cloud off</span> Enable cloud sync in <code>js/config.js</code> to manage shared data.</p>`}
      </div>`;
    })();

    const sectionHTML = {
      requests: requestsHTML, scouters: scoutersHTML, bagelbucks: bagelBucksHTML,
      matchform: matchFormHTML, pitform: pitFormHTML,
      testevent: testEventHTML, data: dataHTML,
    };

    const pwSet = adminCredIds ? memKeys.filter((kk) => adminCredIds.has(Store.scouterIdFor(members[kk].first, members[kk].last))).length : null;
    root.innerHTML = `
      ${pageHero({ ic: "shield", eyebrow: "Admin panel", title: "Team control room",
        sub: "Approve members, reset passwords, edit the scouting forms and manage Bagel Bucks.",
        side: `<div class="ad-stats">
          <a href="#/admin/requests" class="${reqKeys.length ? "hot" : ""}"><b>${reqKeys.length}</b><span>pending</span></a>
          <a href="#/admin/requests"><b>${memKeys.length}</b><span>members</span></a>
          <a href="#/admin/requests"><b>${pwSet == null ? "…" : pwSet}</b><span>passwords set</span></a>
        </div>` })}
      <div class="subtabs" id="adminTabs">
        ${tabs.map(([kk, l, ic]) => `<a href="#/admin/${kk}" class="${active === kk ? "on" : ""}">${icon(ic)} ${esc(l)}${kk === "requests" && reqKeys.length ? ` <span class="ad-badge">${reqKeys.length}</span>` : ""}</a>`).join("")}
      </div>
      <div id="adminBody">${sectionHTML[active] || requestsHTML}</div>`;

    // ---- Test event handlers ----
    const doBuildTestEvent = async () => {
      toast("Building test event…");
      try { await buildTestEvent(); toast("Test event ready"); renderAdmin(root); }
      catch (e) { toast(e.message || "Couldn't build test event", "err"); }
    };
    const teCreate = $("#teCreate", root);
    if (teCreate) teCreate.onclick = doBuildTestEvent;
    const teRebuild = $("#teRebuild", root);
    if (teRebuild) teRebuild.onclick = () => confirmDialog("Rebuild the test event from CA Glendale's current team list? The qualification counter resets to Q1.", doBuildTestEvent);
    const teActivate = $("#teActivate", root);
    if (teActivate) teActivate.onclick = () => { selectEvent(TEST_EVENT_KEY, TEST_EVENT_NAME); };
    const teQual = $("#teQual", root);
    const setTestQual = (v) => {
      applyTestTime(v);
      const te2 = Store.getSettings().testEvent || {};
      if (window.Cloud && Cloud.enabled()) { lastTestEventTs = Date.now(); Cloud.pushTestQual(te2.currentQual, te2.total); }
      toast("Q" + te2.currentQual + " is now up next"); renderAdmin(root);
    };
    const teSet = $("#teSetQual", root);
    if (teSet && teQual) teSet.onclick = () => setTestQual(teQual.value);
    const teMinus = $("#teMinus", root);
    if (teMinus && teQual) teMinus.onclick = () => setTestQual((Number(teQual.value) || 1) - 1);
    const tePlus = $("#tePlus", root);
    if (tePlus && teQual) tePlus.onclick = () => setTestQual((Number(teQual.value) || 1) + 1);
    const teDelete = $("#teDelete", root);
    if (teDelete) teDelete.onclick = () => confirmDialog("Delete the test event? Its synthesized schedule and cached teams are removed.", () => {
      const wasActive = Store.getSettings().eventKey === TEST_EVENT_KEY;
      Store.setSettings({ testEvent: null });
      Store.setCache("matches." + TEST_EVENT_KEY, null);
      Store.setCache("teams." + TEST_EVENT_KEY, null);
      Store.setCache("testTemplate", null);
      if (wasActive) Store.setSettings({ eventKey: "", eventName: "" });
      cloudTestSeen = false; lastTestEventTs = 0;
      if (window.Cloud && Cloud.enabled()) Cloud.clearTestEvent();
      toast("Test event deleted"); refreshChrome(); renderAdmin(root);
    });

    // ---- Danger zone handler ----
    const clearCloudBtn = $("#clearCloudBtn", root);
    if (clearCloudBtn) clearCloudBtn.onclick = () => confirmDialog(
      "Delete ALL shared scouting data from the cloud (matches, pits, pick lists, tier lists) for every device? This can't be undone.",
      () => {
        toast("Clearing cloud data…");
        Cloud.clearAllScoutingData()
          .then(() => { toast("Cloud scouting data cleared"); renderAdmin(root); })
          .catch((e) => toast(e && e.message === "cloud off" ? "Cloud sync is off" : "Couldn't clear cloud data", "err"));
      });

    const bbBtn = $("#bbApproveBtn", root);
    if (bbBtn) bbBtn.onclick = () => {
      const evk = Store.getSettings().eventKey || "";
      const on = !Store.isBBApproved(evk);
      Store.approveBBEvent(evk, on);
      Cloud.pushBBApproved(Store.getBBApproved()); // team-wide: every device earns BB for it
      toast(on ? "BB earning approved for this event (team-wide)" : "BB earning turned off");
      renderAdmin(root);
    };
    const bbAmt = (btn) => { const r = btn.closest("tr"); const i = r && r.querySelector(".bb-amt"); return Math.abs(Math.floor(Number(i && i.value) || 0)); };
    $$("[data-bbadd]", root).forEach((b) => b.onclick = () => { const amt = bbAmt(b); if (!amt) return toast("Enter an amount", "err"); Cloud.addBB(amt, b.dataset.bbadd); toast(`+${amt} BB added`); });
    $$("[data-bbsub]", root).forEach((b) => b.onclick = () => { const amt = bbAmt(b); if (!amt) return toast("Enter an amount", "err"); Cloud.addBB(-amt, b.dataset.bbsub); toast(`−${amt} BB removed`); });

    $$("[data-approve]", root).forEach((b) => b.onclick = () => { Store.approveMember(b.dataset.approve); Cloud.pushRoster(); toast("Member approved"); renderAdmin(root); refreshChrome(); });
    $$("[data-deny]", root).forEach((b) => b.onclick = () => { Store.denyRequest(b.dataset.deny); Cloud.pushRoster(); toast("Request denied"); renderAdmin(root); refreshChrome(); });
    $$("[data-remove]", root).forEach((b) => b.onclick = () =>
      confirmDialog("Remove this member from the roster?", () => {
        const m = Store.getMembers()[b.dataset.remove];
        Store.removeMember(b.dataset.remove); Cloud.pushRoster();
        if (m && Cloud.enabled()) { const sid = Store.scouterIdFor(m.first, m.last); Cloud.deleteCred(sid).catch(() => {}); if (adminCredIds) adminCredIds.delete(sid); }
        toast("Member removed"); renderAdmin(root);
      }));
    $$("[data-resetpw]", root).forEach((b) => b.onclick = () =>
      confirmDialog(`Reset ${b.dataset.name}'s password? They'll be signed out and must create a new one at their next login.`, () => {
        Cloud.deleteCred(b.dataset.resetpw)
          .then(() => { if (adminCredIds) adminCredIds.delete(b.dataset.resetpw); toast("Password reset"); renderAdmin(root); })
          .catch(() => toast("Couldn't reset — check your connection", "err"));
      }));
    $$("[data-del-scouter]", root).forEach((b) => b.onclick = () => {
      const id = b.dataset.delScouter, nm = b.dataset.scouterName || "this scouter";
      confirmDialog(`Delete the scouter account "${nm}"? This removes their profile from the leaderboard for everyone (their match & pit records are kept).`, () => {
        Store.removeAccountById(id);
        const done = () => { toast("Scouter removed"); renderAdmin(root); };
        if (Cloud.enabled()) Cloud.deleteScouter(id).then(done).catch(() => { toast("Removed locally; cloud delete failed", "err"); renderAdmin(root); });
        else done();
      });
    });
    const addBtn = $("#addMemberBtn", root);
    if (addBtn) addBtn.onclick = () => {
      modal("Add member", `
        <div class="login-names"><div class="field"><label>First name</label><input id="amFirst" /></div>
        <div class="field"><label>Last name</label><input id="amLast" /></div></div>
        <button class="btn primary" id="amSave">${icon("check")} Add to roster</button>`, (body, close) => {
        $("#amSave", body).onclick = () => {
          const f = $("#amFirst", body).value.trim(), l = $("#amLast", body).value.trim();
          if (!f || !l) { toast("Enter a first and last name", "err"); return; }
          Store.addMember(f, l); Cloud.pushRoster(); close(); toast("Member added"); renderAdmin(root);
        };
      });
    };

    // ---- Pit form builder ----
    const workingSchema = () => ((Cloud.enabled() && Cloud.getPitForm()) || Store.getPitSchema() || GAME.pitFields).map((f) => ({ ...f }));
    const commitSchema = (arr) => { Store.setPitSchema(arr); Cloud.pushPitForm(arr); renderAdmin(root); };
    const uniqueKey = (label, schema) => {
      let base = "pf_" + (label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "field");
      let key = base, n = 1; const keys = new Set(schema.map((f) => f.key));
      while (keys.has(key)) key = base + "_" + (n++);
      return key;
    };
    const addPF = $("#addPitField", root);
    if (addPF) addPF.onclick = () => openPitFieldEditor(null);
    const resetPF = $("#resetPitForm", root);
    if (resetPF) resetPF.onclick = () => confirmDialog("Reset the pit form back to the default questions? Your custom questions will be removed (saved pit data is kept).",
      () => { Store.clearPitSchema(); Cloud.clearPitForm(); toast("Pit form reset to default"); renderAdmin(root); });
    $$("[data-pf-up]", root).forEach((b) => b.onclick = () => { const i = +b.dataset.pfUp; if (i <= 0) return; const a = workingSchema(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; commitSchema(a); });
    $$("[data-pf-down]", root).forEach((b) => b.onclick = () => { const i = +b.dataset.pfDown; const a = workingSchema(); if (i >= a.length - 1) return; [a[i + 1], a[i]] = [a[i], a[i + 1]]; commitSchema(a); });
    $$("[data-pf-edit]", root).forEach((b) => b.onclick = () => openPitFieldEditor(+b.dataset.pfEdit));
    $$("[data-pf-del]", root).forEach((b) => b.onclick = () => confirmDialog("Delete this question?", () => { const a = workingSchema(); a.splice(+b.dataset.pfDel, 1); commitSchema(a); toast("Question deleted"); }));

    function openPitFieldEditor(index) {
      const schema = workingSchema();
      const editing = index != null;
      const f = editing ? schema[index] : { label: "", type: "text" };
      const types = ["text", "number", "bool", "select", "counter", "rating"];
      const typeLabels = { text: "Text / notes", number: "Number", bool: "Yes / No toggle", select: "Dropdown", counter: "Counter (+/−)", rating: "Star rating (1–5)" };
      modal(editing ? "Edit question" : "Add question", `
        <div class="field"><label>Question / label</label><input id="pfLabel" value="${esc(f.label || "")}" placeholder="e.g. Can it climb the tower?" /></div>
        <div class="field"><label>Answer type</label>
          <select id="pfType">${types.map((t) => `<option value="${t}" ${f.type === t ? "selected" : ""}>${typeLabels[t]}</option>`).join("")}</select></div>
        <div class="field" id="pfOptWrap" ${f.type === "select" ? "" : "hidden"}>
          <label>Dropdown options (one per line)</label>
          <textarea id="pfOptions" placeholder="Swerve&#10;Tank&#10;Mecanum">${esc((f.options || []).join("\n"))}</textarea></div>
        <div class="field"><label>Help text (optional)</label><input id="pfHelp" value="${esc(f.help || "")}" placeholder="Shown under the question" /></div>
        <div class="btn-row"><button class="btn primary" id="pfSave">${icon("check")} ${editing ? "Save changes" : "Add question"}</button></div>`,
        (body, close) => {
          const typeSel = $("#pfType", body);
          typeSel.onchange = () => { $("#pfOptWrap", body).hidden = typeSel.value !== "select"; };
          $("#pfSave", body).onclick = () => {
            const label = $("#pfLabel", body).value.trim();
            if (!label) { toast("Enter a question", "err"); return; }
            const type = typeSel.value;
            let options;
            if (type === "select") {
              options = $("#pfOptions", body).value.split("\n").map((x) => x.trim()).filter(Boolean);
              if (!options.length) { toast("Add at least one dropdown option", "err"); return; }
            }
            const help = $("#pfHelp", body).value.trim();
            const field = { key: editing ? f.key : uniqueKey(label, schema), label, type };
            if (options) field.options = options;
            if (help) field.help = help;
            if (type === "rating") field.max = 5;
            if (type === "counter" || type === "number") field.min = 0;
            if (editing) schema[index] = field; else schema.push(field);
            close(); commitSchema(schema); toast(editing ? "Question updated" : "Question added");
          };
        });
    }

    // ---- Match form builder ----
    const workingMatch = () => ((Cloud.enabled() && Cloud.getMatchForm()) || Store.getMatchSchema() || GAME.matchFields).map((f) => {
      const o = { ...f }; delete o.points; return o; // strip non-serializable fn
    });
    const commitMatch = (arr) => { Store.setMatchSchema(arr); Cloud.pushMatchForm(arr); renderAdmin(root); };
    const mlSel = $("#matchListStatSel", root);
    if (mlSel) mlSel.onchange = () => { Store.setSettings({ matchListStat: mlSel.value }); toast("Match-list column updated"); };
    const addMF = $("#addMatchField", root);
    if (addMF) addMF.onclick = () => openMatchFieldEditor(null);
    const resetMF = $("#resetMatchForm", root);
    if (resetMF) resetMF.onclick = () => confirmDialog("Reset the match form to the default REBUILT questions? (Saved match data is kept.)",
      () => { Store.clearMatchSchema(); Cloud.clearMatchForm(); toast("Match form reset to default"); renderAdmin(root); });
    $$("[data-mf-up]", root).forEach((b) => b.onclick = () => { const i = +b.dataset.mfUp; if (i <= 0) return; const a = workingMatch(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; commitMatch(a); });
    $$("[data-mf-down]", root).forEach((b) => b.onclick = () => { const i = +b.dataset.mfDown; const a = workingMatch(); if (i >= a.length - 1) return; [a[i + 1], a[i]] = [a[i], a[i + 1]]; commitMatch(a); });
    $$("[data-mf-edit]", root).forEach((b) => b.onclick = () => openMatchFieldEditor(+b.dataset.mfEdit));
    $$("[data-mf-del]", root).forEach((b) => b.onclick = () => confirmDialog("Delete this match question?", () => { const a = workingMatch(); a.splice(+b.dataset.mfDel, 1); commitMatch(a); toast("Question deleted"); }));

    function openMatchFieldEditor(index) {
      const schema = workingMatch();
      const editing = index != null;
      const f = editing ? schema[index] : { label: "", type: "counter", phase: "active" };
      const types = ["counter", "number", "bool", "select", "rating", "text"];
      const typeLabels = { text: "Text / notes", number: "Number", bool: "Yes / No toggle", select: "Dropdown", counter: "Counter (+/−)", rating: "Star rating (1–5)" };
      const phases = GAME.matchPhases; // auto/active/inactive/endgame/post
      modal(editing ? "Edit match question" : "Add match question", `
        <div class="field"><label>Question / label</label><input id="mfLabel" value="${esc(f.label || "")}" placeholder="e.g. Algae scored" /></div>
        <div class="login-names">
          <div class="field"><label>Phase</label><select id="mfPhase">${phases.map((p) => `<option value="${p.id}" ${(f.phase || "post") === p.id ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</select></div>
          <div class="field"><label>Answer type</label><select id="mfType">${types.map((t) => `<option value="${t}" ${f.type === t ? "selected" : ""}>${typeLabels[t]}</option>`).join("")}</select></div>
        </div>
        <div class="field" id="mfOptWrap" ${f.type === "select" ? "" : "hidden"}>
          <label>Dropdown options (one per line)</label>
          <textarea id="mfOptions" placeholder="None&#10;Level 1&#10;Level 2">${esc((f.options || []).join("\n"))}</textarea></div>
        <div class="field"><label>Help text (optional)</label><input id="mfHelp" value="${esc(f.help || "")}" /></div>
        <div class="btn-row"><button class="btn primary" id="mfSave">${icon("check")} ${editing ? "Save changes" : "Add question"}</button></div>`,
        (body, close) => {
          const typeSel = $("#mfType", body);
          const updHelp = () => { $("#mfOptWrap", body).hidden = typeSel.value !== "select"; };
          updHelp(); typeSel.onchange = updHelp;
          $("#mfSave", body).onclick = () => {
            const label = $("#mfLabel", body).value.trim();
            if (!label) { toast("Enter a question", "err"); return; }
            const type = typeSel.value;
            let options;
            if (type === "select") {
              options = $("#mfOptions", body).value.split("\n").map((x) => x.trim()).filter(Boolean);
              if (!options.length) { toast("Add at least one option", "err"); return; }
            }
            const field = { key: editing ? f.key : uniqueKey(label, schema), label, type, phase: $("#mfPhase", body).value };
            if (options) field.options = options;
            const help = $("#mfHelp", body).value.trim(); if (help) field.help = help;
            if (type === "rating") field.max = 5;
            if (type === "counter" || type === "number") field.min = 0;
            if (editing) schema[index] = field; else schema.push(field);
            close(); commitMatch(schema); toast(editing ? "Question updated" : "Question added");
          };
        });
    }
  }

  /* ===========================================================================
     VIEW: SETTINGS
     ======================================================================== */
  function renderSettings(root) {
    const s = Store.getSettings();
    const u = Auth.currentUser();
    root.innerHTML = `
      ${pageHero({ ic: "settings", eyebrow: "Settings", title: "Make it yours", sub: "Theme, season and data connections for this device." })}
      <div class="st-grid">
        <section class="card st-card">
          <div class="sr-head"><h3>${icon("sun")} Appearance</h3></div>
          <div class="st-theme" id="setTheme">
            <button data-v="dark" class="st-theme-opt dark${s.theme !== "light" ? " on" : ""}"><span class="st-swatch"></span><b>Dark</b><span>Easy on the eyes in the stands</span></button>
            <button data-v="light" class="st-theme-opt light${s.theme === "light" ? " on" : ""}"><span class="st-swatch"></span><b>Light</b><span>Bright pits &amp; outdoors</span></button>
          </div>
        </section>
        <section class="card st-card">
          <div class="sr-head"><h3>${icon("user")} Account</h3></div>
          <div class="st-acct">
            ${scouterAvatar(Store.getMe(), "sc-avatar")}
            <div><b>${esc(u ? u.first + " " + u.last : "Guest")}</b><span class="hint">Signed in on this device</span></div>
            <a class="btn ghost sm" href="#/members/profile">${icon("user")} Profile</a>
          </div>
          <button class="btn danger sm" id="stLogout" style="margin-top:12px">${icon("logout")} Log out</button>
        </section>
      </div>

      <section class="card st-card" style="margin-top:16px">
        <div class="sr-head"><h3>${icon("clock")} Season</h3><span class="badge yellow">Viewing ${esc(GAME.seasonLabel)}</span></div>
        <p class="hint" style="margin-top:0">Each year's scouting, pit data, forms, stats, EPA and pick lists are kept completely separate, and switching never deletes anything.
          Accounts and Bagel Bucks are shared by every year. This only changes the year on <b>this device</b>.</p>
        <div class="season-tiles">
          ${(window.SEASONS || [GAME]).map((g) => `
            <button class="season-tile${g.season === GAME.season ? " on" : ""}" data-season="${g.season}" ${g.season === GAME.season ? 'aria-current="true"' : ""}>
              <span class="st-year">${g.season}</span>
              <span class="st-name">${esc(g.name)}</span>
              <span class="st-state">${g.season === GAME.season ? `${icon("check")} Viewing` : "Switch to this year"}</span>
            </button>`).join("")}
        </div>
      </section>

      <section class="card st-card" style="margin-top:16px">
        <div class="sr-head"><h3>${icon("globe")} The Blue Alliance</h3>
          ${API.hasKey() ? `<span class="badge green dot">Connected</span>` : `<span class="badge red dot">No key set</span>`}</div>
        <p class="hint" style="margin-top:0">${API.hasKey() ? "Built-in team key. Scouts don't need to enter anything." : "Paste your key in <code>js/config.js</code>, or add one below for just this device."}
          Events are chosen from the event chip in the sidebar.</p>
        <div class="btn-row">
          <button class="btn ghost sm" id="testKey">${icon("check")} Test connection</button>
          <span id="keyStatus" class="hint"></span>
        </div>
        <details style="margin-top:14px">
          <summary class="hint" style="cursor:pointer">Advanced: use my own key on this device</summary>
          <p class="hint" style="margin-top:8px">Overrides the built-in key, stored only in this browser. Get one at
            <a href="https://www.thebluealliance.com/account" target="_blank" rel="noopener">thebluealliance.com/account</a>.</p>
          <div class="field"><input type="password" id="setKey" value="${esc(s.tbaKey || "")}" placeholder="Paste a Read API key" autocomplete="off" /></div>
          <button class="btn primary sm" id="saveKey">${icon("check")} Save override</button>
        </details>
      </section>`;

    $("#testKey", root).onclick = async () => {
      const st = $("#keyStatus", root);
      if (!API.hasKey()) { st.innerHTML = `<span style="color:var(--danger)">No key set — see js/config.js</span>`; return; }
      st.textContent = "Testing…";
      try { await API.verifyKey(); st.innerHTML = `<span style="color:var(--success)">✓ Connection OK</span>`; toast("The Blue Alliance connected"); }
      catch (e) { st.innerHTML = `<span style="color:var(--danger)">✗ ${e.message === "BAD_KEY" ? "Invalid key" : "Couldn't connect (offline?)"}</span>`; }
    };
    $("#saveKey", root).onclick = () => {
      const key = $("#setKey", root).value.trim();
      Store.setSettings({ tbaKey: key });
      toast(key ? "Personal key saved" : "Override cleared — using built-in key");
      renderSettings(root);
    };
    $$("#setTheme [data-v]", root).forEach((b) => b.onclick = () => {
      $$("#setTheme [data-v]", root).forEach((x) => x.classList.toggle("on", x === b));
      applyTheme(b.dataset.v); Store.setSettings({ theme: b.dataset.v }); refreshChrome();
    });
    $("#stLogout", root).onclick = () => confirmDialog("Log out of the scouting app?", () => Auth.logout());
    $$("[data-season]", root).forEach((b) => b.onclick = () => {
      const y = Number(b.dataset.season);
      if (y === GAME.season) return;
      confirmDialog(`Switch this device to the ${y} season? You'll see ${y}'s data only. ${GAME.season}'s data stays saved and comes back when you switch again. The app will reload.`,
        () => Store.setSeason(y));
    });
  }

  /* ===========================================================================
     Theme + boot
     ======================================================================== */
  function applyTheme(theme) { document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark"); }

  function startApp(loginStatus) {
    const syncNavLock = () => document.body.classList.toggle("nav-lock", app.classList.contains("nav-open"));
    $("#menuBtn").onclick = () => { app.classList.toggle("nav-open"); syncNavLock(); };
    $("#scrim").onclick = () => { app.classList.remove("nav-open"); syncNavLock(); };
    $("#themeToggle").onclick = () => {
      const cur = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
      const next = cur === "light" ? "dark" : "light";
      applyTheme(next); Store.setSettings({ theme: next }); refreshChrome();
    };
    const logoutBtn = $("#logoutBtn");
    if (logoutBtn) logoutBtn.onclick = () => confirmDialog("Log out of the scouting app?", () => Auth.logout());
    const userName = $("#userChipName");
    if (userName) { userName.title = "View your profile"; userName.onclick = () => { location.hash = "#/members/profile/" + Store.getMe().id; }; }
    const chip = $("#eventChip");
    if (chip) { chip.classList.add("clickable"); chip.title = "Click to change event";
      chip.onclick = openEventPicker; }
    $$("#nav a").forEach((a) => a.onclick = (e) => { e.preventDefault(); go(a.dataset.route); });

    window.addEventListener("hashchange", router);
    if (!location.hash) location.hash = "#/dashboard";
    router();

    // Cloud sync (real-time scouters, BB leaderboard, shared lists). No-op if
    // Firebase isn't configured — everything still works locally.
    Cloud.init();
    Auth.checkSession(); // signs this device out if the account's password was reset
    Cloud.syncMe();
    Cloud.heartbeat();
    Cloud.releaseMyClaims(); // a fresh load = no active selection, so clear my old claims
    setInterval(() => Cloud.heartbeat(), 45 * 1000);
    Cloud.onChange(() => {
      const teChanged = applyCloudTestEvent();
      const bbChanged = reconcileBB(); // keep my local BB mirror = the cloud total
      if (teChanged) refreshChrome();
      // NEVER auto-re-render while the user is filling the match/pit ENTRY forms —
      // a background cloud snapshot (another scout's heartbeat/data) would rebuild
      // the form and wipe everything they typed. On the MATCH page we still live-
      // update robot-claim locks; on the PIT page we refresh the shared list + map
      // in place (never the form). Both refresh fully on next visit.
      // If the admin's cloud form arrives (or changes) while the form is still
      // untouched, swap it in; once someone has started filling it, never rebuild.
      const formNow = (id, fields) => { const f = $("#" + id); return f && !f.dataset.dirty && f.dataset.sig !== formSig(fields); };
      if (current() === "match") { if (formNow("matchForm", matchFields())) { router(); return; } refreshRobotClaims(); return; }
      if (current() === "pit") { if (formNow("pitForm", pitFields())) { router(); return; } if (pitPageRefresh) pitPageRefresh(); return; }
      // Data page: only rebuild when records actually changed (heartbeats would
      // otherwise reset the search box and scroll position every few seconds).
      if (current() === "data") {
        const sig = dataSig();
        if (sig === lastDataSig && !teChanged) return;
        lastDataSig = sig;
        const typing = document.activeElement && document.activeElement.id === "dsInput";
        router();
        const inp = typing && $("#dsInput");
        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
        return;
      }
      if (teChanged || bbChanged || ["members", "picklist", "admin", "teams"].includes(current())) router();
    });
    // Global "someone just scouted" popup — show for everyone except the scout who
    // made it (they already got their own toast).
    Cloud.onActivity((a) => { if (a && a.scouterId !== Store.getMe().id) scoutPopup(a); });
    // One-time BB reconcile: Bagel Bucks is now account-based in the cloud. If this
    // device's local total is HIGHER than the cloud's (e.g. the phone you actually
    // scouted on), push it up so no earned BB is lost; otherwise pull the cloud total down.
    setTimeout(() => {
      if (!Cloud.enabled()) return;
      const me = Store.getMe();
      const cm = (Cloud.getScouters() || []).find((s) => s.id === me.id);
      const cloudBb = cm && typeof cm.bb === "number" ? cm.bb : 0;
      if ((me.bb || 0) > cloudBb) Cloud.setBBValue(me.id, me.bb);
      else if (reconcileBB() && current() === "members") router();
    }, 3500);
    // Adopt any already-shared test event on startup.
    setTimeout(() => { if (applyCloudTestEvent()) { refreshChrome(); router(); } }, 1500);
    // NOTE: we intentionally do NOT re-push the whole roster on startup anymore —
    // that re-uploaded stale requests (making denied names reappear). New access
    // requests reach admins via Cloud.pushAccessRequest at login; approve/deny push
    // the authoritative roster immediately.

    if (loginStatus === "new") setTimeout(() => toast("Welcome! Your name was logged for admin review.", "ok"), 400);
  }

  function boot() {
    applyTheme(Store.getSettings().theme);
    if (!Store.storageAvailable()) toast("Local storage is blocked — data won't persist. Export often.", "err");
    // Load robot photos from IndexedDB (and migrate any legacy inline photos out of
    // localStorage), then re-render so photos appear and the quota is freed.
    Store.hydratePhotos().then(() => { if (Auth.isLoggedIn()) router(); }).catch(() => {});
    if (Auth.isLoggedIn()) startApp();
    else Auth.showLogin((status) => startApp(status));
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

