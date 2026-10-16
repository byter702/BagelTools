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
    $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === r));
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
    $("#eventChip").innerHTML = s.eventName
      ? `Event<br><b>${esc(s.eventName)}</b>`
      : `No event selected`;
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

    root.innerHTML = `
      <div class="section">
        <div class="card">
          <h2>Quick actions</h2>
          <div class="btn-row">
            <button class="btn primary" data-go="match">${icon("plus")} New match</button>
            <button class="btn secondary" data-go="pit">${icon("wrench")} Pit scout</button>
            <button class="btn ghost" data-go="bagelstats">${icon("chart")} BagelStats</button>
            <button class="btn ghost" data-go="picklist">${icon("list")} Pick list</button>
            <button class="btn ghost" data-go="data">${icon("download")} Export data</button>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="card event-hero">
          <div class="eh-left">
            <span class="eh-label">${icon("calendar")} Current event</span>
            <span class="eh-name">${s.eventName ? esc(s.eventName) : "No event selected"}</span>
            <span class="hint">${s.eventName
              ? (teams.length ? teams.length + " teams loaded · tap to switch" : "Loaded · tap to switch")
              : "Choose your event to load teams, schedule & stats."}</span>
          </div>
          <button class="btn primary eh-btn" id="chooseEvent">${icon("calendar")} ${s.eventName ? "Change event" : "Choose event"}</button>
        </div>
      </div>

      ${countdownHTML()}

      <div id="liveSection"></div>

      <div class="section grid cols-2">
        ${kpi("Teams at event", teams.length || "–")}
        ${kpi("Teams w/ data", stats.length)}
      </div>

      <div class="section">
        <div class="card">
          <h2>Recent teams scouted</h2>
          ${recentMatchesTable(matches.slice(-6).reverse())}
        </div>
      </div>`;

    $$("[data-go]", root).forEach((b) => b.onclick = () => go(b.dataset.go));
    $$("[data-team]", root).forEach((r) => r.onclick = () => openTeam(r.dataset.team));
    const ce = $("#chooseEvent", root); if (ce) ce.onclick = openEventPicker;
    loadLiveSection(root);
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
  function countdownHTML() {
    const cd = window.CONFIG && window.CONFIG.countdown;
    if (!cd || !cd.date) return "";
    const target = new Date(cd.date + "T00:00:00");
    if (isNaN(target)) return "";
    const now = new Date();
    const days = Math.ceil((target - now) / 86400000);
    const dateStr = target.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    let big, unit;
    if (days > 1) { big = days; unit = "days to go"; }
    else if (days === 1) { big = 1; unit = "day to go"; }
    else if (days === 0) { big = "Today"; unit = "it's here!"; }
    else { big = "—"; unit = "event passed"; }
    return `<div class="section"><div class="card countdown-card">
      <div class="cd-left">
        <span class="cd-label">${icon("calendar")} Countdown</span>
        <span class="cd-event">${esc(cd.label)}</span>
        <span class="hint">${esc(dateStr)}</span>
      </div>
      <div class="cd-num"><span class="cd-days">${big}</span><span class="cd-unit">${unit}</span></div>
    </div></div>`;
  }
  function kpi(label, value, tone = "") {
    return `<div class="card"><div class="kpi">
      <span class="kpi-label">${esc(label)}</span>
      <span class="kpi-value ${tone}">${esc(value)}</span></div></div>`;
  }
  function emptyState(ic, title, sub) {
    return `<div class="empty">${icon(ic, "ico")}<h3>${esc(title)}</h3><p class="muted">${esc(sub)}</p></div>`;
  }
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
  const matchCountOf = (sc) => {
    const id = sc && sc.id;
    const n = id ? allMatches().filter((m) => String(m.scouterId) === String(id)).length : 0;
    return n || (sc && sc.matchCount) || 0;
  };
  const pitCountOf = (sc) => {
    const id = sc && sc.id;
    const n = id ? Object.values(allPits()).filter((p) => String(p.scouterId) === String(id)).length : 0;
    return n || (sc && sc.pitScoutedTeams || []).length || (sc && sc.pitCount) || 0;
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
    return list.length ? list : (sc && sc.lastMatchTeams) || [];
  };
  const lastPitTeamsOf = (sc) => {
    const id = sc && sc.id;
    const list = id ? lastTeamsFrom(Object.values(allPits()), id) : [];
    return list.length ? list : (sc && sc.lastPitTeams) || [];
  };

  function renderMembers(root) {
    const { sub } = memberSub();
    const activeTab = ["profile", "leaderboard", "scouters"].includes(sub) ? sub : "profile";
    const tabs = [["profile", "Profile"], ["leaderboard", "Leaderboard"], ["scouters", "Scouters"]];
    root.innerHTML = `
      <div class="subtabs" id="memberTabs">
        ${tabs.map(([k, l]) => `<a href="#/members/${k}" class="${activeTab === k ? "on" : ""}">${esc(l)}</a>`).join("")}
      </div>
      ${Cloud.enabled() ? "" : `<div class="card cloud-note">${icon("globe")}
        <span>Cloud sync is off, so you'll only see yourself here. A lead can turn it on in <b>js/config.js</b> to share Bagel Bucks, the leaderboard, and live online status across the whole team.</span></div>`}
      <div id="memberBody"></div>`;
    const body = $("#memberBody", root);
    if (activeTab === "leaderboard") renderLeaderboard(body);
    else if (activeTab === "scouters") renderScoutersList(body);
    else renderProfile(body, memberSub().id || Store.getMe().id);
  }

  function renderProfile(body, id) {
    const me = Store.getMe();
    const sc = allScouters().find((s) => s.id === id) || me;
    const isMe = sc.id === me.id;
    const online = isMe || isOnline(sc);
    body.innerHTML = `
      <div class="section">
        <div class="card profile-hero">
          <div class="ph-avatar-wrap">
            ${scouterAvatar(sc, "ph-avatar")}
            ${isMe ? `<button class="btn ghost sm" id="editPic">${icon("edit")} Photo</button>
              <input type="file" id="picInput" accept="image/*" hidden />` : ""}
          </div>
          <div class="ph-info">
            <div class="ph-name">${esc(scouterName(sc))}${isMe ? ` <span class="badge cyan">You</span>` : ""}</div>
            <div class="ph-status"><span class="status-dot ${online ? "on" : ""}"></span>${
              online ? "Online now" : (sc.lastSeen ? "Last seen " + timeAgo(sc.lastSeen) : "Offline")}</div>
          </div>
          <div class="ph-bb"><span class="bb-big">${sc.bb || 0}</span><span class="bb-unit">${BB}</span></div>
        </div>
      </div>
      <div class="section grid cols-3">
        ${kpi("Bagel Bucks", (sc.bb || 0) + " " + BB, "yellow")}
        ${kpi("Matches scouted", matchCountOf(sc), "cyan")}
        ${kpi("Teams pit scouted", pitCountOf(sc))}
      </div>
      <div class="section grid cols-2">
        <div class="card"><h3>Last teams scouted</h3>${teamChips(lastMatchTeamsOf(sc))}</div>
        <div class="card"><h3>Last teams pit scouted</h3>${teamChips(lastPitTeamsOf(sc))}</div>
      </div>`;
    $$("[data-team]", body).forEach((c) => c.onclick = () => openTeam(c.dataset.team));
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
    body.innerHTML = `<div class="section"><div class="lb-list">${scs.map((sc, i) => {
      const online = sc.id === meId || isOnline(sc);
      return `<button class="lb-row" data-id="${esc(sc.id)}">
        <span class="lb-rank">${i + 1}</span>
        ${scouterAvatar(sc, "lb-avatar")}
        <span class="lb-name">${esc(scouterName(sc))}${online ? ` <span class="status-dot on inline"></span>` : ""}</span>
        <span class="lb-bbwrap">
          <span class="lb-bb-row"><span class="lb-bb">${sc.bb || 0}</span><span class="lb-bb-unit">${BB}</span></span>
          <span class="lb-sub">${matchCountOf(sc)} M · ${pitCountOf(sc)} P</span>
        </span>
      </button>`;
    }).join("")}</div></div>`;
    $$("[data-id]", body).forEach((r) => r.onclick = () => { location.hash = "#/members/profile/" + r.dataset.id; });
  }

  function renderScoutersList(body) {
    const meId = Store.getMe().id;
    const scs = allScouters().slice().sort((a, b) => scouterName(a).localeCompare(scouterName(b)));
    body.innerHTML = `<div class="section"><div class="sc-list">${scs.map((sc) => {
      const online = sc.id === meId || isOnline(sc);
      return `<button class="sc-row" data-id="${esc(sc.id)}">
        ${scouterAvatar(sc, "sc-avatar")}
        <span class="sc-name">${esc(scouterName(sc))}</span>
        <span class="sc-status"><span class="status-dot ${online ? "on" : ""}"></span>${
          online ? "Online" : (sc.lastSeen ? timeAgo(sc.lastSeen) : "Offline")}</span>
      </button>`;
    }).join("")}</div></div>`;
    $$("[data-id]", body).forEach((r) => r.onclick = () => { location.hash = "#/members/profile/" + r.dataset.id; });
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
  function renderEventsPage(root) {
    const own = [["list", "Teams"], ["schedule", "Schedule"]];
    const sub = own.some((t) => t[0] === teamsSub()) ? teamsSub() : "list";
    // Stats + Compare are shortcuts that jump to the Event tab of those pages.
    root.innerHTML = `<div class="subtabs" id="evTabs">
      ${own.map(([k, l]) => `<a href="#/teams/${k}" class="${sub === k ? "on" : ""}">${esc(l)}</a>`).join("")}
      <a href="#/bagelstats" id="evStats">Stats</a>
      <a href="#/compare" id="evCompare">Compare</a>
    </div><div id="evBody"></div>`;
    const st = $("#evStats", root); if (st) st.onclick = () => { bagelTab = "event"; };
    const cp = $("#evCompare", root); if (cp) cp.onclick = () => { compareTab = "event"; };
    const body = $("#evBody", root);
    if (sub === "schedule") renderSchedule(body);
    else renderTeamsList(body);
  }

  function renderTeamsList(root) {
    const s = Store.getSettings();
    const teams = eventTeams();
    if (!teams.length) {
      root.innerHTML = `<div class="card">${emptyState("teams", "No team list loaded",
        "Pick your event on the Dashboard to pull every team attending from The Blue Alliance.")}
        <div class="btn-row" style="justify-content:center"><button class="btn primary" data-go="dashboard">${icon("calendar")} Choose event</button></div></div>`;
      $("[data-go]", root).onclick = () => go("dashboard");
      return;
    }
    let epaMap = buildSeasonEpa();
    const epaOf = (num) => epaMap[String(num)] ?? (computeStats(num).avgCycles || 0);
    let rankMap = {}; // team# -> { rank, wr }

    root.innerHTML = `
      <div class="section-head">
        <div class="row"><h2 style="margin:0">${teams.length} teams · ${esc(s.eventName || s.eventKey)}</h2></div>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <div class="pill-toggle" id="teamSort">
            <button data-s="number" class="${teamSort === "number" ? "on" : ""}">#</button>
            <button data-s="name" class="${teamSort === "name" ? "on" : ""}">A–Z</button>
            <button data-s="epa" class="${teamSort === "epa" ? "on" : ""}">EPA</button>
            <button data-s="rank" class="${teamSort === "rank" ? "on" : ""}">Rank</button>
            <button data-s="win" class="${teamSort === "win" ? "on" : ""}">Win%</button>
          </div>
          <input type="search" id="teamSearch" placeholder="Search…" style="min-width:160px" />
        </div>
      </div>
      <div class="team-list" id="teamList"></div>`;

    const listEl = $("#teamList", root);
    function draw(filter = "") {
      const f = filter.toLowerCase();
      const pits = allPits();
      let list = teams.filter((t) => !f ||
        String(t.team_number).includes(f) || (t.nickname || "").toLowerCase().includes(f));
      list = list.slice().sort((a, b) => {
        if (teamSort === "name") return (a.nickname || "").localeCompare(b.nickname || "");
        if (teamSort === "epa") return epaOf(b.team_number) - epaOf(a.team_number);
        if (teamSort === "rank") return ((rankMap[a.team_number] || {}).rank || 1e9) - ((rankMap[b.team_number] || {}).rank || 1e9);
        if (teamSort === "win") return ((rankMap[b.team_number] || {}).wr ?? -1) - ((rankMap[a.team_number] || {}).wr ?? -1);
        return a.team_number - b.team_number;
      });
      listEl.innerHTML = list.map((t) => {
        const n = t.team_number;
        const epa = epaMap[String(n)];
        const rk = rankMap[n] || {};
        const photo = (pits[n] || {}).photo;
        return `<button class="team-row" data-team="${n}">
          <img class="team-avatar tr-icon" data-avatar="${n}" alt="" />
          <span class="tr-robot">${photo ? `<img src="${esc(photo)}" alt="robot" />` : `<span class="tr-robot-ph">${icon("wrench")}</span>`}</span>
          <span class="tr-id"><span class="tr-num">${n}</span><span class="tr-name">${esc(t.nickname || t.name || "")}</span></span>
          <span class="tr-stat"><span class="trs-val">${epa != null ? fmt(epa, 1) : "–"}</span><span class="trs-label">EPA</span></span>
          <span class="tr-stat"><span class="trs-val">${rk.rank ? "#" + rk.rank : "–"}</span><span class="trs-label">Rank</span></span>
          <span class="tr-stat"><span class="trs-val">${rk.wr != null ? Math.round(rk.wr * 100) + "%" : "–"}</span><span class="trs-label">Win</span></span>
        </button>`;
      }).join("") || emptyState("search", "No matches", "Try another search.");
      $$("[data-team]", listEl).forEach((c) => c.onclick = () => openTeam(c.dataset.team));
      paintAvatars(listEl, list.map((t) => t.team_number));
    }
    draw();
    if (!Object.keys(epaMap).length) {
      API.sbYearLeaderboard(GAME.season).then((res) => {
        (res && res.rows || []).forEach((r) => { epaMap[String(r.team)] = r.epa; });
        if (Object.keys(epaMap).length) draw($("#teamSearch", root).value);
      }).catch(() => {});
    }
    // Event rank + win-rate from rankings (TBA, or on-device for the test event).
    if (s.eventKey) API.getEventRankings(s.eventKey).then(({ rankings }) => {
      rankMap = {};
      (rankings || []).forEach((r) => {
        const tn = String(r.team_key).replace("frc", "");
        const rec = r.record || {}; const g = (rec.wins || 0) + (rec.losses || 0) + (rec.ties || 0);
        rankMap[tn] = { rank: r.rank, wr: g ? (rec.wins || 0) / g : null };
      });
      draw($("#teamSearch", root).value);
    }).catch(() => {});

    $("#teamSearch", root).oninput = (e) => draw(e.target.value);
    $$("#teamSort button", root).forEach((b) => b.onclick = () => {
      teamSort = b.dataset.s;
      $$("#teamSort button", root).forEach((x) => x.classList.toggle("on", x === b));
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
    if (!s.eventKey) {
      root.innerHTML = `<div class="card">${emptyState("calendar", "No event selected",
        "Choose your event on the Dashboard to see the match schedule.")}
        <div class="btn-row" style="justify-content:center"><button class="btn primary" data-go="dashboard">${icon("calendar")} Choose event</button></div></div>`;
      $("[data-go]", root).onclick = () => go("dashboard");
      return;
    }
    const quals = all.filter((m) => m.comp_level === "qm");
    const playoffs = all.filter((m) => m.comp_level && m.comp_level !== "qm");
    const byOrder = (a, b) => (COMP_ORDER[a.comp_level] - COMP_ORDER[b.comp_level]) ||
      ((a.set_number || 0) - (b.set_number || 0)) || (a.match_number - b.match_number);
    quals.sort((a, b) => a.match_number - b.match_number);
    playoffs.sort(byOrder);

    const fmtTime = (m) => { const u = m.actual_time || m.predicted_time || m.time; return u ? new Date(u * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""; };
    const teamsOf = (m, c) => (m.alliances[c].team_keys || []).map((k) => k.replace("frc", ""));
    const played = (m) => m.alliances && m.alliances.red.score >= 0 && m.alliances.blue.score >= 0;
    const label = (m) => COMP_LABEL[m.comp_level] + (m.comp_level === "qm" ? m.match_number : (m.set_number || m.match_number));

    const matchRow = (m, idx) => {
      const red = teamsOf(m, "red"), blue = teamsOf(m, "blue");
      const done = played(m);
      const rWon = done && m.alliances.red.score > m.alliances.blue.score;
      const bWon = done && m.alliances.blue.score > m.alliances.red.score;
      return `<button class="sched-row" data-mi="${idx}">
        <span class="sr-label">${esc(label(m))}</span>
        <span class="sr-alliance red ${rWon ? "won" : ""}">${red.map((t) => `<span class="sr-team">${t}</span>`).join("")}</span>
        <span class="sr-score">${done ? `${m.alliances.red.score}<span class="sr-dash">–</span>${m.alliances.blue.score}` : `<span class="sr-time">${esc(fmtTime(m))}</span>`}</span>
        <span class="sr-alliance blue ${bWon ? "won" : ""}">${blue.map((t) => `<span class="sr-team">${t}</span>`).join("")}</span>
      </button>`;
    };

    root.innerHTML = `
      <div class="section-head"><h2 style="margin:0">Schedule · ${esc(s.eventName || s.eventKey)}</h2></div>
      ${!all.length ? `<div class="card">${emptyState("calendar", "No schedule yet", "The match schedule loads once it's posted on The Blue Alliance (needs wifi to fetch).")}</div>` : ""}
      ${quals.length ? `<div class="card"><h3 style="margin-top:0">Qualifications (${quals.length})</h3>
        <div class="sched-list" id="qualList">${quals.map((m) => matchRow(m, all.indexOf(m))).join("")}</div></div>` : ""}
      ${playoffs.length ? `<div class="card" style="margin-top:16px"><h3 style="margin-top:0">Playoffs (${playoffs.length})</h3>
        <div class="sched-list" id="poList">${playoffs.map((m) => matchRow(m, all.indexOf(m))).join("")}</div></div>`
        : (quals.length ? `<div class="card" style="margin-top:16px"><p class="hint" style="margin:0">Playoff matches will appear here once the alliance selections finish and they're posted.</p></div>` : "")}`;

    $$(".sched-row", root).forEach((b) => b.onclick = () => openMatchDetail(all[+b.dataset.mi]));
    $("[data-go]", root) && ($("[data-go]", root).onclick = () => go("dashboard"));
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

    modal(`Team ${team}${teamName(team) ? " · " + teamName(team) : ""}`, epaCard + `
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
    });
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

    const phases = GAME.matchPhases.map((p) => {
      const fs = matchFields().filter((f) => (f.phase || "post") === p.id);
      if (!fs.length) return "";
      return `<div class="card" data-phase="${p.id}"><h3>${esc(p.label)}</h3>
        <div class="form-grid">${fs.map((f) => renderField(f, "")).join("")}</div></div>`;
    }).join("");

    const fmtTime = (unix) => unix ? " · " + new Date(unix * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    const topCard = liveMode ? `
      <div class="card" style="margin-bottom:16px">
        <div class="form-grid">
          <div class="field"><label>Upcoming match</label>
            <select id="mMatchSel"><option value="">Select match…</option>${upcomingQuals.map((m) =>
              `<option value="${m.match_number}">Q${m.match_number}${esc(fmtTime(m.predicted_time || m.time))}</option>`).join("")}</select></div>
        </div>
        <div id="robotPicker" class="robot-picker"><p class="hint">Pick a match above, then tap the robot you're scouting.</p></div>
        <input type="hidden" id="mNum" /><input type="hidden" id="mTeam" />
      </div>` : `
      <div class="card" style="margin-bottom:16px">
        <div class="form-grid">
          <div class="field"><label>Match #</label><input type="number" id="mNum" placeholder="e.g. 14" inputmode="numeric" /></div>
          <div class="field"><label>Team scouted</label>${teamControl}</div>
          <div class="field"><label>Alliance</label>
            <div class="pill-toggle" id="mAlliance">
              <button type="button" data-v="red" class="on">Red</button>
              <button type="button" data-v="blue">Blue</button></div></div>
        </div>
      </div>`;

    root.innerHTML = `
      <form id="matchForm">
        ${topCard}
        <div class="grid cols-2" id="matchPhaseGrid" style="margin-bottom:16px">${phases}</div>
        <div class="btn-row">
          <button type="submit" class="btn primary">${icon("check")} <span id="mSaveLabel">Save match</span></button>
          <button type="button" class="btn ghost" id="mReset">Clear form</button>
        </div>
      </form>

      <div class="section" style="margin-top:26px">
        <div class="section-head"><h2>This session · ${Store.getMatches().length} total records</h2></div>
        <div id="matchList"></div>
      </div>`;

    if (liveMode) {
      const picker = $("#robotPicker", root);
      const renderRobots = (num) => {
        const m = upcomingQuals.find((x) => String(x.match_number) === String(num));
        if (!m) { picker.innerHTML = `<p class="hint">Pick a match above, then tap the robot you're scouting.</p>`; return; }
        picker.innerHTML = ["red", "blue"].map((col) => `
          <div class="robot-group">
            <div class="rg-label"><span class="alliance-dot alliance-${col}"></span>${col} alliance</div>
            <div class="robot-row">${m.alliances[col].team_keys.map((k) => { const t = k.replace("frc", ""); return `
              <button type="button" class="robot-pick" data-team="${t}" data-alliance="${col}">
                <img class="team-avatar" data-avatar="${t}" data-ally="${col}" alt="" />
                <span class="rp-num">${t}</span><span class="rp-name">${esc(teamName(t))}</span></button>`; }).join("")}</div>
          </div>`).join("");
        paintAvatars(picker, ["red", "blue"].flatMap((c) => m.alliances[c].team_keys.map((k) => k.replace("frc", ""))));
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
      $$("#mAlliance button", root).forEach((b) => b.onclick = () => {
        $$("#mAlliance button", root).forEach((x) => x.classList.toggle("on", x === b));
      });
    }

    wireFields(root);
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
      const fields = readForm($(".grid.cols-2", root));
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
      const wrap = $(`.grid.cols-2 [data-key="${f.key}"]`, root);
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
    const teamControl = teams.length
      ? `<select id="pTeam"><option value="">Select team…</option>${
          teams.map((t) => `<option value="${t.team_number}">${t.team_number} · ${esc(t.nickname || "")}</option>`).join("")}</select>`
      : `<input type="number" id="pTeam" placeholder="Team #" inputmode="numeric" />`;

    root.innerHTML = `
      <div id="pitMap"></div>
      <form id="pitForm">
        <div class="card" style="margin-bottom:16px">
          <div class="form-grid">
            <div class="field"><label>Team</label>${teamControl}</div>
            <div class="field"><label>Robot photo</label>
              <input type="file" id="pPhoto" accept="image/*" />
              <div id="pPhotoPreview" class="photo-preview"></div></div>
          </div>
        </div>
        <div class="card" style="margin-bottom:16px"><h3>Robot</h3>
          <div class="form-grid">${pitFields().map((f) => renderField(f, "")).join("")}</div>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn primary">${icon("check")} Save pit data</button>
          <button type="button" class="btn ghost" id="pReset">Clear</button>
        </div>
      </form>
      <div class="section" style="margin-top:26px">
        <div class="section-head"><h2>Pit-scouted teams</h2></div>
        <div id="pitList"></div>
      </div>`;

    wireFields(root);
    drawPitList();
    loadPitMap(root);
    // Let cloud updates refresh the shared pit list + map live without touching the form.
    pitPageRefresh = () => { try { drawPitList(); loadPitMap(root); } catch (e) {} };

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
      const clr = $("#pPhotoClear", root); if (clr) clr.onclick = () => { pitPhoto = null; $("#pPhoto", root).value = ""; showPhotoPreview(null); };
    }

    $("#pReset", root).onclick = () => renderPit(root);
    $("#pitForm", root).onsubmit = (e) => {
      e.preventDefault();
      const team = $("#pTeam", root).value.trim();
      if (!team) { toast("Pick a team first", "err"); return; }
      const fields = readForm($("#pitForm .card:nth-of-type(2)", root));
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
      renderPit(root);
    };
    // expose for loadPitIntoForm
    renderPit._setPhoto = (dataUrl) => { pitPhoto = dataUrl; showPhotoPreview(dataUrl); };

    function drawPitList() {
      const pits = allPits();
      const teamsArr = Object.values(pits).sort((a, b) => Number(a.team) - Number(b.team));
      const el = $("#pitList", root);
      if (!teamsArr.length) { el.innerHTML = `<div class="card">${emptyState("wrench", "No pit data yet", "Fill the form and save.")}</div>`; return; }
      el.innerHTML = `<div class="grid auto">${teamsArr.map((p) => `
        <div class="card team-card" data-open="${p.team}">
          ${p.photo ? `<img class="pit-thumb" src="${p.photo}" alt="Team ${esc(p.team)} robot" />` : ""}
          <div class="tc-top"><span class="tc-num">${esc(p.team)}</span></div>
          <div class="tc-name">${esc(p.nickname || teamName(p.team) || "")}</div>
          <div class="tc-meta">
            ${p.drivetrain ? `<span class="badge cyan">${esc(p.drivetrain)}</span>` : ""}
            ${p.maxClimb && p.maxClimb !== "None" ? `<span class="badge yellow">climb ${esc(p.maxClimb)}</span>` : ""}
            ${p.shotblocker ? `<span class="badge green">shotblocker</span>` : ""}
          </div>
          <div class="row between" style="margin-top:8px">
            <button class="btn sm ghost" data-load="${p.team}">${icon("edit")} Edit</button>
            <button class="icon-btn" data-del="${p.team}" aria-label="Delete">${icon("trash")}</button>
          </div></div>`).join("")}</div>`;
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
      const wrap = $(`#pitForm .card:nth-of-type(2) [data-key="${f.key}"]`, root);
      if (!wrap) return; const v = p[f.key];
      if (f.type === "bool") wrap.querySelector("input").checked = !!v;
      else if (f.type === "select") wrap.querySelector("select").value = v || wrap.querySelector("select").value;
      else if (f.type === "number") wrap.querySelector("input").value = v ?? "";
      else if (f.type === "text") wrap.querySelector("textarea").value = v || "";
      else if (f.type === "counter") { const cc = wrap.querySelector(".counter"); cc.dataset.val = v || 0; cc.querySelector(".count").value = v || 0; }
      else if (f.type === "rating") { const rr = wrap.querySelector(".rating"); rr.dataset.val = v || 0; rr.querySelectorAll(".star").forEach((sx) => sx.classList.toggle("on", Number(sx.dataset.idx) <= (v || 0))); }
    });
    if (renderPit._setPhoto) renderPit._setPhoto(p.photo || null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Editing pit data — Save to update");
  }
  function prefillPitTeam(team) { const t = $("#pTeam"); if (t) t.value = team; }

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
  function socalPitMapCard(pits) {
    const flat = [].concat.apply([], [].concat.apply([], Object.values(SOCAL_PITMAP)));
    const done = flat.filter((t) => pits[t]).length;
    const cell = (t) => `<button type="button" class="pit-cell socal ${pits[t] ? "done" : "todo"}" data-team="${t}"><span class="pc-team">${t}</span></button>`;
    const col = (rows, wide) => `<div class="socal-col${wide ? " wide" : ""}">${rows.map((r) => `<div class="socal-row">${r.map(cell).join("")}</div>`).join("")}</div>`;
    return `<div class="card" style="margin-bottom:16px">
      <div class="section-head">
        <div class="row" style="gap:10px">${icon("wrench")}<h3 style="margin:0">Pit map · SoCal Showdown · ${done}/${flat.length} scouted</h3></div>
        <div class="row" style="gap:12px"><span class="badge cyan dot">Scouted</span><span class="badge red dot">Not yet</span></div>
      </div>
      <div class="socal-map-scroll"><div class="socal-map">
        <div class="socal-side">${col(SOCAL_PITMAP.colA, true)}${col(SOCAL_PITMAP.colB, false)}</div>
        <div class="socal-field"><span>FIELD</span></div>
        <div class="socal-side">${col(SOCAL_PITMAP.colC, false)}${col(SOCAL_PITMAP.colD, true)}</div>
      </div></div>
    </div>`;
  }

  // Pit map: shows a pasted map image (Settings → Pit map) plus a green/red
  // team-status grid (green = pit-scouted, red = not). Toggle off in Settings.
  // For SoCal Showdown it renders the hand-laid venue layout instead.
  function loadPitMap(root) {
    const container = $("#pitMap", root);
    if (!container) return;
    const s = Store.getSettings();
    if (isSocalShowdown(s)) {
      container.innerHTML = socalPitMapCard(allPits());
      $$(".pit-cell", container).forEach((b) => b.onclick = () => {
        prefillPitTeam(b.dataset.team);
        const fm = $("#pitForm", root); if (fm) fm.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    const url = (s.pitMapUrl || "").trim();
    const teams = eventTeams().slice().sort((a, b) => a.team_number - b.team_number);
    if (!s.pitMapEnabled || (!url && !teams.length)) { container.innerHTML = ""; return; }
    const pits = allPits();
    const doneN = teams.filter((t) => pits[t.team_number]).length;
    container.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="section-head">
          <div class="row" style="gap:10px">${icon("wrench")}<h3 style="margin:0">Pit map${teams.length ? ` · ${doneN}/${teams.length} scouted` : ""}</h3></div>
          <div class="row" style="gap:12px"><span class="badge cyan dot">Scouted</span><span class="badge red dot">Not yet</span></div>
        </div>
        ${url ? `<img class="pit-map-img" src="${esc(url)}" alt="Pit map"
            onerror="this.style.display='none';var n=this.nextElementSibling;if(n)n.hidden=false;" />
          <p class="hint" hidden>Couldn't load the map image — check the link in Settings → Pit map.</p>` : ""}
        ${teams.length ? `<div class="pit-map-grid" style="margin-top:${url ? "14px" : "4px"}">${teams.map((t) => {
          const done = !!pits[t.team_number];
          return `<button type="button" class="pit-cell ${done ? "done" : "todo"}" data-team="${t.team_number}">
            <span class="pc-team">${t.team_number}</span></button>`;
        }).join("")}</div>`
        : `<p class="hint" style="margin:10px 0 0">Select an event to see per-team scouting status here.</p>`}
      </div>`;
    $$(".pit-cell", container).forEach((b) => b.onclick = () => {
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
  const matchupSeries = {}; // global: team# -> sbTeamMatches rows (in-memory cache)

  function matchupSub() { const p = (location.hash.replace(/^#\/?/, "") || "").split("/"); return p[1] === "event" ? "event" : "global"; }

  function renderMatchup(root) {
    const sub = matchupSub();
    const s = Store.getSettings();
    const teams = eventTeams();
    // Team display name: event teams know their own; global teams come from the
    // Statbotics season leaderboard (loaded in the background below if needed).
    const lbRows = API.sbCachedLeaderboard(GAME.season) || [];
    const lbName = {}; lbRows.forEach((r) => { lbName[String(r.team)] = r.name; });
    const nameOf = (t) => (sub === "event" ? teamName(t) : (lbName[String(t)] || teamName(t) || ""));
    const picker = (col, i) => {
      const arr = col === "red" ? matchupRed : matchupBlue;
      const t = arr[i];
      const ctrl = sub === "event"
        ? `<select class="mu-team" data-col="${col}" data-i="${i}">
            <option value="">Team ${i + 1}…</option>
            ${teams.map((tm) => `<option value="${tm.team_number}" ${t === String(tm.team_number) ? "selected" : ""}>${tm.team_number} · ${esc(tm.nickname || "")}</option>`).join("")}
          </select>`
        : `<input type="number" class="mu-team" data-col="${col}" data-i="${i}" placeholder="Team ${i + 1}" value="${esc(t)}" inputmode="numeric" />`;
      return `<div class="mu-pick ${col}">
        <span class="mu-pick-av">${t ? `<img class="team-avatar" data-avatar="${esc(t)}" data-tring="${esc(t)}" data-ally="${col}" alt="" />` : `<span class="mu-pick-ph">${i + 1}</span>`}</span>
        ${ctrl}
        <span class="mu-pick-name" data-tcolor="${esc(t)}">${t ? (esc(nameOf(t)) || "&nbsp;") : `<span class="muted">empty</span>`}</span>
      </div>`;
    };
    root.innerHTML = `
      <div class="mu-head">
        <div class="subtabs" id="muTabs">
          <a href="#/matchup/global" class="${sub === "global" ? "on" : ""}">Global</a>
          <a href="#/matchup/event" class="${sub === "event" ? "on" : ""}">Event</a>
        </div>
        <span class="hint mu-head-hint">${sub === "event"
          ? `This event's on-device EPA · slider rewinds by qualification`
          : `Season EPA from Statbotics · slider rewinds by week`}</span>
      </div>
      ${sub === "event" && !teams.length
        ? `<div class="card">${emptyState("calendar", "No event selected", "Choose your event on the Dashboard to pick its teams.")}</div>`
        : `<div class="mu-pickers">
          ${["red", "blue"].map((col) => `<div class="card mu-ally ${col}">
            <div class="mu-ally-head"><span class="alliance-dot alliance-${col}"></span>${col} alliance</div>
            ${[0, 1, 2].map((i) => picker(col, i)).join("")}</div>`).join("")}
        </div>
        <div class="card mu-time" id="muTime"></div>
        <div id="muResults"></div>`}`;
    if (sub === "event" && !teams.length) { const g = $("[data-go]", root); if (g) g.onclick = () => go("dashboard"); return; }
    paintAvatars(root, [...matchupRed, ...matchupBlue].filter(Boolean));
    paintTeamColors(root, [...new Set([...matchupRed, ...matchupBlue].filter(Boolean))]);

    // ---- EPA lookups ------------------------------------------------------
    // Event: recompute on-device EPA using only quals up to N. Returns {total,auto,teleop,endgame}|null.
    const eventLookup = (qual) => {
      const cache = s.eventKey ? Store.getCache("matches." + s.eventKey, null) : null;
      const all = (cache ? cache.data : []) || [];
      const upto = all.filter((m) => m.comp_level === "qm" && (Number(m.match_number) || 0) <= qual);
      const ev = EPA.computeEvent(upto);
      return (t) => { const r = ev.byTeam[t]; if (!r) return null; const b = r.breakdown || {}; return { total: r.epa, auto: b.auto, teleop: b.teleop, endgame: b.endgame }; };
    };
    // Global: a team's EPA at week W (last match with week<=W). Returns {total,auto,teleop,endgame}|null.
    const globalLookup = (week) => (t) => {
      const rows = matchupSeries[String(t)];
      if (!rows || !rows.length) return null;
      let best = null; rows.forEach((r) => { if (r.week != null && r.week <= week) best = r; });
      if (!best) { best = rows.filter((r) => r.week == null).slice(-1)[0] || null; } // fall back to offseason/latest
      if (!best) return null;
      return { total: best.epa, auto: best.auto, teleop: best.teleop, endgame: best.endgame };
    };

    const selected = () => [...matchupRed, ...matchupBlue].filter(Boolean);
    const maxQual = () => {
      const cache = s.eventKey ? Store.getCache("matches." + s.eventKey, null) : null;
      const all = (cache ? cache.data : []) || [];
      return all.filter((m) => m.comp_level === "qm").reduce((mx, m) => Math.max(mx, Number(m.match_number) || 0), 0);
    };
    const maxWeek = () => selected().reduce((mx, t) => {
      const rows = matchupSeries[String(t)] || [];
      return rows.reduce((m2, r) => (r.week != null ? Math.max(m2, r.week) : m2), mx);
    }, 0);

    function drawTime() {
      const el = $("#muTime", root); if (!el) return;
      if (sub === "event") {
        const mx = maxQual();
        if (!mx) { el.innerHTML = `<p class="hint" style="margin:0">Load this event's matches (needs wifi) to use the qualification slider.</p>`; return; }
        if (matchupQual > mx) matchupQual = mx;
        el.innerHTML = `<div class="mu-time-head"><span class="mu-time-label">After qualification</span>
          <span class="mu-time-val" id="muTimeVal">${matchupQual >= mx ? "Q" + mx + " · latest" : "Q" + matchupQual}</span></div>
          <input type="range" id="muSlider" min="1" max="${mx}" value="${matchupQual}" />`;
      } else {
        const mx = maxWeek();
        if (!mx) { el.innerHTML = `<p class="hint" style="margin:0">Enter teams above to load their season EPA, then rewind by week here.</p>`; return; }
        if (matchupWeek > mx) matchupWeek = mx;
        el.innerHTML = `<div class="mu-time-head"><span class="mu-time-label">Season week</span>
          <span class="mu-time-val" id="muTimeVal">${matchupWeek >= mx ? "Week " + mx + " · latest" : "Week " + matchupWeek}</span></div>
          <input type="range" id="muSlider" min="1" max="${mx}" value="${matchupWeek}" />`;
      }
      const sl = $("#muSlider", el);
      if (sl) sl.oninput = (e) => { const v = Number(e.target.value); if (sub === "event") matchupQual = v; else matchupWeek = v; drawResults(); const tv = $("#muTimeVal", el); if (tv) { const mx = sub === "event" ? maxQual() : maxWeek(); tv.textContent = (sub === "event" ? (v >= mx ? "Q" + mx + " · latest" : "Q" + v) : (v >= mx ? "Week " + mx + " · latest" : "Week " + v)); } };
    }

    function drawResults() {
      const el = $("#muResults", root); if (!el) return;
      const getEpa = sub === "event" ? eventLookup(matchupQual) : globalLookup(matchupWeek);
      const sideData = (arr) => arr.filter(Boolean).map((t) => ({ t, e: getEpa(t) }));
      const red = sideData(matchupRed), blue = sideData(matchupBlue);
      if (!red.length && !blue.length) { el.innerHTML = `<div class="card">${emptyState("compare", "Pick teams to simulate", "Add teams to the red and blue alliances above to see the predicted outcome.")}</div>`; return; }
      const sum = (side, k) => side.reduce((a, x) => a + (x.e && x.e[k] != null ? x.e[k] : 0), 0);
      const rT = sum(red, "total"), bT = sum(blue, "total");
      const pRed = Math.round(winProb(rT, bT) * 100);
      const comps = [["auto", "Auto"], ["teleop", "Teleop"], ["endgame", "Endgame"]];
      const maxTeamEpa = Math.max(1, ...[...red, ...blue].map((x) => (x.e ? x.e.total : 0)));
      const teamRow = (x, col) => {
        const e = x.e;
        return `<div class="mu-trow" data-team="${esc(x.t)}">
          <img class="team-avatar mu-tav" data-avatar="${esc(x.t)}" data-tring="${esc(x.t)}" data-ally="${col}" alt="" />
          <span class="mu-tnum" data-tcolor="${esc(x.t)}">${esc(x.t)}</span>
          <span class="mu-tname">${esc(nameOf(x.t))}</span>
          <span class="mu-tbar"><span class="mu-tbar-fill ${col}" style="width:${e ? Math.round(e.total / maxTeamEpa * 100) : 0}%"></span></span>
          <span class="mu-tepa ${col}">${e ? fmt(e.total, 1) : `<span class="muted">–</span>`}</span></div>`;
      };
      const avStrip = (arr, col) => `<div class="mu-av-strip">${arr.filter(Boolean).map((t) => `<img class="team-avatar" data-avatar="${esc(t)}" data-tring="${esc(t)}" data-ally="${col}" alt="" />`).join("")}</div>`;
      el.innerHTML = `
        <div class="card mu-score">
          <div class="mu-score-row">
            <div class="mu-score-side red"><span class="mu-sc-label">Red Alliance</span><span class="mu-sc-val">${Math.round(rT)}</span>${avStrip(matchupRed, "red")}</div>
            <div class="mu-score-mid"><span>predicted</span><span>score</span></div>
            <div class="mu-score-side blue"><span class="mu-sc-label">Blue Alliance</span><span class="mu-sc-val">${Math.round(bT)}</span>${avStrip(matchupBlue, "blue")}</div>
          </div>
          <div class="mu-prob">
            <div class="md-prob-head"><span class="md-prob-red">${pRed}%</span>
              <span class="md-prob-mid">${rT === bT ? "toss-up" : (rT > bT ? "Red favored" : "Blue favored")}</span>
              <span class="md-prob-blue">${100 - pRed}%</span></div>
            <div class="md-prob-bar"><span class="mpb-red" style="width:${pRed}%"></span><span class="mpb-blue" style="width:${100 - pRed}%"></span></div>
          </div>
          <table class="mu-breakdown">
            <thead><tr><th>Phase</th><th class="red">Red</th><th class="blue">Blue</th><th>Edge</th></tr></thead>
            <tbody>
              ${comps.map(([k, lbl]) => { const r = sum(red, k), b = sum(blue, k); return `<tr>
                <td>${lbl}</td><td class="red">${fmt(r, 1)}</td><td class="blue">${fmt(b, 1)}</td>
                <td class="${r >= b ? "red" : "blue"}">${(r >= b ? "R +" : "B +") + fmt(Math.abs(r - b), 1)}</td></tr>`; }).join("")}
              <tr class="mu-total"><td>Total EPA</td><td class="red">${fmt(rT, 1)}</td><td class="blue">${fmt(bT, 1)}</td>
                <td class="${rT >= bT ? "red" : "blue"}">${(rT >= bT ? "R +" : "B +") + fmt(Math.abs(rT - bT), 1)}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="mu-pergrid">
          <div class="card mu-teamcard red"><div class="mu-ally-head red"><span class="alliance-dot alliance-red"></span>Red teams</div>${red.length ? red.map((x) => teamRow(x, "red")).join("") : `<p class="muted">No red teams.</p>`}</div>
          <div class="card mu-teamcard blue"><div class="mu-ally-head blue"><span class="alliance-dot alliance-blue"></span>Blue teams</div>${blue.length ? blue.map((x) => teamRow(x, "blue")).join("") : `<p class="muted">No blue teams.</p>`}</div>
        </div>
        <p class="hint" style="margin:8px 2px 0">${sub === "event"
          ? "On-device event EPA (expected points) from played quals — an estimate, not an official prediction."
          : "Season EPA from Statbotics. Predicted score ≈ each alliance's combined EPA."}</p>`;
      paintAvatars(el, [...matchupRed, ...matchupBlue].filter(Boolean));
      paintTeamColors(el, [...new Set([...matchupRed, ...matchupBlue].filter(Boolean))]);
      $$("[data-team]", el).forEach((c) => c.onclick = () => openTeam(c.dataset.team));
    }

    // ---- Wiring -----------------------------------------------------------
    const refreshGlobalThen = (cb) => {
      if (sub !== "global") return cb();
      const need = selected().filter((t) => !matchupSeries[String(t)]);
      if (!need.length) return cb();
      const wrap = $("#muResults", root); if (wrap) wrap.innerHTML = `<div class="card"><p class="muted" style="text-align:center;padding:14px 0">Loading season EPA…</p></div>`;
      Promise.all(need.map((t) => API.sbTeamMatches(t, GAME.season).then((rows) => { matchupSeries[String(t)] = rows; }).catch(() => { matchupSeries[String(t)] = []; })))
        .then(cb);
    };
    $$(".mu-team", root).forEach((ctrl) => ctrl.onchange = () => {
      const col = ctrl.dataset.col, i = Number(ctrl.dataset.i), v = (ctrl.value || "").replace(/\D/g, "");
      (col === "red" ? matchupRed : matchupBlue)[i] = v;
      renderMatchup(root); // re-render so the picker's avatar + name update too
    });
    // initial draw (load any already-selected global teams)
    refreshGlobalThen(() => { drawTime(); drawResults(); });
    // Global: load the season leaderboard once (for team names) if it isn't cached.
    if (sub === "global" && !lbRows.length && !matchupLbLoading) {
      matchupLbLoading = true;
      API.sbYearLeaderboard(GAME.season).then(() => { matchupLbLoading = false; if (matchupSub() === "global" && current() === "matchup") renderMatchup(root); }).catch(() => { matchupLbLoading = false; });
    }
  }

  function picklistSub() {
    const s = location.hash.replace(/^#\/?/, "").split("/")[1] || "alliance";
    return ["alliance", "tierlist", "scouters"].includes(s) ? s : "alliance";
  }

  function renderPicklist(root) {
    const teams = eventTeams();
    const sub = picklistSub();
    const tabs = [["alliance", "Alliance selection"], ["tierlist", "Tierlist"], ["scouters", "Scouters lists"]];
    const bar = `<div class="subtabs" id="pickTabs">
      ${tabs.map(([k, l]) => `<a href="#/picklist/${k}" class="${sub === k ? "on" : ""}">${esc(l)}</a>`).join("")}</div>`;

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
                <summary>${icon("search")} Traits${activeCount ? ` <span class="badge cyan">${activeCount}</span>` : ""}</summary>
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
          ? `<td class="ab-slot filled" data-a="${a}" data-c="${c}" data-team="${t}" draggable="true">
              <img class="team-avatar" data-avatar="${t}" alt="" /><span class="ab-team">${t}</span>
              <button class="slot-x" data-clear="${a}-${c}" aria-label="Clear">${icon("x")}</button></td>`
          : `<td class="ab-slot empty ${pickSelected ? "target" : ""}" data-a="${a}" data-c="${c}">${pickSelected ? "+" : "·"}</td>`).join("")}
      </tr>`).join("");
      paintAvatars(abBody, bb.grid.flat().filter(Boolean));
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
        <div class="pool-team ${pickSelected === t ? "sel" : ""}" draggable="true" data-team="${t}">
          <button class="pt-add" data-add="${t}" title="Add to an alliance slot" aria-label="Add ${t} to an alliance slot">${icon("plus")}</button>
          <button class="pt-main" data-stats="${t}">
            <img class="team-avatar" data-avatar="${t}" alt="" />
            <span class="pt-info"><span class="pt-num">${t}</span><span class="pt-name">${esc(teamName(t))}</span></span>
          </button>
          <span class="pt-epa">${epaOf(t) != null ? fmt(epaOf(t)) : "–"}</span>
          <button class="pt-dnp" data-dnp="${t}" title="Do Not Pick" aria-label="Do Not Pick">${icon("x")}</button>
        </div>`).join("") : `<p class="muted" style="padding:10px">No teams match these filters.</p>`;
      paintAvatars(poolList, pool);
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
        <div class="dnp-item" data-team="${t}"><img class="team-avatar" data-avatar="${t}" alt="" /><span>${t}</span>
          <button class="icon-btn sm" data-undnp="${t}" aria-label="Remove">${icon("x")}</button></div>`).join("")
        : `<p class="muted" style="padding:8px">Drag or tap-✕ teams here to exclude.</p>`;
      paintAvatars(dnpZone, bb.dnp);
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
      <div class="tier-team ${tierSelected === t ? "sel" : ""}" draggable="true" data-team="${t}">
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
      paintAvatars(board, [...placed]);
      paintAvatars(poolEl, pool);
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
    (Cloud.getSharedBoards() || []).forEach((b) => {
      if (b.scouterId === me.id) return;
      // Cloud stores the grid as row maps ({cells}); rebuild the 2D grid for display.
      const grid = b.grid || (b.rows || []).map((r) => (r && r.cells) || []);
      out.push({ ...b, grid });
    });
    return out.sort((a, z) => (z.submittedAt || 0) - (a.submittedAt || 0));
  }
  function sharedTierlists() {
    const me = Store.getMe(), out = [];
    const myT = Store.getTierlist();
    if (myT.submitted) out.push({ scouterId: me.id, name: scouterName(me), tiers: myT.tiers, submittedAt: myT.submittedAt });
    (Cloud.getSharedTierlists() || []).forEach((t) => { if (t.scouterId !== me.id) out.push(t); });
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
      <h2 style="margin-top:0">Scouters lists</h2>
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

  function renderData(root) {
    const matches = allMatches(), pits = allPits(), pl = Store.getPicklist();
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
      </div>
      <div class="card" style="margin-top:16px"><h2 style="color:var(--danger)">Danger zone</h2>
        <p class="hint">Permanently erase data on <b>this device</b>. Export a backup first — this cannot be undone.</p>
        <div class="btn-row">
          <button class="btn danger" id="clrMatches">Clear match data</button>
          <button class="btn danger" id="clrPits">Clear pit data</button>
          <button class="btn danger" id="clrAll">Clear everything</button>
        </div>
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
    $("#clrMatches", root).onclick = () => confirmDialog("Delete all match records on this device?", () => { Store.setCache("__noop", 0); localStorage.removeItem("bb702.matches"); toast("Match data cleared"); renderData(root); });
    $("#clrPits", root).onclick = () => confirmDialog("Delete all pit data on this device?", () => { localStorage.removeItem("bb702.pits"); toast("Pit data cleared"); renderData(root); });
    $("#clrAll", root).onclick = () => confirmDialog("Erase ALL scouting data (matches, pits, pick list, strategy) on this device?", () => {
      ["matches", "pits", "picklist", "strategy"].forEach((k) => localStorage.removeItem("bb702." + k)); toast("All data cleared"); renderData(root);
    });
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

  function applyBagelSort(rows, mode) {
    const rankKey = mode === "state" ? "stateRank" : mode === "district" ? "districtRank"
      : mode === "event" ? "tbaRank" : "worldRank";
    const val = (r, col) => {
      if (col === "rank") return r[rankKey] ?? 1e9;
      if (col === "team") return Number(r.team);
      if (col === "epa") return r.epa ?? -1e9;
      if (col === "rp") return r.rp ?? -1e9;
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

  function contrastText(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return null;
    const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#08131a" : "#ffffff";
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
    root.innerHTML = `
      <div class="section-head">
        <div class="pill-toggle" id="bagelTabs">
          <button data-tab="world" class="${bagelTab === "world" ? "on" : ""}">World</button>
          <button data-tab="state" class="${bagelTab === "state" ? "on" : ""}">State</button>
          <button data-tab="district" class="${bagelTab === "district" ? "on" : ""}">District</button>
          <button data-tab="event" class="${bagelTab === "event" ? "on" : ""}">Event</button>
        </div>
        <span class="badge cyan">EPA · ${GAME.seasonLabel}</span>
      </div>
      <div id="bagelBody"><div class="empty">${icon("chart")}<p class="muted">Loading…</p></div></div>`;
    $$("#bagelTabs button", root).forEach((b) => b.onclick = () => { bagelTab = b.dataset.tab; renderBagelStats(root); });
    const body = $("#bagelBody", root);
    if (bagelTab === "event") renderBagelEvent(body);
    else renderBagelWorld(body, bagelTab);
  }

  // Shared leaderboard table. rows: [{team,name,epa,worldRank,stateRank,breakdown,state}]
  // Headers are click-to-sort. Rank column label is "Rank" (event) or "#".
  function leaderboardTable(rows, opts) {
    const isEvent = opts.mode === "event";
    const rankOf = (r) => isEvent ? r.tbaRank : opts.mode === "state" ? r.stateRank
      : opts.mode === "district" ? r.districtRank : r.worldRank;
    const arrow = (col) => bagelSort.col === col ? (bagelSort.dir === "asc" ? " ▲" : " ▼") : "";
    const th = (col, label, extra = "") => `<th class="sortable ${extra}" data-sort="${col}">${label}${arrow(col)}</th>`;
    return `<div class="table-wrap"><table class="lb">
      <thead><tr>
        ${th("rank", isEvent ? "Rank" : "#")}
        ${th("team", "Team")}
        ${th("epa", "EPA", "num")}
        ${th("auto", "Auto", "num hide-sm")}
        ${th("teleop", "Teleop", "num hide-sm")}
        ${th("endgame", "End", "num hide-sm")}
        ${isEvent ? th("rp", "RP", "num") + `<th class="num hide-sm">W-L-T</th>` : ""}
      </tr></thead>
      <tbody>${rows.map((r) => `<tr data-team="${r.team}">
          <td class="num rank-cell">${rankOf(r) || "–"}</td>
          <td><span class="lb-team"><img class="team-avatar" data-avatar="${r.team}" alt="" /><span class="team-chip">${r.team}</span></span>
              <span class="muted lb-name">${esc(r.name || teamName(r.team))}</span></td>
          <td class="num epa-cell">${fmt(r.epa)}</td>
          <td class="num hide-sm muted">${fmt(r.breakdown && r.breakdown.auto)}</td>
          <td class="num hide-sm muted">${fmt(r.breakdown && r.breakdown.teleop)}</td>
          <td class="num hide-sm muted">${fmt(r.breakdown && r.breakdown.endgame)}</td>
          ${isEvent ? `<td class="num">${r.rp != null ? fmt(r.rp, 2) : "–"}</td>
            <td class="num hide-sm muted">${r.record ? `${r.record.w}-${r.record.l}-${r.record.t}` : "–"}</td>` : ""}
        </tr>`).join("")}</tbody></table></div>`;
  }

  // redraw() is called after a header-sort click to re-render with the new order.
  function wireLeaderboard(container, redraw) {
    $$("tr[data-team]", container).forEach((tr) => tr.onclick = () => openTeam(tr.dataset.team));
    $$("th.sortable", container).forEach((th) => th.onclick = () => {
      const col = th.dataset.sort;
      if (bagelSort.col === col) bagelSort.dir = bagelSort.dir === "asc" ? "desc" : "asc";
      else { bagelSort.col = col; bagelSort.dir = (col === "rank" || col === "team") ? "asc" : "desc"; }
      if (redraw) redraw();
    });
    if (bagelFocusTeam) {
      const row = container.querySelector(`tr[data-team="${bagelFocusTeam}"]`);
      if (row) { row.classList.add("focus-row"); row.scrollIntoView({ block: "center", behavior: "smooth" }); }
      bagelFocusTeam = null;
    }
  }

  async function renderBagelWorld(body, mode) {
    let lb = API.sbCachedLeaderboard(GAME.season);
    let fromCache = !!lb, downMsg = "";
    try {
      const res = await API.sbYearLeaderboard(GAME.season);
      lb = res.rows; fromCache = res.fromCache;
    } catch (e) {
      if (!lb) {
        body.innerHTML = `<div class="card">${emptyState("globe", "Statbotics is unavailable",
          "The world/state leaderboards come from Statbotics' API, which isn't responding right now. Cached data will appear here once it loads successfully.")}
          ${Store.getSettings().eventKey ? `<div class="row" style="justify-content:center"><button class="btn secondary" id="toEvent">${icon("chart")} View live Event EPA instead</button></div>` : ""}</div>`;
        const te = $("#toEvent", body); if (te) te.onclick = () => { bagelTab = "event"; renderBagelStats($("#view")); };
        return;
      }
      downMsg = "Statbotics offline — showing last cached data.";
    }

    let selectControl = "";
    if (mode === "state") {
      const states = [...new Set(lb.map((r) => r.state).filter(Boolean))].sort();
      if (!states.includes(bagelState)) bagelState = states.includes("CA") ? "CA" : (states[0] || "");
      selectControl = `<div class="row" style="gap:8px"><label class="hint">State:</label>
        <select id="regionSel" style="width:auto;min-width:90px">${states.map((s) =>
          `<option ${s === bagelState ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`;
    } else if (mode === "district") {
      const dists = [...new Set(lb.map((r) => r.district).filter(Boolean))].sort();
      if (!dists.includes(bagelDistrict)) bagelDistrict = dists.includes("ca") ? "ca" : (dists[0] || "");
      selectControl = `<div class="row" style="gap:8px"><label class="hint">District:</label>
        <select id="regionSel" style="width:auto;min-width:90px">${dists.map((d) =>
          `<option value="${esc(d)}" ${d === bagelDistrict ? "selected" : ""}>${esc(d.toUpperCase())}</option>`).join("")}</select></div>`;
    }

    let list = mode === "state" ? lb.filter((r) => r.state === bagelState)
      : mode === "district" ? lb.filter((r) => r.district === bagelDistrict) : lb;

    body.innerHTML = `
      <div class="section-head" style="margin-top:4px">
        <div class="row" style="gap:12px">${selectControl}
          <input type="search" id="lbSearch" placeholder="Search team # or name…" style="min-width:190px" /></div>
        <span class="hint">${fromCache ? (downMsg || "cached") : "live"} · ${list.length} teams</span>
      </div>
      <div id="lbList"></div>
      <div class="row between" id="lbPager" style="margin-top:14px"></div>`;

    const listEl = $("#lbList", body), pagerEl = $("#lbPager", body);
    const PAGE = 25; let pageIdx = 0;
    function draw(filter = "") {
      const f = filter.trim().toLowerCase();
      let rows = list;
      if (f) rows = list.filter((r) => r.team.includes(f) || (r.name || "").toLowerCase().includes(f));
      rows = applyBagelSort(rows, mode);
      const pages = Math.max(1, Math.ceil(rows.length / PAGE));
      if (pageIdx >= pages) pageIdx = 0;
      const slice = rows.slice(pageIdx * PAGE, pageIdx * PAGE + PAGE);
      listEl.innerHTML = slice.length ? leaderboardTable(slice, { mode }) : emptyState("search", "No teams", "Try another search.");
      wireLeaderboard(listEl, () => { pageIdx = 0; draw($("#lbSearch", body).value); });
      paintAvatars(listEl, slice.map((r) => r.team));
      pagerEl.innerHTML = rows.length > PAGE ? `
        <button class="btn ghost sm" id="prevPg" ${pageIdx === 0 ? "disabled" : ""}>← Prev</button>
        <span class="hint">Page ${pageIdx + 1} of ${pages} · ${rows.length} teams</span>
        <button class="btn ghost sm" id="nextPg" ${pageIdx >= pages - 1 ? "disabled" : ""}>Next →</button>` : "";
      const pv = $("#prevPg", pagerEl); if (pv) pv.onclick = () => { pageIdx--; draw($("#lbSearch", body).value); };
      const nx = $("#nextPg", pagerEl); if (nx) nx.onclick = () => { pageIdx++; draw($("#lbSearch", body).value); };
    }
    draw();
    $("#lbSearch", body).oninput = (e) => { pageIdx = 0; draw(e.target.value); };
    const rs = $("#regionSel", body);
    if (rs) rs.onchange = () => { if (mode === "state") bagelState = rs.value; else bagelDistrict = rs.value; renderBagelStats($("#view")); };
  }

  async function renderBagelEvent(body) {
    const s = Store.getSettings();
    // No event selected yet
    if (!s.eventKey) {
      body.innerHTML = `<div class="card">${emptyState("calendar", "No event selected",
        "Choose your event on the Dashboard (or the event name at the bottom-left) to see live event EPA, ranks & RP.")}
        <div class="row" style="justify-content:center"><button class="btn primary" id="pickEv">${icon("calendar")} Choose event</button></div></div>`;
      const pe = $("#pickEv", body); if (pe) pe.onclick = openEventPicker;
      return;
    }
    body.innerHTML = `<div class="empty">${icon("chart")}<p class="muted">Loading ${esc(s.eventName || s.eventKey)} matches…</p></div>`;
    let fetchErr = null;
    try { await API.getEventMatches(s.eventKey); } catch (e) { fetchErr = e.message; }
    const epa = currentEventEpa();
    if (!epa || !epa.ranked.length) {
      let title = "No match data yet", msg, showRetry = true;
      if (fetchErr === "NO_KEY") { title = "No Blue Alliance key";
        msg = "The event EPA is built from TBA match results, which need a key. Paste yours in js/config.js (defaultTbaKey) or Settings → The Blue Alliance → Advanced, then Retry."; }
      else if (fetchErr === "BAD_KEY") { title = "Blue Alliance key rejected";
        msg = "Your TBA key was rejected. Check it in js/config.js / Settings → The Blue Alliance, then Retry."; }
      else if (fetchErr) { title = "Couldn't reach The Blue Alliance";
        msg = "Offline or TBA is unreachable. Connect to wifi and tap Retry — during a live event, data updates as matches are scored."; }
      else { msg = "No qualification matches have been scored yet for this event. They'll appear automatically as results post — tap Retry to refresh."; }
      body.innerHTML = `<div class="card">${emptyState("chart", title, msg)}
        <div class="row" style="justify-content:center">${showRetry ? `<button class="btn primary" id="retryEv">${icon("search")} Retry now</button>` : ""}</div></div>`;
      const rt = $("#retryEv", body); if (rt) rt.onclick = () => renderBagelEvent(body);
      return;
    }
    // TBA rankings → rank / ranking score (RP) / W-L-T
    let rankMap = {};
    try {
      const { rankings } = await API.getEventRankings(s.eventKey);
      rankings.forEach((r) => {
        const t = r.team_key.replace("frc", "");
        rankMap[t] = { rank: r.rank, rp: (r.sort_orders && r.sort_orders.length ? r.sort_orders[0] : null),
          record: r.record ? { w: r.record.wins, l: r.record.losses, t: r.record.ties } : null };
      });
    } catch (e) { /* rankings optional */ }
    const haveRanks = Object.keys(rankMap).length > 0;

    const rows = epa.ranked.map((r) => {
      const tr = rankMap[r.team] || {};
      return { team: r.team, name: teamName(r.team), epa: r.epa, breakdown: r.breakdown,
        tbaRank: tr.rank ?? null, rp: tr.rp ?? null, record: tr.record ?? null };
    });
    // Default to TBA rank order on the Event tab
    if (haveRanks) bagelSort = { col: "rank", dir: "asc" };
    body.innerHTML = `
      <div class="section-head" style="margin-top:4px">
        <div><h3 style="margin:0">${esc(s.eventName || s.eventKey)}</h3>
          <span class="hint">EPA on-device from ${epa.played} matches · ${haveRanks ? "ranks & RP from TBA" : "TBA ranks unavailable"} · ${rows.length} teams</span></div>
        <input type="search" id="lbSearch" placeholder="Search team…" style="min-width:200px;flex:none" />
      </div>
      <div id="lbList"></div>`;
    const listEl = $("#lbList", body);
    function draw(filter = "") {
      const f = filter.trim().toLowerCase();
      let r = f ? rows.filter((x) => x.team.includes(f) || (x.name || "").toLowerCase().includes(f)) : rows;
      r = applyBagelSort(r, "event");
      listEl.innerHTML = r.length ? leaderboardTable(r, { mode: "event" }) : emptyState("search", "No teams", "Try another search.");
      wireLeaderboard(listEl, () => draw($("#lbSearch", body).value));
      paintAvatars(listEl, r.map((x) => x.team));
    }
    draw();
    $("#lbSearch", body).oninput = (e) => draw(e.target.value);
  }

  function gotoBagel(tab, team) {
    bagelTab = tab; bagelFocusTeam = team || null;
    if (current() === "bagelstats") renderBagelStats($("#view")); else go("bagelstats");
  }

  /* ===========================================================================
     VIEW: COMPARE  (overlay multiple teams' EPA graphs + stat comparison)
     ======================================================================== */
  let compareTab = "global";     // global | event
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
    root.innerHTML = `
      <div class="section-head">
        <div class="pill-toggle" id="cmpTabs">
          <button data-t="global" class="${compareTab === "global" ? "on" : ""}">Global</button>
          <button data-t="event" class="${compareTab === "event" ? "on" : ""}">Event</button>
        </div>
        <span class="badge cyan">EPA · ${GAME.seasonLabel}</span>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div class="field" style="margin:0"><label>Add a team to compare</label>
            ${compareTab === "event" && eventTeams().length
              ? `<select id="cmpAdd" style="min-width:200px"><option value="">Select team…</option>${
                  eventTeams().filter((t) => !compareTeams.includes(String(t.team_number)))
                    .map((t) => `<option value="${t.team_number}">${t.team_number} · ${esc(t.nickname || "")}</option>`).join("")}</select>`
              : `<input type="number" id="cmpAdd" placeholder="Team #" inputmode="numeric" style="max-width:160px" />`}</div>
          <button class="btn primary" id="cmpAddBtn">${icon("plus")} Add</button>
          <button class="btn ghost" id="cmpTop5">${icon("trophy")} Top 5 by EPA</button>
          ${compareTab === "event" && !eventTeams().length ? `<span class="hint">Pick an event on the Dashboard to get a team dropdown.</span>` : ""}
        </div>
        <div id="cmpChips" class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap"></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <h3>${icon("chart")} EPA over time</h3>
        <div id="cmpChart"><p class="muted" style="text-align:center;padding:14px 0">Add teams above to overlay their EPA graphs.</p></div>
      </div>
      <div class="card"><h3>Stat comparison</h3><div id="cmpStats"></div></div>`;

    $$("#cmpTabs button", root).forEach((b) => b.onclick = () => { compareTab = b.dataset.t; renderCompare(root); });
    const addBtn = $("#cmpAddBtn", root), addInput = $("#cmpAdd", root);
    const add = () => {
      const t = (addInput.value || "").replace(/\D/g, "");
      if (!t) return;
      if (!compareTeams.includes(t)) { if (compareTeams.length >= 6) { toast("Up to 6 teams", "err"); return; } compareTeams.push(t); }
      addInput.value = ""; draw();
    };
    addBtn.onclick = add;
    addInput.onkeydown = (e) => { if (e.key === "Enter") add(); };
    // Fill the compare list with the 5 highest-EPA teams for the current tab.
    $("#cmpTop5", root).onclick = () => {
      let ranked;
      if (compareTab === "event") {
        const ev = currentEventEpa();
        const pool = eventTeams().map((t) => String(t.team_number)).filter((t) => ev && ev.byTeam[t]);
        ranked = pool.sort((a, b) => ev.byTeam[b].epa - ev.byTeam[a].epa);
        if (!ranked.length) { toast("No event EPA yet — load the event's matches (needs wifi) first", "err"); return; }
      } else {
        const epaMap = buildSeasonEpa();
        const evTeams = eventTeams().map((t) => String(t.team_number));
        if (evTeams.length) ranked = evTeams.filter((t) => epaMap[t] != null).sort((a, b) => epaMap[b] - epaMap[a]);
        else ranked = (API.sbCachedLeaderboard(GAME.season) || []).map((r) => String(r.team)); // world top 5
        if (!ranked.length) { toast("Load World EPA first (BagelStats → World)", "err"); return; }
      }
      compareTeams = ranked.slice(0, 5);
      draw();
      toast("Added the top 5 teams by EPA");
    };

    async function draw() {
      // chips
      const chipsEl = $("#cmpChips", root);
      chipsEl.innerHTML = compareTeams.length
        ? compareTeams.map((t, i) => `<span class="cmp-chip" style="border-color:${CMP_PALETTE[i % CMP_PALETTE.length]}">
            <i style="background:${CMP_PALETTE[i % CMP_PALETTE.length]}"></i>${t}
            <button data-rm="${t}" aria-label="Remove">${icon("x")}</button></span>`).join("")
        : `<span class="hint">No teams added yet.</span>`;
      $$("[data-rm]", chipsEl).forEach((b) => b.onclick = () => { compareTeams = compareTeams.filter((x) => x !== b.dataset.rm); draw(); });

      const chartEl = $("#cmpChart", root), statsEl = $("#cmpStats", root);
      if (!compareTeams.length) {
        chartEl.innerHTML = `<p class="muted" style="text-align:center;padding:14px 0">Add teams above to overlay their EPA graphs.</p>`;
        statsEl.innerHTML = ""; return;
      }
      // distinct palette colors (match the chips) so lines are easy to tell apart
      const colorOf = (t, i) => CMP_PALETTE[i % CMP_PALETTE.length];

      // ---- EPA graph (per-team match series) ----
      chartEl.innerHTML = `<p class="muted" style="text-align:center;padding:14px 0">Loading EPA graphs…</p>`;
      const ek = s.eventKey;
      const seriesList = [];
      for (let i = 0; i < compareTeams.length; i++) {
        const t = compareTeams[i];
        let pts = [];
        try {
          const rows = await API.sbTeamMatches(t, GAME.season);
          pts = (compareTab === "event" ? rows.filter((m) => m.event === ek) : rows).map((m) => ({ epa: m.epa }));
        } catch (e) {}
        seriesList.push({ team: t, color: colorOf(t, i), points: pts });
      }
      renderMultiLineChart(chartEl, seriesList);

      // ---- Stat comparison table ----
      const lb = API.sbCachedLeaderboard(GAME.season) || [];
      const lbMap = {}; lb.forEach((r) => { lbMap[r.team] = r; });
      const ev = currentEventEpa();
      let rows;
      if (compareTab === "event") {
        rows = [
          ["Event EPA", (t) => ev && ev.byTeam[t] ? fmt(ev.byTeam[t].epa) : "–"],
          ["Auto EPA", (t) => ev && ev.byTeam[t] && ev.byTeam[t].breakdown ? fmt(ev.byTeam[t].breakdown.auto) : "–"],
          ["Teleop EPA", (t) => ev && ev.byTeam[t] && ev.byTeam[t].breakdown ? fmt(ev.byTeam[t].breakdown.teleop) : "–"],
          ["Endgame EPA", (t) => ev && ev.byTeam[t] && ev.byTeam[t].breakdown ? fmt(ev.byTeam[t].breakdown.endgame) : "–"],
          ["Event rank", (t) => ev && ev.byTeam[t] ? "#" + ev.byTeam[t].rank : "–"],
        ];
      } else {
        rows = [
          ["Season EPA", (t) => lbMap[t] ? fmt(lbMap[t].epa) : "–"],
          ["Auto EPA", (t) => lbMap[t] && lbMap[t].breakdown ? fmt(lbMap[t].breakdown.auto) : "–"],
          ["Teleop EPA", (t) => lbMap[t] && lbMap[t].breakdown ? fmt(lbMap[t].breakdown.teleop) : "–"],
          ["Endgame EPA", (t) => lbMap[t] && lbMap[t].breakdown ? fmt(lbMap[t].breakdown.endgame) : "–"],
          ["World rank", (t) => lbMap[t] ? "#" + lbMap[t].worldRank : "–"],
          ["State rank", (t) => lbMap[t] && lbMap[t].stateRank ? "#" + lbMap[t].stateRank : "–"],
          ["Record (W-L-T)", (t) => lbMap[t] && lbMap[t].record ? `${lbMap[t].record.w}-${lbMap[t].record.l}-${lbMap[t].record.t}` : "–"],
        ];
      }
      statsEl.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Stat</th>${compareTeams.map((t, i) =>
          `<th class="num"><span class="cmp-th" style="color:${colorOf(t, i)}">${t}</span></th>`).join("")}</tr></thead>
        <tbody>${rows.map(([label, fn]) => `<tr><td class="muted">${label}</td>${
          compareTeams.map((t) => `<td class="num">${fn(t)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        ${compareTab === "event" && !s.eventKey ? `<p class="hint" style="margin-top:10px">Select an event on the Dashboard to see event stats.</p>` : ""}`;
    }
    draw();
  }

  /* ===========================================================================
     VIEW: ADMIN PANEL (member roster + access requests)
     ======================================================================== */
  let adminUnlocked = false;
  function renderAdmin(root) {
    const pin = (window.CONFIG && window.CONFIG.adminPin) || "";
    if (pin && !adminUnlocked) {
      root.innerHTML = `
        <div class="card" style="max-width:440px;margin:40px auto">
          <div class="row" style="gap:10px;margin-bottom:6px">${icon("shield")}<h2 style="margin:0">Admin access</h2></div>
          <p class="hint">Enter the admin PIN to view the member roster and access requests.</p>
          <div class="field"><label>Admin PIN</label><input type="password" id="adminPin" placeholder="PIN" /></div>
          <div class="login-error" id="adminErr" hidden></div>
          <button class="btn primary block" id="adminUnlock">${icon("shield")} Unlock</button>
        </div>`;
      const tryUnlock = () => {
        if ($("#adminPin", root).value === pin) { adminUnlocked = true; renderAdmin(root); }
        else { const e = $("#adminErr", root); e.textContent = "Wrong PIN."; e.hidden = false; }
      };
      $("#adminUnlock", root).onclick = tryUnlock;
      $("#adminPin", root).onkeydown = (e) => { if (e.key === "Enter") tryUnlock(); };
      $("#adminPin", root).focus();
      return;
    }

    const requests = Store.getRequests();
    const reqKeys = Object.keys(requests).sort((a, b) => requests[b].ts - requests[a].ts);
    const members = Store.getMembers();
    const memKeys = Object.keys(members).sort((a, b) => (members[a].first || "").localeCompare(members[b].first || ""));
    const dt = (ts) => ts ? new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "–";
    const tabs = [
      ["requests", "Requests & members"],
      ["scouters", "Scouters"],
      ["bagelbucks", "Bagel Bucks"],
      ["matchform", "Match form"],
      ["pitform", "Pit form"],
      ["testevent", "Test event"],
      ["data", "Data"],
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
              <p class="hint" style="margin:4px 0 0">These people signed in with a name that isn't on the roster yet. Approve to add them, or deny to dismiss.</p></div>
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
          <thead><tr><th>Name</th><th>First seen</th><th>Last seen</th><th></th></tr></thead>
          <tbody>${memKeys.map((key) => `<tr>
            <td><b>${esc(members[key].first)} ${esc(members[key].last)}</b></td>
            <td class="muted">${esc(dt(members[key].firstSeen))}</td>
            <td class="muted">${esc(dt(members[key].lastSeen))}</td>
            <td><button class="icon-btn" data-remove="${esc(key)}" aria-label="Remove member">${icon("trash")}</button></td>
          </tr>`).join("")}</tbody></table></div>`
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

    root.innerHTML = `
      <div class="subtabs" id="adminTabs">
        ${tabs.map(([kk, l]) => `<a href="#/admin/${kk}" class="${active === kk ? "on" : ""}">${esc(l)}${kk === "requests" && reqKeys.length ? ` (${reqKeys.length})` : ""}</a>`).join("")}
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
      confirmDialog("Remove this member from the roster?", () => { Store.removeMember(b.dataset.remove); Cloud.pushRoster(); toast("Member removed"); renderAdmin(root); }));
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
    const year = GAME.season;
    root.innerHTML = `
      <div class="grid cols-2">
        <div class="card"><h2>The Blue Alliance</h2>
          <div>${API.hasKey()
            ? `<span class="badge green dot">Connected</span> <span class="hint">Built-in team key — scouts don't need to enter anything.</span>`
            : `<span class="badge red dot">No key set</span> <span class="hint">Paste your key in <code>js/config.js</code>, or add one below for just this device.</span>`}</div>
          <div class="btn-row" style="margin-top:12px">
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
        </div>
        <div class="card"><h2>Preferences</h2>
          <div class="field"><label>Theme</label>
            <div class="pill-toggle" id="setTheme">
              <button data-v="dark" class="${s.theme !== "light" ? "on" : ""}">Dark</button>
              <button data-v="light" class="${s.theme === "light" ? "on" : ""}">Light</button></div></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px"><h2>${icon("calendar")} Event</h2>
        <p class="hint">Load an event to pull its full team list & match schedule. Do this at home with wifi — it's cached for offline use at the venue.</p>
        <div class="row" style="margin-bottom:12px">
          <button class="btn ghost sm" id="loadEvents">${icon("search")} Load ${year} events</button>
          ${s.eventName ? `<span class="badge yellow dot">Current: ${esc(s.eventName)}</span>` : ""}
        </div>
        <div class="field" style="max-width:520px"><input type="search" id="evFilter" placeholder="Filter events by name / city…" /></div>
        <div id="eventList"></div>
      </div>

      <div class="card" style="margin-top:16px"><h2>${icon("wrench")} Pit map</h2>
        <p class="hint">Paste a link to your event's pit-map image (e.g. from Nexus, the event page, or a photo you host).
          The Pit Scouting page shows it above a team grid that turns green as pits get scouted.</p>
        <div class="field inline"><div><label>Show pit map</label><span class="help">Turn off for events with no map.</span></div>
          <label class="switch"><input type="checkbox" id="setPitMapOn" ${s.pitMapEnabled ? "checked" : ""}><span class="slider"></span></label></div>
        <div class="field"><label>Pit map image URL</label>
          <input type="text" id="setPitMapUrl" value="${esc(s.pitMapUrl || "")}" placeholder="https://…/pit-map.png" /></div>
        <button class="btn primary sm" id="savePitMap">${icon("check")} Save pit map</button>
      </div>`;

    const testKeyBtn = $("#testKey", root);
    if (testKeyBtn) testKeyBtn.onclick = async () => {
      const st = $("#keyStatus", root);
      if (!API.hasKey()) { st.innerHTML = `<span style="color:var(--danger)">No key set — see js/config.js</span>`; return; }
      st.textContent = "Testing…";
      try { await API.verifyKey(); st.innerHTML = `<span style="color:var(--success)">✓ Connection OK</span>`; toast("The Blue Alliance connected"); }
      catch (e) { st.innerHTML = `<span style="color:var(--danger)">✗ ${e.message === "BAD_KEY" ? "Invalid key" : "Couldn't connect (offline?)"}</span>`; }
    };
    const saveKeyBtn = $("#saveKey", root);
    if (saveKeyBtn) saveKeyBtn.onclick = async () => {
      const key = $("#setKey", root).value.trim();
      Store.setSettings({ tbaKey: key });
      toast(key ? "Personal key saved" : "Override cleared — using built-in key");
      renderSettings(root);
    };
    $("#savePitMap", root).onclick = () => {
      Store.setSettings({ pitMapUrl: $("#setPitMapUrl", root).value.trim(), pitMapEnabled: $("#setPitMapOn", root).checked });
      toast("Pit map saved");
    };
    $$("#setTheme button", root).forEach((b) => b.onclick = () => {
      $$("#setTheme button", root).forEach((x) => x.classList.toggle("on", x === b));
      applyTheme(b.dataset.v); Store.setSettings({ theme: b.dataset.v }); refreshChrome();
    });

    let eventsCache = [];
    const drawEvents = (filter = "") => {
      const el = $("#eventList", root);
      const f = filter.toLowerCase();
      const list = eventsCache.filter((e) => !f || (e.name || "").toLowerCase().includes(f) ||
        (e.city || "").toLowerCase().includes(f) || (e.key || "").toLowerCase().includes(f)).slice(0, 60);
      if (!list.length) { el.innerHTML = `<p class="muted">${eventsCache.length ? "No matches." : "Click “Load events” above."}</p>`; return; }
      el.innerHTML = `<div class="table-wrap" style="max-height:420px;overflow:auto"><table>
        <thead><tr><th>Event</th><th>Location</th><th>Dates</th><th></th></tr></thead>
        <tbody>${list.map((e) => `<tr>
          <td><b>${esc(e.name || e.key)}</b></td>
          <td class="muted">${esc([e.city, e.state_prov, e.country].filter(Boolean).join(", "))}</td>
          <td class="muted">${esc(e.start_date || "")}</td>
          <td><button class="btn primary sm" data-ev="${esc(e.key)}" data-name="${esc(e.name || e.key)}">Select</button></td>
        </tr>`).join("")}</tbody></table></div>`;
      $$("[data-ev]", el).forEach((b) => b.onclick = () => selectEvent(b.dataset.ev, b.dataset.name));
    };

    $("#loadEvents", root).onclick = async () => {
      if (!API.hasKey()) { toast("No TBA key set — paste one in js/config.js", "err"); return; }
      const el = $("#eventList", root); el.innerHTML = `<p class="muted">Loading ${year} events…</p>`;
      try {
        const { events, fromCache } = await API.getEvents(year);
        eventsCache = events; drawEvents($("#evFilter", root).value);
        if (fromCache) toast("Loaded events from cache (offline)");
      } catch (e) {
        el.innerHTML = `<p style="color:var(--danger)">${e.message === "NO_KEY" ? "Add your TBA key first." :
          e.message === "BAD_KEY" ? "That TBA key is invalid." : "Couldn't load events (offline & no cache)."}</p>`;
      }
    };
    $("#evFilter", root).oninput = (e) => drawEvents(e.target.value);

    async function selectEvent(key, name) {
      Store.setSettings({ eventKey: key, eventName: name });
      refreshChrome();
      toast("Loading team list & schedule…");
      try {
        await API.getEventTeams(key);
        await API.getEventMatches(key);
        // warm the color cache for the roster
        API.getTeamColors(eventTeams().map((t) => t.team_number));
        toast(`Event set: ${name}`);
      } catch (e) { toast("Event set, but team list needs wifi to load", "err"); }
    }
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
      if (current() === "match") { refreshRobotClaims(); return; }
      if (current() === "pit") { if (pitPageRefresh) pitPageRefresh(); return; }
      if (teChanged || bbChanged || ["members", "picklist", "data", "admin", "teams"].includes(current())) router();
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

