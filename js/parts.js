/* =============================================================================
   parts.js  —  BagelParts inside BagelTools: the manufacturing tracker's data.
   -----------------------------------------------------------------------------
   Ported from github.com/Suhaan27/bagel-parts (server.py). Same rules, same
   save codes (BP1:…), no separate server or login: the whole board lives in one
   Firestore doc (bparts/state) and every change is a transaction on it, just
   like the old server's lock around state.json. PDF drawings and DXF files are
   stored in chunks under bpfiles/ because one Firestore doc holds at most 1 MB.
   ========================================================================== */
const Parts = (() => {
  "use strict";
  const db = () => (window.Cloud && Cloud.enabled() && window.firebase) ? firebase.firestore() : null;
  const me = () => (window.Store && Store.getMe && Store.getMe()) || {};
  const myName = () => { const m = me(); return `${m.first || ""} ${m.last || ""}`.trim(); };
  const rid = (p) => p + Math.random().toString(16).slice(2, 10);
  const stateRef = (d) => d.collection("bparts").doc("state");

  const MAX_FILE_BYTES = 6 * 1024 * 1024;   // per PDF drawing / DXF, like the old server
  const CHUNK = 700000;                      // base64 chars per Firestore chunk doc
  const SIZE_WARN = 700000, SIZE_MAX = 980000;

  const STAGES = {
    "3dp":         ["Unfinished", "Designed", "Printing", "Done"],
    "fabworks":    ["Unfinished", "Designed", "Ordered", "Arrived"],
    "lasercut":    ["Unfinished", "Designed", "DXF Uploaded", "Done"],
    "inhouse":     ["Unfinished", "Designed", "Drawing made", "In progress", "Done"],
    "belt":        ["Ordered", "Arrived", "Sorted"],
    "gear":        ["Ordered", "Arrived", "Sorted"],
    "motor":       ["Ordered", "Arrived", "Sorted"],
    "pulley":      ["Unfinished", "Designed", "Printing", "Done"],
    "shaft":       ["Unfinished", "Designed", "In progress", "Done"],
    "spacer":      ["Unfinished", "Designed", "Printing", "Done"],
    "roller":      ["Ordered", "Arrived", "Sorted"],
    "collar":      ["Ordered", "Arrived", "Sorted"],
    "electronics": ["Ordered", "Arrived", "Sorted"],
  };
  const CUSTOM_STAGES = ["Ordered", "Arrived", "Sorted"];
  const TYPE_ORDER = ["3dp", "fabworks", "lasercut", "inhouse", "belt", "gear", "motor", "pulley", "shaft", "spacer", "roller", "collar", "electronics"];
  const TYPE_INFO = {
    "3dp": { label: "3D Print", color: "#7c5cff" }, "fabworks": { label: "Fabworks", color: "#ff8c42" },
    "lasercut": { label: "Laser Cut", color: "#ff5c8a" }, "inhouse": { label: "In-House", color: "#ffc718" },
    "belt": { label: "Belts", color: "#2fd0a2" }, "gear": { label: "Gears", color: "#58c4dd" },
    "motor": { label: "Motors", color: "#ff6b6b" }, "pulley": { label: "Pulleys", color: "#c792ea" },
    "shaft": { label: "Shafts", color: "#e8b04e" }, "spacer": { label: "Spacers", color: "#8fd3ff" },
    "roller": { label: "Rollers", color: "#ff9ecb" }, "collar": { label: "Shaft Collars", color: "#b7f36b" },
    "electronics": { label: "Electronics", color: "#ffd75e" },
  };
  const BUILTIN_LIST_NAMES = new Set(["3d print", "fabworks", "laser cut", "in-house", "belts", "gears", "motors",
    "pulleys", "shafts", "spacers", "rollers", "shaft collars", "electronics"]);

  /* ---- Naming rules (the "type-name" convention + auto-detected COTS) ------ */
  const NAME_RE = /^\s*(3dp|fabworks|lasercut|inhouse)\s*[-_: ]\s*(.+?)\s*$/i;
  const COMPOSITE_RE = /^\s*composite\s*[-_:]\s*(.+?)\s*$/i;
  const BELT_RE = /\bbelts?\b/i, GEAR_RE = /\bgears?\b/i;
  const MOTOR_RE = /\bmotors?\b|\bkraken\b|\bfalcon\b|\bneos?\b|\bcims?\b|\bvortex\b|\bminions?\b|\b775\s*pro\b/i;
  const PULLEY_RE = /\bpull?e?ys?\b/i, SPACER_RE = /\bspacers?\b/i;
  const ROLLER_RE = /\brollers?\b|\bsushi\b|\bcompliant\s*wheels?\b|\bstar\s*wheels?\b|\bflappers?\b/i;
  const COLLAR_RE = /\bcollars?\b/i, BEARING_RE = /\bbearings?\b/i;
  const ELECTRONICS_RE = /\b(roborio|rio|system\s*core|systemcore|pdh|pdp|pcm|vrm|batter(?:y|ies)|breakers?|radios?|pigeons?|can\s*range|canrange|can\s*coder|cancoder|canivore|candle|limelights?|cameras?|ethernet|switch(?:es)?|rsl|spark\s*max|sparkmax|talon\w*|compressors?|solenoids?|leds?)\b/i;
  const SHAFT_RE = /\bshafts?\b|\bchurros?\b|\bthunder\s*hex\b|\brounded\s+hex\b/i;
  const ORIGIN_RE = /^\s*origin[\s_-]*(cube)?\s*(<\d+>)?\s*$/i;
  const FASTENER_RE = /\b(bolts?|screws?|nuts?|locknuts?|nylocks?|washers?|rivets?|shcs|bhcs|fhcs|phcs|phms|hcs)\b/i;
  const PARTNUM_RE = /^#?[A-Za-z]{0,6}[-_]?\d[\w./×x-]*$/;

  // [type or null, display name]. Order matters: "Shaft Collar" is a collar,
  // "8mm Motor Spacer" a spacer, "Spur Gear (Hex Bore)" a gear.
  function classify(raw) {
    raw = String(raw || "");
    const m = raw.match(NAME_RE);
    if (m) return [m[1].toLowerCase(), m[2]];
    if (BEARING_RE.test(raw)) return [null, raw];
    for (const [t, rx] of [["belt", BELT_RE], ["gear", GEAR_RE], ["pulley", PULLEY_RE], ["roller", ROLLER_RE], ["collar", COLLAR_RE],
      ["spacer", SPACER_RE], ["electronics", ELECTRONICS_RE], ["shaft", SHAFT_RE], ["motor", MOTOR_RE]]) {
      if (rx.test(raw)) return [t, raw.trim()];
    }
    return [null, raw];
  }
  function compositeRefName(name) { const m = String(name || "").match(COMPOSITE_RE); return m ? m[1].trim() : null; }
  // Never tracked: origin cubes, fasteners, and bare part numbers (unless type-prefixed).
  function isIgnoredName(name) {
    if (compositeRefName(name)) return false;
    if (ORIGIN_RE.test(name)) return true;
    if (NAME_RE.test(name)) return false;
    if (FASTENER_RE.test(name)) return true;
    if (!name.includes(" ") && PARTNUM_RE.test(name)) return true;
    return false;
  }

  /* ---- Pasted BOM / CSV → [name, qty] -------------------------------------- */
  const HEADER_WORDS = new Set(["name", "part name", "part", "description", "item", "qty", "quantity", "part number", "material", "state", "revision"]);
  const NUMERIC_RE = /^[\d.\s/x×*-]+$/, INSTANCE_RE = /\s*<\d+>\s*$/, QTY_RE = /^\d{1,4}$/;
  const cleanCell = (c) => { c = c.trim(); if (c.length >= 2 && c[0] === '"' && c.endsWith('"')) c = c.slice(1, -1).replace(/""/g, '"'); return c.trim(); };
  const cellIsTyped = (c) => NAME_RE.test(c) || classify(c)[0] !== null || compositeRefName(c) !== null;
  function parseLines(text) {
    const found = new Map();
    for (let line of String(text || "").split(/\r?\n/)) {
      line = line.trim(); if (!line) continue;
      let cells = line.includes("\t") ? line.split("\t") : (line.split(",").length - 1 >= 2 ? line.split(",") : [line]);
      cells = cells.map(cleanCell).filter(Boolean);
      if (!cells.length) continue;
      const lowered = cells.map((c) => c.toLowerCase());
      if (cells.length > 1 && lowered.filter((c) => HEADER_WORDS.has(c)).length >= 2) continue; // a table's header row
      let qty = 1;
      if (cells.length >= 2 && QTY_RE.test(cells[cells.length - 1])) qty = Math.max(1, parseInt(cells[cells.length - 1], 10));
      let name = cells.find((c) => !NUMERIC_RE.test(c) && cellIsTyped(c)) || null;
      if (!name) {
        const cand = cells.filter((c) => !NUMERIC_RE.test(c) && !HEADER_WORDS.has(c.toLowerCase()) && !(!c.includes(" ") && PARTNUM_RE.test(c)));
        if (cand.length) name = cand.reduce((a, b) => (b.length > a.length ? b : a));
      }
      if (!name) continue;
      name = name.replace(INSTANCE_RE, "").trim();
      if (!name || isIgnoredName(name)) continue;
      const k = name.toLowerCase();
      if (found.has(k)) found.get(k)[1] += qty; else found.set(k, [name, qty]);
    }
    return [...found.values()];
  }

  /* ---- State ---------------------------------------------------------------- */
  // Firestore can't hold arrays of arrays, so composite parts are stored as
  // [{n, q}] here and converted back to [[name, qty]] in save codes.
  const compPairs = (c) => (c.parts || []).map((p) => Array.isArray(p) ? [String(p[0]), Number(p[1]) || 1] : [String(p.n), Number(p.q) || 1]);
  function normalize(raw) {
    const s = JSON.parse(JSON.stringify(raw || {}));
    s.projects = Array.isArray(s.projects) ? s.projects : [];
    s.mechanisms = Array.isArray(s.mechanisms) ? s.mechanisms : [];
    s.parts = s.parts && typeof s.parts === "object" ? s.parts : {};
    s.customTypes = Array.isArray(s.customTypes) ? s.customTypes : [];
    s.composites = (Array.isArray(s.composites) ? s.composites : []).map((c) => ({ id: c.id, name: c.name, parts: compPairs(c).map(([n, q]) => ({ n, q })) }));
    s.people = Array.isArray(s.people) ? s.people : [];
    s.projects.forEach((p) => { p.archived = !!p.archived; });
    const valid = new Set(Object.keys(s.parts));
    s.people.forEach((p) => { delete p.mechs; p.parts = (p.parts || []).filter((k) => valid.has(k)); });
    const orphans = s.mechanisms.filter((m) => !m.project);
    if (orphans.length) {
      let proj = s.projects[0];
      if (!proj) { proj = { id: rid("p_"), name: "Socal Showdown Redesign", archived: false }; s.projects.push(proj); }
      orphans.forEach((m) => { m.project = proj.id; });
    }
    s.rev = Number(s.rev) || 0;
    s.version = 3;
    return s;
  }
  const customIds = (s) => new Set(s.customTypes.map((t) => t.id));
  function stagesFor(type, s) { return STAGES[type] || (type && customIds(s).has(type) ? CUSTOM_STAGES : []); }
  function effectiveType(rec, s) {
    const ov = rec.typeOverride;
    if (ov && (STAGES[ov] || customIds(s).has(ov))) return ov;
    return classify(rec.rawName || rec.name || "")[0];
  }
  const mechOf = (s, id) => s.mechanisms.find((m) => m.id === id);
  const need = (cond, msg) => { if (!cond) throw new Error(msg); };

  let cache = null, ready = false, cbs = [], unsub = null, lastBy = "", listenErr = null;
  const fire = () => cbs.forEach((cb) => { try { cb(); } catch (e) { console.warn("[Parts]", e); } });
  // Start listening (the first Parts page visit). The doc may not exist yet.
  function watch() {
    const d = db(); if (!d || unsub) return;
    unsub = stateRef(d).onSnapshot((snap) => {
      const data = snap.exists ? snap.data() : {};
      lastBy = data.by || "";
      cache = normalize(data); ready = true; listenErr = null; fire();
    }, (e) => { console.warn("[Parts] listen failed", e); listenErr = e; ready = true; if (!cache) cache = normalize({}); fire(); });
  }
  function state() { return cache || normalize({}); }

  // Every change: read the latest board, apply `fn`, write it back — all in one
  // transaction so two people editing at once never overwrite each other.
  async function mutate(fn) {
    const d = db(); if (!d) throw new Error("Parts needs the cloud connection (you look offline).");
    const before = state();
    let next = null, out;
    await d.runTransaction(async (tx) => {
      const snap = await tx.get(stateRef(d));
      const s = normalize(snap.exists ? snap.data() : {});
      out = fn(s);
      s.rev = (Number(s.rev) || 0) + 1; s.updatedAt = Date.now(); s.by = me().id || ""; s.byName = myName();
      const json = JSON.stringify(s);
      if (json.length > SIZE_MAX) throw new Error("The parts board is full. Delete old projects or parts to make room.");
      next = JSON.parse(json);
      tx.set(stateRef(d), next);
    });
    lastBy = me().id || "";
    cache = normalize(next); ready = true; fire();
    dropOrphanFiles(before, cache);
    return out;
  }
  const sizeOf = () => JSON.stringify(state()).length;

  /* ---- What the pages draw ---------------------------------------------------- */
  function view() {
    const s = state();
    const byMech = {};
    for (const [key, rec] of Object.entries(s.parts)) (byMech[rec.mech] = byMech[rec.mech] || []).push([key, rec]);
    const mechanisms = s.mechanisms.map((m) => {
      const parts = [];
      for (const [key, rec] of byMech[m.id] || []) {
        const raw = rec.rawName || rec.name || "";
        if (isIgnoredName(raw)) continue;
        const disp = classify(raw)[1], type = effectiveType(rec, s), stages = stagesFor(type, s);
        const stage = Math.min(rec.stage || 0, Math.max(stages.length - 1, 0));
        parts.push({ key, name: disp, rawName: raw, qty: parseInt(rec.qty, 10) || 1, type, stage, stages,
          done: !!stages.length && stage === stages.length - 1, resolved: !!rec.resolved, archived: !!rec.archived,
          overridden: !!rec.typeOverride, mechanism: m.name, mechId: m.id, project: m.project, onshapeUrl: m.link || null,
          drawing: rec.drawing ? rec.drawing.name : null, dxf: rec.dxf ? rec.dxf.name : null, seq: rec.seq || 0 });
      }
      return { id: m.id, name: m.name, project: m.project, link: m.link || "", parts };
    });
    return { projects: s.projects, mechanisms, customTypes: s.customTypes, composites: s.composites.map((c) => ({ id: c.id, name: c.name, parts: compPairs(c) })),
      people: s.people, rev: s.rev, by: lastBy };
  }
  function typeInfo(t, customTypes) {
    if (TYPE_INFO[t]) return TYPE_INFO[t];
    const c = (customTypes || state().customTypes).find((x) => x.id === t);
    return c ? { label: c.name, color: "#9fb0d4", custom: true } : { label: "Unsorted", color: "#9fb0d4" };
  }

  /* ---- Projects ------------------------------------------------------------- */
  const addProject = (name) => mutate((s) => {
    name = String(name || "").trim(); need(name, "Give the project a name.");
    need(!s.projects.some((p) => p.name.toLowerCase() === name.toLowerCase()), `A project called “${name}” already exists.`);
    const id = rid("p_"); s.projects.push({ id, name, archived: false }); return id;
  });
  const removeProject = (id) => mutate((s) => {
    const mids = new Set(s.mechanisms.filter((m) => m.project === id).map((m) => m.id));
    s.projects = s.projects.filter((p) => p.id !== id);
    s.mechanisms = s.mechanisms.filter((m) => m.project !== id);
    for (const k of Object.keys(s.parts)) if (mids.has(s.parts[k].mech)) delete s.parts[k];
    s.people = s.people.filter((p) => p.project !== id);
  });
  const renameProject = (id, name) => mutate((s) => {
    name = String(name || "").trim(); need(name, "Give the project a name.");
    const p = s.projects.find((x) => x.id === id); need(p, "Unknown project. Refresh the page.");
    need(!s.projects.some((o) => o.id !== id && o.name.toLowerCase() === name.toLowerCase()), `A project called “${name}” already exists.`);
    p.name = name;
  });
  // A small square image (data URL) shown next to the project name. "" clears it.
  const setProjectIcon = (id, icon) => mutate((s) => {
    const p = s.projects.find((x) => x.id === id); need(p, "Unknown project. Refresh the page.");
    if (icon) p.icon = String(icon); else delete p.icon;
  });
  // Archiving can also drop the project's drawings / DXFs to free space.
  const setProjectArchived = (id, archived, dropDrawings, dropDxfs) => mutate((s) => {
    const p = s.projects.find((x) => x.id === id); need(p, "Unknown project. Refresh the page.");
    p.archived = !!archived;
    if (archived && (dropDrawings || dropDxfs)) {
      const mids = new Set(s.mechanisms.filter((m) => m.project === id).map((m) => m.id));
      for (const rec of Object.values(s.parts)) if (mids.has(rec.mech)) { if (dropDrawings) delete rec.drawing; if (dropDxfs) delete rec.dxf; }
    }
  });

  /* ---- Mechanisms ----------------------------------------------------------- */
  const addMechanism = (name, link, project) => mutate((s) => {
    name = String(name || "").trim(); need(name, "Give the mechanism a name (e.g. Drivetrain).");
    need(s.projects.some((p) => p.id === project), "Pick a project first.");
    need(!s.mechanisms.some((m) => m.project === project && m.name.toLowerCase() === name.toLowerCase()), `“${name}” already exists in this project.`);
    const id = rid("m_"); s.mechanisms.push({ id, name, link: String(link || "").trim(), project }); return id;
  });
  const removeMechanism = (id) => mutate((s) => {
    s.mechanisms = s.mechanisms.filter((m) => m.id !== id);
    for (const k of Object.keys(s.parts)) if (s.parts[k].mech === id) delete s.parts[k];
  });
  const updateMechanism = (id, name, link) => mutate((s) => {
    name = String(name || "").trim(); need(name, "Give the mechanism a name.");
    const m = mechOf(s, id); need(m, "Unknown mechanism. Refresh the page.");
    need(!s.mechanisms.some((o) => o.id !== id && o.project === m.project && o.name.toLowerCase() === name.toLowerCase()), `“${name}” already exists in this project.`);
    m.name = name; if (link != null) m.link = String(link).trim();
  });

  /* ---- People (per project; optionally linked to a BagelTools account) ------ */
  const addPerson = (project, name, uid) => mutate((s) => {
    name = String(name || "").trim(); need(name, "Give the person a name.");
    need(s.projects.some((p) => p.id === project), "Pick a project first.");
    need(!s.people.some((p) => p.project === project && p.name.toLowerCase() === name.toLowerCase()), `“${name}” is already on this project.`);
    const id = rid("u_"); s.people.push({ id, project, name, parts: [], ...(uid ? { uid } : {}) }); return id;
  });
  const removePerson = (id) => mutate((s) => { s.people = s.people.filter((p) => p.id !== id); });
  const updatePerson = (id, name, uid) => mutate((s) => {
    name = String(name || "").trim(); need(name, "Give the person a name.");
    const p = s.people.find((x) => x.id === id); need(p, "Unknown person. Refresh the page.");
    need(!s.people.some((o) => o.id !== id && o.project === p.project && o.name.toLowerCase() === name.toLowerCase()), `“${name}” is already on this project.`);
    p.name = name; if (uid) p.uid = uid; else delete p.uid;
  });
  // A part can belong to several people; this only touches the one named.
  const assign = (personId, keys, assigned) => mutate((s) => {
    const p = s.people.find((x) => x.id === personId); need(p, "Unknown person. Refresh the page.");
    p.parts = p.parts || [];
    if (assigned) {
      for (const k of keys) {
        const rec = s.parts[k]; if (!rec) continue;
        const m = mechOf(s, rec.mech); if (!m || m.project !== p.project) continue;
        if (!p.parts.includes(k)) p.parts.push(k);
      }
      p.assignedBy = me().id || ""; p.assignedAt = Date.now();
    } else { const drop = new Set(keys); p.parts = p.parts.filter((k) => !drop.has(k)); }
  });

  /* ---- Composites (one BOM line that's really several parts) ---------------- */
  const findComposite = (name, s) => { const n = String(name || "").trim().toLowerCase(); return s.composites.find((c) => c.name.trim().toLowerCase() === n) || null; };
  function expandEntries(entries, s, undefinedOut) {
    const result = new Map();
    const add = (name, qty) => { const k = name.toLowerCase(); if (result.has(k)) result.get(k)[1] += qty; else result.set(k, [name, qty]); };
    const rec = (name, qty, depth) => {
      const ref = compositeRefName(name), comp = findComposite(ref !== null ? ref : name, s);
      if (comp && depth < 8) { compPairs(comp).forEach(([cn, cq]) => rec(cn, cq * qty, depth + 1)); return; }
      if (ref !== null) { if (undefinedOut) undefinedOut.set(ref.toLowerCase(), ref); return; }
      add(name, qty);
    };
    entries.forEach(([n, q]) => rec(n, q, 0));
    return [...result.values()];
  }
  const addComposite = (name, text) => {
    name = String(name || "").trim();
    if (!name) return Promise.reject(new Error("Name the composite exactly as it appears in the assembly BOM."));
    const parts = parseLines(text);
    if (!parts.length) return Promise.reject(new Error("Couldn't read any parts from that. Paste the composite's Part Studio parts, one per line."));
    return mutate((s) => {
      const payload = parts.map(([n, q]) => ({ n, q })), ex = findComposite(name, s);
      if (ex) { ex.name = name; ex.parts = payload; } else s.composites.push({ id: rid("k_"), name, parts: payload });
    });
  };
  const removeComposite = (id) => mutate((s) => { s.composites = s.composites.filter((c) => c.id !== id); });

  /* ---- Import a mechanism's parts (a diff, never a wipe) ------------------------ */
  function planImport(s, mechId, text) {
    const raw = parseLines(text);
    need(raw.length, "Couldn't find any part names in that. Paste one part name per line, or a copied BOM table.");
    const undef = new Map(), entries = expandEntries(raw, s, undef);
    const composites = [];
    raw.forEach(([name, qty]) => {
      const ref = compositeRefName(name), lookup = ref !== null ? ref : name;
      if (findComposite(lookup, s)) composites.push({ name: lookup, qty, parts: expandEntries([[name, qty]], s).length });
    });
    need(entries.length || undef.size, "Nothing to import after expanding composites.");
    need(mechOf(s, mechId), "Unknown mechanism. Refresh the page and try again.");
    const names = entries.map(([n]) => n), qtyOf = new Map(entries.map(([n, q]) => [n.toLowerCase(), q]));
    const isDone = (rec) => { const st = stagesFor(effectiveType(rec, s), s); return !!st.length && (rec.stage || 0) >= st.length - 1; };
    const current = Object.entries(s.parts).filter(([, r]) => r.mech === mechId);
    const pasted = new Set(names.map((n) => `${mechId}|${n.toLowerCase()}`));
    const toAdd = names.filter((n) => !s.parts[`${mechId}|${n.toLowerCase()}`]);
    const missing = current.filter(([k, r]) => !pasted.has(k) && !isDone(r) && !r.archived);
    return { raw, names, qtyOf, toAdd, missing, composites, undefinedComposites: [...undef.values()] };
  }
  function previewImport(mechId, text) {
    const p = planImport(state(), mechId, text);
    return { parsed: p.raw.length, toAdd: p.toAdd.map((n) => ({ raw: n, name: classify(n)[1], type: classify(n)[0], qty: p.qtyOf.get(n.toLowerCase()) })),
      existing: p.names.length - p.toAdd.length, missing: p.missing.map(([, r]) => r.rawName), composites: p.composites, undefinedComposites: p.undefinedComposites };
  }
  const applyImport = (mechId, text, removeMissing) => mutate((s) => {
    const p = planImport(s, mechId, text);
    let seq = Math.max(0, ...Object.values(s.parts).map((r) => r.seq || 0));
    p.toAdd.forEach((n) => {
      const [type, disp] = classify(n);
      s.parts[`${mechId}|${n.toLowerCase()}`] = { mech: mechId, name: disp, rawName: n, type, qty: p.qtyOf.get(n.toLowerCase()), stage: 0, resolved: false, firstSeen: new Date().toISOString(), seq: ++seq };
    });
    p.names.forEach((n) => { const k = `${mechId}|${n.toLowerCase()}`; if (s.parts[k]) s.parts[k].qty = p.qtyOf.get(n.toLowerCase()); }); // quantities come from CAD
    let removed = 0;
    if (removeMissing) p.missing.forEach(([k]) => { delete s.parts[k]; removed++; });
    return { added: p.toAdd.length, removed, existing: p.names.length - p.toAdd.length };
  });

  /* ---- Part changes ------------------------------------------------------------ */
  const partOr = (s, key) => { const r = s.parts[key]; need(r, "Unknown part. Refresh the page."); return r; };
  const setStage = (key, stage) => mutate((s) => {
    const r = partOr(s, key), st = stagesFor(effectiveType(r, s), s);
    r.stage = Math.max(0, Math.min(parseInt(stage, 10) || 0, Math.max(st.length - 1, 0)));
    r.stageBy = me().id || ""; r.stageAt = Date.now(); return r.stage;
  });
  const setResolved = (key, v) => mutate((s) => { partOr(s, key).resolved = !!v; });
  const setArchived = (key, v) => mutate((s) => { partOr(s, key).archived = !!v; });
  const removePart = (key) => mutate((s) => { partOr(s, key); delete s.parts[key]; });
  // Re-sort a part onto a list (null = back to auto-detect).
  const setPartType = (key, type) => mutate((s) => {
    const r = partOr(s, key);
    if (!type) delete r.typeOverride;
    else { need(STAGES[type] || customIds(s).has(type), "Unknown list. Refresh the page."); r.typeOverride = type; r.resolved = false; }
    const st = stagesFor(effectiveType(r, s), s);
    r.stage = Math.max(0, Math.min(r.stage || 0, Math.max(st.length - 1, 0)));
  });
  const addCustomType = (name) => mutate((s) => {
    name = String(name || "").trim(); need(name, "Give the list a name.");
    need(!BUILTIN_LIST_NAMES.has(name.toLowerCase()) && !s.customTypes.some((t) => t.name.toLowerCase() === name.toLowerCase()), `A list called “${name}” already exists.`);
    const id = rid("c_"); s.customTypes.push({ id, name }); return id;
  });
  const removeCustomType = (id) => mutate((s) => {
    const used = Object.values(s.parts).filter((r) => r.typeOverride === id).length;
    need(!used, `That list still holds ${used} part${used === 1 ? "" : "s"}. Drag them somewhere else first.`);
    s.customTypes = s.customTypes.filter((t) => t.id !== id);
  });

  /* ---- Files: PDF drawings (in-house) and DXFs (laser cut) --------------------- */
  // A file = bpfiles/{id} {kind, key, name, size, n} + chunk docs bpfiles/{id}_{i} {of, i, d}
  // (all top-level docs, so they fall under the same rules as everything else).
  const fileIds = (s) => { const out = new Set(); Object.values(s.parts).forEach((r) => { if (r.drawing && r.drawing.id) out.add(r.drawing.id); if (r.dxf && r.dxf.id) out.add(r.dxf.id); }); return out; };
  async function deleteFile(id) {
    const d = db(); if (!d || !id) return;
    try {
      const col = d.collection("bpfiles"), meta = await col.doc(id).get();
      const n = meta.exists ? (meta.data().n || 0) : 0;
      for (let i = 0; i < n; i++) await col.doc(`${id}_${i}`).delete();
      await col.doc(id).delete();
    } catch (e) { console.warn("[Parts] file cleanup failed", id, e); }
  }
  function dropOrphanFiles(before, after) {
    const keep = fileIds(after);
    fileIds(before).forEach((id) => { if (!keep.has(id)) deleteFile(id); });
  }
  const readB64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error("Couldn't read that file."));
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.readAsDataURL(file);
  });
  // kind: "drawing" (PDF, in-house parts → "Drawing made") or "dxf" (laser cut → "DXF Uploaded").
  async function uploadFile(kind, key, file) {
    const d = db(); if (!d) throw new Error("Uploading needs the cloud connection.");
    const isPdf = kind === "drawing";
    let name = String(file.name || "").trim() || (isPdf ? "drawing.pdf" : "part.dxf");
    if (isPdf && !/\.pdf$/i.test(name)) name += ".pdf";
    if (!isPdf && !/\.dxf$/i.test(name)) throw new Error("Please choose a DXF file.");
    if (file.size > MAX_FILE_BYTES) throw new Error(`That file is too large (max ${MAX_FILE_BYTES / 1048576} MB).`);
    const b64 = await readB64(file);
    if (!b64) throw new Error("That file is empty.");
    if (isPdf && atob(b64.slice(0, 8)).slice(0, 5) !== "%PDF-") throw new Error("Only PDF drawings are supported.");
    const s0 = state(), rec0 = s0.parts[key];
    need(rec0, "Unknown part. Refresh the page.");
    need(effectiveType(rec0, s0) === (isPdf ? "inhouse" : "lasercut"), isPdf ? "Drawings can only go on in-house parts." : "DXF files can only go on laser-cut parts.");
    const id = rid("f_"), col = d.collection("bpfiles"), n = Math.ceil(b64.length / CHUNK);
    for (let i = 0; i < n; i++) await col.doc(`${id}_${i}`).set({ of: id, i, d: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
    await col.doc(id).set({ kind, key, name, size: file.size, n, ts: Date.now(), by: me().id || "" });
    try {
      await mutate((s) => {
        const r = partOr(s, key);
        r[kind] = { id, name, size: file.size };
        const st = stagesFor(effectiveType(r, s), s).map((x) => x.toLowerCase()), want = isPdf ? "drawing made" : "dxf uploaded";
        const idx = st.indexOf(want);
        if (idx >= 0 && (r.stage || 0) < idx) r.stage = idx; // never moves a part backwards
      });
    } catch (e) { deleteFile(id); throw e; }
  }
  const removeFile = (kind, key) => mutate((s) => { const r = partOr(s, key); need(r[kind], kind === "drawing" ? "No drawing to remove." : "No DXF to remove."); delete r[kind]; });
  // Fetch a file back as a Blob.
  async function fetchFile(kind, key) {
    const d = db(); if (!d) throw new Error("Opening files needs the cloud connection.");
    const r = state().parts[key], f = r && r[kind];
    need(f && f.id, "That file isn't there anymore.");
    const col = d.collection("bpfiles"), meta = await col.doc(f.id).get();
    need(meta.exists, "That file isn't there anymore.");
    const n = meta.data().n || 0;
    const chunks = await Promise.all(Array.from({ length: n }, (_, i) => col.doc(`${f.id}_${i}`).get()));
    need(chunks.every((c) => c.exists), "Part of that file is missing. Upload it again.");
    const b64 = chunks.map((c) => c.data().d).join("");
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { name: f.name, blob: new Blob([bytes], { type: kind === "drawing" ? "application/pdf" : "application/dxf" }) };
  }

  /* ---- Save codes (BP1:…, the same format the old BagelParts used) -------------- */
  const toB64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  async function zlib(bytes, decompress) {
    const stream = new Blob([bytes]).stream().pipeThrough(decompress ? new DecompressionStream("deflate") : new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function exportCode(projectId) {
    const s = state();
    const projects = projectId ? s.projects.filter((p) => p.id === projectId) : s.projects.slice();
    need(projects.length, projectId ? "Unknown project." : "There's nothing to export yet.");
    const pids = new Set(projects.map((p) => p.id));
    const mechanisms = s.mechanisms.filter((m) => pids.has(m.project)), mids = new Set(mechanisms.map((m) => m.id));
    const parts = {};
    for (const [k, r] of Object.entries(s.parts)) if (mids.has(r.mech)) { const c = { ...r }; delete c.drawing; delete c.dxf; parts[k] = c; }
    const people = s.people.filter((p) => pids.has(p.project)).map((p) => ({ id: p.id, project: p.project, name: p.name, parts: p.parts || [], ...(p.uid ? { uid: p.uid } : {}) }));
    const bundle = { v: 1, scope: projectId ? "project" : "all", projects, mechanisms, parts, people, customTypes: s.customTypes,
      composites: s.composites.map((c) => ({ id: c.id, name: c.name, parts: compPairs(c) })) };
    return "BP1:" + toB64(await zlib(new TextEncoder().encode(JSON.stringify(bundle)), false));
  }
  // Adds the code's projects as NEW projects — nothing you already have is overwritten.
  async function importCode(code) {
    code = String(code || "").replace(/\s+/g, "");
    if (code.startsWith("BP1:")) code = code.slice(4);
    let bundle;
    try {
      const bin = atob(code), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      bundle = JSON.parse(new TextDecoder().decode(await zlib(bytes, true)));
    } catch (e) { throw new Error("That doesn't look like a BagelParts save code."); }
    need(bundle && typeof bundle === "object" && Array.isArray(bundle.projects), "That save code doesn't contain any project data.");
    return mutate((s) => {
      const ctMap = {}, ctByName = new Map(s.customTypes.map((t) => [t.name.toLowerCase(), t.id]));
      (bundle.customTypes || []).forEach((t) => {
        const nm = String(t.name || "").trim(); if (!nm) return;
        if (ctByName.has(nm.toLowerCase())) ctMap[t.id] = ctByName.get(nm.toLowerCase());
        else { const id = rid("c_"); s.customTypes.push({ id, name: nm }); ctByName.set(nm.toLowerCase(), id); ctMap[t.id] = id; }
      });
      const compNames = new Set(s.composites.map((c) => c.name.toLowerCase()));
      (bundle.composites || []).forEach((c) => {
        const nm = String(c.name || "").trim();
        if (nm && !compNames.has(nm.toLowerCase())) { s.composites.push({ id: rid("k_"), name: nm, parts: compPairs(c).map(([n, q]) => ({ n, q })) }); compNames.add(nm.toLowerCase()); }
      });
      const existing = new Set(s.projects.map((p) => p.name.toLowerCase())), projMap = {}, newIds = [];
      bundle.projects.forEach((p) => {
        const base = String(p.name || "Imported project").trim() || "Imported project";
        let name = base, i = 2; while (existing.has(name.toLowerCase())) name = `${base} (${i++})`;
        existing.add(name.toLowerCase());
        const id = rid("p_"); s.projects.push({ id, name, archived: !!p.archived }); projMap[p.id] = id; newIds.push(id);
      });
      const mechMap = {};
      (bundle.mechanisms || []).forEach((m) => {
        const np = projMap[m.project]; if (!np) return;
        const id = rid("m_"); mechMap[m.id] = id; s.mechanisms.push({ id, name: m.name || "Mechanism", link: m.link || "", project: np });
      });
      const partMap = {};
      let seq = Math.max(0, ...Object.values(s.parts).map((r) => r.seq || 0));
      Object.entries(bundle.parts || {}).forEach(([oldKey, rec]) => {
        const nm = mechMap[rec.mech]; if (!nm) return;
        const rawName = rec.rawName || rec.name || "", key = `${nm}|${rawName.toLowerCase()}`;
        const r = { ...rec, mech: nm }; delete r.drawing; delete r.dxf;
        if (ctMap[r.typeOverride]) r.typeOverride = ctMap[r.typeOverride];
        if (!r.seq) r.seq = ++seq;
        s.parts[key] = r; partMap[oldKey] = key;
      });
      (bundle.people || []).forEach((pe) => {
        const np = projMap[pe.project]; if (!np) return;
        s.people.push({ id: rid("u_"), project: np, name: pe.name || "?", parts: (pe.parts || []).map((k) => partMap[k]).filter(Boolean), ...(pe.uid ? { uid: pe.uid } : {}) });
      });
      return newIds;
    });
  }

  // A part whose prep is done but the part itself isn't: in-house with a drawing,
  // laser cut with a DXF, or a 3D print / pulley / spacer / shaft at "Designed".
  function readyToMake(p) {
    if (p.archived || p.done) return false;
    if (p.type === "inhouse") return !!p.drawing;
    if (p.type === "lasercut") return !!p.dxf;
    if (["3dp", "pulley", "spacer", "shaft"].includes(p.type)) return p.stages[p.stage] === "Designed";
    return false;
  }

  return {
    STAGES, TYPE_ORDER, TYPE_INFO, SIZE_WARN, SIZE_MAX, MAX_FILE_BYTES,
    watch, isReady: () => ready, onChange: (cb) => { cbs.push(cb); return () => { cbs = cbs.filter((x) => x !== cb); }; },
    listenError: () => listenErr, view, state, sizeOf, typeInfo, classify, parseLines, readyToMake,
    addProject, removeProject, renameProject, setProjectArchived, setProjectIcon,
    addMechanism, removeMechanism, updateMechanism,
    addPerson, removePerson, updatePerson, assign,
    addComposite, removeComposite, previewImport, applyImport,
    setStage, setResolved, setArchived, removePart, setPartType, addCustomType, removeCustomType,
    uploadFile, removeFile, fetchFile, exportCode, importCode,
  };
})();
window.Parts = Parts;
