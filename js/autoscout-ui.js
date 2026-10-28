/* =============================================================================
   autoscout-ui.js  —  Scouting → Auto Scout
   -----------------------------------------------------------------------------
   #/autoscout            pick an event, then a match with a video
   #/autoscout/<match>    the workspace: 1 Video → 2 Tag → 3 Track → 4 Results

   The video: the match's YouTube video from TBA plays right on the page, and
   Chrome/Edge tab capture ("Share this tab") hands Auto Scout its pixels.
   Element Capture keeps our own drawing out of what's read (Region Capture is
   the fallback: then the boxes show in a side preview instead of on the video).
   A downloaded video file works everywhere and can run faster than real time.

   Tagging happens on a still of the first frame of auto: where the field camera
   is, both hubs, and which robot is which. Then the video plays from the start
   of auto and autoscout.js does the tracking; the official TBA breakdown turns
   that into who scored what. Results are saved on this device and to the team
   (Firestore autoscout/{matchKey}, if the rules allow it).
   ========================================================================== */
const AutoScoutUI = (() => {
  "use strict";
  let H = null; // helpers from app.js: $, $$, esc, icon, toast, modal, confirmDialog, pageHero, emptyState, nameFor, shortEventName, paintTeamFills, scoutDisplayName
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => H.esc(s), icon = (n, c) => H.icon(n, c);
  const CFG = () => (window.GAME && GAME.autoScout) || null;
  const LS = "bb702.as.";
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  // one color per robot: warm for red, cool for blue
  const SLOT = { red: ["#ff5a4f", "#ffa53a", "#ff6fb5"], blue: ["#3fa2ff", "#9b7bff", "#26d0b0"] };
  const ALLY = { red: "#e0564f", blue: "#3f7fe0" };
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const tag = (m) => m.comp_level === "qm" ? "Q" + m.match_number : m.comp_level === "sf" ? "SF" + m.set_number
    : m.comp_level === "f" ? "F" + m.match_number : m.comp_level.toUpperCase() + m.set_number + "-" + m.match_number;
  const longLabel = (m) => m.comp_level === "qm" ? "Qualification " + m.match_number : m.comp_level === "sf" ? "Playoff match " + m.set_number
    : m.comp_level === "f" ? "Finals " + m.match_number : tag(m);
  const LEVEL = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
  const teamsOf = (m, al) => ((m.alliances && m.alliances[al] && m.alliances[al].team_keys) || []).map((k) => k.replace("frc", ""));
  // TBA video keys can carry a start time ("abc123?t=45")
  const ytVideos = (m) => (m.videos || []).filter((v) => v.type === "youtube" && v.key).map((v) => {
    const [id, q] = String(v.key).split(/[?&](.*)/s);
    const t = /(?:^|&)(?:t|start)=(\d+)/.exec(q || "");
    return { id, start: t ? Number(t[1]) : 0 };
  });
  const canCapture = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia &&
    ("RestrictionTarget" in window || "CropTarget" in window) && "MediaStreamTrackProcessor" in window);

  /* ===========================================================================
     Results: this device + the team's cloud
     ======================================================================== */
  const resKey = () => "results." + GAME.season;
  const localResults = () => ls.get(resKey(), {});
  function saveLocal(doc) {
    const all = localResults(); all[doc.key] = doc;
    const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
    keys.slice(250).forEach((k) => delete all[k]);
    ls.set(resKey(), all);
  }
  async function eventResults(eventKey) {
    const map = {};
    Object.values(localResults()).forEach((d) => { if (d.event === eventKey) map[d.key] = d; });
    if (window.Cloud && Cloud.listAutoScout && Cloud.enabled()) {
      try { (await Cloud.listAutoScout(eventKey)).forEach((d) => { if (!map[d.key] || (d.at || 0) > (map[d.key].at || 0)) map[d.key] = d; }); }
      catch (e) { /* rules may not allow autoscout yet: this device's results still show */ }
    }
    return map;
  }
  async function saveResult(doc) {
    saveLocal(doc);
    if (!(window.Cloud && Cloud.saveAutoScout && Cloud.enabled())) return "local";
    try { await Cloud.saveAutoScout(doc); return "cloud"; } catch (e) { return "local"; }
  }

  /* ===========================================================================
     Routing
     ======================================================================== */
  let session = null;
  function page(root) {
    const key = decodeURIComponent((location.hash.replace(/^#\/?/, "").split("/")[1]) || "");
    if (!CFG()) return renderOffSeason(root);
    if (key) return renderWorkspace(root, key);
    renderLanding(root);
  }
  function unmount() { if (session) { session.destroy(); session = null; } }

  const hero = (side) => H.pageHero({ ic: "scan", eyebrow: "Scouting · Beta", title: "Auto Scout",
    sub: "Let the match video scout for you. Tag the six robots once, and Auto Scout follows every robot and every shot, then splits the official score by who shot it.", side });

  function renderOffSeason(root) {
    root.innerHTML = hero() + `<div class="card as-off">${H.emptyState("scan", `Auto Scout doesn't know ${esc(GAME.seasonLabel)} yet`,
      `It learns each game's pieces, scoring periods and TBA breakdown after kickoff. For REBUILT matches, switch the season to 2026 in Settings.`)}
      <div class="btn-row" style="justify-content:center"><a class="btn ghost sm" href="#/settings">${icon("settings")} Settings</a></div></div>`;
  }

  /* ===========================================================================
     Landing: event → matches, plus team stats from what's been analyzed
     ======================================================================== */
  let lastFilter = "all", lastTeamQ = "", lastTab = "matches";
  function currentEvent() {
    const saved = ls.get("event", null);
    if (saved && saved.season === GAME.season && saved.key) return saved;
    const s = Store.getSettings();
    return s.eventKey ? { key: s.eventKey, name: s.eventName || s.eventKey, season: GAME.season } : null;
  }
  function renderLanding(root) {
    const ev = currentEvent();
    root.innerHTML = hero(`<span class="as-beta">${icon("zap")} Beta</span>`) + `
      <div class="as-how">
        ${[["search", "Find the match", "Any event, any match with a video"], ["target", "Tag the robots", "Tap each robot once at the start"],
          ["scan", "Watch it track", "Robots, shots and balls per second, live"], ["trophy", "Who scored", "The official score, split by shooter"]]
          .map(([ic, b, s], i) => `<div class="as-how-step" style="--i:${i}"><span class="as-how-n">${i + 1}</span>${icon(ic)}<div><b>${b}</b><span>${s}</span></div></div>`).join("")}
      </div>
      <div class="card as-evbar">
        <div class="as-ev-now">${icon("calendar")}<div><small>${esc(GAME.seasonLabel)} event</small><b id="asEvName">${ev ? esc(H.shortEventName(ev.name)) : "Pick an event"}</b></div></div>
        <label class="ds-search as-ev-search">${icon("search")}<input id="asEvQ" type="search" placeholder="Search events by name, city or code…" autocomplete="off" /></label>
        <div class="as-ev-drop" id="asEvDrop" hidden></div>
      </div>
      <div id="asBody"></div>`;
    wireEventSearch(root, (e) => { ls.set("event", { key: e.key, name: e.name, season: GAME.season }); $("#asEvName", root).textContent = H.shortEventName(e.name); loadEvent($("#asBody", root), e); });
    if (ev) loadEvent($("#asBody", root), ev);
    else $("#asBody", root).innerHTML = `<div class="card">${H.emptyState("calendar", "Pick an event", "Search above for the event whose matches you want Auto Scout to watch.")}</div>`;
  }
  function wireEventSearch(root, onPick) {
    const q = $("#asEvQ", root), drop = $("#asEvDrop", root);
    let events = null;
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      if (!s || !events) { drop.hidden = true; return; }
      const hits = events.filter((e) => [e.name, e.city, e.state_prov, e.country, e.key, e.event_code].some((x) => String(x || "").toLowerCase().includes(s))).slice(0, 8);
      drop.hidden = false;
      drop.innerHTML = hits.length ? hits.map((e) => `<button class="as-ev-hit" data-ev="${esc(e.key)}"><b>${esc(H.shortEventName(e.name))}</b><span>${esc([e.city, e.state_prov, e.country].filter(Boolean).join(", "))} · ${esc(e.start_date || "")}</span></button>`).join("")
        : `<div class="as-ev-none">No ${GAME.season} events match "${esc(q.value)}"</div>`;
      $$("[data-ev]", drop).forEach((b) => b.onclick = () => { const e = events.find((x) => x.key === b.dataset.ev); q.value = ""; drop.hidden = true; onPick(e); });
    };
    q.addEventListener("focus", () => { if (!events) API.eventsForYear(GAME.season).then((l) => { events = l; draw(); }).catch(() => { events = []; }); });
    q.addEventListener("input", draw);
    q.addEventListener("keydown", (e) => { if (e.key === "Escape") { q.value = ""; drop.hidden = true; } });
    document.addEventListener("pointerdown", function off(e) { if (!drop.isConnected) return document.removeEventListener("pointerdown", off); if (!e.target.closest(".as-evbar")) drop.hidden = true; });
  }

  async function loadEvent(body, ev) {
    body.innerHTML = `<div class="card tp-loading"><span class="tp-spin"></span>Loading matches and videos…</div>`;
    let matches, done;
    try { [matches, done] = await Promise.all([API.eventMatchesFull(ev.key), eventResults(ev.key)]); }
    catch (e) {
      if (body.isConnected) body.innerHTML = `<div class="card">${H.emptyState("globe", "Couldn't load this event", "The Blue Alliance needs wifi. Try again online.")}</div>`;
      return;
    }
    if (!body.isConnected) return;
    matches = matches.slice().sort((a, b) => (LEVEL[a.comp_level] - LEVEL[b.comp_level]) || (a.set_number - b.set_number) || (a.match_number - b.match_number));
    const nDone = Object.keys(done).length;
    body.innerHTML = `
      <div class="as-tabs seg" role="tablist">
        <button data-tab="matches" class="${lastTab === "matches" ? "on" : ""}">${icon("play")} Matches</button>
        <button data-tab="teams" class="${lastTab === "teams" ? "on" : ""}">${icon("podium")} Team stats${nDone ? ` <span class="as-count">${nDone}</span>` : ""}</button>
      </div>
      <div id="asPane"></div>`;
    const pane = $("#asPane", body);
    const show = () => { $$("[data-tab]", body).forEach((b) => b.classList.toggle("on", b.dataset.tab === lastTab)); if (lastTab === "teams") drawTeamStats(pane, done, ev); else drawMatches(pane, matches, done); };
    $$("[data-tab]", body).forEach((b) => b.onclick = () => { lastTab = b.dataset.tab; show(); });
    show();
  }

  function drawMatches(pane, matches, done) {
    const withVid = matches.filter((m) => ytVideos(m).length).length;
    pane.innerHTML = `
      <div class="as-filters">
        <div class="seg" id="asF">${[["all", "All"], ["qm", "Quals"], ["po", "Playoffs"], ["done", "Analyzed"]].map(([k, l]) => `<button data-f="${k}" class="${lastFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <label class="ds-search as-team-q">${icon("search")}<input id="asTeamQ" type="search" inputmode="numeric" placeholder="Team #" value="${esc(lastTeamQ)}" /></label>
        <span class="muted as-vidcount">${icon("play")} ${withVid} of ${matches.length} matches have video</span>
      </div>
      <div class="as-grid" id="asGrid"></div>`;
    const grid = $("#asGrid", pane);
    const draw = () => {
      const q = lastTeamQ.trim();
      const list = matches.filter((m) => (lastFilter === "all" || (lastFilter === "qm" ? m.comp_level === "qm" : lastFilter === "po" ? m.comp_level !== "qm" : !!done[m.key]))
        && (!q || teamsOf(m, "red").concat(teamsOf(m, "blue")).some((t) => t.startsWith(q))));
      if (!list.length) { grid.innerHTML = `<div class="card as-empty">${H.emptyState("search", matches.length ? "No matches here" : "No schedule yet", matches.length ? "Try another filter or team number." : "This event's matches aren't on TBA yet.")}</div>`; return; }
      grid.innerHTML = list.map((m, i) => {
        const v = ytVideos(m)[0], r = done[m.key], played = m.alliances && m.alliances.red.score >= 0;
        const rs = played ? m.alliances.red.score : null, bs = played ? m.alliances.blue.score : null;
        const side = (al) => `<span class="as-mc-teams ${al}">${teamsOf(m, al).map((t) => `<i>${esc(t)}</i>`).join("")}</span>`;
        return `<a class="as-mc${v ? "" : " novid"}${r ? " done" : ""}" ${v ? `href="#/autoscout/${esc(m.key)}"` : `aria-disabled="true"`} style="--i:${Math.min(i, 24)}">
          <span class="as-mc-thumb">${v ? `<img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy" />` : `<span class="as-mc-novid">${icon("eye-off")}No video yet</span>`}
            <b class="as-mc-tag">${esc(tag(m))}</b>${r ? `<span class="as-mc-done">${icon("check")} Analyzed</span>` : v ? `<span class="as-mc-go">${icon("scan")} Auto Scout</span>` : ""}</span>
          <span class="as-mc-body">${side("red")}<span class="as-mc-score">${played ? `<b class="r">${rs}</b><em>–</em><b class="b">${bs}</b>` : `<em>${m.time ? new Date(m.time * 1000).toLocaleTimeString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "TBD"}</em>`}</span>${side("blue")}</span>
          ${r ? `<span class="as-mc-by">${esc(r.by || "Someone")} · ${esc(timeAgo(r.at))}</span>` : ""}
        </a>`;
      }).join("");
    };
    $$("[data-f]", pane).forEach((b) => b.onclick = () => { lastFilter = b.dataset.f; $$("[data-f]", pane).forEach((x) => x.classList.toggle("on", x === b)); draw(); });
    $("#asTeamQ", pane).oninput = (e) => { lastTeamQ = e.target.value.replace(/\D/g, ""); draw(); };
    draw();
  }
  const timeAgo = (ts) => { const s = (Date.now() - (ts || 0)) / 1000; return s < 90 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago"; };

  // every team's averages over the matches Auto Scout has watched
  function teamTable(done) {
    const by = {};
    Object.values(done).forEach((d) => (d.robots || []).forEach((r) => {
      const t = by[r.team] || (by[r.team] = { team: r.team, n: 0, pts: 0, fuel: 0, shots: 0, climb: 0, bpsW: 0, sec: 0, peak: 0 });
      t.n++; t.pts += r.points || 0; t.fuel += r.fuel || 0; t.shots += r.shots || 0; t.climb += r.climb || 0;
      t.bpsW += (r.bps || 0) * (r.shootSec || 0); t.sec += r.shootSec || 0; t.peak = Math.max(t.peak, r.peakBps || 0);
    }));
    return Object.values(by).map((t) => ({ ...t, avgPts: t.pts / t.n, avgFuel: t.fuel / t.n, avgShots: t.shots / t.n, acc: t.shots ? Math.min(1, t.fuel / t.shots) : null,
      bps: t.sec ? t.bpsW / t.sec : 0, avgClimb: t.climb / t.n }));
  }
  let teamSort = "avgPts";
  function drawTeamStats(pane, done, ev) {
    const rows = teamTable(done);
    if (!rows.length) { pane.innerHTML = `<div class="card">${H.emptyState("podium", "Nothing analyzed yet", "Run Auto Scout on a few matches and every team's averages show up here.")}</div>`; return; }
    const COLS = [["avgPts", "Points"], ["avgFuel", CFG().pieceNamePlural], ["avgShots", "Shots"], ["acc", "Accuracy"], ["bps", "Balls/s"], ["peak", "Peak b/s"], ["avgClimb", "Climb"], ["n", "Matches"]];
    const draw = () => {
      rows.sort((a, b) => (b[teamSort] ?? -1) - (a[teamSort] ?? -1));
      const max = Math.max(...rows.map((r) => r.avgPts), 1);
      pane.innerHTML = `<div class="card as-tt-card"><div class="as-tt-head"><b>${esc(H.shortEventName(ev.name))}</b><span class="muted">Averages per match · ${plural(Object.keys(done).length, "match")} analyzed</span></div>
        <div class="as-tt-wrap"><table class="as-tt"><thead><tr><th>#</th><th>Team</th>${COLS.map(([k, l]) => `<th><button data-sort="${k}" class="${teamSort === k ? "on" : ""}">${l}</button></th>`).join("")}</tr></thead>
        <tbody>${rows.map((r, i) => `<tr><td class="muted">${i + 1}</td><td><a href="#/team/${esc(r.team)}" class="as-tt-team" data-tfill="${esc(r.team)}"><b>${esc(r.team)}</b><span>${esc(H.nameFor(r.team) || "")}</span></a></td>
          <td><span class="as-tt-bar" style="--w:${(r.avgPts / max * 100).toFixed(0)}%"><b>${r.avgPts.toFixed(1)}</b></span></td>
          <td>${r.avgFuel.toFixed(1)}</td><td>${r.avgShots.toFixed(1)}</td><td>${r.acc == null ? "–" : Math.round(r.acc * 100) + "%"}</td>
          <td>${r.bps ? r.bps.toFixed(1) : "–"}</td><td>${r.peak ? r.peak.toFixed(1) : "–"}</td><td>${r.avgClimb.toFixed(1)}</td><td>${r.n}</td></tr>`).join("")}</tbody></table></div>
        <p class="hint as-tt-note">${icon("info")} Points and ${esc(CFG().pieceNamePlural.toLowerCase())} add up to the official TBA score. Shots, accuracy and balls per second are estimates from the video.</p></div>`;
      $$("[data-sort]", pane).forEach((b) => b.onclick = () => { teamSort = b.dataset.sort; draw(); });
      H.paintTeamFills(pane, rows.map((r) => r.team));
    };
    draw();
  }

  /* ===========================================================================
     Workspace: one match
     ======================================================================== */
  async function renderWorkspace(root, key) {
    root.innerHTML = `<div class="card tp-loading"><span class="tp-spin"></span>Loading the match…</div>`;
    let m;
    try { m = await API.matchFull(key); } catch (e) { m = null; }
    if (!root.isConnected) return;
    if (!m || !m.key) {
      root.innerHTML = `<div class="ds-crumbs"><a class="btn ghost sm" href="#/autoscout">${icon("chevron-left")} Matches</a></div><div class="card">${H.emptyState("globe", "Couldn't load this match", "Check your connection and try again.")}</div>`;
      return;
    }
    let prior = localResults()[key] || null;
    unmount();
    session = createSession(root, m, prior);
    if (!prior) eventResults(m.event_key).then((all) => { if (all[key] && session && session.m.key === key && session.step() === "video") session.showPrior(all[key]); });
  }

  function createSession(root, m, prior) {
    const cfg = CFG();
    const st = {
      step: prior ? "results" : "video", result: prior,
      vids: ytVideos(m), vidIdx: 0, kind: null,        // kind: "youtube" | "file"
      yt: null, ytReady: false, ytAnchor: { raw: 0, at: 0 }, file: null, fileVid: null,
      cap: null,                                        // { stream, track, mode: "element"|"crop", reader }
      still: null,                                      // canvas: the frame everything was tagged on
      t0: null, roi: { x: 0, y: 0.09, w: 1, h: 0.91 }, hubs: { red: null, blue: null }, corners: null,
      robots: [...teamsOf(m, "red").map((t, i) => ({ team: t, alliance: "red", slot: i })), ...teamsOf(m, "blue").map((t, i) => ({ team: t, alliance: "blue", slot: i }))]
        .map((r) => ({ ...r, box: null, color: SLOT[r.alliance][r.slot] })),
      tool: "start", pick: null, speed: 1, wide: false, ask: ls.get("ask", true), asked: {}, lostPrompt: null, check: false, lastPhase: null,
      engine: null, running: false, paused: false, proc: null, lastImg: null, t: 0, rate: [], startWall: 0, lastPanel: 0,
      destroyed: false, raf: 0,
    };
    if (window.__SANDBOX) window.__asSt = st; // testing only: the read-only sandbox can inspect a session
    const END = cfg.periods[cfg.periods.length - 1].end;
    const official = cfg.official(m);
    const played = m.alliances && m.alliances.red.score >= 0 && official.red && official.blue;

    /* ---------- layout ---------- */
    root.innerHTML = `
      <div class="ds-crumbs"><a class="btn ghost sm" href="#/autoscout">${icon("chevron-left")} Matches</a>
        <span class="as-crumb-ev muted">${esc(m.event_key)}</span></div>
      <header class="as-mhead">
        <div class="as-mhead-l"><span class="as-mtag">${esc(tag(m))}</span><div><h2>${esc(longLabel(m))}</h2>
          <span class="muted">${played ? `Final ${m.alliances.red.score}–${m.alliances.blue.score}` : "Not played yet"} · Auto Scout beta</span></div></div>
        <div class="as-mteams">${["red", "blue"].map((al) => `<div class="as-mteam ${al}">${teamsOf(m, al).map((t) => `<b>${esc(t)}</b>`).join("")}${played ? `<em>${m.alliances[al].score}</em>` : ""}</div>`).join("")}</div>
      </header>
      <ol class="as-steps" id="asSteps"></ol>
      <div class="as-work" id="asWork">
        <div class="as-stage-col">
          <div class="as-stage" id="asStage"><div class="as-src" id="asSrc"></div><canvas class="as-ovl" id="asOvl"></canvas>
            <div class="as-stage-msg" id="asMsg" hidden></div></div>
          <div class="as-under" id="asUnder"></div>
        </div>
        <aside class="as-side" id="asSide"></aside>
      </div>
      <div id="asResults"></div>`;
    const stage = $("#asStage", root), src = $("#asSrc", root), ovl = $("#asOvl", root), side = $("#asSide", root), under = $("#asUnder", root);
    const work = $("#asWork", root), resultsEl = $("#asResults", root);
    const octx = ovl.getContext("2d");

    function drawSteps() {
      const order = ["video", "tag", "track", "results"], at = order.indexOf(st.step);
      $("#asSteps", root).innerHTML = [["video", "Video", "play"], ["tag", "Tag", "target"], ["track", "Track", "scan"], ["results", "Who scored", "trophy"]]
        .map(([k, l, ic], i) => `<li class="${i < at ? "done" : i === at ? "on" : ""}"><span>${i < at ? icon("check") : i + 1}</span>${icon(ic)}<b>${l}</b></li>`).join("");
    }

    /* ---------- frame geometry ---------- */
    // The frame's size and where it sits on screen (letterboxed inside the stage).
    function frameSize() {
      if (st.kind === "file" && st.fileVid) return [st.fileVid.videoWidth || 16, st.fileVid.videoHeight || 9];
      if (st.still) return [st.still.width, st.still.height];
      return [16, 9];
    }
    function contentRect() {
      const w = stage.clientWidth, h = stage.clientHeight, [fw, fh] = frameSize();
      let r = { x: 0, y: 0, w, h };
      if (st.kind === "file") { const s = Math.min(w / fw, h / fh); r = { x: (w - fw * s) / 2, y: (h - fh * s) / 2, w: fw * s, h: fh * s }; }
      // zoomed out (field corners, robots off screen): the frame shrinks to leave room around it
      if (st.step === "tag" && st.wide) { const k = 0.62; r = { x: r.x + r.w * (1 - k) / 2, y: r.y + r.h * (1 - k) / 2, w: r.w * k, h: r.h * k }; }
      return r;
    }
    const toScreen = (nx, ny) => { const c = contentRect(); return [c.x + nx * c.w, c.y + ny * c.h]; };
    const toNorm = (sx, sy) => { const c = contentRect(); return [(sx - c.x) / c.w, (sy - c.y) / c.h]; };
    function sizeOverlay() {
      const dpr = window.devicePixelRatio || 1, w = stage.clientWidth, h = stage.clientHeight;
      if (ovl.width !== Math.round(w * dpr) || ovl.height !== Math.round(h * dpr)) { ovl.width = Math.round(w * dpr); ovl.height = Math.round(h * dpr); }
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const ro = new ResizeObserver(() => { sizeOverlay(); redraw(); });
    ro.observe(stage);

    /* ---------- the video sources ---------- */
    function loadYouTubeApi() {
      if (window.YT && YT.Player) return Promise.resolve();
      return new Promise((res, rej) => {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch (e) {} res(); };
        const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.onerror = () => rej(new Error("YouTube didn't load")); document.head.appendChild(s);
      });
    }
    async function useYouTube(idx) {
      clearSource(); st.kind = "youtube"; st.vidIdx = idx;
      const v = st.vids[idx];
      src.innerHTML = `<div id="asYt"></div>`;
      try { await loadYouTubeApi(); } catch (e) { msg("YouTube didn't load. Check your connection, or use a video file.", "warn"); return; }
      if (st.destroyed) return;
      st.yt = new YT.Player($("#asYt", src), {
        videoId: v.id, host: "https://www.youtube-nocookie.com",
        // no YouTube control bar: it would sit on top of the frame Auto Scout reads (our own buttons seek)
        playerVars: { rel: 0, controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1, iv_load_policy: 3, fs: 0, start: v.start || 0, origin: location.origin },
        events: { onReady: () => { st.ytReady = true; if (st.step === "video") drawSide(); }, onStateChange: () => { anchorYt(); } },
      });
      drawSide();
    }
    function useFile(file) {
      clearSource(); st.kind = "file"; st.file = file;
      src.innerHTML = `<video id="asFileVid" playsinline muted preload="auto"></video>`;
      const v = st.fileVid = $("#asFileVid", src);
      v.src = URL.createObjectURL(file);
      v.addEventListener("loadedmetadata", () => { sizeOverlay(); drawSide(); redraw(); }, { once: true });
      v.addEventListener("timeupdate", () => { if (st.step === "tag" && st.tool === "start") updateClock(); });
      drawSide();
    }
    function clearSource() {
      stopCapture();
      if (st.yt) { try { st.yt.destroy(); } catch (e) {} st.yt = null; st.ytReady = false; }
      if (st.fileVid) { try { URL.revokeObjectURL(st.fileVid.src); } catch (e) {} st.fileVid = null; }
      src.innerHTML = ""; st.still = null;
    }
    // YouTube reports its time in steps; between reports, extrapolate.
    function anchorYt() { if (st.yt && st.yt.getCurrentTime) st.ytAnchor = { raw: st.yt.getCurrentTime() || 0, at: performance.now() }; }
    function ytPlaying() { return st.yt && st.yt.getPlayerState && st.yt.getPlayerState() === 1; }
    function videoTime() {
      if (st.kind === "file") return st.fileVid ? st.fileVid.currentTime : 0;
      if (!st.yt || !st.yt.getCurrentTime) return 0;
      const raw = st.yt.getCurrentTime() || 0;
      if (raw !== st.ytAnchor.raw) st.ytAnchor = { raw, at: performance.now() };
      return ytPlaying() ? raw + (performance.now() - st.ytAnchor.at) / 1000 * (st.yt.getPlaybackRate ? st.yt.getPlaybackRate() : 1) : raw;
    }
    function play() { if (st.kind === "file") st.fileVid && st.fileVid.play().catch(() => {}); else if (st.yt) st.yt.playVideo(); }
    function pause() { if (st.kind === "file") st.fileVid && st.fileVid.pause(); else if (st.yt) st.yt.pauseVideo(); }
    function isPlaying() { return st.kind === "file" ? !!(st.fileVid && !st.fileVid.paused) : ytPlaying(); }
    // some files (screen recordings, fragmented MP4s) can't seek: setting the time would
    // jump to the start, so they just keep playing from where they are
    function canSeek(t) {
      if (st.kind !== "file") return true;
      const r = st.fileVid && st.fileVid.seekable;
      if (!r || !r.length) return false;
      for (let k = 0; k < r.length; k++) if (t >= r.start(k) && t <= r.end(k)) return true;
      return false;
    }
    function seek(t) {
      t = Math.max(0, t);
      if (!canSeek(t)) return;
      if (st.kind === "file") { if (st.fileVid) st.fileVid.currentTime = t; }
      else if (st.yt) { st.yt.seekTo(t, true); st.ytAnchor = { raw: t, at: performance.now() }; }
    }
    function setRate(r) { if (st.kind === "file") { if (st.fileVid) st.fileVid.playbackRate = r; } else if (st.yt && st.yt.setPlaybackRate) st.yt.setPlaybackRate(r); }

    // Tab capture of the player (YouTube only): Element Capture, else Region Capture.
    async function connectCapture() {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser", frameRate: { ideal: 30, max: 30 } }, audio: false,
        preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude", monitorTypeSurfaces: "exclude",
      });
      const [track] = stream.getVideoTracks();
      let mode = null;
      try { if ("RestrictionTarget" in window && track.restrictTo) { await track.restrictTo(await RestrictionTarget.fromElement(src)); mode = "element"; } } catch (e) { mode = null; }
      if (!mode) try { if ("CropTarget" in window && track.cropTo) { await track.cropTo(await CropTarget.fromElement(src)); mode = "crop"; } } catch (e) { mode = null; }
      if (!mode) { stream.getTracks().forEach((t) => t.stop()); throw new Error("Pick “This tab” when Chrome asks, so Auto Scout can read the video on this page."); }
      const cap = st.cap = { stream, track, mode, last: null, lastAt: 0, waiters: [], onFrame: null };
      track.addEventListener("ended", () => { if (st.cap === cap) { st.cap = null; if (st.running) pauseRun("The video connection was stopped."); drawSide(); } });
      const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
      cap.reader = reader;
      (async () => {
        for (;;) {
          let r; try { r = await reader.read(); } catch (e) { break; }
          if (r.done) break;
          const fr = r.value;
          try {
            if (cap.onFrame) cap.onFrame(fr);
            if (cap.waiters.length) { const w = cap.waiters.splice(0); w.forEach((fn) => fn(fr)); }
            // a paused video may stop sending frames: keep the latest one (Region Capture
            // only while our overlay is clear, so it never holds our own drawing)
            const now = performance.now();
            if (now - cap.lastAt > 250 && !(cap.mode === "crop" && st.step === "tag" && st.tool !== "start")) {
              const c = cap.last || document.createElement("canvas");
              if (c.width !== fr.displayWidth || c.height !== fr.displayHeight) { c.width = fr.displayWidth; c.height = fr.displayHeight; }
              c.getContext("2d").drawImage(fr, 0, 0); cap.last = c; cap.lastAt = now;
            }
          } finally { fr.close(); }
        }
      })();
    }
    function stopCapture() {
      if (!st.cap) return;
      try { st.cap.reader && st.cap.reader.cancel(); } catch (e) {}
      st.cap.stream.getTracks().forEach((t) => t.stop());
      st.cap = null;
    }
    // the next captured frame, drawn into a canvas (our overlay hidden first in Region Capture mode)
    function nextCapturedFrame(frameCount = 3) {
      return new Promise((res) => {
        if (!st.cap) return res(null);
        const hide = st.cap.mode === "crop";
        if (hide) ovl.style.visibility = "hidden";
        let n = 0;
        const take = (fr) => {
          if (++n < frameCount) { st.cap.waiters.push(take); return; }
          const c = document.createElement("canvas"); c.width = fr.displayWidth; c.height = fr.displayHeight;
          c.getContext("2d").drawImage(fr, 0, 0);
          if (hide) ovl.style.visibility = "";
          res(c);
        };
        st.cap.waiters.push(take);
        // nothing new coming (a paused video often sends no frames): use the latest one
        setTimeout(() => {
          if (n >= frameCount || !st.cap) return;
          n = frameCount; st.cap.waiters = st.cap.waiters.filter((w) => w !== take);
          if (hide) ovl.style.visibility = "";
          const l = st.cap.last;
          if (!l) return res(null);
          const c = document.createElement("canvas"); c.width = l.width; c.height = l.height; c.getContext("2d").drawImage(l, 0, 0);
          res(c);
        }, 900);
      });
    }
    function fileFrame() {
      const v = st.fileVid; if (!v || !v.videoWidth) return null;
      const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d").drawImage(v, 0, 0);
      return c;
    }

    /* ---------- messages on the stage ---------- */
    function msg(text, kind) {
      const el = $("#asMsg", root); if (!el) return;
      el.hidden = !text; el.className = "as-stage-msg" + (kind ? " " + kind : "");
      el.innerHTML = text ? `${icon(kind === "warn" ? "info" : "scan")}<span>${text}</span>` : "";
    }

    /* ---------- tagging ---------- */
    // Pixels of the still (or the current frame) at processing size, for snapping boxes.
    function procOf(canvas, roi) {
      const fw = canvas.width, fh = canvas.height, sw = roi.w * fw, sh = roi.h * fh;
      const sc = Math.min(1, Math.sqrt(260000 / (sw * sh)));
      const W = Math.max(64, Math.round(sw * sc)), Hh = Math.max(36, Math.round(sh * sc));
      const c = document.createElement("canvas"); c.width = W; c.height = Hh;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(canvas, roi.x * fw, roi.y * fh, sw, sh, 0, 0, W, Hh);
      return { img: g.getImageData(0, 0, W, Hh), W, H: Hh };
    }
    const nToP = (p, roi, nx, ny) => [(nx - roi.x) / roi.w * p.W, (ny - roi.y) / roi.h * p.H];
    const pToN = (p, roi, x, y) => [roi.x + x / p.W * roi.w, roi.y + y / p.H * roi.h];
    function boxPToN(p, roi, b) { const [x, y] = pToN(p, roi, b.x, b.y), [x2, y2] = pToN(p, roi, b.x + b.w, b.y + b.h); return { x, y, w: x2 - x, h: y2 - y }; }
    function boxNToP(p, roi, b) { const [x, y] = nToP(p, roi, b.x, b.y), [x2, y2] = nToP(p, roi, b.x + b.w, b.y + b.h); return { x, y, w: x2 - x, h: y2 - y }; }
    function placeRobot(i, nx, ny) {
      const r = st.robots[i]; if (!r || !st.still) return;
      const p = procOf(st.still, st.roi);
      const [x, y] = nToP(p, st.roi, nx, ny);
      const others = st.robots.filter((o) => o.box && !o.off);
      const avgW = others.length ? others.reduce((s, o) => s + boxNToP(p, st.roi, o.box).w, 0) / others.length : p.W * 0.065;
      r.off = nx < 0 || nx > 1 || ny < 0 || ny > 1;
      // off screen: a box at the tap (it's found when it drives in); on screen: snap to its bumper
      r.box = boxPToN(p, st.roi, r.off ? { x: x - avgW / 2, y: y - avgW * 0.45, w: avgW, h: avgW * 0.9 } : AutoScout.snapBox(p.img.data, p.W, p.H, x, y, r.alliance, avgW));
      // next untagged robot
      const next = st.robots.findIndex((o) => !o.box);
      st.pick = next >= 0 ? next : null;
    }
    function autoFind() {
      if (!st.still) return;
      const p = procOf(st.still, st.roi), f = AutoScout.findRobots(p.img.data, p.W, p.H);
      let n = 0;
      ["red", "blue"].forEach((al) => {
        const team = st.robots.filter((r) => r.alliance === al && !r.box);
        f[al].slice(0, team.length).forEach((c, k) => { team[k].box = boxPToN(p, st.roi, c.box); n++; });
      });
      H.toast(n ? `Found ${plural(n, "robot")}: check each label and fix any that are wrong` : "Couldn't spot bumpers. Tap each robot instead.", n ? "ok" : "err");
      st.pick = st.robots.findIndex((o) => !o.box); if (st.pick < 0) st.pick = null;
    }
    function defaultCorners() {
      const r = st.roi;
      return [[r.x + r.w * 0.05, r.y + r.h * 0.16], [r.x + r.w * 0.95, r.y + r.h * 0.16], [r.x + r.w * 1.0, r.y + r.h * 0.97], [r.x, r.y + r.h * 0.97]];
    }
    const ready = () => ({
      start: st.t0 != null, roi: true, hubs: !!(st.hubs.red && st.hubs.blue), robots: st.robots.every((r) => r.box),
    });

    // pointer interaction on the stage while tagging (or fixing a robot while paused)
    let drag = null;
    const HANDLE = 12;
    // pointer → stage px (the on-screen box can be scaled by a page transition)
    const stagePt = (e) => { const r = ovl.getBoundingClientRect(); return [(e.clientX - r.left) * stage.clientWidth / (r.width || 1), (e.clientY - r.top) * stage.clientHeight / (r.height || 1)]; };
    ovl.addEventListener("pointerdown", (e) => {
      if (!(st.step === "tag" || (st.step === "track" && st.paused))) return;
      const [sx, sy] = stagePt(e);
      const [nx, ny] = toNorm(sx, sy);
      const near = (ax, ay) => { const [px, py] = toScreen(ax, ay); return Math.hypot(px - sx, py - sy) < HANDLE + 4; };
      if (st.step === "track") { // fixing a robot mid-match
        if (st.pick == null) return;
        fixRobot(st.pick, nx, ny); return;
      }
      if (st.tool === "roi") {
        const r = st.roi, pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
        const k = pts.findIndex(([a, b]) => near(a, b));
        drag = k >= 0 ? { kind: "roi-corner", k } : (nx > r.x && nx < r.x + r.w && ny > r.y && ny < r.y + r.h) ? { kind: "roi-move", ox: nx - r.x, oy: ny - r.y } : null;
      } else if (st.tool === "hubs") {
        const hit = ["red", "blue"].find((al) => st.hubs[al] && near(st.hubs[al].x, st.hubs[al].y));
        if (hit) drag = { kind: "hub", al: hit };
        else if (st.pick === "red" || st.pick === "blue") {
          const prev = st.hubs[st.pick];
          st.hubs[st.pick] = { x: nx, y: ny, r: prev ? prev.r : 0.028 };
          st.pick = st.hubs.red ? (st.hubs.blue ? null : "blue") : "red";
          drawSide(); redraw();
        }
      } else if (st.tool === "robots") {
        // grab a box corner to resize, the box to move, or tap to place the picked robot
        for (let i = st.robots.length - 1; i >= 0; i--) {
          const b = st.robots[i].box; if (!b) continue;
          if (near(b.x + b.w, b.y + b.h)) { drag = { kind: "box-size", i }; break; }
          if (nx > b.x && nx < b.x + b.w && ny > b.y && ny < b.y + b.h && st.pick == null) { drag = { kind: "box-move", i, ox: nx - b.x, oy: ny - b.y }; break; }
        }
        if (!drag && st.pick != null && typeof st.pick === "number") { placeRobot(st.pick, nx, ny); drawSide(); redraw(); }
      } else if (st.tool === "corners") {
        const c = st.corners || (st.corners = defaultCorners());
        const k = c.findIndex(([a, b]) => near(a, b));
        if (k >= 0) drag = { kind: "corner", k };
      }
      if (drag) { ovl.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    ovl.addEventListener("pointermove", (e) => {
      const [sx, sy] = stagePt(e);
      if (!drag) {
        if (st.step === "tag" || (st.step === "track" && st.paused)) ovl.style.cursor = st.pick != null ? "crosshair" : "default";
        return;
      }
      let [nx, ny] = toNorm(sx, sy);
      const outside = drag.kind === "box-move" || drag.kind === "box-size" || drag.kind === "corner";
      nx = clamp(nx, outside ? -0.6 : 0, outside ? 1.6 : 1); ny = clamp(ny, outside ? -0.6 : 0, outside ? 1.6 : 1);
      if (drag.kind === "roi-corner") {
        const r = st.roi, x2 = r.x + r.w, y2 = r.y + r.h;
        let [ax, ay, bx, by] = [r.x, r.y, x2, y2];
        if (drag.k === 0) { ax = nx; ay = ny; } else if (drag.k === 1) { bx = nx; ay = ny; } else if (drag.k === 2) { bx = nx; by = ny; } else { ax = nx; by = ny; }
        if (bx - ax > 0.15 && by - ay > 0.12) st.roi = { x: ax, y: ay, w: bx - ax, h: by - ay };
      } else if (drag.kind === "roi-move") {
        st.roi.x = clamp(nx - drag.ox, 0, 1 - st.roi.w); st.roi.y = clamp(ny - drag.oy, 0, 1 - st.roi.h);
      } else if (drag.kind === "hub") { st.hubs[drag.al].x = nx; st.hubs[drag.al].y = ny; }
      else if (drag.kind === "box-move") {
        const rb = st.robots[drag.i], b = rb.box; b.x = nx - drag.ox; b.y = ny - drag.oy;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2; rb.off = cx < 0 || cx > 1 || cy < 0 || cy > 1;
      }
      else if (drag.kind === "box-size") { const b = st.robots[drag.i].box; b.w = Math.max(0.012, nx - b.x); b.h = Math.max(0.012, ny - b.y); }
      else if (drag.kind === "corner") st.corners[drag.k] = [nx, ny];
      redraw();
    });
    const endDrag = () => { if (drag) { drag = null; drawSide(); redraw(); } };
    ovl.addEventListener("pointerup", endDrag);
    ovl.addEventListener("pointercancel", endDrag);

    /* ---------- drawing the overlay ---------- */
    function redraw() {
      if (st.raf) return;
      st.raf = requestAnimationFrame(() => { st.raf = 0; paint(); });
    }
    function label(x, y, text, color, opts = {}) {
      octx.font = `700 ${opts.size || 12}px Orbitron, system-ui, sans-serif`;
      const w = octx.measureText(text).width + 10, h = (opts.size || 12) + 7;
      const ly = opts.below ? y + 3 : y - h - 3;
      octx.fillStyle = color; octx.beginPath(); octx.roundRect(x, ly, w, h, 5); octx.fill();
      octx.fillStyle = opts.dark ? "#0a0e13" : "#fff"; octx.fillText(text, x + 5, ly + h - 6);
    }
    function paint() {
      sizeOverlay();
      const W = stage.clientWidth, Hh = stage.clientHeight;
      octx.clearRect(0, 0, W, Hh);
      const tagging = st.step === "tag", tracking = st.step === "track";
      // tags go on the still of the start of auto (it also hides YouTube's pause overlays)
      if (tagging && st.tool !== "start" && st.still) {
        const c = contentRect();
        if (st.wide) { // everything around the video is "off screen"
          octx.fillStyle = "#070b10"; octx.fillRect(0, 0, W, Hh);
          octx.strokeStyle = "rgba(255,255,255,.05)"; octx.lineWidth = 1;
          for (let gx = -Hh; gx < W; gx += 14) { octx.beginPath(); octx.moveTo(gx, Hh); octx.lineTo(gx + Hh, 0); octx.stroke(); }
        }
        octx.drawImage(st.still, c.x, c.y, c.w, c.h);
        if (st.wide) {
          octx.strokeStyle = "rgba(255,255,255,.5)"; octx.setLineDash([5, 4]); octx.strokeRect(c.x, c.y, c.w, c.h); octx.setLineDash([]);
          octx.font = "700 11px Orbitron, system-ui, sans-serif"; octx.fillStyle = "rgba(255,255,255,.55)"; octx.fillText("OFF SCREEN", 10, 18);
        }
      }
      if (!tagging && !tracking) return;
      if (tracking && st.cap && st.cap.mode === "crop" && !st.paused) return; // our drawing would be read back in
      const r = st.roi, [rx, ry] = toScreen(r.x, r.y), [rx2, ry2] = toScreen(r.x + r.w, r.y + r.h);
      if (tagging && st.tool === "start") return; // just the video while finding the start
      if (tagging) {
        // dim what's outside the field view
        octx.fillStyle = "rgba(4,8,12,.55)";
        octx.fillRect(0, 0, W, ry); octx.fillRect(0, ry2, W, Hh - ry2); octx.fillRect(0, ry, rx, ry2 - ry); octx.fillRect(rx2, ry, W - rx2, ry2 - ry);
        octx.strokeStyle = st.tool === "roi" ? "#5bbde2" : "rgba(91,189,226,.45)"; octx.lineWidth = 2; octx.setLineDash(st.tool === "roi" ? [] : [6, 5]);
        octx.strokeRect(rx, ry, rx2 - rx, ry2 - ry); octx.setLineDash([]);
        if (st.tool === "roi") [[rx, ry], [rx2, ry], [rx2, ry2], [rx, ry2]].forEach(([a, b]) => { octx.fillStyle = "#5bbde2"; octx.beginPath(); octx.arc(a, b, 7, 0, 7); octx.fill(); });
        if (st.tool === "corners" || st.corners) {
          const c = (st.corners || defaultCorners()).map(([a, b]) => toScreen(a, b));
          octx.strokeStyle = st.tool === "corners" ? "#4ade80" : "rgba(74,222,128,.3)"; octx.lineWidth = 1.5;
          octx.beginPath(); c.forEach(([a, b], k) => k ? octx.lineTo(a, b) : octx.moveTo(a, b)); octx.closePath(); octx.stroke();
          if (st.tool === "corners") c.forEach(([a, b]) => { octx.fillStyle = "#4ade80"; octx.beginPath(); octx.arc(a, b, 7, 0, 7); octx.fill(); });
        }
      }
      // hubs
      ["red", "blue"].forEach((al) => {
        const h = st.hubs[al]; if (!h) return;
        const [hx, hy] = toScreen(h.x, h.y), hr = h.r * contentRect().w;
        octx.strokeStyle = ALLY[al]; octx.lineWidth = tagging ? 3 : 1.5; octx.globalAlpha = tagging ? 1 : 0.55;
        octx.beginPath(); octx.arc(hx, hy, hr, 0, 7); octx.stroke(); octx.globalAlpha = 1;
        if (tagging) label(hx - 22, hy - hr, al === "red" ? "Red hub" : "Blue hub", ALLY[al]);
      });
      // robots
      const view = tracking && st.view;
      st.robots.forEach((rb, i) => {
        let b = rb.box, est = false, firing = 0;
        if (view && view.robots[i] && st.procGeo) {
          b = boxPToN(st.procGeo, st.roi, view.robots[i]); est = view.robots[i].est; firing = view.robots[i].firing;
          if (view.robots[i].off) { // pinned to the edge of the video, pointing where it is
            const [ex, ey] = toScreen(clamp(b.x + b.w / 2, 0.01, 0.95), clamp(b.y + b.h / 2, 0.04, 0.97));
            label(Math.min(ex, W - 120), ey, rb.team + " · off screen", rb.color, { size: 10 });
            return;
          }
        }
        if (!b) return;
        const [x, y] = toScreen(b.x, b.y), [x2, y2] = toScreen(b.x + b.w, b.y + b.h);
        const picked = st.pick === i;
        if (firing >= 1.5) { octx.shadowColor = rb.color; octx.shadowBlur = 16; }
        octx.strokeStyle = rb.color; octx.lineWidth = picked ? 3.5 : 2.2; octx.setLineDash(est ? [7, 5] : []);
        octx.strokeRect(x, y, x2 - x, y2 - y); octx.setLineDash([]); octx.shadowBlur = 0;
        label(x, y2, rb.team + (firing >= 1.5 ? `  ${firing.toFixed(0)}/s` : ""), rb.color, { below: true, size: 11 });
        if (tagging && st.tool === "robots") { octx.fillStyle = rb.color; octx.beginPath(); octx.arc(x2, y2, 5, 0, 7); octx.fill(); }
      });
      // flights
      if (view && st.procGeo) {
        const P = (q) => toScreen(...pToN(st.procGeo, st.roi, q[0], q[1]));
        octx.lineCap = "round";
        view.traces.forEach((tr) => {
          const col = tr.robot >= 0 ? st.robots[tr.robot].color : "#ffd84d";
          octx.globalAlpha = Math.max(0, 1 - tr.age / 1.2); octx.strokeStyle = tr.res === "make" ? col : tr.res === "miss" ? "#f87171" : "rgba(255,255,255,.75)";
          octx.lineWidth = 2.4; octx.beginPath(); tr.pts.forEach((q, k) => { const [a, b] = P(q); k ? octx.lineTo(a, b) : octx.moveTo(a, b); }); octx.stroke();
        });
        octx.globalAlpha = 1; octx.strokeStyle = "#ffe14d"; octx.lineWidth = 2;
        view.tracks.forEach((p) => { octx.beginPath(); p.forEach((q, k) => { const [a, b] = P(q); k ? octx.lineTo(a, b) : octx.moveTo(a, b); }); octx.stroke(); });
        if (view.off) { octx.fillStyle = "rgba(4,8,12,.6)"; octx.fillRect(0, 0, W, Hh); label(W / 2 - 110, Hh / 2, "Waiting for the field camera", "#5bbde2", { size: 13 }); }
      }
    }

    /* ---------- the side panel ---------- */
    function drawSide(soft) {
      if (st.destroyed) return;
      drawSteps();
      if (st.step !== "track") under.innerHTML = "";
      work.classList.toggle("is-results", st.step === "results");
      work.classList.toggle("crop-mode", !!(st.cap && st.cap.mode === "crop"));
      ovl.classList.toggle("live", st.step === "tag" || st.step === "track");
      if (st.step === "results") { work.hidden = true; resultsEl.hidden = false; return drawResults(); }
      work.hidden = false; resultsEl.hidden = true;
      if (st.step === "video") return sideVideo();
      if (st.step === "tag") return sideTag(soft);
      if (st.step === "track") return sideTrack();
    }

    function sideVideo() {
      const cap = canCapture();
      side.innerHTML = `
        <div class="as-panel">
          <h3>${icon("play")} 1 · The match video</h3>
          ${st.vids.length ? `<div class="as-vids">${st.vids.map((v, i) => `<button class="as-vid${st.kind === "youtube" && st.vidIdx === i ? " on" : ""}" data-vid="${i}">
              <img src="https://i.ytimg.com/vi/${esc(v.id)}/default.jpg" alt="" /><span><b>Video ${i + 1}</b><small>YouTube · from TBA</small></span></button>`).join("")}</div>` : `<p class="hint">TBA doesn't list a video for this match yet.</p>`}
          <label class="as-file btn ghost sm">${icon("upload")} Use a video file<input type="file" accept="video/*" id="asFileIn" hidden /></label>
          ${st.kind === "youtube" ? (cap ? `
            <div class="as-connect">
              <p>Auto Scout reads the video right off this page. Press <b>Connect</b>, then choose <b>This tab</b> in Chrome's box. Nothing is recorded or uploaded.</p>
              <button class="btn primary" id="asConnect"${st.ytReady ? "" : " disabled"}>${icon("scan")} Connect the video</button>
            </div>` : `<div class="as-warn">${icon("info")}<span>Reading a YouTube video needs Chrome or Edge on a computer. You can still use a video file of the match.</span></div>`) : ""}
          ${st.kind === "file" && st.fileVid ? `<button class="btn primary" id="asFileGo"${st.fileVid.readyState >= 1 ? "" : " disabled"}>${icon("arrow-right")} Use this video</button>` : ""}
        </div>
        ${played ? "" : `<div class="as-warn">${icon("info")}<span>This match hasn't been played, so there's no official score to split yet.</span></div>`}`;
      $$("[data-vid]", side).forEach((b) => b.onclick = () => useYouTube(Number(b.dataset.vid)));
      $("#asFileIn", side).onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) useFile(f); };
      const c = $("#asConnect", side);
      if (c) c.onclick = async () => {
        c.disabled = true; c.innerHTML = `<span class="tp-spin"></span> Waiting for Chrome…`;
        try { await connectCapture(); } catch (e) {
          c.disabled = false; c.innerHTML = `${icon("scan")} Connect the video`;
          if (e && e.name !== "NotAllowedError") H.toast(e.message || String(e), "err");
          return;
        }
        H.toast(st.cap.mode === "element" ? "Connected. Auto Scout can see the video" : "Connected (preview mode: the boxes show beside the video)");
        st.step = "tag"; st.tool = "start"; drawSide(); redraw();
      };
      const fg = $("#asFileGo", side);
      if (fg) fg.onclick = () => { st.step = "tag"; st.tool = "start"; drawSide(); redraw(); };
      if (st.kind === "file" && st.fileVid && st.fileVid.readyState < 1) st.fileVid.addEventListener("loadedmetadata", () => drawSide(), { once: true });
    }

    function updateClock() { const el = $("#asClock", side); if (el) el.textContent = mmss(videoTime()) + "." + Math.floor((videoTime() % 1) * 10); }
    let clockTimer = 0;
    function sideTag(soft) {
      const rd = ready(), cfgP = cfg.periods;
      const items = [
        ["start", "Start of auto", rd.start ? `Auto starts at ${mmss(st.t0)}.${Math.floor((st.t0 % 1) * 10)}` : "Find the moment auto begins"],
        ["roi", "Field view", "Frame the main field camera"],
        ["hubs", "Hubs", rd.hubs ? "Both hubs placed" : "Tap each alliance's hub opening"],
        ["robots", "Robots", rd.robots ? "All six tagged" : `${st.robots.filter((r) => r.box).length} of 6 tagged`],
        ["corners", "Field corners", st.corners ? "Set" : "Optional, for the field map"],
      ];
      const locked = st.t0 == null;
      const body = {
        start: `<p class="hint">Play or scrub until the match clock starts (the timer jumps to 0:${String(cfgP[0].end - 3).padStart(2, "0")} and robots start moving), pause, then press the button.</p>
          <div class="as-transport">
            <button class="as-tp" data-seek="-5">−5s</button><button class="as-tp" data-seek="-1">−1s</button><button class="as-tp" data-seek="-0.2">−⅕</button>
            <button class="as-tp play" id="asPlay">${icon(isPlaying() ? "x" : "play")}</button>
            <button class="as-tp" data-seek="0.2">+⅕</button><button class="as-tp" data-seek="1">+1s</button><button class="as-tp" data-seek="5">+5s</button>
          </div>
          <div class="as-clockrow"><span class="as-clock" id="asClock">0:00.0</span><button class="btn primary sm" id="asSetStart">${icon("flag")} Auto starts here</button></div>`,
        roi: `<p class="hint">Drag the corners so the box covers the main field camera. Leave out the score bar and any picture-in-picture.</p>
          <div class="btn-row"><button class="btn ghost sm" data-roi="full">Whole video</button><button class="btn ghost sm" data-roi="top">Top half</button><button class="btn ghost sm" data-roi="nobar">No score bar</button></div>`,
        hubs: `<p class="hint">Pick a hub, then tap the middle of its opening on the video. Drag to adjust.</p>
          <div class="as-chips">${["red", "blue"].map((al) => `<button class="as-chip ${al}${st.pick === al ? " on" : ""}${st.hubs[al] ? " set" : ""}" data-hub="${al}">${st.hubs[al] ? icon("check") : icon("target")} ${al === "red" ? "Red" : "Blue"} hub</button>`).join("")}</div>
          <label class="as-range">Ring size <input type="range" id="asHubR" min="0.012" max="0.07" step="0.002" value="${(st.hubs.red || st.hubs.blue || { r: 0.028 }).r}" /></label>`,
        robots: `<p class="hint">Pick a team, then tap that robot on the video. The box snaps to its bumper; drag it or its corner to fix it.</p>
          <div class="as-chips robots">${st.robots.map((r, i) => `<button class="as-chip rb${st.pick === i ? " on" : ""}${r.box ? " set" : ""}" data-rb="${i}" style="--c:${r.color}" title="${r.off ? "Starts off screen" : ""}"><i></i>${esc(r.team)}${r.off ? icon("eye-off") : r.box ? icon("check") : ""}</button>`).join("")}</div>
          <p class="hint">${icon("eye-off")} Robot not in the video yet? Zoom out and tap roughly where it is, outside the picture. Auto Scout picks it up when it drives in.</p>
          <div class="btn-row"><button class="btn ghost sm" id="asWide">${icon(st.wide ? "x" : "eye-off")} ${st.wide ? "Back to normal view" : "Zoom out"}</button><button class="btn ghost sm" id="asAuto">${icon("zap")} Find robots for me</button>${st.robots.some((r) => r.box) ? `<button class="btn ghost sm" id="asClearRb">${icon("x")} Clear</button>` : ""}</div>`,
        corners: `<p class="hint">Drag the four dots onto the corners of the field carpet (far left, far right, near right, near left). The view is zoomed out: if a corner is cut off, put its dot where it would be outside the picture.</p>
          <div class="btn-row"><button class="btn ghost sm" id="asCornersReset">Reset</button></div>`,
      };
      {
        side.innerHTML = `<div class="as-panel"><h3>${icon("target")} 2 · Tag the match</h3>
          <div class="as-tag-list" id="asTagList">${items.map(([k, l, s], i) => `
            <section class="as-tag${st.tool === k ? " open" : ""}${(k === "start" ? rd.start : k === "roi" ? !locked : k === "corners" ? !!st.corners : rd[k]) ? " ok" : ""}${locked && k !== "start" ? " locked" : ""}">
              <button class="as-tag-h" data-tool="${k}"${locked && k !== "start" ? " disabled" : ""}><span class="as-tag-n">${(k === "start" ? rd.start : k === "corners" ? !!st.corners : k === "roi" ? !locked : rd[k]) ? icon("check") : i + 1}</span><b>${l}</b><small>${esc(s)}</small></button>
              ${st.tool === k ? `<div class="as-tag-b">${body[k]}</div>` : ""}
            </section>`).join("")}</div>
          <div class="as-go">
            <div class="seg as-speed">${(st.kind === "file" ? [1, 2, 3] : [1, 1.5, 2]).map((s) => `<button data-speed="${s}" class="${st.speed === s ? "on" : ""}">${s}×</button>`).join("")}</div>
            <label class="as-ask"><input type="checkbox" id="asAsk"${st.ask ? " checked" : ""} /><span>Pause and ask me when it loses a robot <small>Plus a quick check at each period change. Most accurate: a tap fixes a box and it carries on</small></span></label>
            <button class="btn primary" id="asStart"${rd.start && rd.hubs && rd.robots ? "" : " disabled"}>${icon("scan")} Start Auto Scout</button>
            <span class="muted as-eta-pre">${icon("clock")} About ${mmss(END / st.speed + 4)} to watch${st.speed > 1 ? "" : " · 1× is the most accurate"}</span>
          </div></div>`;
      }
      wireTag();
      if (st.tool === "start") { clearInterval(clockTimer); clockTimer = setInterval(() => { if (!side.isConnected || st.step !== "tag" || st.tool !== "start") return clearInterval(clockTimer); updateClock(); const p = $("#asPlay", side); if (p) p.innerHTML = icon(isPlaying() ? "x" : "play"); }, 120); }
    }
    function wireTag() {
      $$("[data-tool]", side).forEach((b) => b.onclick = async () => {
        const k = b.dataset.tool, prev = st.tool;
        st.tool = k;
        if (k === "robots" && st.pick == null) { const n = st.robots.findIndex((r) => !r.box); st.pick = n >= 0 ? n : null; }
        if (k === "hubs") st.pick = st.hubs.red ? (st.hubs.blue ? null : "blue") : "red";
        if (k === "corners" && !st.corners) st.corners = defaultCorners();
        // corners always zoom out; the robots tool keeps its own zoom toggle
        st.wide = k === "corners" || (k === "robots" && prev === "robots" && st.wide);
        drawSide(); redraw();
      });
      $$("[data-seek]", side).forEach((b) => b.onclick = () => { seek(videoTime() + Number(b.dataset.seek)); setTimeout(updateClock, 150); });
      const pl = $("#asPlay", side); if (pl) pl.onclick = () => { if (isPlaying()) pause(); else play(); };
      const ss = $("#asSetStart", side);
      if (ss) ss.onclick = async () => {
        pause();
        ss.disabled = true; ss.innerHTML = `<span class="tp-spin"></span> Grabbing the frame…`;
        await new Promise((r) => setTimeout(r, 350));
        const t = videoTime();
        const still = st.kind === "file" ? fileFrame() : await nextCapturedFrame(3);
        if (!still) { H.toast("Couldn't read the video frame. Is the video connected?", "err"); ss.disabled = false; ss.innerHTML = `${icon("flag")} Auto starts here`; return; }
        st.t0 = t; st.still = still;
        if (!st.robots.some((r) => r.box)) st.tool = "roi";
        H.toast(`Auto starts at ${mmss(t)}. Now frame the field`);
        drawSide(); redraw();
      };
      $$("[data-roi]", side).forEach((b) => b.onclick = () => {
        st.roi = b.dataset.roi === "full" ? { x: 0, y: 0, w: 1, h: 1 } : b.dataset.roi === "top" ? { x: 0, y: 0.08, w: 1, h: 0.47 } : { x: 0, y: 0.09, w: 1, h: 0.91 };
        redraw();
      });
      $$("[data-hub]", side).forEach((b) => b.onclick = () => { st.pick = b.dataset.hub; drawSide(true); redraw(); });
      const hr = $("#asHubR", side); if (hr) hr.oninput = () => { ["red", "blue"].forEach((al) => { if (st.hubs[al]) st.hubs[al].r = Number(hr.value); }); redraw(); };
      $$("[data-rb]", side).forEach((b) => b.onclick = () => { const i = Number(b.dataset.rb); st.pick = st.pick === i ? null : i; drawSide(true); redraw(); });
      const af = $("#asAuto", side); if (af) af.onclick = () => { autoFind(); drawSide(); redraw(); };
      const wd = $("#asWide", side); if (wd) wd.onclick = () => { st.wide = !st.wide; drawSide(); redraw(); };
      const cr = $("#asClearRb", side); if (cr) cr.onclick = () => { st.robots.forEach((r) => { r.box = null; r.off = false; }); st.pick = 0; drawSide(); redraw(); };
      const cc = $("#asCornersReset", side); if (cc) cc.onclick = () => { st.corners = defaultCorners(); redraw(); };
      $$("[data-speed]", side).forEach((b) => b.onclick = () => { st.speed = Number(b.dataset.speed); drawSide(); });
      const ask = $("#asAsk", side); if (ask) ask.onchange = () => { st.ask = ask.checked; ls.set("ask", st.ask); };
      const go = $("#asStart", side); if (go) go.onclick = startRun;
    }

    /* ---------- tracking ---------- */
    async function startRun() {
      const roi = st.roi;
      // processing geometry from the tag still
      const p = procOf(st.still, roi);
      st.procGeo = { W: p.W, H: p.H };
      const proc = document.createElement("canvas"); proc.width = p.W; proc.height = p.H;
      st.proc = proc.getContext("2d", { willReadFrequently: true });
      const scaleR = p.W / roi.w; // normalized width → processing px
      const hubs = {};
      ["red", "blue"].forEach((al) => { const h = st.hubs[al], [x, y] = nToP(p, roi, h.x, h.y); hubs[al] = { x, y, r: h.r * scaleR }; });
      const corners = (st.corners || defaultCorners()).map(([a, b]) => nToP(p, roi, a, b));
      st.engine = AutoScout.create({
        width: p.W, height: p.H, piece: cfg.piece, field: cfg.field, periods: cfg.periods, hubs, corners,
        robots: st.robots.map((r) => ({ team: r.team, alliance: r.alliance, box: boxNToP(p, roi, r.box), off: !!r.off })),
      });
      st.wide = false;
      st.useDet = window.AutoScoutDetect ? await AutoScoutDetect.load() : false;
      st.step = "track"; st.running = true; st.paused = false; st.pick = null; st.t = 0; st.rate = []; st.view = null; st.lastFrame = null; st.lastProcT = null; st.skip = 0;
      st.lastPhase = null; st.check = false; st.lostPrompt = null; st.asked = {}; st.lastProcWall = performance.now() + 3000;
      drawSide(); redraw();
      // back to the start of auto (if it moved since it was tagged), then go
      setRate(st.speed);
      if (Math.abs(videoTime() - st.t0) > 0.05) { seek(st.t0); await new Promise((r) => setTimeout(r, 600)); }
      if (!st.running) return;
      // A file's first frame is the tag still itself (exactly where the robots were tagged).
      // YouTube starts from the first live frame instead: a paused player can draw its own
      // overlays on the still.
      if (st.kind === "file") st.engine.step(procOf(st.still, roi).img.data, 0);
      st.startWall = performance.now();
      play();
      if (st.kind === "file") fileLoop(); else st.cap.onFrame = onCapFrame;
    }
    async function processFrame(drawable, fw, fh, t) {
      if (st.busy) return; // still on the last frame: skip this one
      st.busy = true;
      try { await readFrame(drawable, fw, fh, t); } finally { st.busy = false; }
    }
    async function readFrame(drawable, fw, fh, t) {
      const r = st.roi, g = st.proc, P = st.procGeo;
      g.drawImage(drawable, r.x * fw, r.y * fh, r.w * fw, r.h * fh, 0, 0, P.W, P.H);
      const img = g.getImageData(0, 0, P.W, P.H);
      let boxes = null;
      if (st.useDet) {
        try { boxes = await AutoScoutDetect.detect(g.canvas, P.W, P.H); }
        catch (e) { st.useDet = false; H.toast("The robot detector stopped; using bumpers only", "err"); }
        if (!st.running) return;
      }
      st.engine.step(img.data, t, boxes);
      st.t = t; st.view = st.engine.view(t);
      const now = performance.now();
      st.lastProcWall = now;
      if (st.ask && !st.view.off) {
        // a quick look at every period change: same-alliance robots can swap boxes
        // without either one looking lost, and this keeps a swap to one period at most
        const ph = phaseAt(t).id;
        if (st.lastPhase && ph !== st.lastPhase) { st.lastPhase = ph; st.check = true; st.pick = null; pauseRun(); return; }
        st.lastPhase = ph;
        const i = st.view.robots.findIndex((r, k) => r.lostFor > 45 && now - (st.asked[k] || 0) > 12000);
        if (i >= 0) { st.asked[i] = now; st.lostPrompt = i; st.pick = i; pauseRun(); return; }
      }
      st.rate.push([now, t]); while (st.rate.length > 2 && now - st.rate[0][0] > 6000) st.rate.shift();
      if (st.cap && st.cap.mode === "crop") drawVision(drawable, fw, fh); else redraw();
      if (now - st.lastPanel > 250) { st.lastPanel = now; updateTrackPanel(); }
    }
    function onCapFrame(fr) {
      if (!st.running || st.paused) return;
      if (st.skip > 0) { st.skip--; return; } // frames that may still show our paused-state drawing
      const t = videoTime() - st.t0;
      if (t >= END) return finishRun();
      if (t < (st.engine.frames ? 0.02 : -0.2)) return;
      if (st.lastProcT != null && t - st.lastProcT < 1 / 34) return;
      st.lastProcT = t;
      // keep the latest frame for fixing robots while paused
      processFrame(fr, fr.displayWidth, fr.displayHeight, t);
      if (!st.lastFrame || performance.now() - (st.lastFrameAt || 0) > 400) {
        const c = st.lastFrame || document.createElement("canvas"); c.width = fr.displayWidth; c.height = fr.displayHeight;
        c.getContext("2d").drawImage(fr, 0, 0); st.lastFrame = c; st.lastFrameAt = performance.now();
      }
    }
    function fileLoop() {
      const v = st.fileVid;
      const cb = (now, meta) => {
        if (!st.running) return;
        if (!st.paused) {
          const t = meta.mediaTime - st.t0;
          if (t >= END || v.ended) return finishRun();
          if (t > 0.02 && (st.lastProcT == null || t - st.lastProcT >= 1 / 34)) { st.lastProcT = t; processFrame(v, v.videoWidth, v.videoHeight, t); }
        }
        st.vfc = v.requestVideoFrameCallback(cb);
      };
      st.vfc = v.requestVideoFrameCallback(cb);
    }
    function drawVision(drawable, fw, fh) {
      const cv = $("#asVision", root); if (!cv) return;
      const r = st.roi, g = cv.getContext("2d"), P = st.procGeo;
      if (cv.width !== P.W) { cv.width = P.W; cv.height = P.H; }
      g.drawImage(drawable, r.x * fw, r.y * fh, r.w * fw, r.h * fh, 0, 0, P.W, P.H);
      const v = st.view; if (!v) return;
      g.lineWidth = 2;
      v.robots.forEach((b, i) => { g.strokeStyle = st.robots[i].color; g.setLineDash(b.est ? [6, 4] : []); g.strokeRect(b.x, b.y, b.w, b.h); });
      g.setLineDash([]);
      v.traces.forEach((tr) => { g.strokeStyle = tr.robot >= 0 ? st.robots[tr.robot].color : "#ffd84d"; g.globalAlpha = Math.max(0, 1 - tr.age / 1.2); g.beginPath(); tr.pts.forEach(([a, b], k) => k ? g.lineTo(a, b) : g.moveTo(a, b)); g.stroke(); });
      g.globalAlpha = 1;
    }
    function pauseRun(why) {
      if (!st.running) return;
      st.paused = true; pause();
      if (why) H.toast(why, "err");
      drawSide(); redraw();
    }
    async function resumeRun() {
      if (!st.running) return;
      if (st.kind === "youtube" && !st.cap) {
        try { await connectCapture(); } catch (e) { if (e && e.name !== "NotAllowedError") H.toast(e.message || String(e), "err"); return; }
        st.cap.onFrame = onCapFrame;
      }
      st.paused = false; st.pick = null; st.lostPrompt = null; st.check = false; st.lastProcT = st.t; st.lastProcWall = performance.now() + 1500; st.skip = st.cap && st.cap.mode === "crop" ? 4 : 0;
      if (Math.abs(videoTime() - (st.t0 + st.t)) > 0.25) seek(st.t0 + st.t); // back to where reading stopped
      play(); drawSide(); redraw();
    }
    // a video file only gets read while the tab is showing: pause instead of skipping ahead
    const onVis = () => { if (document.hidden && st.running && !st.paused && st.kind === "file") pauseRun("Paused while the tab was in the background"); };
    document.addEventListener("visibilitychange", onVis);
    // the same if frames stop arriving while the video plays on (a minimized window)
    const watchdog = setInterval(() => {
      if (!st.running || st.paused || !isPlaying() || !st.lastProcWall) return;
      if (performance.now() - st.lastProcWall > (st.kind === "file" ? 1500 : 4000)) pauseRun("Paused: Auto Scout can only read the video while this tab is on screen");
    }, 700);
    function fixRobot(i, nx, ny) {
      const img = st.lastFrame || st.still; if (!img) return;
      const p = procOf(st.kind === "file" ? (fileFrame() || img) : img, st.roi);
      const [x, y] = nToP(p, st.roi, nx, ny);
      const cur = st.view && st.view.robots[i];
      const box = AutoScout.snapBox(p.img.data, p.W, p.H, x, y, st.robots[i].alliance, cur ? cur.w : p.W * 0.065);
      st.engine.relocate(i, box);
      st.view = st.engine.view(st.t);
      H.toast(`${st.robots[i].team} moved`);
      const wasAsked = st.lostPrompt === i;
      st.pick = null; st.lostPrompt = null; drawSide(); redraw();
      if (wasAsked) resumeRun(); // it asked, you answered: carry on
    }
    async function finishRun() {
      if (!st.running) return;
      st.running = false; pause();
      if (st.cap) st.cap.onFrame = null;
      const res = st.engine.finish(official);
      const u = window.Auth && Auth.currentUser && Auth.currentUser();
      const doc = {
        v: 1, key: m.key, event: m.event_key, season: GAME.season, label: tag(m), at: Date.now(),
        by: H.scoutDisplayName() || "Someone", byId: (Store.getMe && Store.getMe() || {}).id || "",
        video: st.kind === "file" ? { kind: "file", name: st.file ? st.file.name : "" } : { kind: "youtube", id: st.vids[st.vidIdx].id, t0: +st.t0.toFixed(2) },
        speed: st.speed, official: { red: (official.red || {}).total || 0, blue: (official.blue || {}).total || 0 },
        frames: res.frames, skipped: res.skipped, flights: res.flights,
        robots: res.robots.map((r) => ({
          team: r.team, alliance: r.alliance, points: r.points, fuel: r.fuel, shots: r.shots, acc: r.acc, bps: r.bps, peakBps: r.peakBps, shootSec: r.shootSec,
          climb: r.climb, climbLabel: r.climbLabel, traced: r.traced, makes: r.makes, misses: r.misses, passes: r.passes, byPeriod: r.byPeriod, heat: r.heat, tracked: r.tracked,
          path: thinPath(r.path),
        })),
      };
      if (!u) doc.by = doc.by || "Someone";
      st.result = doc; st.step = "results";
      const where = await saveResult(doc);
      if (where === "local" && window.Cloud && Cloud.enabled && Cloud.enabled()) H.toast("Saved on this device. (The team copy needs “autoscout” in the Firebase rules.)", "err");
      else H.toast(where === "cloud" ? "Saved for the whole team" : "Saved on this device");
      stopCapture();
      drawSide();
    }
    // one point per second is plenty for the field map
    function thinPath(path) {
      const out = []; let last = -1;
      (path || []).forEach(([t, x, y, e]) => { const s = Math.floor(t); if (s !== last) { last = s; out.push([+x.toFixed(2), +y.toFixed(2), e]); } });
      return out;
    }

    function phaseAt(t) { const p = cfg.periods.find((q) => t < q.end) || cfg.periods[cfg.periods.length - 1]; return p; }
    function sideTrack() {
      const crop = st.cap && st.cap.mode === "crop";
      side.innerHTML = `
        <div class="as-panel as-live">
          <div class="as-phase"><span class="as-live-dot${st.paused ? " paused" : ""}"></span><b id="asPhase">${esc(phaseAt(st.t).short)}</b><span class="as-mclock" id="asMClock">${mmss(st.t)}</span></div>
          <div class="as-eta"><b id="asEta">Starting…</b><span id="asEtaSub" class="muted"></span></div>
          <span class="as-det${st.useDet ? " on" : ""}">${icon(st.useDet ? "zap" : "target")} ${st.useDet ? `Robot detector on (${esc(AutoScoutDetect.backend() === "webgpu" ? "graphics card" : "processor")})` : "Finding robots by their bumpers"}</span>
          ${["red", "blue"].map((al) => `<div class="as-ally ${al}"><div class="as-ally-h"><b>${al === "red" ? "RED" : "BLUE"}</b><span>${official[al] ? `<em>${official[al].total}</em> ${esc(cfg.pieceNamePlural.toLowerCase())} scored` : ""}</span></div>
            ${st.robots.map((r, i) => r.alliance !== al ? "" : `<div class="as-rrow${st.pick === i ? " on" : ""}" data-fix="${i}" style="--c:${r.color}"><i></i><b>${esc(r.team)}</b><span class="as-rbar"><s id="asBar${i}"></s></span><em id="asShots${i}">0</em></div>`).join("")}
          </div>`).join("")}
          <div class="as-field"><canvas id="asMap" width="320" height="156"></canvas><span class="as-field-k"><i></i> in view <i class="est"></i> estimated</span></div>
          ${st.paused && st.check && st.lostPrompt == null ? `<div class="as-lost check"><b>${icon("eye")} ${esc(phaseAt(st.t).label)}: quick check</b>
              <span>Is every box on the right robot? ${st.pick != null ? `Now tap where <b>${esc(st.robots[st.pick].team)}</b> is.` : "If one's wrong, pick its team above, then tap the robot."}</span>
              <button class="btn primary sm" id="asAllGood">${icon("check")} All good, keep going</button></div>`
          : st.paused && st.lostPrompt != null ? `<div class="as-lost" style="--c:${st.robots[st.lostPrompt].color}"><b>${icon("target")} Where's ${esc(st.robots[st.lostPrompt].team)}?</b>
              <span>Auto Scout lost it. Tap it on the video and it keeps going.</span>
              <button class="btn ghost sm" id="asHidden">${icon("eye-off")} It's hidden, keep going</button></div>`
          : st.paused ? `<p class="hint as-fixhint">${icon("target")} ${st.pick != null ? `Now tap where <b>${esc(st.robots[st.pick].team)}</b> really is on the video.` : "A box on the wrong robot? Pick that team above, then tap the robot on the video."}</p>`
            : `<p class="hint as-fixhint">${icon("info")} Keep this tab open while it watches. Dashed box = lost robot: pause and tap it back.</p>`}
          <div class="btn-row as-live-ctl">
            ${st.paused ? (st.check || st.lostPrompt != null ? "" : `<button class="btn primary sm" id="asResume">${icon("play")} Resume</button>`) : `<button class="btn ghost sm" id="asPause">${icon("target")} Pause / fix a robot</button>`}
            <button class="btn ghost sm" id="asStop">${icon("x")} Stop</button>
          </div>
          ${crop ? `<div class="as-vision-wrap"><canvas id="asVision"></canvas><span>What Auto Scout sees</span></div>` : ""}
        </div>`;
      under.innerHTML = `<div class="as-timeline">${cfg.periods.map((p, i) => { const s = i ? cfg.periods[i - 1].end : 0; return `<div class="as-tl-seg" style="flex:${p.end - s}"><span>${esc(p.short)}</span></div>`; }).join("")}<i class="as-tl-head" id="asHead"></i></div>`;
      const ps = $("#asPause", side); if (ps) ps.onclick = () => pauseRun();
      const rs = $("#asResume", side); if (rs) rs.onclick = resumeRun;
      const ag = $("#asAllGood", side); if (ag) ag.onclick = () => { st.check = false; resumeRun(); };
      const hd = $("#asHidden", side); if (hd) hd.onclick = () => { if (st.lostPrompt != null) st.asked[st.lostPrompt] = performance.now() + 8000; st.lostPrompt = null; resumeRun(); };
      $("#asStop", side).onclick = () => H.confirmDialog("Stop Auto Scout? This match's tracking so far is thrown away.", () => { st.running = false; pause(); if (st.cap) st.cap.onFrame = null; st.step = "tag"; drawSide(); redraw(); });
      $$("[data-fix]", side).forEach((b) => b.onclick = () => { if (!st.paused) pauseRun(); st.pick = Number(b.dataset.fix); drawSide(); redraw(); });
      updateTrackPanel();
    }
    function updateTrackPanel() {
      if (st.step !== "track" || !st.engine) return;
      const t = st.t, ph = phaseAt(t);
      const pe = $("#asPhase", side); if (pe) pe.textContent = ph.short;
      const mc = $("#asMClock", side); if (mc) mc.textContent = mmss(t) + " / " + mmss(END);
      const head = $("#asHead", root); if (head) head.style.left = clamp(t / END, 0, 1) * 100 + "%";
      // how fast the match is going by, from the last few seconds
      let speed = st.speed;
      if (st.rate.length > 4) { const [a, b] = [st.rate[0], st.rate[st.rate.length - 1]]; if (b[0] > a[0]) speed = Math.max(0.05, (b[1] - a[1]) / ((b[0] - a[0]) / 1000)); }
      const left = (END - t) / speed;
      const eta = $("#asEta", side), sub = $("#asEtaSub", side);
      if (eta) eta.textContent = st.paused ? "Paused" : t < 0.5 ? "Starting…" : `${mmss(left)} left`;
      if (sub) sub.textContent = st.paused ? "" : `done about ${new Date(Date.now() + left * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${speed.toFixed(1)}× real time`;
      const tl = st.engine.tally(), max = Math.max(10, ...tl.map((r) => r.shots));
      tl.forEach((r, i) => {
        const e = $("#asShots" + i, side); if (e) e.textContent = Math.round(r.shots);
        const b = $("#asBar" + i, side); if (b) b.style.width = (r.shots / max * 100).toFixed(1) + "%";
        const row = e && e.closest(".as-rrow");
        if (row && st.view) { row.classList.toggle("firing", st.view.robots[i].firing >= 1.5); row.classList.toggle("lost", !!st.view.robots[i].est); }
      });
      drawMap($("#asMap", side), st.view ? st.view.robots.map((r, i) => ({ x: r.field[0], y: r.field[1], est: r.est, color: st.robots[i].color, team: st.robots[i].team })) : []);
    }
    // the field map: robots as dots, red/blue ends where their hubs are on the video
    function redOnRight() { return !(st.hubs.red && st.hubs.blue) || st.hubs.red.x > st.hubs.blue.x; }
    function drawMap(cv, dots, opts = {}) {
      if (!cv) return;
      const g = cv.getContext("2d"), W = cv.width, Hh = cv.height, pad = 6, fw = W - pad * 2, fh = Hh - pad * 2;
      g.clearRect(0, 0, W, Hh);
      g.fillStyle = "rgba(255,255,255,.04)"; g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 1;
      g.beginPath(); g.roundRect(pad, pad, fw, fh, 8); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(W / 2, pad); g.lineTo(W / 2, Hh - pad); g.setLineDash([3, 4]); g.stroke(); g.setLineDash([]);
      const right = redOnRight();
      [["red", right ? 0.72 : 0.28], ["blue", right ? 0.28 : 0.72]].forEach(([al, x]) => {
        g.strokeStyle = ALLY[al]; g.lineWidth = 2; g.strokeRect(pad + x * fw - 7, pad + fh / 2 - 7, 14, 14);
        g.fillStyle = ALLY[al]; g.globalAlpha = 0.18; g.fillRect(al === "red" ? (right ? W - pad - 10 : pad) : (right ? pad : W - pad - 10), pad, 10, fh); g.globalAlpha = 1;
      });
      if (opts.heat) { // where a robot shot from
        const max = Math.max(...opts.heat, 0.01);
        opts.heat.forEach((v, k) => { if (!v) return; const cx = k % 12, cy = Math.floor(k / 12); g.fillStyle = opts.color; g.globalAlpha = 0.15 + 0.8 * (v / max); g.fillRect(pad + cx * fw / 12 + 1, pad + cy * fh / 6 + 1, fw / 12 - 2, fh / 6 - 2); });
        g.globalAlpha = 1;
      }
      if (opts.path) {
        g.strokeStyle = opts.color; g.globalAlpha = 0.55; g.lineWidth = 1.5; g.beginPath();
        opts.path.forEach(([x, y], k) => { const a = pad + x * fw, b = pad + y * fh; k ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); g.globalAlpha = 1;
      }
      dots.forEach((d) => {
        const x = pad + d.x * fw, y = pad + d.y * fh;
        g.fillStyle = d.color; g.strokeStyle = d.color; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 5, 0, 7); if (d.est) { g.setLineDash([2, 2]); g.stroke(); g.setLineDash([]); } else g.fill();
        g.font = "700 10px Orbitron, sans-serif"; g.fillText(d.team, x + 7, y + 3);
      });
    }

    /* ---------- results ---------- */
    function drawResults() {
      const d = st.result; if (!d) return;
      const robots = d.robots || [];
      const byAl = (al) => robots.map((r, i) => ({ ...r, i })).filter((r) => r.alliance === al).sort((a, b) => (b.points || 0) - (a.points || 0));
      const maxPts = Math.max(1, ...robots.map((r) => r.points || 0));
      const colorOf = (team) => { const s = st.robots.find((r) => r.team === String(team)); return s ? s.color : "#5bbde2"; };
      const periodIds = cfg.periods.map((p) => p.id);
      resultsEl.innerHTML = `
        <section class="as-final">
          <header class="as-final-h"><span class="as-final-eye">${icon("trophy")} Final · who scored</span>
            <h2>${esc(longLabel(m))}</h2>
            <span class="muted">${esc(d.by || "Someone")} · ${esc(new Date(d.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))} · ${plural(d.frames || 0, "frame")} read</span></header>
          <div class="as-final-cols">${["red", "blue"].map((al) => {
            const list = byAl(al), fuelSum = list.reduce((s, r) => s + (r.fuel || 0), 0), off = d.official ? d.official[al] : null;
            return `<div class="as-fcol ${al}"><div class="as-fcol-h"><b>${al === "red" ? "RED" : "BLUE"}</b><em>${m.alliances ? m.alliances[al].score : ""}</em></div>
              ${list.map((r, k) => `<div class="as-frow" style="--c:${colorOf(r.team)};--i:${k}">
                <i class="as-fbar"></i>
                <div class="as-fteam"><a href="#/team/${esc(r.team)}"><b>${esc(r.team)}</b></a><span>${esc(H.nameFor(r.team) || "")}</span>
                  ${r.tracked != null ? `<em class="as-trk${r.tracked < 0.6 ? " low" : ""}" title="How much of the match Auto Scout was sure where this robot was">${icon("scan")} tracked ${Math.round(r.tracked * 100)}%</em>` : ""}</div>
                <div class="as-fpts"><b>${r.points || 0}</b><span>points</span><s style="--w:${((r.points || 0) / maxPts * 100).toFixed(0)}%"></s></div>
                <div class="as-fstats">
                  <span><b>${r.fuel || 0}</b>${esc(cfg.pieceNamePlural.toLowerCase())}</span>
                  <span><b>${r.shots || 0}</b>shots</span>
                  <span><b>${r.acc == null ? "–" : Math.round(r.acc * 100) + "%"}</b>accuracy</span>
                  <span><b>${r.bps ? r.bps.toFixed(1) : "–"}</b>balls/s</span>
                  <span><b>${r.peakBps ? r.peakBps.toFixed(1) : "–"}</b>peak b/s</span>
                  <span><b>${r.climb ? "+" + r.climb : "–"}</b>${esc(r.climbLabel || "climb")}</span>
                </div>
              </div>`).join("")}
              <p class="as-adds ${off != null && fuelSum === off ? "ok" : ""}">${off != null && fuelSum === off ? `${icon("check")} ${fuelSum} ${esc(cfg.pieceNamePlural.toLowerCase())} · adds up to the scoreboard` : `${icon("info")} No official breakdown to split yet`}</p>
            </div>`;
          }).join("")}</div>
          <div class="as-periods card"><h3>${icon("chart")} ${esc(cfg.pieceNamePlural)} by period</h3>
            <div class="as-ptable-wrap"><table class="as-ptable"><thead><tr><th>Team</th>${cfg.periods.map((p) => `<th>${esc(p.label)}</th>`).join("")}<th>Total</th></tr></thead>
            <tbody>${["red", "blue"].map((al) => byAl(al).map((r) => `<tr class="${al}"><td><i style="background:${colorOf(r.team)}"></i>${esc(r.team)}</td>${periodIds.map((pid) => {
              const q = (r.byPeriod || {})[pid] || {}; return `<td>${q.fuel ? `<b>${q.fuel}</b>` : `<span class="muted">0</span>`}${q.shots ? `<small>${q.shots} shots</small>` : ""}</td>`;
            }).join("")}<td><b>${r.fuel || 0}</b></td></tr>`).join("")).join("")}</tbody></table></div></div>
          <div class="as-maps">${robots.map((r, i) => `<div class="as-mapcard card" style="--c:${colorOf(r.team)}"><div class="as-mapcard-h"><i></i><b>${esc(r.team)}</b><span class="muted">where it shot from</span></div><canvas data-map="${i}" width="320" height="156"></canvas></div>`).join("")}</div>
          <p class="hint as-final-note">${icon("info")} Points and ${esc(cfg.pieceNamePlural.toLowerCase())} split each alliance's official hub count, period by period, by who was seen shooting. Climbs come from TBA. Shots, accuracy and balls per second are estimates from the video.</p>
          <div class="btn-row as-final-ctl">
            <a class="btn ghost" href="#/autoscout">${icon("chevron-left")} All matches</a>
            <button class="btn ghost" id="asRerun">${icon("scan")} Run it again</button>
          </div>
        </section>`;
      $$("[data-map]", resultsEl).forEach((cv) => { const r = robots[Number(cv.dataset.map)]; drawMap(cv, [], { heat: r.heat, path: r.path, color: colorOf(r.team) }); });
      $("#asRerun", resultsEl).onclick = () => {
        st.step = "video"; st.result = null; st.t0 = null; st.still = null; st.robots.forEach((r) => { r.box = null; });
        drawSide(); if (st.vids.length && !st.yt && !st.fileVid) useYouTube(0);
      };
    }

    /* ---------- start ---------- */
    drawSide();
    if (st.step === "video" && st.vids.length) useYouTube(0);

    return {
      m,
      step: () => st.step,
      showPrior(doc) { st.result = doc; st.step = "results"; clearSource(); drawSide(); },
      destroy() {
        st.destroyed = true; st.running = false;
        clearInterval(clockTimer); cancelAnimationFrame(st.raf); ro.disconnect();
        document.removeEventListener("visibilitychange", onVis); clearInterval(watchdog);
        if (st.fileVid && st.vfc) try { st.fileVid.cancelVideoFrameCallback(st.vfc); } catch (e) {}
        clearSource();
      },
    };
  }

  function init(helpers) { H = helpers; }
  return { init, page, unmount };
})();

window.AutoScoutUI = AutoScoutUI;
