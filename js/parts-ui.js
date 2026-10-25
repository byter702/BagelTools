/* =============================================================================
   parts-ui.js  —  the Parts app pages: Board, My Parts, Guide.
   -----------------------------------------------------------------------------
   BagelParts' board (projects → mechanisms → parts sorted into lists by how
   they're made, plus the team and who's building what), drawn in BagelTools
   style. Data and rules live in parts.js; app.js hands over its UI helpers
   through PartsUI.init().
   ========================================================================== */
const PartsUI = (() => {
  "use strict";
  let H = null; // helpers from app.js: $, $$, esc, icon, toast, modal, confirmDialog, notifyBanner, pageHero, emptyState, scouterAvatar, allScouters, scouterName
  const LS = "bb702.parts.";
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* storage off */ } },
  };
  let activeProject = ls.get("project", null), activeMech = "__all__", activePerson = null, activeAlert = null, expandedKey = null;
  const collapsed = new Set(ls.get("collapsed", []));
  let catOrder = ls.get("catOrder", null), catColors = ls.get("catColors", {});
  let V = null, mounted = null, isDragging = false, pending = false;
  let prevKeys = null, prevMine = null;
  const undoStack = [];
  const SWATCHES = ["#7c5cff", "#5b7cff", "#2f80ed", "#58c4dd", "#2fd0a2", "#27ae60", "#b7f36b", "#ffd75e", "#f2a33c", "#ff8c42",
    "#ff6b6b", "#ff5c8a", "#ff9ecb", "#c792ea", "#9b59b6", "#8fd3ff", "#95a5a6", "#4a5568"];

  const meId = () => (Store.getMe() || {}).id || "";
  const $$ = (sel, root) => [...root.querySelectorAll(sel)];
  const field = (form, name) => form.querySelector(`[name="${name}"]`);
  const esc = (s) => H.esc(s), icon = (n, c) => H.icon(n, c);
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const err = (e) => H.toast((e && e.message) || String(e), "err");
  const run = (p, ok) => Promise.resolve(p).then((r) => { if (ok) H.toast(typeof ok === "function" ? ok(r) : ok); return r; }).catch(err);

  /* ---- shared lookups ---------------------------------------------------------- */
  const liveProjects = () => V.projects.filter((p) => !p.archived);
  const projectMechs = () => V.mechanisms.filter((m) => m.project === activeProject);
  const projectParts = () => projectMechs().flatMap((m) => m.parts);
  const projectPeople = () => V.people.filter((p) => p.project === activeProject);
  const customTypes = () => V.customTypes || [];
  const typeInfo = (t) => {
    const base = Parts.typeInfo(t, customTypes());
    return { ...base, color: catColors[t] || base.color };
  };
  const allTypeIds = () => [...Parts.TYPE_ORDER, ...customTypes().map((c) => c.id)];
  function orderedTypes() {
    const all = allTypeIds();
    if (!Array.isArray(catOrder)) return all;
    const inOrder = catOrder.filter((t) => all.includes(t));
    return [...inOrder, ...all.filter((t) => !inOrder.includes(t))];
  }
  const frac = (p) => (!p.stages || p.stages.length <= 1) ? (p.stage > 0 ? 1 : 0) : p.stage / (p.stages.length - 1);
  const assignees = (p) => V.people.filter((x) => x.project === p.project && (x.parts || []).includes(p.key));
  const scById = (uid) => uid ? H.allScouters().find((s) => s.id === uid) : null;
  // A teammate's BagelTools account: the linked one, else the only roster member with
  // that full name (or first name), so imported teams show real profile photos.
  function scFor(person) {
    if (person.uid) return scById(person.uid);
    const n = String(person.name || "").trim().toLowerCase(); if (!n) return null;
    const roster = H.allScouters();
    const full = roster.filter((s) => H.scouterName(s).toLowerCase() === n);
    if (full.length === 1) return full[0];
    const first = roster.filter((s) => String(s.first || "").trim().toLowerCase() === n);
    return first.length === 1 ? first[0] : null;
  }
  function personProgress(person) {
    const keys = new Set(person.parts || []);
    const parts = V.mechanisms.filter((m) => m.project === person.project).flatMap((m) => m.parts).filter((p) => keys.has(p.key) && !p.archived);
    const done = parts.filter((p) => p.done).length;
    return { done, total: parts.length, pct: parts.length ? Math.round(done / parts.length * 100) : 0 };
  }
  const alertParts = (person) => {
    const keys = new Set(person.parts || []);
    return V.mechanisms.filter((m) => m.project === person.project).flatMap((m) => m.parts).filter((p) => keys.has(p.key) && Parts.readyToMake(p));
  };
  // Which teammate cards are me: linked to my account, else an unlinked card with my name.
  function myPeople() {
    const me = Store.getMe() || {}, full = `${me.first || ""} ${me.last || ""}`.trim().toLowerCase(), first = String(me.first || "").trim().toLowerCase();
    const firstTaken = H.allScouters().filter((s) => String(s.first || "").trim().toLowerCase() === first).length > 1;
    return V.people.filter((p) => p.uid ? p.uid === me.id
      : (p.name.trim().toLowerCase() === full || (!firstTaken && first && p.name.trim().toLowerCase() === first)));
  }
  function avatar(person, cls) {
    const sc = scFor(person);
    if (sc) return H.scouterAvatar(sc, cls);
    return `<span class="${cls} bp-initial" aria-hidden="true">${esc((person.name || "?").trim().charAt(0).toUpperCase())}</span>`;
  }
  function visibleParts() {
    if (activeAlert) { const p = projectPeople().find((x) => x.id === activeAlert); return p ? alertParts(p) : []; }
    if (activePerson) { const p = projectPeople().find((x) => x.id === activePerson); const k = new Set(p ? p.parts : []); return projectParts().filter((x) => k.has(x.key)); }
    return (activeMech === "__all__" ? projectMechs() : projectMechs().filter((m) => m.id === activeMech)).flatMap((m) => m.parts);
  }
  function pushUndo(label, undo) { undoStack.push({ label, undo }); if (undoStack.length > 50) undoStack.shift(); }

  /* ---- data arrives: tell people what changed, then redraw --------------------- */
  function onData() {
    V = Parts.view();
    const keys = new Set(V.mechanisms.flatMap((m) => m.parts.map((p) => p.key)));
    const mine = new Map(myPeople().map((p) => [p.id, new Set(p.parts || [])]));
    const byOther = V.by && V.by !== meId();
    if (prevKeys && byOther) {
      const fresh = V.mechanisms.map((m) => [m, m.parts.filter((p) => !prevKeys.has(p.key)).length]).filter(([, n]) => n);
      fresh.forEach(([m, n]) => H.toast(`${plural(n, "new part")} in ${m.name}`));
      mine.forEach((set, pid) => {
        const before = prevMine.get(pid) || new Set(), added = [...set].filter((k) => !before.has(k));
        if (added.length && prevMine.has(pid)) {
          const person = V.people.find((p) => p.id === pid), proj = V.projects.find((p) => p.id === (person || {}).project);
          const who = (Parts.state().byName || "").split(" ")[0] || "A teammate";
          H.notifyBanner(`${who} gave you ${plural(added.length, "part")} to build`, { sub: proj ? `Parts · ${proj.name}` : "Parts" });
        }
      });
    }
    prevKeys = keys; prevMine = mine;
    redraw();
  }
  function redraw() {
    if (!mounted || !mounted.root.isConnected) { mounted = null; return; }
    const a = document.activeElement;
    if (isDragging || (a && mounted.root.contains(a) && a.matches("input:not([type=file]), textarea") && a.value)) { pending = true; return; }
    pending = false;
    const y = window.scrollY;
    mounted.draw(mounted.root);
    window.scrollTo(0, y);
  }

  /* ===========================================================================
     BOARD (#/parts)
     ======================================================================== */
  function hero(title, sub, side) {
    return H.pageHero({ ic: "wrench", eyebrow: "BagelParts · manufacturing", title, sub, side });
  }
  // Common start for every Parts page: cloud + data ready? Returns false while waiting.
  function gate(root, draw, title) {
    mounted = { root, draw };
    if (!window.Cloud || !Cloud.enabled()) {
      root.innerHTML = hero(title, "") + `<div class="card">${H.emptyState("globe", "Connecting to the team cloud…", "Parts is shared by the whole team, so it needs a connection.")}</div>`;
      return false;
    }
    Parts.watch();
    if (!Parts.isReady()) {
      root.innerHTML = hero(title, "") + `<div class="card bp-loading">${H.emptyState("wrench", "Loading the parts board…", "")}</div>`;
      return false;
    }
    V = Parts.view();
    if (prevKeys === null) { prevKeys = new Set(V.mechanisms.flatMap((m) => m.parts.map((p) => p.key))); prevMine = new Map(myPeople().map((p) => [p.id, new Set(p.parts || [])])); }
    const live = liveProjects();
    if (!activeProject || !live.some((p) => p.id === activeProject)) { activeProject = live.length ? live[0].id : null; ls.set("project", activeProject); }
    if (activeMech !== "__all__" && !projectMechs().some((m) => m.id === activeMech)) activeMech = "__all__";
    return true;
  }

  function board(root) {
    if (!gate(root, board, "Parts")) return;
    const proj = V.projects.find((p) => p.id === activeProject) || null;
    const archived = V.projects.filter((p) => p.archived);
    const size = Parts.sizeOf();
    root.innerHTML = `
      ${hero(proj ? esc(proj.name) : "Parts", "Import each mechanism from Onshape, track every part until it's made, and split the work across the team.",
        `<button class="btn ghost sm" data-act="code-all" title="Save code for every project">${icon("download")} Save code</button>`)}
      ${size > Parts.SIZE_WARN ? `<div class="card bp-warn">${icon("info")}<span>The parts board is ${Math.round(size / Parts.SIZE_MAX * 100)}% full. Delete projects you don't need anymore to keep room.</span></div>` : ""}
      ${projectsBar(proj, archived)}
      ${proj ? projectBody(proj) : startHere()}`;
    wireBoard(root);
  }

  function projectsBar(proj, archived) {
    const live = liveProjects();
    return `<section class="card bp-projects">
      <div class="bp-proj-row">
        <span class="pg-eyebrow">Projects</span>
        <div class="bp-pills" role="tablist" aria-label="Projects">${live.map((p) => `
          <span class="bp-pill${p.id === activeProject ? " on" : ""}">
            <button type="button" role="tab" aria-selected="${p.id === activeProject}" data-proj="${esc(p.id)}">${esc(p.name)}</button>
            ${p.id === activeProject ? `<button type="button" class="bp-pill-ic" data-proj-edit="${esc(p.id)}" title="Rename ${esc(p.name)}" aria-label="Rename ${esc(p.name)}">${icon("edit")}</button>` : ""}
          </span>`).join("") || `<span class="hint">No active projects yet.</span>`}</div>
        <form class="bp-inline" data-form="project"><input name="name" autocomplete="off" placeholder="New project" aria-label="New project name" />
          <button class="btn primary sm" type="submit">${icon("plus")} Add</button></form>
      </div>
      ${proj || archived.length ? `<div class="bp-proj-acts">
        ${proj ? `<button class="btn ghost sm" data-act="code-proj">${icon("download")} Save code for ${esc(proj.name)}</button>
          <button class="btn ghost sm" data-act="archive-proj">${icon("lock")} Archive</button>
          <button class="btn ghost sm bp-danger" data-act="del-proj">${icon("trash")} Delete</button>` : ""}
        ${archived.length ? `<details class="bp-archived"><summary>${icon("lock")} ${plural(archived.length, "archived project")}</summary>
          ${archived.map((p) => `<div class="bp-arow"><span>${esc(p.name)}</span><span class="bp-rowbtns">
            <button class="btn ghost sm" data-unarchive="${esc(p.id)}">Bring back</button>
            <button class="btn ghost sm bp-danger" data-proj-del="${esc(p.id)}">Delete</button></span></div>`).join("")}</details>` : ""}
      </div>` : ""}
    </section>`;
  }

  function startHere() {
    return `<section class="bp-start">
      <div class="card bp-start-card">
        <span class="bp-start-ic">${icon("plus")}</span>
        <h3>Start a project</h3>
        <p class="hint">One project per robot or season, for example "Socal Showdown Redesign". Type a name above and hit Add.</p>
      </div>
      <div class="card bp-start-card">
        <span class="bp-start-ic">${icon("upload")}</span>
        <h3>Bring over the old BagelParts</h3>
        <p class="hint">On the old site, click <b>Export data</b>, copy the save code, then paste it here. Every project, part, stage and assignment comes along. PDF drawings and DXFs need re-uploading.</p>
        <button class="btn primary sm" data-act="code-all">${icon("upload")} Paste a save code</button>
      </div>
    </section>`;
  }

  function projectBody(proj) {
    const mechs = projectMechs();
    const mech = mechs.find((m) => m.id === activeMech) || null;
    const counted = (list) => list.filter((p) => p.type && !p.archived).length;
    const mechBar = `<nav class="bp-mechs" aria-label="Mechanisms">
      <button type="button" class="bp-mech${activeMech === "__all__" ? " on" : ""}" data-mech="__all__">All mechanisms <b>${counted(projectParts())}</b></button>
      ${mechs.map((m) => `<button type="button" class="bp-mech${activeMech === m.id ? " on" : ""}" data-mech="${esc(m.id)}">${esc(m.name)} <b>${counted(m.parts)}</b></button>`).join("")}
      <button type="button" class="bp-mech add" data-act="add-mech">${icon("plus")} Mechanism</button></nav>`;
    if (!mechs.length) {
      return mechBar + `<div class="bp-layout"><div class="bp-main"><div class="card">${H.emptyState("wrench", "Add your first mechanism",
        "Drivetrain, Intake, Shooter… each gets its own tab. Then open it and import its parts from Onshape.")}
        <div class="btn-row" style="justify-content:center"><button class="btn primary" data-act="add-mech">${icon("plus")} Add a mechanism</button></div></div></div>${teamPanel(proj)}</div>`;
    }
    const scope = mech ? [mech] : mechs;
    const typed = scope.flatMap((m) => m.parts).filter((p) => p.type && !p.archived), done = typed.filter((p) => p.done).length;
    const pct = typed.length ? Math.round(done / typed.length * 100) : 0;
    const ready = scope.flatMap((m) => m.parts).filter(Parts.readyToMake).length;
    const unsorted = scope.flatMap((m) => m.parts).filter((p) => !p.type && !p.resolved && !p.archived).length;
    return `${mechBar}
      ${mech ? `<section class="card bp-mechact">
        <div class="bp-mechact-id"><span class="pg-eyebrow">Mechanism</span><b>${esc(mech.name)}</b></div>
        <div class="btn-row">
          <button class="btn primary sm" data-act="import">${icon("upload")} Import latest version</button>
          ${mech.link ? `<a class="btn ghost sm" href="${esc(mech.link)}" target="_blank" rel="noopener">${icon("external")} Open in Onshape</a>` : ""}
          <button class="btn ghost sm" data-act="edit-mech">${icon("edit")} Edit</button>
          <button class="btn ghost sm bp-danger" data-act="del-mech">${icon("trash")} Remove</button>
        </div></section>` : ""}
      <section class="card bp-stats">
        <div class="bp-stats-top"><span class="pg-eyebrow">Manufactured${mech ? ` · ${esc(mech.name)}` : ""}</span>
          <b class="bp-stats-frac">${done} <span>/ ${typed.length}</span></b><b class="bp-stats-pct">${pct}%</b></div>
        <div class="bp-bigbar"><i style="width:${pct}%"></i></div>
        <div class="bp-stats-chips">
          ${ready ? `<span class="bp-schip hot">${icon("zap")} ${ready} ready to make</span>` : ""}
          ${unsorted ? `<span class="bp-schip">${icon("info")} ${unsorted} unsorted</span>` : ""}
          ${!mech ? `<span class="bp-schip">${icon("info")} Pick a mechanism tab to import its parts</span>` : ""}
        </div>
      </section>
      ${filterBanner()}
      <div class="bp-layout">
        <div class="bp-main">${boardHTML()}${listsHTML()}</div>
        ${teamPanel(proj)}
      </div>`;
  }

  function filterBanner() {
    const p = projectPeople().find((x) => x.id === (activeAlert || activePerson));
    if (!p) { activeAlert = activePerson = null; return ""; }
    return `<div class="bp-filter">${avatar(p, "bp-av sm")}<span>Showing only <b>${esc(p.name)}</b>'s parts${activeAlert ? " that are ready to make" : ""}</span>
      <button class="btn ghost sm" data-act="clear-person">${icon("x")} Show all parts</button></div>`;
  }

  /* ---- the list columns ---- */
  function boardHTML() {
    const parts = visibleParts().filter((p) => p.type && !p.done && !p.archived);
    const all = orderedTypes(), full = all.filter((t) => parts.some((p) => p.type === t)), empty = all.filter((t) => !full.includes(t));
    // empty lists shrink to small chips at the end (still drop targets)
    return `<div class="bp-board">${full.map((t) => column(t, parts.filter((p) => p.type === t))).join("")}
      ${full.length ? "" : `<div class="card bp-noparts">${H.emptyState("upload", activePerson || activeAlert ? "Nothing here" : "No parts in progress",
        activePerson || activeAlert ? "No parts match this filter." : "Open a mechanism tab and import its parts from Onshape.")}</div>`}</div>
      <div class="bp-empties"><span class="pg-eyebrow">Empty lists</span>${empty.map((t) => { const info = typeInfo(t);
        return `<span class="bp-elist" data-type="${esc(t)}" style="--cat:${esc(info.color)}">
          <button type="button" class="bp-col-ic" data-color="${esc(t)}" aria-label="Pick ${esc(info.label)} color"><span class="bp-dot"></span></button>${esc(info.label)}
          ${info.custom ? `<button type="button" class="bp-col-ic" data-dellist="${esc(t)}" aria-label="Delete ${esc(info.label)}">${icon("x")}</button>` : ""}</span>`; }).join("")}
        <button type="button" class="bp-elist add" data-act="add-list">${icon("plus")} New list</button></div>`;
  }
  function column(type, list) {
    const info = typeInfo(type), shut = collapsed.has(type);
    const sorted = list.slice().sort((a, b) => frac(b) - frac(a) || a.seq - b.seq);
    return `<div class="bp-col${shut ? " shut" : ""}" data-type="${esc(type)}" style="--cat:${esc(info.color)}">
      <div class="bp-col-head" draggable="true" data-colhead="${esc(type)}" title="Drag onto a teammate to assign the whole list">
        <button type="button" class="bp-col-tog" data-collapse="${esc(type)}" aria-label="${shut ? "Expand" : "Collapse"} ${esc(info.label)}">${icon(shut ? "chevron-right" : "chevron-down")}</button>
        <span class="bp-chip">${esc(info.label)}</span><span class="bp-count">${list.length}</span>
        <button type="button" class="bp-col-ic" data-color="${esc(type)}" title="Pick this list's color" aria-label="Pick ${esc(info.label)} color"><span class="bp-dot"></span></button>
        ${info.custom ? `<button type="button" class="bp-col-ic" data-dellist="${esc(type)}" title="Delete this list" aria-label="Delete ${esc(info.label)}">${icon("x")}</button>` : ""}
      </div>
      ${shut ? "" : `<div class="bp-col-body">${sorted.map(partCard).join("")}</div>`}
    </div>`;
  }
  function partCard(p) {
    const pct = p.stages.length > 1 ? p.stage / (p.stages.length - 1) * 100 : 100;
    const who = assignees(p), open = expandedKey === p.key, dim = activePerson && !who.some((x) => x.id === activePerson);
    const ready = Parts.readyToMake(p);
    return `<div class="bp-part${open ? " open" : ""}${dim ? " dim" : ""}${ready ? " ready" : ""}" draggable="true" data-part="${esc(p.key)}">
      <button type="button" class="bp-part-head" data-open="${esc(p.key)}" aria-expanded="${open}">
        <span class="bp-part-name">${esc(p.name)}${p.qty > 1 ? ` <i class="bp-qty">×${p.qty}</i>` : ""}</span>
        <span class="bp-part-meta">${activeMech === "__all__" ? `<span class="bp-mtag">${esc(p.mechanism)}</span>` : ""}
          ${who.length ? `<span class="bp-avs" title="${esc(who.map((x) => x.name).join(", "))}">${who.slice(0, 3).map((x) => avatar(x, "bp-av xs")).join("")}${who.length > 3 ? `<i>+${who.length - 3}</i>` : ""}</span>` : ""}</span>
        <span class="bp-bar"><i style="width:${pct}%"></i></span>
        <span class="bp-stage">${esc(p.stages[p.stage] || "")}${ready ? `<em>${icon("zap")} Ready to make</em>` : ""}</span>
      </button>
      ${open ? detail(p, who) : ""}
    </div>`;
  }
  function detail(p, who) {
    const ppl = projectPeople(), free = ppl.filter((x) => !who.includes(x));
    const lists = orderedTypes();
    return `<div class="bp-detail">
      <div class="bp-steps">${p.stages.map((st, i) => `<button type="button" class="bp-step${i <= p.stage ? " on" : ""}${i === p.stage ? " cur" : ""}" data-stage="${i}" data-key="${esc(p.key)}">
        <span>${i < p.stage ? icon("check") : i + 1}</span>${esc(st)}</button>`).join("")}</div>
      <div class="bp-drow"><span class="bp-dl">Building it</span><span class="bp-dchips">
        ${who.map((x) => `<span class="bp-person-chip">${avatar(x, "bp-av xs")}${esc(x.name)}<button type="button" data-unassign="${esc(x.id)}" data-key="${esc(p.key)}" aria-label="Unassign ${esc(x.name)}">${icon("x")}</button></span>`).join("") || `<span class="hint">Nobody yet</span>`}
        ${free.length ? `<select data-assign="${esc(p.key)}" aria-label="Assign to a teammate"><option value="">+ Assign…</option>${free.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select>` : ""}
      </span></div>
      <div class="bp-drow"><span class="bp-dl">List</span><select data-movetype="${esc(p.key)}" aria-label="Move to a list">
        ${lists.map((t) => `<option value="${esc(t)}"${t === p.type ? " selected" : ""}>${esc(typeInfo(t).label)}</option>`).join("")}
        ${p.overridden ? `<option value="__auto__">Auto-sort by name</option>` : ""}</select></div>
      ${p.type === "inhouse" ? fileRow(p, "drawing") : ""}${p.type === "lasercut" ? fileRow(p, "dxf") : ""}
      <div class="bp-dbtns">
        ${p.onshapeUrl ? `<a class="btn ghost sm" href="${esc(p.onshapeUrl)}" target="_blank" rel="noopener">${icon("external")} Onshape</a>` : ""}
        <button type="button" class="btn ghost sm" data-archive="${esc(p.key)}">${icon("lock")} Archive</button>
        <button type="button" class="btn ghost sm bp-danger" data-remove="${esc(p.key)}">${icon("trash")} Remove</button>
      </div>
    </div>`;
  }
  function fileRow(p, kind) {
    const name = p[kind], pdf = kind === "drawing";
    return `<div class="bp-drow"><span class="bp-dl">${pdf ? "Drawing" : "DXF"}</span>${name
      ? `<span class="bp-file"><button type="button" class="bp-file-open" data-file="${kind}" data-key="${esc(p.key)}">${icon(pdf ? "external" : "download")} ${esc(name)}</button>
         <button type="button" class="bp-file-x" data-file-rm="${kind}" data-key="${esc(p.key)}" aria-label="Remove ${esc(name)}">${icon("x")}</button></span>`
      : `<label class="bp-drop" data-drop="${kind}" data-key="${esc(p.key)}">${icon("upload")} Drop a ${pdf ? "PDF" : "DXF"} or tap to upload
         <input type="file" hidden accept="${pdf ? "application/pdf,.pdf" : ".dxf"}" data-upload="${kind}" data-key="${esc(p.key)}" /></label>`}</div>`;
  }

  /* ---- unsorted / resolved / manufactured / archived ---- */
  function listsHTML() {
    const vis = visibleParts(), order = orderedTypes();
    const row = (p, btns, chip) => `<li class="${activePerson && !assignees(p).some((x) => x.id === activePerson) ? "dim" : ""}"${chip === "drag" ? ` draggable="true" data-part="${esc(p.key)}"` : ""}>
      <span class="bp-lname">${chip && chip !== "drag" ? `<span class="bp-chip sm" style="--cat:${esc(typeInfo(p.type).color)}">${esc(typeInfo(p.type).label)}</span>` : ""}
        ${esc(chip === "drag" ? p.rawName : p.name)}${p.qty > 1 ? ` <i class="bp-qty">×${p.qty}</i>` : ""} <span class="hint">· ${esc(p.mechanism)}</span></span>
      <span class="bp-rowbtns">${btns}</span></li>`;
    const b = (attr, key, label) => `<button type="button" class="btn ghost sm" ${attr}="${esc(key)}">${label}</button>`;
    const sec = (cls, title, sub, items) => items ? `<section class="card bp-list ${cls}"><div class="sr-head"><h3>${title}</h3></div>${sub ? `<p class="hint">${sub}</p>` : ""}<ul>${items}</ul></section>` : "";
    const unsorted = vis.filter((p) => !p.type && !p.resolved && !p.archived);
    const resolved = vis.filter((p) => !p.type && p.resolved && !p.archived);
    const made = vis.filter((p) => p.type && p.done && !p.archived).sort((a, c) => (order.indexOf(a.type) - order.indexOf(c.type)) || a.name.localeCompare(c.name));
    const arch = vis.filter((p) => p.archived);
    return sec("unsorted", `${icon("info")} Unsorted <span class="hint">${unsorted.length}</span>`, `These names don't follow the <code>type-name</code> convention (3dp, fabworks, lasercut, inhouse). Rename them in CAD and re-import, drag one onto a list (or open the list picker), or mark it handled.`,
        unsorted.map((p) => row(p, `<select data-movetype="${esc(p.key)}" aria-label="Put ${esc(p.rawName)} on a list"><option value="">Put on a list…</option>${orderedTypes().map((t) => `<option value="${esc(t)}">${esc(typeInfo(t).label)}</option>`).join("")}</select>${b("data-resolve", p.key, "Handled")}${b("data-archive", p.key, "Archive")}`, "drag")).join("")) +
      sec("resolved", `${icon("check")} Handled <span class="hint">${resolved.length}</span>`, "Unsorted parts you've dealt with.",
        resolved.map((p) => row(p, b("data-unresolve", p.key, "Send back"), "drag")).join("")) +
      sec("made", `${icon("trophy")} Manufactured <span class="hint">${made.length}</span>`, "",
        made.map((p) => row(p, `${b("data-reopen", p.key, "Reopen")}${b("data-archive", p.key, "Archive")}`, true)).join("")) +
      sec("arch", `${icon("lock")} Archived <span class="hint">${arch.length}</span>`, "Set aside: they don't count toward any list or the progress bar.",
        arch.map((p) => row(p, `${b("data-unarchive-part", p.key, "Bring back")}${b("data-remove", p.key, "Delete")}`, p.type ? true : null)).join(""));
  }

  /* ---- team panel ---- */
  function teamPanel(proj) {
    const ppl = projectPeople();
    const alerts = new Map(ppl.map((p) => [p.id, alertParts(p).length]));
    const ordered = ppl.slice().sort((a, b) => ((alerts.get(b.id) > 0) - (alerts.get(a.id) > 0)) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const roster = H.allScouters().map(H.scouterName).filter((n) => !ppl.some((p) => p.name.toLowerCase() === n.toLowerCase()));
    const me = meId();
    return `<aside class="card bp-team">
      <div class="sr-head"><h3>${icon("teams")} Team</h3><span class="hint">${esc(proj.name)}</span></div>
      <div class="bp-people">${ordered.map((p) => {
        const pr = personProgress(p), n = alerts.get(p.id);
        return `<div class="bp-person${activePerson === p.id || activeAlert === p.id ? " on" : ""}" data-person="${esc(p.id)}">
          <button type="button" class="bp-person-main" data-pick="${esc(p.id)}" title="Show only ${esc(p.name)}'s parts">
            ${avatar(p, "bp-av")}<span class="bp-pname">${esc(p.name)}${p.uid && p.uid === me ? ` <span class="badge cyan">You</span>` : ""}</span>
            <span class="bp-ppct">${pr.pct}%</span></button>
          ${n ? `<button type="button" class="bp-alert" data-alert="${esc(p.id)}" title="${plural(n, "part")} ready to make: show only those" aria-label="${plural(n, "part")} ready to make">!</button>` : ""}
          <button type="button" class="bp-pedit" data-edit-person="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">${icon("edit")}</button>
          <span class="bp-pbar"><i style="width:${pr.pct}%"></i></span>
          <span class="bp-pmeta">${pr.done}/${pr.total} done${n ? ` · <b>${n} ready</b>` : ""}</span>
        </div>`; }).join("") || `<p class="hint bp-people-empty">Nobody on this project yet. Add teammates below, then drag a part (or a whole list's header) onto someone to assign it.</p>`}</div>
      <form class="bp-inline" data-form="person"><input name="name" list="bpRoster" autocomplete="off" placeholder="Add a teammate" aria-label="Teammate name" />
        <button class="btn primary sm" type="submit">${icon("plus")} Add</button></form>
      <datalist id="bpRoster">${roster.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
      <p class="hint bp-team-tip">${icon("info")}<span>Drag parts onto people, or open a part and use <b>Assign</b>. A red <b>!</b> means they have parts ready to make.</span></p>
    </aside>`;
  }

  /* ---- board events ---- */
  function partByKey(key) { return V.mechanisms.flatMap((m) => m.parts).find((p) => p.key === key); }
  function wireBoard(root) {
    root.onsubmit = (e) => {
      const f = e.target.closest("form[data-form]"); if (!f) return;
      e.preventDefault();
      const input = f.querySelector("input"), name = input.value.trim(); if (!name) return;
      if (f.dataset.form === "project") run(Parts.addProject(name).then((id) => { activeProject = id; ls.set("project", id); activeMech = "__all__"; input.value = ""; redraw(); }), `Created ${name}`);
      if (f.dataset.form === "person") {
        const sc = H.allScouters().find((s) => H.scouterName(s).toLowerCase() === name.toLowerCase());
        run(Parts.addPerson(activeProject, name, sc ? sc.id : "").then(() => { input.value = ""; redraw(); }), `Added ${name} to the team`);
      }
    };
    root.onclick = (e) => {
      const t = e.target.closest("button, [data-proj], a"); if (!t || !root.contains(t)) return;
      const d = t.dataset;
      if (d.proj) { activeProject = d.proj; ls.set("project", d.proj); activeMech = "__all__"; activePerson = activeAlert = expandedKey = null; return redraw(); }
      if (d.projEdit) return renameProject(d.projEdit);
      if (d.projDel) return deleteProject(d.projDel);
      if (d.unarchive) return run(Parts.setProjectArchived(d.unarchive, false).then(() => { activeProject = d.unarchive; ls.set("project", activeProject); redraw(); }), "Project is back");
      if (d.mech) { activeMech = d.mech; activePerson = activeAlert = expandedKey = null; return redraw(); }
      if (d.open) { expandedKey = expandedKey === d.open ? null : d.open; return redraw(); }
      if (d.stage != null && d.key) { const p = partByKey(d.key); return run(Parts.setStage(d.key, Number(d.stage)).then((st) => { if (p && st === p.stages.length - 1) { expandedKey = null; H.toast(`${p.name} is manufactured`); } })); }
      if (d.unassign) { const pid = d.unassign, key = d.key; return run(Parts.assign(pid, [key], false).then(() => pushUndo("unassign", () => Parts.assign(pid, [key], true)))); }
      if (d.archive) return run(Parts.setArchived(d.archive, true).then(() => { if (expandedKey === d.archive) expandedKey = null; }), "Archived");
      if (d.unarchivePart) return run(Parts.setArchived(d.unarchivePart, false), "Back on its list");
      if (d.remove) { const p = partByKey(d.remove); return H.confirmDialog(`Remove "${p ? p.name : "this part"}" from the tracker?`, () => run(Parts.removePart(d.remove), "Part removed")); }
      if (d.resolve) return run(Parts.setResolved(d.resolve, true));
      if (d.unresolve) return run(Parts.setResolved(d.unresolve, false));
      if (d.reopen) { const p = partByKey(d.reopen); return run(Parts.setStage(d.reopen, Math.max(0, (p ? p.stages.length : 2) - 2)), "Reopened"); }
      if (d.collapse) { collapsed.has(d.collapse) ? collapsed.delete(d.collapse) : collapsed.add(d.collapse); ls.set("collapsed", [...collapsed]); return redraw(); }
      if (d.color) return colorMenu(d.color, t);
      if (d.dellist) { const c = customTypes().find((x) => x.id === d.dellist); return H.confirmDialog(`Delete the "${c ? c.name : ""}" list?`, () => run(Parts.removeCustomType(d.dellist), "List deleted")); }
      if (d.pick) { activePerson = activePerson === d.pick ? null : d.pick; activeAlert = null; activeMech = "__all__"; expandedKey = null; return redraw(); }
      if (d.alert) { activeAlert = activeAlert === d.alert ? null : d.alert; activePerson = null; activeMech = "__all__"; expandedKey = null; return redraw(); }
      if (d.editPerson) return editPerson(d.editPerson);
      if (d.file && d.key) return openFile(d.file, d.key);
      if (d.fileRm && d.key) return H.confirmDialog(`Remove this ${d.fileRm === "drawing" ? "drawing" : "DXF"}?`, () => run(Parts.removeFile(d.fileRm, d.key), "File removed"));
      switch (d.act) {
        case "code-all": return codeModal(null);
        case "code-proj": return codeModal(activeProject);
        case "archive-proj": return archiveProject();
        case "del-proj": return deleteProject(activeProject);
        case "add-mech": return mechModal(null);
        case "edit-mech": return mechModal(projectMechs().find((m) => m.id === activeMech));
        case "del-mech": { const m = projectMechs().find((x) => x.id === activeMech); if (!m) return;
          return H.confirmDialog(`Remove ${m.name} and all ${plural(m.parts.length, "part")}? This can't be undone.`, () => run(Parts.removeMechanism(m.id).then(() => { activeMech = "__all__"; }), `Removed ${m.name}`)); }
        case "import": return importModal(projectMechs().find((m) => m.id === activeMech));
        case "add-list": return askText("New list", "List name (shared by every project)", "", (name) => run(Parts.addCustomType(name), `Created ${name}`));
        case "clear-person": activePerson = activeAlert = null; return redraw();
      }
    };
    root.onchange = (e) => {
      const el = e.target, d = el.dataset;
      if (d.assign && el.value) { const pid = el.value, key = d.assign, person = V.people.find((x) => x.id === pid);
        return run(Parts.assign(pid, [key], true).then(() => pushUndo(`assign to ${person ? person.name : ""}`, () => Parts.assign(pid, [key], false))), `Assigned to ${person ? person.name : "them"}`); }
      if (d.movetype && el.value) return movePart(d.movetype, el.value === "__auto__" ? null : el.value);
      if (d.upload && el.files && el.files[0]) return upload(d.upload, d.key, el.files[0]);
    };
    // drag and drop: parts → lists (re-sort) or people (assign); list headers → lists (reorder) or people (assign all)
    root.ondragstart = (e) => {
      const head = e.target.closest && e.target.closest("[data-colhead]"), card = e.target.closest && e.target.closest("[data-part]");
      if (head) { e.dataTransfer.setData("bagel/col", head.dataset.colhead); e.dataTransfer.effectAllowed = "move"; }
      else if (card) { e.dataTransfer.setData("text/plain", card.dataset.part); e.dataTransfer.effectAllowed = "move"; card.classList.add("dragging"); }
    };
    const target = (e) => e.target.closest && e.target.closest(".bp-col, .bp-elist[data-type], .bp-person, [data-drop]");
    root.ondragover = (e) => { const t = target(e); if (!t) return; e.preventDefault(); $$(".drag-over", root).forEach((x) => x !== t && x.classList.remove("drag-over")); t.classList.add("drag-over"); };
    root.ondragleave = (e) => { const t = target(e); if (t && !t.contains(e.relatedTarget)) t.classList.remove("drag-over"); };
    root.ondrop = (e) => {
      const t = target(e); if (!t) return;
      e.preventDefault(); t.classList.remove("drag-over");
      if (t.dataset.drop) { const f = e.dataTransfer.files[0]; if (f) upload(t.dataset.drop, t.dataset.key, f); return; }
      const col = e.dataTransfer.getData("bagel/col"), key = e.dataTransfer.getData("text/plain");
      if (t.classList.contains("bp-person")) {
        const person = V.people.find((x) => x.id === t.dataset.person); if (!person) return;
        if (col) return assignList(person, col);
        if (key) return run(Parts.assign(person.id, [key], true).then(() => pushUndo(`assign to ${person.name}`, () => Parts.assign(person.id, [key], false))), `Assigned to ${person.name}`);
      } else {
        const type = t.dataset.type;
        if (col) return reorder(col, type);
        if (key) { const p = partByKey(key); if (p && p.type === type) return; return movePart(key, type); }
      }
    };
  }
  function movePart(key, type) {
    const p = partByKey(key), prev = p && p.overridden ? p.type : null;
    return run(Parts.setPartType(key, type).then(() => pushUndo(`move "${p ? p.name : "part"}" back`, () => Parts.setPartType(key, prev))),
      type ? `Moved to ${typeInfo(type).label}` : "Back to auto-sort");
  }
  function assignList(person, type) {
    const keys = projectParts().filter((p) => p.type === type && !p.archived).map((p) => p.key);
    if (!keys.length) return H.toast(`Nothing in ${typeInfo(type).label} to assign`, "err");
    const added = keys.filter((k) => !(person.parts || []).includes(k));
    return run(Parts.assign(person.id, keys, true).then(() => { if (added.length) pushUndo(`assign ${typeInfo(type).label} to ${person.name}`, () => Parts.assign(person.id, added, false)); }),
      `Assigned ${plural(keys.length, typeInfo(type).label + " part")} to ${person.name}`);
  }
  function reorder(dragged, target) {
    if (dragged === target) return;
    const order = orderedTypes().filter((t) => t !== dragged), i = order.indexOf(target);
    if (i < 0) return;
    order.splice(i, 0, dragged); catOrder = order; ls.set("catOrder", order); redraw();
  }
  async function upload(kind, key, file) {
    H.toast(`Uploading ${file.name}…`, "info");
    try { await Parts.uploadFile(kind, key, file); H.toast(kind === "drawing" ? "Drawing added, part moved to Drawing made" : "DXF added, part moved to DXF Uploaded"); }
    catch (e) { err(e); }
  }
  async function openFile(kind, key) {
    // open the tab right away (inside the tap) so pop-up blockers allow it
    const w = kind === "drawing" ? window.open("", "_blank") : null;
    try {
      const { name, blob } = await Parts.fetchFile(kind, key), url = URL.createObjectURL(blob);
      if (w) w.location.href = url;
      else { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { if (w) w.close(); err(e); }
  }
  function colorMenu(type, anchor) {
    const old = document.querySelector(".bp-colors"); if (old) { old.remove(); if (old.dataset.type === type) return; }
    const m = document.createElement("div");
    m.className = "bp-colors"; m.dataset.type = type;
    m.innerHTML = SWATCHES.map((c) => `<button type="button" style="--c:${c}" data-c="${c}" class="${catColors[type] === c ? "on" : ""}" aria-label="${c}"></button>`).join("") +
      `<button type="button" class="bp-colors-reset" data-c="">Default color</button>`;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 8) + "px";
    m.style.left = Math.max(8, Math.min(r.left - 100, innerWidth - m.offsetWidth - 8)) + "px";
    m.onclick = (e) => {
      const b = e.target.closest("[data-c]"); if (!b) return;
      if (b.dataset.c) catColors[type] = b.dataset.c; else delete catColors[type];
      ls.set("catColors", catColors); m.remove(); redraw();
    };
    setTimeout(() => document.addEventListener("pointerdown", function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("pointerdown", off); } }), 0);
  }

  /* ---- dialogs ---- */
  function askText(title, label, value, onOk) {
    H.modal(title, `<form id="bpAsk"><label class="field"><span>${esc(label)}</span><input id="bpAskIn" autocomplete="off" value="${esc(value || "")}" /></label>
      <div class="btn-row" style="justify-content:flex-end;margin-top:14px"><button type="submit" class="btn primary">Save</button></div></form>`, (body, close) => {
      const input = body.querySelector("#bpAskIn"); input.focus(); input.select();
      body.querySelector("#bpAsk").onsubmit = (e) => { e.preventDefault(); const v = input.value.trim(); if (!v) return; close(); onOk(v); };
    });
  }
  function renameProject(id) {
    const p = V.projects.find((x) => x.id === id); if (!p) return;
    askText("Rename project", "Project name", p.name, (name) => run(Parts.renameProject(id, name), "Project renamed"));
  }
  function deleteProject(id) {
    const p = V.projects.find((x) => x.id === id); if (!p) return;
    const n = V.mechanisms.filter((m) => m.project === id).length;
    H.confirmDialog(`Delete "${p.name}", its ${plural(n, "mechanism")} and all their parts? This can't be undone. (Archive keeps it instead.)`,
      () => run(Parts.removeProject(id).then(() => { if (activeProject === id) activeProject = null; }), `Deleted ${p.name}`));
  }
  function archiveProject() {
    const p = V.projects.find((x) => x.id === activeProject); if (!p) return;
    const parts = V.mechanisms.filter((m) => m.project === p.id).flatMap((m) => m.parts);
    const nd = parts.filter((x) => x.drawing).length, nx = parts.filter((x) => x.dxf).length;
    H.modal(`Archive ${p.name}`, `<p>It moves to Archived projects, and you can bring it back any time.</p>
      ${nd ? `<label class="bp-check"><input type="checkbox" id="bpDropD" /> Also delete its ${plural(nd, "PDF drawing")} to free space</label>` : ""}
      ${nx ? `<label class="bp-check"><input type="checkbox" id="bpDropX" /> Also delete its ${plural(nx, "DXF file")} to free space</label>` : ""}
      <div class="btn-row" style="justify-content:flex-end;margin-top:16px"><button class="btn primary" id="bpArch">${icon("lock")} Archive</button></div>`, (body, close) => {
      body.querySelector("#bpArch").onclick = () => {
        const dd = !!(body.querySelector("#bpDropD") || {}).checked, dx = !!(body.querySelector("#bpDropX") || {}).checked;
        close(); run(Parts.setProjectArchived(p.id, true, dd, dx).then(() => { activeProject = null; }), `${p.name} archived`);
      };
    });
  }
  function mechModal(m) {
    H.modal(m ? `Edit ${m.name}` : "Add a mechanism", `<form id="bpMech" class="bp-form">
      <label class="field"><span>Name</span><input name="name" autocomplete="off" placeholder="Drivetrain, Intake, Shooter…" value="${esc(m ? m.name : "")}" required /></label>
      <label class="field"><span>Onshape link <i class="hint">(optional, adds an "Open in Onshape" button)</i></span><input name="link" type="url" inputmode="url" placeholder="https://cad.onshape.com/documents/…" value="${esc(m ? m.link : "")}" /></label>
      <div class="btn-row" style="justify-content:flex-end"><button class="btn primary" type="submit">${icon(m ? "check" : "plus")} ${m ? "Save" : "Add mechanism"}</button></div></form>`, (body, close) => {
      const f = body.querySelector("#bpMech"); field(f, "name").focus();
      f.onsubmit = (e) => {
        e.preventDefault();
        const name = field(f, "name").value.trim(), link = field(f, "link").value.trim(); if (!name) return;
        close();
        if (m) run(Parts.updateMechanism(m.id, name, link), "Mechanism saved");
        else run(Parts.addMechanism(name, link, activeProject).then((id) => { activeMech = id; redraw(); }), `Added ${name}. Now import its parts.`);
      };
    });
  }
  function editPerson(id) {
    const p = V.people.find((x) => x.id === id); if (!p) return;
    const roster = H.allScouters().slice().sort((a, b) => H.scouterName(a).localeCompare(H.scouterName(b)));
    H.modal(`Edit ${p.name}`, `<form id="bpPerson" class="bp-form">
      <label class="field"><span>Name</span><input name="name" autocomplete="off" value="${esc(p.name)}" required /></label>
      <label class="field"><span>BagelTools account <i class="hint">(links their photo, "My Parts" page and alerts)</i></span>
        <select name="uid"><option value="">Not linked</option>${roster.map((s) => `<option value="${esc(s.id)}"${s.id === p.uid ? " selected" : ""}>${esc(H.scouterName(s))}</option>`).join("")}</select></label>
      <div class="btn-row" style="justify-content:space-between">
        <button class="btn ghost bp-danger" type="button" id="bpPersonRm">${icon("trash")} Remove from team</button>
        <button class="btn primary" type="submit">${icon("check")} Save</button></div></form>`, (body, close) => {
      const f = body.querySelector("#bpPerson");
      f.onsubmit = (e) => { e.preventDefault(); close(); run(Parts.updatePerson(p.id, field(f, "name").value, field(f, "uid").value), "Saved"); };
      body.querySelector("#bpPersonRm").onclick = () => { close(); H.confirmDialog(`Remove ${p.name} from this project's team?`, () => run(Parts.removePerson(p.id).then(() => { if (activePerson === p.id) activePerson = null; }), `${p.name} removed`)); };
    });
  }
  function codeModal(projectId) {
    const proj = projectId ? V.projects.find((p) => p.id === projectId) : null;
    H.modal(proj ? `Save code · ${proj.name}` : "Save codes", `<div class="bp-form">
      <p class="hint">${proj ? `Everything in ${esc(proj.name)}: mechanisms, parts with their progress and lists, and the team with assignments.` : "A save code holds every project. Paste it back any time (here or on the old BagelParts) to recreate it."} PDF drawings and DXFs aren't included.</p>
      <textarea id="bpCodeOut" rows="4" readonly placeholder="${V.projects.length ? "Making the code…" : "Nothing to export yet."}"></textarea>
      <div class="btn-row"><button class="btn ghost sm" id="bpCopy" type="button">${icon("download")} Copy save code</button></div>
      <hr class="bp-sep" />
      <p class="hint"><b>Bring data in.</b> Paste a save code (it starts with <code>BP1:</code>). Its projects are added as new ones, so nothing you have is overwritten.</p>
      <textarea id="bpCodeIn" rows="4" placeholder="BP1:…"></textarea>
      <div class="btn-row" style="justify-content:flex-end"><button class="btn primary" id="bpCodeImport" type="button">${icon("upload")} Import save code</button></div></div>`, (body, close) => {
      const out = body.querySelector("#bpCodeOut");
      if (V.projects.length) Parts.exportCode(projectId).then((c) => { out.value = c; }).catch((e) => { out.value = ""; err(e); });
      body.querySelector("#bpCopy").onclick = async () => {
        if (!out.value) return;
        try { await navigator.clipboard.writeText(out.value); } catch (e) { out.select(); document.execCommand("copy"); }
        H.toast("Save code copied");
      };
      body.querySelector("#bpCodeImport").onclick = () => {
        const code = body.querySelector("#bpCodeIn").value.trim(); if (!code) return H.toast("Paste a save code first", "err");
        run(Parts.importCode(code).then((ids) => {
          close();
          if (ids.length) { activeProject = ids[0]; ls.set("project", ids[0]); activeMech = "__all__"; activePerson = activeAlert = null; redraw(); }
          return ids.length;
        }), (n) => `Imported ${plural(n, "project")}`);
      };
    });
  }

  /* ---- Import latest version (paste / CSV / composites with screenshot OCR) ---- */
  function importModal(mech) {
    if (!mech) return;
    H.modal(`Import parts · ${mech.name}`, `<div class="bp-form bp-import">
      <p class="hint">In Onshape, open this mechanism's <b>assembly</b> → <b>BOM</b> → <b>⋯ → Export → CSV</b>, then drop the file here. Pasting part names (one per line) or a copied BOM table works too. Parts you already track keep their progress.</p>
      <label class="bp-drop big" id="bpCsvDrop">${icon("upload")}<span>Drop the BOM <b>CSV</b> here or <u>browse</u></span><input type="file" hidden accept=".csv,.tsv,.txt" id="bpCsv" /></label>
      <textarea id="bpImportText" rows="7" placeholder="inhouse-Drive Rail Tube 2x1&#10;3dp-Gearbox Spacer&#10;lasercut-Belly Pan&#10;115T 5M 15mm Wide Belt&#10;composite-Drive Module"></textarea>
      <details class="bp-comps"><summary>${icon("dashboard")} Composite parts <span class="hint">(${(V.composites || []).length} defined)</span></summary>
        <p class="hint">A composite is one line in the assembly BOM that's really several parts. Define it once (paste the parts from its own Part Studio) and every import expands it, multiplying quantities.</p>
        <div id="bpCompList"></div>
        <input id="bpCompName" autocomplete="off" placeholder="Composite name, exactly as it reads in the BOM" />
        <textarea id="bpCompText" rows="3" placeholder="Its parts, one per line (quantity in the last column)"></textarea>
        <div class="btn-row"><button class="btn ghost sm" type="button" id="bpCompSave">${icon("check")} Save composite</button></div>
      </details>
      <div class="btn-row"><button class="btn ghost" type="button" id="bpPreview">${icon("search")} Preview</button>
        <button class="btn primary" type="button" id="bpApply" hidden>${icon("upload")} Import</button></div>
      <div id="bpSummary" class="bp-summary" hidden></div>
      <div id="bpUndef"></div></div>`, (body, close) => {
      body.closest(".modal").classList.add("bp-wide");
      const text = body.querySelector("#bpImportText"), summary = body.querySelector("#bpSummary"), apply = body.querySelector("#bpApply");
      const compList = () => {
        const comps = Parts.view().composites;
        body.querySelector("#bpCompList").innerHTML = comps.length ? comps.map((c) => `<div class="bp-arow"><span><b>${esc(c.name)}</b> <span class="hint">→ ${plural(c.parts.length, "part type")}, ${c.parts.reduce((s, p) => s + (p[1] || 1), 0)} total</span></span>
          <span class="bp-rowbtns"><button class="btn ghost sm" type="button" data-cedit="${esc(c.id)}">Edit</button><button class="btn ghost sm bp-danger" type="button" data-cdel="${esc(c.id)}">Delete</button></span></div>`).join("") : `<p class="hint">No composites yet.</p>`;
      };
      compList();
      body.querySelector("#bpCompList").onclick = (e) => {
        const b = e.target.closest("[data-cedit], [data-cdel]"); if (!b) return;
        const c = Parts.view().composites.find((x) => x.id === (b.dataset.cedit || b.dataset.cdel)); if (!c) return;
        if (b.dataset.cdel) return run(Parts.removeComposite(c.id).then(compList), "Composite deleted");
        body.querySelector("#bpCompName").value = c.name; body.querySelector("#bpCompText").value = c.parts.map((p) => `${p[0]}\t${p[1]}`).join("\n");
      };
      body.querySelector("#bpCompSave").onclick = () => {
        const n = body.querySelector("#bpCompName").value.trim();
        run(Parts.addComposite(n, body.querySelector("#bpCompText").value).then(() => { body.querySelector("#bpCompName").value = ""; body.querySelector("#bpCompText").value = ""; compList(); }), `Saved ${n}`);
      };
      const loadFile = (f) => { if (!f) return; const r = new FileReader(); r.onload = () => { text.value = r.result; H.toast(`Loaded ${f.name}`); preview(); }; r.onerror = () => H.toast("Couldn't read that file", "err"); r.readAsText(f); };
      const drop = body.querySelector("#bpCsvDrop");
      body.querySelector("#bpCsv").onchange = (e) => loadFile(e.target.files[0]);
      [drop, text].forEach((el) => {
        el.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag-over"); });
        el.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
        el.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) { e.preventDefault(); drop.classList.remove("drag-over"); loadFile(f); } });
      });
      function preview() {
        let r;
        try { r = Parts.previewImport(mech.id, text.value); }
        catch (e) { summary.hidden = false; summary.innerHTML = `<p class="bp-bad">${esc(e.message)}</p>`; apply.hidden = true; body.querySelector("#bpUndef").innerHTML = ""; return; }
        const li = (p) => `<li><span class="bp-chip sm" style="--cat:${esc(p.type ? typeInfo(p.type).color : "#9fb0d4")}">${esc(p.type ? typeInfo(p.type).label : "Unsorted")}</span> ${esc(p.name)}${p.qty > 1 ? ` <i class="bp-qty">×${p.qty}</i>` : ""}</li>`;
        summary.hidden = false;
        summary.innerHTML = `<div class="bp-sum-kpis"><span><b>${r.parsed}</b> names read</span><span class="good"><b>${r.toAdd.length}</b> new</span><span><b>${r.existing}</b> already tracked</span>${r.missing.length ? `<span class="warn"><b>${r.missing.length}</b> missing</span>` : ""}</div>
          ${r.composites.length ? `<p class="hint">Expanded ${r.composites.map((c) => `<b>${esc(c.name)}</b>${c.qty > 1 ? ` ×${c.qty}` : ""} → ${plural(c.parts, "part type")}`).join(", ")}</p>` : ""}
          ${r.toAdd.length ? `<ul class="bp-newlist">${r.toAdd.slice(0, 40).map(li).join("")}${r.toAdd.length > 40 ? `<li class="hint">and ${r.toAdd.length - 40} more</li>` : ""}</ul>` : `<p class="hint">No new parts: everything here is already tracked.</p>`}
          ${r.missing.length ? `<p class="bp-warnline">Tracked but missing from this BOM: ${r.missing.slice(0, 10).map(esc).join(", ")}${r.missing.length > 10 ? "…" : ""}</p>
            <label class="bp-check"><input type="checkbox" id="bpRmMissing" /> Also remove those (finished and archived parts are never removed)</label>` : ""}`;
        apply.hidden = false;
        apply.innerHTML = `${icon("upload")} ${r.toAdd.length ? `Import ${plural(r.toAdd.length, "new part")}` : "Update quantities"}`;
        undefinedComposites(r.undefinedComposites);
      }
      function undefinedComposites(names) {
        const box = body.querySelector("#bpUndef");
        box.innerHTML = names.length ? `<p class="hint"><b>${plural(names.length, "composite part")}</b> in this BOM ${names.length === 1 ? "isn't" : "aren't"} defined yet. Add a screenshot of each one's Part Studio parts list (BagelTools reads the names for you), check them, then save.</p>` +
          names.map((n, i) => `<div class="card bp-undef" data-i="${i}"><h4>Define <span>${esc(n)}</span></h4>
            <label class="bp-drop" tabindex="0">${icon("image")} Drop or paste screenshots, or tap to pick (they stack up)<input type="file" accept="image/*" multiple hidden /></label>
            <p class="hint bp-ocr-status"></p><textarea rows="5" placeholder="Part names appear here, one per line. Fix any misreads."></textarea>
            <div class="btn-row"><button class="btn ghost sm" type="button">${icon("check")} Save ${esc(n)}</button></div></div>`).join("") : "";
        names.forEach((n, i) => {
          const card = box.querySelector(`[data-i="${i}"]`), dz = card.querySelector(".bp-drop"), status = card.querySelector(".bp-ocr-status"), ta = card.querySelector("textarea");
          const add = (files) => ocr(files, ta, status);
          card.querySelector("input").onchange = (e) => add(e.target.files);
          dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag-over"); });
          dz.addEventListener("dragleave", () => dz.classList.remove("drag-over"));
          dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("drag-over"); add(e.dataTransfer.files); });
          dz.addEventListener("paste", (e) => add([...e.clipboardData.items].filter((x) => x.type.startsWith("image/")).map((x) => x.getAsFile()).filter(Boolean)));
          card.querySelector("button").onclick = () => {
            if (!ta.value.trim()) return H.toast("Add the composite's parts first", "err");
            run(Parts.addComposite(n, ta.value).then(() => { compList(); preview(); }), `Saved ${n}`);
          };
        });
      }
      body.querySelector("#bpPreview").onclick = preview;
      apply.onclick = () => {
        const rm = !!(body.querySelector("#bpRmMissing") || {}).checked;
        apply.disabled = true;
        Parts.applyImport(mech.id, text.value, rm).then((r) => {
          close(); H.toast(`Imported: ${r.added} added${r.removed ? `, ${r.removed} removed` : ""}, ${r.existing} kept`);
        }).catch((e) => { apply.disabled = false; err(e); });
      };
      text.focus();
    });
  }
  // Screenshot → part names (Tesseract, loaded only the first time it's needed).
  let tessLoad = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    return tessLoad = tessLoad || new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      s.onload = () => res(); s.onerror = () => { tessLoad = null; rej(new Error("The screenshot reader couldn't load (offline?). Type the parts in instead.")); };
      document.head.appendChild(s);
    });
  }
  async function ocr(fileList, ta, status) {
    const imgs = [...fileList].filter((f) => f && f.type && f.type.startsWith("image/"));
    if (!imgs.length) return;
    try { status.textContent = "Loading the screenshot reader…"; await loadTesseract(); } catch (e) { status.textContent = e.message; return; }
    const lines = ta.value.split("\n").map((s) => s.trim()).filter(Boolean), seen = new Set(lines);
    let added = 0;
    for (let i = 0; i < imgs.length; i++) {
      try {
        const { data } = await Tesseract.recognize(imgs[i], "eng", { logger: (m) => { if (m.status === "recognizing text") status.textContent = `Reading screenshot ${i + 1}/${imgs.length}… ${Math.round(m.progress * 100)}%`; } });
        data.text.split("\n").map((s) => s.trim()).filter(Boolean).forEach((ln) => { if (!seen.has(ln)) { seen.add(ln); lines.push(ln); added++; } });
        ta.value = lines.join("\n");
      } catch (e) { status.textContent = "Couldn't read that screenshot: " + e.message; }
    }
    status.textContent = `Added ${plural(added, "line")} (${lines.length} total). Add more screenshots if the list is longer, check the names, then save.`;
  }

  /* ===========================================================================
     MY PARTS (#/myparts)
     ======================================================================== */
  function mine(root) {
    if (!gate(root, mine, "My parts")) return;
    const cards = myPeople().filter((p) => { const pr = V.projects.find((x) => x.id === p.project); return pr && !pr.archived; });
    const head = H.pageHero({ ic: "user", eyebrow: "BagelParts · my parts", title: "My parts", sub: "Everything you're building, in every project. Bump a part's stage right here." });
    if (!cards.length) {
      const claimable = liveProjects().map((pr) => [pr, V.people.filter((p) => p.project === pr.id && !p.uid)]).filter(([, ps]) => ps.length);
      root.innerHTML = head + `<div class="card">${H.emptyState("user", "You're not on a parts team yet", "Ask whoever runs the board to add you, or if a card with your name is already there, claim it below.")}
        ${claimable.length ? `<div class="bp-claim">${claimable.map(([pr, ps]) => `<label class="field"><span>${esc(pr.name)}</span>
          <select data-claim><option value="">Which card is you?</option>${ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>`).join("")}</div>` : ""}
        <div class="btn-row" style="justify-content:center"><a class="btn primary" href="#/parts">${icon("wrench")} Open the board</a></div></div>`;
      root.onchange = (e) => {
        const sel = e.target.closest("[data-claim]"); if (!sel || !sel.value) return;
        const p = V.people.find((x) => x.id === sel.value);
        run(Parts.updatePerson(p.id, p.name, meId()), `Linked: you're ${p.name} now`);
      };
      root.onclick = null;
      return;
    }
    const sections = cards.map((person) => {
      const proj = V.projects.find((x) => x.id === person.project), keys = new Set(person.parts || []);
      const parts = V.mechanisms.filter((m) => m.project === person.project).flatMap((m) => m.parts).filter((p) => keys.has(p.key) && !p.archived);
      const ready = parts.filter(Parts.readyToMake), todo = parts.filter((p) => !p.done && !Parts.readyToMake(p)), done = parts.filter((p) => p.done);
      const pr = personProgress(person);
      const row = (p) => {
        const info = typeInfo(p.type), pct = p.stages.length > 1 ? p.stage / (p.stages.length - 1) * 100 : 100, last = p.stage >= p.stages.length - 1;
        return `<div class="bp-mrow" style="--cat:${esc(info.color)}">
          <span class="bp-chip sm">${esc(info.label)}</span>
          <a class="bp-mname" href="#/parts" data-goto="${esc(p.key)}" data-proj="${esc(person.project)}">${esc(p.name)}${p.qty > 1 ? ` <i class="bp-qty">×${p.qty}</i>` : ""}<span class="hint"> · ${esc(p.mechanism)}</span></a>
          <span class="bp-mstage"><span class="bp-bar"><i style="width:${pct}%"></i></span>${esc(p.stages[p.stage] || "No stages")}</span>
          <span class="bp-rowbtns">${p.stage > 0 ? `<button class="btn ghost sm" data-step="-1" data-key="${esc(p.key)}" aria-label="Back a stage">${icon("chevron-left")}</button>` : ""}
            ${!last && p.stages.length ? `<button class="btn primary sm" data-step="1" data-key="${esc(p.key)}">${esc(p.stages[p.stage + 1])} ${icon("chevron-right")}</button>` : ""}</span>
        </div>`;
      };
      return `<section class="card bp-mine">
        <div class="bp-mine-head">${avatar(person, "bp-av")}<div><span class="pg-eyebrow">${esc(proj.name)}</span><b>${pr.done}/${pr.total} done</b></div>
          <span class="bp-ppct">${pr.pct}%</span></div>
        <div class="bp-bigbar"><i style="width:${pr.pct}%"></i></div>
        ${ready.length ? `<h4 class="bp-mh hot">${icon("zap")} Ready to make <span>${ready.length}</span></h4>${ready.map(row).join("")}` : ""}
        ${todo.length ? `<h4 class="bp-mh">${icon("clock")} In progress <span>${todo.length}</span></h4>${todo.sort((a, b) => frac(b) - frac(a)).map(row).join("")}` : ""}
        ${done.length ? `<details class="bp-done"><summary>${icon("check")} Done <span>${done.length}</span></summary>${done.map(row).join("")}</details>` : ""}
        ${!parts.length ? `<p class="hint">Nothing assigned to you in ${esc(proj.name)} yet.</p>` : ""}
      </section>`;
    }).join("");
    root.innerHTML = head + sections;
    root.onchange = null;
    root.onclick = (e) => {
      const b = e.target.closest("[data-step]");
      if (b) { const p = partByKey(b.dataset.key); if (p) run(Parts.setStage(p.key, p.stage + Number(b.dataset.step)), (st) => `${p.name}: ${p.stages[st]}`); return; }
      const a = e.target.closest("[data-goto]");
      if (a) { const p = partByKey(a.dataset.goto); activeProject = a.dataset.proj; ls.set("project", activeProject); activeMech = p ? p.mechId : "__all__"; activePerson = activeAlert = null; expandedKey = a.dataset.goto; }
    };
  }

  /* ===========================================================================
     GUIDE (#/partsguide)
     ======================================================================== */
  function guide(root) {
    mounted = null;
    const row = (code, means, stages) => `<tr><td><code>${code}</code></td><td>${means}</td><td>${stages}</td></tr>`;
    root.innerHTML = H.pageHero({ ic: "info", eyebrow: "BagelParts · guide", title: "How Parts works", sub: "From an Onshape assembly to every part made, and who's making it." }) + `
      <div class="bp-guide">
        <section class="card"><h3>${icon("wrench")} 1 · Projects and mechanisms</h3>
          <p>Make a <b>project</b> per robot or season. Inside it, add a <b>mechanism</b> (Drivetrain, Intake, Shooter…): each gets its own tab. The Onshape link is optional and adds an "Open in Onshape" button.</p></section>
        <section class="card"><h3>${icon("upload")} 2 · Import parts from Onshape</h3>
          <ol><li>In Onshape, open the mechanism's <b>assembly</b>, open the <b>BOM</b>, then <b>⋯ → Export → CSV</b>.</li>
          <li>On the Board, open that mechanism's tab, hit <b>Import latest version</b> and drop the CSV in (or paste part names).</li>
          <li><b>Preview</b> shows what's new, what's already tracked and what disappeared. Then <b>Import</b>.</li></ol>
          <p>Re-import whenever the CAD changes: it's a diff, so progress is kept. Parts missing from the new BOM are only removed if you tick the box, and finished or archived parts never are. Quantities come from the BOM's last column.</p></section>
        <section class="card"><h3>${icon("dashboard")} 3 · Composite parts</h3>
          <p>Name composites in Onshape with a <code>composite-</code> prefix. The first time one shows up in an import, a box appears: drop in a screenshot of its Part Studio parts list and BagelTools reads the names (check them!). After that every import expands it automatically, multiplying quantities. Composites can contain composites.</p></section>
        <section class="card bp-guide-wide"><h3>${icon("list")} 4 · Name parts so Parts understands them</h3>
          <div class="table-wrap"><table><thead><tr><th>Looks like</th><th>Means</th><th>Stages</th></tr></thead><tbody>
            ${row("3dp-Roller End Cap", "3D printed", "Unfinished → Designed → Printing → Done")}
            ${row("fabworks-Drive Gusset", "Ordered from Fabworks", "Unfinished → Designed → Ordered → Arrived")}
            ${row("lasercut-Belly Pan", "Laser cut", "Unfinished → Designed → DXF Uploaded → Done")}
            ${row("inhouse-Climber Tube 2x1", "Machined by us", "Unfinished → Designed → Drawing made → In progress → Done")}
            ${row("115T 5M 15mm Wide Belt", 'Anything with "belt"', "Ordered → Arrived → Sorted")}
            ${row("14t Steel Spur Gear", 'Anything with "gear"', "Ordered → Arrived → Sorted")}
            ${row("Kraken X60", "Motors: Kraken, NEO, Falcon, CIM, Vortex…", "Ordered → Arrived → Sorted")}
            ${row("24T HTD Pulley", 'Anything with "pulley"', "Unfinished → Designed → Printing → Done")}
            ${row('1/2 Rounded Hex (19" L)', "Shafts: churro, ThunderHex, rounded hex", "Unfinished → Designed → In progress → Done")}
            ${row("1/2 Hex Bore Spacer", 'Anything with "spacer"', "Unfinished → Designed → Printing → Done")}
            ${row("Sushi Roller (40A)", "Rollers: sushi, compliant/star wheels, flappers", "Ordered → Arrived → Sorted")}
            ${row("1/2 Hex Shaft Collar", 'Anything with "collar"', "Ordered → Arrived → Sorted")}
            ${row("roboRIO, PDH, radio…", "FRC electronics", "Ordered → Arrived → Sorted")}
            ${row("composite-Drive Module", "A composite (see 3)", "expands into its parts")}
          </tbody></table></div>
          <p class="hint">Your <code>type-</code> prefix always wins (<code>3dp-MotorSpacer</code> is a 3D print). Ignored automatically: origin cubes, fasteners (bolts, screws, nuts, washers…) and bare part numbers. Bearings and anything else land in <b>Unsorted</b>.</p></section>
        <section class="card"><h3>${icon("teams")} 5 · Team and assignments</h3>
          <p>The <b>Team</b> panel is per project. Add teammates (pick their name to link their BagelTools account), then drag a part onto someone, or drag a whole list's header to give them every part in it. On a phone, open a part and use <b>Assign</b>. A part can belong to several people.</p>
          <p>Tap a person to see only their parts. A red <b>!</b> means they have parts <b>ready to make</b>: an in-house part with a drawing, a laser-cut part with a DXF, or a 3D print / pulley / spacer / shaft at "Designed". People linked to their account get a heads-up when someone hands them parts, and see everything on <a href="#/myparts">My Parts</a>.</p></section>
        <section class="card"><h3>${icon("check")} 6 · Track, sort, archive</h3>
          <ul><li>Tap a part to open it, then tap a stage. Its last stage moves it to <b>Manufactured</b>.</li>
          <li>In-house parts take a <b>PDF drawing</b> and laser-cut parts a <b>DXF</b>: drop the file on the open part. Uploading moves it to "Drawing made" / "DXF Uploaded".</li>
          <li>Sorted wrong? Drag the part to another list, or use the <b>List</b> picker. <b>Ctrl+Z</b> undoes the last move or assignment.</li>
          <li><b>New list</b> (end of the board) makes your own list, shared by every project. The dot on a list's header picks its color on your device; drag headers to reorder.</li>
          <li><b>Archive</b> sets a part (or a whole project) aside without deleting it.</li></ul></section>
        <section class="card"><h3>${icon("download")} 7 · Save codes</h3>
          <p>A save code (<code>BP1:…</code>) holds whole projects. Use one to back up, or to bring data over from the old BagelParts: there, click <b>Export data</b> and copy the code; here, <b>Save code → Import</b>. Drawings and DXFs aren't in codes, so re-upload those.</p></section>
      </div>`;
  }

  function init(helpers) {
    H = helpers;
    Parts.onChange(onData);
    document.addEventListener("dragstart", () => { isDragging = true; }, true);
    document.addEventListener("dragend", () => { isDragging = false; if (pending) setTimeout(redraw, 50); }, true);
    document.addEventListener("focusout", () => { if (pending) setTimeout(() => { if (pending) redraw(); }, 120); });
    document.addEventListener("keydown", (e) => {
      if (!mounted || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || (e.key !== "z" && e.key !== "Z")) return;
      const a = document.activeElement;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
      e.preventDefault();
      const u = undoStack.pop();
      if (!u) return H.toast("Nothing to undo");
      Promise.resolve(u.undo()).then(() => H.toast(`Undone: ${u.label}`)).catch(err);
    });
  }

  return { init, board, mine, guide };
})();
window.PartsUI = PartsUI;
