/* =============================================================================
   store.js  —  Offline-first data layer (localStorage)
   -----------------------------------------------------------------------------
   All scouting data lives in the browser. Nothing is sent anywhere except the
   read-only calls to The Blue Alliance / frc-colors in api.js. Every read/write
   is wrapped so a private window or cleared storage never crashes the app.
   ========================================================================== */

const Store = (() => {
  const NS = "bb702"; // key namespace
  const k = (name) => `${NS}.${name}`;

  function read(name, fallback) {
    try {
      const raw = localStorage.getItem(k(name));
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      console.warn("Store.read failed", name, e);
      return fallback;
    }
  }
  function write(name, value) {
    try {
      localStorage.setItem(k(name), JSON.stringify(value));
      return true;
    } catch (e) {
      // Quota exceeded. Scouting data (non-cache keys) must never be lost, so
      // evict the API caches to free space and retry. Caches simply re-fetch.
      if (!name.startsWith("cache.")) {
        try {
          Object.keys(localStorage).filter((x) => x.startsWith(NS + ".cache.")).forEach((x) => localStorage.removeItem(x));
          localStorage.setItem(k(name), JSON.stringify(value));
          return true;
        } catch (e2) { console.warn("Store.write failed after cache evict", name, e2); return false; }
      }
      // A cache write failed — not critical; drop it silently.
      return false;
    }
  }

  // ---- Settings -----------------------------------------------------------
  const defaultSettings = {
    tbaKey: "",
    scoutName: "",
    eventKey: "",
    eventName: "",
    theme: "dark",
    pitMapUrl: "",       // pasted link to a pit-map image
    pitMapEnabled: true, // show the pit map section on the Pit page
    pinnedEvents: [],    // event keys pinned to the top of the event picker
    matchListStat: "",   // extra summary column on the match list: "", "estPoints", or a field key
  };
  function getSettings() { return { ...defaultSettings, ...read("settings", {}) }; }
  function setSettings(patch) { write("settings", { ...getSettings(), ...patch }); }

  // ---- Match scouting -----------------------------------------------------
  // entries: [{ id, ts, event, scout, matchNumber, team, alliance, ...fields }]
  function getMatches() { return read("matches", []); }
  function saveMatch(entry) {
    const list = getMatches();
    if (entry.id) {
      const i = list.findIndex((m) => m.id === entry.id);
      if (i >= 0) list[i] = entry; else list.push(entry);
    } else {
      entry.id = uid();
      entry.ts = Date.now();
      list.push(entry);
    }
    return write("matches", list) ? entry : false;
  }
  function deleteMatch(id) {
    write("matches", getMatches().filter((m) => m.id !== id));
  }

  // ---- Pit scouting -------------------------------------------------------
  // pits: { [teamNumber]: { team, event, scout, ts, ...fields } }
  function getPits() { return read("pits", {}); }
  function savePit(team, data) {
    const pits = getPits();
    pits[team] = { ...(pits[team] || {}), ...data, team, ts: Date.now() };
    return write("pits", pits) ? pits[team] : false;
  }
  function deletePit(team) {
    const pits = getPits();
    delete pits[team];
    write("pits", pits);
  }

  // ---- Pick list ----------------------------------------------------------
  // picklist: { ranked: [teamNum, ...], dnp: [teamNum, ...], notes: {team: str} }
  function getPicklist() { return read("picklist", { ranked: [], dnp: [], notes: {} }); }
  function setPicklist(pl) { write("picklist", pl); }

  // ---- Tier list (S–F) ----------------------------------------------------
  // tierlist: { tiers: { S:[team,...], A:[], ... F:[] }, submitted, submittedAt }
  function getTierlist() { return read("tierlist", { tiers: {}, submitted: false, submittedAt: null }); }
  function setTierlist(tl) { write("tierlist", tl); }

  // ---- Bagel Bucks: admin event approval ----------------------------------
  // Only events the admin has approved (AND that are live) let scouts earn BB.
  function getBBApproved() { const a = read("bbApproved", []); return Array.isArray(a) ? a : []; }
  function isBBApproved(eventKey) { return !!eventKey && getBBApproved().includes(eventKey); }
  function approveBBEvent(eventKey, on) {
    if (!eventKey) return;
    const list = getBBApproved().filter((kk) => kk !== eventKey);
    if (on) list.push(eventKey);
    write("bbApproved", list);
  }

  // ---- Scouter profiles ("me") + Bagel Bucks ------------------------------
  // Each login NAME is its own account. Profiles are stored keyed by nameKey
  // in a single "meAccounts" object, so entering a different name on the login
  // screen gives that person a distinct id / Bagel Bucks / counts / photo.
  //   meAccounts: { [nameKey]: { id, first, last, profilePic, bb, matchCount,
  //       pitCount, lastMatchTeams:[], lastPitTeams:[], pitScoutedTeams:[], updatedAt } }
  function meAccountKey() {
    const s = getSession();
    return s ? nameKey(s.first, s.last) : "__guest__";
  }
  function getMeAccounts() { const a = read("meAccounts", null); return (a && typeof a === "object") ? a : {}; }
  // One-time migration: fold the old single "me" profile into its owner's account.
  function migrateLegacyMe(accounts) {
    const legacy = read("me", null);
    if (!legacy || typeof legacy !== "object") return false;
    if (!legacy.first && !legacy.last) { try { localStorage.removeItem(k("me")); } catch {} return false; }
    const key = nameKey(legacy.first, legacy.last);
    if (!accounts[key]) accounts[key] = legacy;
    try { localStorage.removeItem(k("me")); } catch {}
    return true;
  }
  function getMe() {
    const accounts = getMeAccounts();
    let migrated = migrateLegacyMe(accounts);
    const key = meAccountKey();
    let me = accounts[key];
    let dirty = migrated;
    if (!me || typeof me !== "object") { me = {}; dirty = true; }
    const defaults = { bb: 0, matchCount: 0, pitCount: 0, profilePic: "",
      lastMatchTeams: [], lastPitTeams: [], pitScoutedTeams: [] };
    me = { ...defaults, ...me };
    const sess = getSession();
    if (sess && (me.first !== sess.first || me.last !== sess.last)) {
      me.first = sess.first; me.last = sess.last; dirty = true;
    }
    // Deterministic id derived from the NAME, so the same person has ONE identity
    // (one cloud scouter doc) across every device — entering an already-registered
    // name no longer spawns a second account. Older accounts that still carry a
    // random id are migrated to the deterministic one here.
    if (me.first || me.last) {
      const wantId = scouterIdFor(me.first, me.last);
      if (me.id !== wantId) { me.id = wantId; dirty = true; }
    } else if (!me.id) {
      me.id = "sc_" + uid(); dirty = true;
    }
    if (dirty) { accounts[key] = me; write("meAccounts", accounts); }
    return me;
  }
  // Remove one local scouter account by its id (used by the admin scouter cleanup).
  function removeAccountById(id) {
    const accounts = getMeAccounts();
    let changed = false;
    Object.keys(accounts).forEach((k2) => {
      if (accounts[k2] && accounts[k2].id === id) { delete accounts[k2]; changed = true; }
    });
    if (changed) write("meAccounts", accounts);
    return changed;
  }
  function setMe(patch) {
    const accounts = getMeAccounts();
    const key = meAccountKey();
    const next = { ...getMe(), ...patch, updatedAt: Date.now() };
    accounts[key] = next;
    write("meAccounts", accounts);
    return next;
  }
  function recordMatchScouted(team, earnBB) {
    const me = getMe(); team = String(team);
    me.matchCount = (me.matchCount || 0) + 1;
    me.lastMatchTeams = [team, ...(me.lastMatchTeams || []).filter((t) => t !== team)].slice(0, 12);
    if (earnBB) me.bb = (me.bb || 0) + 10;
    return setMe(me);
  }
  function recordPitScouted(team, earnBB) {
    const me = getMe(); team = String(team);
    me.pitCount = (me.pitCount || 0) + 1;
    me.lastPitTeams = [team, ...(me.lastPitTeams || []).filter((t) => t !== team)].slice(0, 12);
    if (!(me.pitScoutedTeams || []).includes(team)) me.pitScoutedTeams = [...(me.pitScoutedTeams || []), team];
    if (earnBB) me.bb = (me.bb || 0) + 5;
    return setMe(me);
  }

  // ---- Strategy notes -----------------------------------------------------
  // strategy: { [matchNumber]: "text" }  (free-form per upcoming match)
  function getStrategy() { return read("strategy", {}); }
  function setStrategy(s) { write("strategy", s); }

  // ---- Auth: session + member roster + access requests --------------------
  function nameKey(first, last) {
    return (String(first || "").trim() + "|" + String(last || "").trim()).toLowerCase();
  }
  // Stable string hash → short base36 token. Same name always yields the same id.
  function hashKey(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function scouterIdFor(first, last) { return "sc_" + hashKey(nameKey(first, last)); }
  function getSession() { return read("session", null); }        // {first,last,ts} or null
  function setSession(user) { write("session", user); }
  function clearSession() { try { localStorage.removeItem(k("session")); } catch {} }

  // members: approved roster { key: {first,last,firstSeen,lastSeen} }
  function getMembers() { return read("members", {}); }
  // requests: pending access { key: {first,last,ts} }
  function getRequests() { return read("requests", {}); }

  // Called on every login. Returns "known" | "new" | "pending".
  function recordLogin(first, last) {
    const key = nameKey(first, last);
    const members = getMembers();
    if (members[key]) {
      members[key].lastSeen = Date.now();
      write("members", members);
      return "known";
    }
    const reqs = getRequests();
    if (reqs[key]) { reqs[key].ts = Date.now(); write("requests", reqs); return "pending"; }
    reqs[key] = { first: String(first).trim(), last: String(last).trim(), ts: Date.now() };
    write("requests", reqs);
    return "new";
  }
  function approveMember(key) {
    const reqs = getRequests(), members = getMembers();
    const r = reqs[key];
    members[key] = { first: r ? r.first : "", last: r ? r.last : "",
      firstSeen: r ? r.ts : Date.now(), lastSeen: Date.now() };
    delete reqs[key];
    write("members", members); write("requests", reqs);
  }
  function denyRequest(key) { const reqs = getRequests(); delete reqs[key]; write("requests", reqs); }
  // Merge a shared roster (from the cloud) into the local one. Approved members
  // win over pending requests, so a name approved on any device stops showing as
  // a request everywhere. Idempotent — safe to call on every cloud snapshot.
  function mergeRoster(members, requests) {
    if (members && typeof members === "object") {
      const merged = { ...getMembers(), ...members };
      write("members", merged);
    }
    const mem = getMembers();
    if (requests && typeof requests === "object") {
      const reqs = { ...getRequests() };
      Object.keys(requests).forEach((k2) => { if (!reqs[k2]) reqs[k2] = requests[k2]; });
      Object.keys(reqs).forEach((k2) => { if (mem[k2]) delete reqs[k2]; });
      write("requests", reqs);
    }
  }
  function removeMember(key) { const members = getMembers(); delete members[key]; write("members", members); }
  // Manually add an approved member (admin).
  function addMember(first, last) {
    const key = nameKey(first, last); const members = getMembers();
    members[key] = { first: String(first).trim(), last: String(last).trim(), firstSeen: Date.now(), lastSeen: Date.now() };
    write("members", members);
  }

  // ---- Custom pit-scouting form schema (admin-editable) -------------------
  // Returns a custom field array if the admin defined one, else null (use default).
  function getPitSchema() { const c = read("pitSchema", null); return Array.isArray(c) && c.length ? c : null; }
  function setPitSchema(arr) { write("pitSchema", arr); }
  function clearPitSchema() { try { localStorage.removeItem(k("pitSchema")); } catch {} }

  // ---- Custom match-scouting form schema (admin-editable) -----------------
  function getMatchSchema() { const c = read("matchSchema", null); return Array.isArray(c) && c.length ? c : null; }
  function setMatchSchema(arr) { write("matchSchema", arr); }
  function clearMatchSchema() { try { localStorage.removeItem(k("matchSchema")); } catch {} }

  // ---- TBA caches (so the app works offline after first load) -------------
  function getCache(name, fallback) { return read("cache." + name, fallback); }
  function setCache(name, value) { write("cache." + name, value); }

  // ---- Full backup export / import ---------------------------------------
  function exportAll() {
    return {
      meta: { app: "Bagel Bytes Scouting", exported: new Date().toISOString(), version: 1 },
      settings: (() => { const s = getSettings(); return { ...s, tbaKey: "" }; })(), // never export the key
      matches: getMatches(),
      pits: getPits(),
      picklist: getPicklist(),
      tierlist: getTierlist(),
      strategy: getStrategy(),
      members: getMembers(),
      requests: getRequests(),
      pitSchema: getPitSchema(),
      matchSchema: getMatchSchema(),
      meAccounts: (getMe(), getMeAccounts()),
      bbApproved: getBBApproved(),
    };
  }
  // mode: "merge" (default) keeps existing + adds; "replace" wipes then loads
  function importAll(obj, mode = "merge") {
    if (!obj || typeof obj !== "object") throw new Error("Invalid backup file.");
    if (mode === "replace") {
      write("matches", obj.matches || []);
      write("pits", obj.pits || {});
      write("picklist", obj.picklist || { ranked: [], dnp: [], notes: {} });
      if (obj.tierlist) write("tierlist", obj.tierlist);
      write("strategy", obj.strategy || {});
      write("members", obj.members || {});
      write("requests", obj.requests || {});
      if (Array.isArray(obj.bbApproved)) write("bbApproved", obj.bbApproved);
      if (obj.meAccounts && typeof obj.meAccounts === "object") write("meAccounts", obj.meAccounts);
    } else {
      // merge matches by id
      const byId = new Map(getMatches().map((m) => [m.id, m]));
      (obj.matches || []).forEach((m) => byId.set(m.id, m));
      write("matches", [...byId.values()]);
      // merge pits by team (incoming wins if newer)
      const pits = getPits();
      Object.entries(obj.pits || {}).forEach(([team, d]) => {
        if (!pits[team] || (d.ts || 0) >= (pits[team].ts || 0)) pits[team] = d;
      });
      write("pits", pits);
      // strategy merge
      write("strategy", { ...getStrategy(), ...(obj.strategy || {}) });
      // members / requests merge (roster aggregation across devices)
      write("members", { ...getMembers(), ...(obj.members || {}) });
      const mergedReqs = { ...getRequests(), ...(obj.requests || {}) };
      const mem = getMembers();
      Object.keys(mergedReqs).forEach((kk) => { if (mem[kk]) delete mergedReqs[kk]; });
      write("requests", mergedReqs);
      // custom forms: adopt an incoming one only if we don't have our own
      if (obj.pitSchema && !getPitSchema()) write("pitSchema", obj.pitSchema);
      if (obj.matchSchema && !getMatchSchema()) write("matchSchema", obj.matchSchema);
      // picklist: only import if we currently have none
      const cur = getPicklist();
      if (!cur.ranked.length && obj.picklist) write("picklist", obj.picklist);
      // tier list: adopt an incoming one only if we don't have our own
      const curTl = getTierlist();
      const hasTl = curTl && curTl.tiers && Object.values(curTl.tiers).some((a) => Array.isArray(a) && a.length);
      if (!hasTl && obj.tierlist) write("tierlist", obj.tierlist);
      // BB-approved events: union across devices
      if (Array.isArray(obj.bbApproved)) write("bbApproved", [...new Set([...getBBApproved(), ...obj.bbApproved])]);
      // scouter accounts: merge by name so the lead device aggregates everyone's
      // Bagel Bucks / counts for the leaderboard; the newer profile per name wins.
      const accts = getMeAccounts();
      Object.entries(obj.meAccounts || {}).forEach(([key, a]) => {
        if (a && (!accts[key] || (a.updatedAt || 0) >= (accts[key].updatedAt || 0))) accts[key] = a;
      });
      write("meAccounts", accts);
    }
    // never import someone else's TBA key; keep local settings
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function storageAvailable() {
    try { localStorage.setItem(k("__t"), "1"); localStorage.removeItem(k("__t")); return true; }
    catch { return false; }
  }

  return {
    getSettings, setSettings,
    getMatches, saveMatch, deleteMatch,
    getPits, savePit, deletePit,
    getPicklist, setPicklist,
    getTierlist, setTierlist,
    getBBApproved, isBBApproved, approveBBEvent,
    getMe, setMe, getMeAccounts, removeAccountById, scouterIdFor, recordMatchScouted, recordPitScouted,
    getStrategy, setStrategy,
    getSession, setSession, clearSession,
    getMembers, getRequests, recordLogin, approveMember, denyRequest, removeMember, addMember, nameKey, mergeRoster,
    getPitSchema, setPitSchema, clearPitSchema,
    getMatchSchema, setMatchSchema, clearMatchSchema,
    getCache, setCache,
    exportAll, importAll,
    uid, storageAvailable,
  };
})();

window.Store = Store;
