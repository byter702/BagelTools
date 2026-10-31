/* ===========================================================================
   cloud.js — optional Firebase Firestore sync for cross-scout sharing.

   Fully degrades to a no-op when window.CONFIG.firebaseConfig is empty, so the
   app stays 100% offline-first. When configured it shares, in realtime:
     • scouters  — profile, Bagel Bucks, counts, presence (online status)
     • matches   — every match record (keyed by its local id, no collisions)
     • pits      — pit-scouting records (keyed by team number)
     • boards    — submitted alliance-selection boards (keyed by scouter)
     • tierlists — submitted tier lists (keyed by scouter)

   Profile pictures ride along as compressed dataURLs inside the scouter doc,
   so no Firebase Storage (and no paid plan) is needed.

   Load order matters: this file must come AFTER config.js + store.js and the
   Firebase CDN scripts, and BEFORE app.js (app.js captures window.Cloud once).
   ======================================================================== */
(function () {
  "use strict";

  var CFG = (window.CONFIG && window.CONFIG.firebaseConfig) || {};
  // Seasons are stored separately: 2026 uses the original collection/doc names,
  // other years get a "_<year>" suffix (matches_2027, config/matchForm_2027, …).
  // scouters (accounts + Bagel Bucks), creds and config/roster are shared by all years.
  var SEASON = (window.GAME && window.GAME.season) || 2026;
  function col(name) { return SEASON === 2026 ? name : name + "_" + SEASON; }
  function cfgId(name) { return SEASON === 2026 ? name : name + "_" + SEASON; }
  var configured = !!(CFG && CFG.apiKey && CFG.projectId &&
    typeof firebase !== "undefined" && firebase.initializeApp);

  var db = null;
  var ready = false;
  var changeCbs = [];
  var activityCbs = [];
  var activitySeeded = false;
  var cache = { scouters: [], boards: [], tierlists: [], matches: [], pits: [],
    claims: [], activity: [], config: { matchForm: null, pitForm: null, roster: null } };
  var lastPush = { matches: 0, pits: 0 };
  var cfgBootstrapped = false;
  var cfgLoaded = false, cfgWaiters = [];
  var formStamp = {}, formCbs = []; // last-seen updatedAt of the shared forms
  var primeStamp, primeCbs = [];      // Prime 702 fun mode (config/prime702, all seasons)

  // The first snapshot of every core collection = "initial sync done": pages
  // drawn before the cloud data arrived get one redraw (see onFirstSync).
  var firstNeed = ["scouters", "boards", "tierlists", "matches", "pits", "config"], firstSeen = {}, firstDone = false, firstCbs = [];
  function seen(name) {
    if (firstDone) return;
    firstSeen[name] = true;
    if (firstNeed.every(function (n) { return firstSeen[n]; })) {
      firstDone = true;
      setTimeout(function () { firstCbs.forEach(function (cb) { try { cb(); } catch (e) {} }); }, 0);
    }
  }
  function fire() { changeCbs.forEach(function (cb) { try { cb(); } catch (e) {} }); }
  function fireActivity(d) { activityCbs.forEach(function (cb) { try { cb(d); } catch (e) {} }); }
  function me() { return (window.Store && Store.getMe && Store.getMe()) || null; }
  function eventKey() {
    return (window.Store && Store.getSettings && Store.getSettings().eventKey) || "";
  }
  function log(msg, e) {
    try { console.warn("[Cloud] " + msg, e || ""); } catch (x) {}
    // The Firestore rules refusing us (e.g. test-mode rules that expired) means nothing
    // reads or saves: say so loudly instead of quietly showing old cached data.
    if (e && (e.code === "permission-denied" || /insufficient permissions/i.test(e.message || ""))) markBlocked();
  }
  // Approvals made on this device that never reached the server (offline, or the rules
  // refusing writes) go up once it answers again. Only members approved after the
  // server's last roster save, so someone removed long ago can't come back this way.
  var healed = false;
  function healRoster(r) {
    if (healed || !db || !window.Store || !Store.getMembers) return;
    healed = true;
    var cloudM = r.members || {}, removed = r.removed || {}, since = r.updatedAt || 0;
    if (!since) return;
    var local = Store.getMembers(), FP = firebase.firestore.FieldPath, args = [];
    Object.keys(local).forEach(function (k) {
      var m = local[k] || {};
      if (cloudM[k] || removed[k]) return;
      if (Math.max(m.approvedAt || 0, m.lastSeen || 0, m.firstSeen || 0) <= since) return;
      args.push(new FP("members", k), clean(m), new FP("requests", k), firebase.firestore.FieldValue.delete());
    });
    if (!args.length) return;
    var ref = db.collection("config").doc("roster");
    ref.update.apply(ref, args.concat(["updatedAt", Date.now()]))
      .then(function () { log("re-sent " + args.length / 4 + " approval(s) that never reached the server"); })
      .catch(function (e) { log("roster heal failed", e); });
  }
  var blocked = false, blockedCbs = [];
  function markBlocked() {
    if (blocked) return;
    blocked = true;
    blockedCbs.forEach(function (cb) { try { cb(); } catch (x) {} });
  }

  function listen() {
    if (!db) return;
    db.collection("scouters").onSnapshot(function (snap) {
      cache.scouters = snap.docs.map(function (d) { return d.data(); });
      seen("scouters");
      fire();
    }, function (e) { log("scouters listen failed", e); });

    db.collection(col("boards")).onSnapshot(function (snap) {
      cache.boards = snap.docs.map(function (d) { return d.data(); });
      seen("boards");
      fire();
    }, function (e) { log("boards listen failed", e); });

    db.collection(col("tierlists")).onSnapshot(function (snap) {
      cache.tierlists = snap.docs.map(function (d) { return d.data(); });
      seen("tierlists");
      fire();
    }, function (e) { log("tierlists listen failed", e); });

    db.collection(col("matches")).onSnapshot(function (snap) {
      cache.matches = snap.docs.map(function (d) { return d.data(); });
      seen("matches");
      fire();
    }, function (e) { log("matches listen failed", e); });

    db.collection(col("pits")).onSnapshot(function (snap) {
      cache.pits = snap.docs.map(function (d) { return d.data(); });
      seen("pits");
      fire();
    }, function (e) { log("pits listen failed", e); });

    // Match claims: which team in which match is already being scouted (live lock).
    db.collection(col("claims")).onSnapshot(function (snap) {
      cache.claims = snap.docs.map(function (d) { return d.data(); });
      fire();
    }, function (e) { log("claims listen failed", e); });

    // Activity feed: drives the global "someone just scouted" popup. The first
    // snapshot is a seed (don't pop up on page load); later additions notify.
    db.collection(col("activity")).orderBy("ts", "desc").limit(20).onSnapshot(function (snap) {
      cache.activity = snap.docs.map(function (d) { return d.data(); });
      if (!activitySeeded) { activitySeeded = true; return; }
      snap.docChanges().forEach(function (ch) {
        if (ch.type === "added") fireActivity(ch.doc.data());
      });
    }, function (e) { log("activity listen failed", e); });

    // Admin config: form schemas + member roster, shared across all devices.
    db.collection("config").onSnapshot(function (snap) {
      // Rebuild from scratch each snapshot so DELETED config docs (e.g. a removed
      // test event or a reset form) actually disappear on every device.
      var next = {};
      snap.docs.forEach(function (d) { next[d.id] = d.data(); });
      cache.config = next;
      // Fold the shared roster into the local store so every device recognizes
      // the same approved members and pending access requests.
      try {
        var r = cache.config.roster;
        if (r && window.Store && Store.mergeRoster) Store.mergeRoster(r.members, r.requests, r.removed);
        if (r && !snap.metadata.fromCache) healRoster(r);
        // Removed from the roster? Sign out on every device right away (only on what the
        // server says, never on the on-device copy, which can be out of date).
        if (r && !snap.metadata.fromCache && window.Auth && Auth.enforceRoster) setTimeout(Auth.enforceRoster, 0);
        // Fold the shared Bagel Bucks approved-event list into local so every
        // device knows which events earn BB (admin approval is team-wide).
        ["matchForm", "pitForm"].forEach(function (name) {
          var d = cache.config[cfgId(name)];
          var setFn = name === "matchForm" ? "setMatchSchema" : "setPitSchema";
          var clrFn = name === "matchForm" ? "clearMatchSchema" : "clearPitSchema";
          if (d && Array.isArray(d.schema) && d.schema.length) {
            var cur = window.Store && Store[name === "matchForm" ? "getMatchSchema" : "getPitSchema"]();
            if (JSON.stringify(cur) !== JSON.stringify(d.schema)) Store[setFn](d.schema);
          } else if (d && d.schema === null && window.Store) Store[clrFn]();
          var stamp = d ? (d.updatedAt || 1) : 0;
          if (formStamp[name] === undefined) { formStamp[name] = stamp; return; } // first look = baseline
          if (stamp !== formStamp[name]) {
            formStamp[name] = stamp;
            var info = { form: name, note: (d && d.note) || "", byId: (d && d.byId) || "", byName: (d && d.byName) || "" };
            formCbs.forEach(function (cb) { try { cb(info); } catch (e) {} });
          }
        });
        var pr = cache.config.prime702 || null, pst = pr ? (pr.updatedAt || 1) : 0;
        if (primeStamp === undefined) primeStamp = pst;
        else if (pst !== primeStamp) { primeStamp = pst; primeCbs.forEach(function (cb) { try { cb(pr); } catch (e) {} }); }
        var bb = cache.config[cfgId("bbApproved")];
        if (bb && window.Store && Store.setBBApprovedList) Store.setBBApprovedList(bb.events || []);
      } catch (e) {}
      // First time: if the cloud has no shared form/roster yet but this device
      // has local customizations, push them up so nothing is lost on migration.
      if (!cfgBootstrapped) {
        cfgBootstrapped = true;
        try {
          if (!cache.config[cfgId("matchForm")] && window.Store && Store.getMatchSchema && Store.getMatchSchema())
            Cloud.pushMatchForm(Store.getMatchSchema());
          if (!cache.config[cfgId("pitForm")] && window.Store && Store.getPitSchema && Store.getPitSchema())
            Cloud.pushPitForm(Store.getPitSchema());
          if (!cache.config.roster && window.Store && Store.getMembers)
            Cloud.pushRoster();
          if (!cache.config[cfgId("bbApproved")] && window.Store && Store.getBBApproved && Store.getBBApproved().length)
            Cloud.pushBBApproved(Store.getBBApproved());
        } catch (e) {}
      }
      if (!cfgLoaded) { cfgLoaded = true; cfgWaiters.splice(0).forEach(function (r) { r(true); }); }
      seen("config");
      fire();
    }, function (e) { log("config listen failed", e); });
    // a collection that never answers (offline, permissions) mustn't block the redraw forever
    setTimeout(function () { firstNeed.forEach(seen); }, 10000);
  }

  // Strip undefined (Firestore rejects it) and functions.
  function clean(obj) {
    return JSON.parse(JSON.stringify(obj == null ? {} : obj));
  }

  var Cloud = {
    enabled: function () { return configured && ready; },

    init: function () {
      if (!configured || ready) return;
      try {
        if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(CFG);
        db = firebase.firestore();
        // Keep a copy of the data on the device. A reload then only downloads what
        // changed instead of every match/pit/scouter again (the free plan allows
        // 50k reads a day), and offline saves survive a refresh.
        try { db.enablePersistence({ synchronizeTabs: true }).catch(function (e) { log("offline cache off", e && e.code); }); }
        catch (e) { log("offline cache off", e); }
        ready = true;
        listen();
      } catch (e) { ready = false; log("init failed", e); }
    },

    // Upsert my scouter/profile doc (also serves as a presence heartbeat).
    // NOTE: bb is deliberately NOT written here — Bagel Bucks is account-based and
    // lives authoritatively in the cloud doc, changed only via atomic addBB/setBB
    // (so two devices on one account can't clobber each other's total).
    syncMe: function () {
      if (!this.enabled()) return;
      var m = me(); if (!m || !m.id) return;
      var doc = clean({
        id: m.id, first: m.first || "", last: m.last || "",
        matchCount: m.matchCount || 0, pitCount: m.pitCount || 0,
        profilePic: m.profilePic || "", discord: m.discord || "",
        lastMatchTeams: m.lastMatchTeams || [], lastPitTeams: m.lastPitTeams || [],
        lastSeen: Date.now(), updatedAt: Date.now(),
      });
      db.collection("scouters").doc(m.id).set(doc, { merge: true })
        .catch(function (e) { log("syncMe failed", e); });
    },

    // ---- Bagel Bucks (account-based, atomic) ----
    // Add (or subtract) BB to a scouter's cloud total atomically. Defaults to me.
    addBB: function (delta, scouterId) {
      if (!this.enabled() || !delta) return;
      var m = me(); var id = scouterId || (m && m.id); if (!id) return;
      try {
        db.collection("scouters").doc(id).set(
          { id: id, bb: firebase.firestore.FieldValue.increment(delta) }, { merge: true })
          .catch(function (e) { log("addBB failed", e); });
      } catch (e) { log("addBB threw", e); }
    },
    // A new member's starting Bagel Bucks: given once per account (startBB marks it),
    // so approving twice or logging in on several devices never doubles it.
    grantStartBB: function (id, amount, first, last) {
      if (!this.enabled() || !id || !(amount > 0)) return Promise.resolve(false);
      var ref = db.collection("scouters").doc(id);
      return db.runTransaction(function (tx) {
        return tx.get(ref).then(function (s) {
          var d = s.exists ? s.data() : {};
          if (d.startBB) return false;
          var doc = { id: id, bb: (d.bb || 0) + amount, startBB: Date.now() };
          if (!d.first && first) { doc.first = first; doc.last = last || ""; } // approved before ever logging in: keep the name on it
          tx.set(ref, doc, { merge: true });
          return true;
        });
      }).catch(function (e) { log("grantStartBB failed", e); return false; });
    },
    // Set a scouter's BB to an exact value (admin edit, or one-time migrate-up).
    setBBValue: function (scouterId, value) {
      if (!this.enabled() || !scouterId) return;
      db.collection("scouters").doc(scouterId).set({ id: scouterId, bb: Number(value) || 0 }, { merge: true })
        .catch(function (e) { log("setBBValue failed", e); });
    },

    // Admin: give every member the same Bagel Bucks at once. An increment, so a bet or
    // a scouting reward landing at the same moment isn't lost. Logged in config/bbBoosts.
    getBBBoosts: function () { var d = cache.config.bbBoosts; return (d && Array.isArray(d.log)) ? d.log : []; },
    giveAllBB: async function (amount, ids) {
      if (!this.enabled()) throw new Error("cloud off");
      amount = Math.floor(Number(amount));
      if (!(amount > 0 && amount <= 100000)) throw new Error("pick an amount between 1 and 100,000");
      ids = Array.from(new Set((ids || []).filter(Boolean)));
      if (!ids.length) throw new Error("nobody on the roster");
      var m = me(), by = m ? ((m.first || "") + " " + (m.last || "")).trim() : "";
      for (var i = 0; i < ids.length; i += 400) { // a batch holds at most 500 writes
        var batch = db.batch();
        ids.slice(i, i + 400).forEach(function (id) {
          batch.set(db.collection("scouters").doc(id), { id: id, bb: firebase.firestore.FieldValue.increment(amount) }, { merge: true });
        });
        await batch.commit();
      }
      await db.collection("config").doc("bbBoosts").set({
        log: firebase.firestore.FieldValue.arrayUnion({ amount: amount, at: Date.now(), by: by, byId: m ? m.id : "", n: ids.length }) }, { merge: true });
      return ids.length;
    },

    // Lightweight presence ping.
    heartbeat: function () {
      if (!this.enabled()) return;
      var m = me(); if (!m || !m.id) return;
      db.collection("scouters").doc(m.id).set({ id: m.id, lastSeen: Date.now() }, { merge: true })
        .catch(function () {});
    },

    pushMatches: function () {
      if (!this.enabled() || !window.Store) return;
      var now = Date.now(); if (now - lastPush.matches < 800) return; lastPush.matches = now;
      var list = Store.getMatches() || [];
      var m = me();
      var batch = db.batch();
      list.forEach(function (rec) {
        if (!rec || !rec.id) return;
        var doc = clean(rec);
        doc.scouterId = m ? m.id : (rec.scouterId || "");
        batch.set(db.collection(col("matches")).doc(String(rec.id)), doc, { merge: true });
      });
      batch.commit().catch(function (e) { log("pushMatches failed", e); });
    },

    pushPits: function () {
      if (!this.enabled() || !window.Store) return;
      var now = Date.now(); if (now - lastPush.pits < 800) return; lastPush.pits = now;
      var pits = Store.getPits() || {};
      var m = me();
      var batch = db.batch();
      Object.keys(pits).forEach(function (team) {
        var doc = clean(pits[team]);
        doc.team = String(team);
        doc.scouterId = m ? m.id : (doc.scouterId || "");
        batch.set(db.collection(col("pits")).doc(String(team)), doc, { merge: true });
      });
      batch.commit().catch(function (e) { log("pushPits failed", e); });
    },

    pushPicklist: function () {
      if (!this.enabled() || !window.Store) return;
      var m = me(); if (!m || !m.id) return;
      var b = Store.getPicklist() || {};
      // Firestore rejects nested arrays, so the 8×N grid is stored as an array of
      // row maps ({cells:[...]}). sharedBoards() rebuilds the 2D grid on read.
      var doc = clean({
        scouterId: m.id, name: ((m.first || "") + " " + (m.last || "")).trim() || "Scout",
        cols: b.cols || [], rows: (b.grid || []).map(function (r) { return { cells: r || [] }; }),
        event: eventKey(),
        submittedAt: b.submittedAt || Date.now(),
      });
      db.collection(col("boards")).doc(m.id).set(doc, { merge: true })
        .catch(function (e) { log("pushPicklist failed", e); });
    },

    pushTierlist: function () {
      if (!this.enabled() || !window.Store) return;
      var m = me(); if (!m || !m.id) return;
      var t = Store.getTierlist() || {};
      var doc = clean({
        scouterId: m.id, name: ((m.first || "") + " " + (m.last || "")).trim() || "Scout",
        tiers: t.tiers || {}, event: eventKey(),
        submittedAt: t.submittedAt || Date.now(),
      });
      db.collection(col("tierlists")).doc(m.id).set(doc, { merge: true })
        .catch(function (e) { log("pushTierlist failed", e); });
    },

    // ---- Admin config: shared form schemas + roster ----
    // Admin form edits. `note` says what changed ("added a question", "required
    // fields", …); every other device shows it and refreshes (see onFormChange).
    pushMatchForm: function (schema, note) { this._pushForm("matchForm", schema, note); },
    pushPitForm: function (schema, note) { this._pushForm("pitForm", schema, note); },
    clearMatchForm: function () { this._pushForm("matchForm", null, "reset it to the default"); },
    clearPitForm: function () { this._pushForm("pitForm", null, "reset it to the default"); },
    _pushForm: function (name, schema, note) {
      if (!this.enabled()) return;
      var m = me();
      var doc = { schema: schema ? clean(schema) : null, updatedAt: Date.now(), note: note || "",
        byId: m ? m.id : "", byName: m ? ((m.first || "") + " " + (m.last || "")).trim() : "" };
      cache.config[cfgId(name)] = doc;
      formStamp[name] = doc.updatedAt; // my own change: no "an admin changed…" popup for me
      db.collection("config").doc(cfgId(name)).set(doc)
        .catch(function (e) { log("push " + name + " failed", e); });
    },

    // ---- Shared TEST EVENT (config/testEvent) ----
    // The whole team rehearses on the same synthetic event: the admin's teams +
    // schedule template + "current qual" are stored here, and every device rebuilds
    // the same matches deterministically from applyTestTime(currentQual).
    pushTestEvent: function (payload) {
      if (!this.enabled()) return;
      db.collection("config").doc(cfgId("testEvent"))
        .set(clean({
          teams: (payload && payload.teams) || [],
          template: (payload && payload.template) || [],
          currentQual: (payload && payload.currentQual) || 1,
          total: (payload && payload.total) || 0,
          srcName: (payload && payload.srcName) || "",
          updatedAt: Date.now(),
        }))
        .catch(function (e) { log("pushTestEvent failed", e); });
    },
    // Lightweight update when the admin only steps the "current qual".
    pushTestQual: function (n, total) {
      if (!this.enabled()) return;
      var patch = { currentQual: n, updatedAt: Date.now() };
      if (total != null) patch.total = total;
      db.collection("config").doc(cfgId("testEvent")).set(patch, { merge: true })
        .catch(function (e) { log("pushTestQual failed", e); });
    },
    clearTestEvent: function () {
      if (!this.enabled()) return;
      cache.config[cfgId("testEvent")] = null;
      db.collection("config").doc(cfgId("testEvent")).delete()
        .catch(function (e) { log("clearTestEvent failed", e); });
    },
    getTestEvent: function () { return cache.config[cfgId("testEvent")] || null; },
    // ---- Discord Parts pings: the channel webhook the site posts to directly ----
    // Stored in config (not in the public code) and pasted in by an admin.
    getPartsWebhook: function () { var d = cache.config["parts_webhook"]; return (d && d.url) || ""; },
    setPartsWebhook: function (url) {
      if (!this.enabled()) return Promise.resolve();
      var doc = clean({ url: (url || "").trim(), updatedAt: Date.now() });
      cache.config["parts_webhook"] = doc;   // optimistic so the field sticks instantly
      return db.collection("config").doc("parts_webhook").set(doc).catch(function (e) { log("setPartsWebhook failed", e); });
    },
    // ---- Scouting schedule: who signed up + their station assignments, per event ----
    // Stored as a config doc keyed by eventKey (which already carries the year).
    getSchedule: function (eventKey) { return eventKey ? (cache.config["sched_" + eventKey] || null) : null; },
    setSchedule: function (eventKey, doc) {
      if (!this.enabled() || !eventKey) return Promise.resolve();
      var full = clean(Object.assign({ updatedAt: Date.now() }, doc || {}));
      cache.config["sched_" + eventKey] = full;   // optimistic so the page updates instantly
      return db.collection("config").doc("sched_" + eventKey).set(full).catch(function (e) { log("setSchedule failed", e); });
    },
    pushRoster: function () {
      if (!this.enabled() || !window.Store) return;
      var members = (Store.getMembers && Store.getMembers()) || {};
      var requests = (Store.getRequests && Store.getRequests()) || {};
      var removed = (Store.getRemoved && Store.getRemoved()) || {};
      db.collection("config").doc("roster")
        .set(clean({ members: members, requests: requests, removed: removed, updatedAt: Date.now() }))
        .catch(function (e) { log("pushRoster failed", e); });
    },
    // Team-wide Bagel Bucks approval: which events earn BB (shared by the admin).
    pushBBApproved: function (events) {
      if (!this.enabled()) return;
      db.collection("config").doc(cfgId("bbApproved"))
        .set({ events: clean(events || []), updatedAt: Date.now() })
        .catch(function (e) { log("pushBBApproved failed", e); });
    },
    // Add ONE access request to the shared roster without touching the rest of it.
    // Used at login by not-yet-approved people (who may have an empty local roster),
    // so a merge — never a full overwrite — keeps existing members/requests intact.
    pushAccessRequest: function (key, entry) {
      if (!this.enabled() || !key) return;
      var patch = { requests: {}, updatedAt: Date.now() };
      patch.requests[key] = clean(entry || {});
      db.collection("config").doc("roster").set(patch, { merge: true })
        .catch(function (e) { log("pushAccessRequest failed", e); });
    },
    // Admin-only: wipe ALL shared scouting data from the cloud (matches, pits,
    // submitted picklists/boards and tier lists). Used to reset a test event.
    // Config docs (roster + form schemas) are intentionally left untouched.
    clearAllScoutingData: function () {
      if (!this.enabled()) return Promise.reject(new Error("cloud off"));
      var cols = ["matches", "pits", "boards", "tierlists"].map(col); // this season only
      return Promise.all(cols.map(function (c) {
        return db.collection(c).get().then(function (snap) {
          if (snap.empty) return null;
          var batch = db.batch();
          snap.docs.forEach(function (d) { batch.delete(d.ref); });
          return batch.commit();
        });
      })).then(function () {
        cache.matches = []; cache.pits = []; cache.boards = []; cache.tierlists = [];
        fire();
      });
    },

    // Admin-only: remove a single scouter from the cloud — their profile doc plus
    // any submitted pick list / tier list keyed by that id. (Match/pit records are
    // shared team data and are kept.)
    deleteScouter: function (id) {
      if (!this.enabled()) return Promise.reject(new Error("cloud off"));
      if (!id) return Promise.reject(new Error("no id"));
      var batch = db.batch();
      batch.delete(db.collection("scouters").doc(id));
      batch.delete(db.collection(col("boards")).doc(id));
      batch.delete(db.collection(col("tierlists")).doc(id));
      return batch.commit().then(function () {
        cache.scouters = (cache.scouters || []).filter(function (s) { return s && s.id !== id; });
        cache.boards = (cache.boards || []).filter(function (b) { return b && b.scouterId !== id; });
        cache.tierlists = (cache.tierlists || []).filter(function (t) { return t && t.scouterId !== id; });
        fire();
      });
    },

    // ---- Match claims (live "who's scouting what") ----
    claimId: function (ev, matchNumber, team) { return ev + "_q" + matchNumber + "_" + team; },
    pushClaim: function (ev, matchNumber, team, alliance) {
      if (!this.enabled() || !ev || !matchNumber || !team) return;
      var m = me();
      var doc = clean({
        eventKey: ev, matchNumber: String(matchNumber), team: String(team), alliance: alliance || "",
        scouterId: m ? m.id : "", scouterName: m ? ((m.first || "") + " " + (m.last || "")).trim() : "Someone",
        ts: Date.now(),
      });
      db.collection(col("claims")).doc(this.claimId(ev, matchNumber, team)).set(doc)
        .catch(function (e) { log("pushClaim failed", e); });
    },
    releaseClaim: function (ev, matchNumber, team) {
      if (!this.enabled() || !ev || !matchNumber || !team) return;
      db.collection(col("claims")).doc(this.claimId(ev, matchNumber, team)).delete()
        .catch(function () {});
    },
    // Drop every claim this scout owns — called on load so a refresh clears a stale
    // selection (otherwise an abandoned pick would keep locking a robot for others).
    releaseMyClaims: function () {
      if (!this.enabled()) return;
      var m = me(); if (!m || !m.id) return;
      db.collection(col("claims")).where("scouterId", "==", m.id).get().then(function (snap) {
        if (snap.empty) return;
        var batch = db.batch();
        snap.docs.forEach(function (d) { batch.delete(d.ref); });
        return batch.commit();
      }).catch(function (e) { log("releaseMyClaims failed", e); });
    },
    getClaims: function () { return cache.claims || []; },

    // ---- Activity feed (global scout popup) ----
    pushActivity: function (entry) {
      if (!this.enabled()) return;
      var m = me();
      var doc = clean({
        scouterId: m ? m.id : "", scouterName: m ? ((m.first || "") + " " + (m.last || "")).trim() : "Someone",
        type: (entry && entry.type) || "match", team: entry ? String(entry.team || "") : "",
        bb: (entry && entry.bb) || 0, matchNumber: entry ? String(entry.matchNumber || "") : "",
        ts: Date.now(),
      });
      db.collection(col("activity")).add(doc).catch(function (e) { log("pushActivity failed", e); });
    },
    onActivity: function (cb) { if (typeof cb === "function") activityCbs.push(cb); },

    // Resolves once the shared config (roster) has arrived, or after `ms` — so the
    // login screen can check membership against the team-wide roster.
    whenConfig: function (ms) {
      if (cfgLoaded || !this.enabled()) return Promise.resolve(cfgLoaded);
      return new Promise(function (resolve) {
        cfgWaiters.push(resolve);
        setTimeout(function () { resolve(false); }, ms || 5000);
      });
    },

    // ---- Account passwords (creds/{scouterId}) ----
    // Only a salted PBKDF2 hash is stored — never the password. Read straight from
    // the server so an admin reset takes effect immediately. Resolves null when the
    // account has no password yet; REJECTS when the server can't be reached.
    getCred: function (id) {
      if (!this.enabled() || !id) return Promise.reject(new Error("cloud off"));
      return db.collection("creds").doc(id).get({ source: "server" })
        .then(function (d) { return d.exists ? d.data() : null; });
    },
    setCred: function (id, cred) {
      if (!this.enabled() || !id) return Promise.reject(new Error("cloud off"));
      return db.collection("creds").doc(id).set(clean(cred));
    },
    deleteCred: function (id) {
      if (!this.enabled() || !id) return Promise.reject(new Error("cloud off"));
      return db.collection("creds").doc(id).delete();
    },
    // Live view of one account's password record (signs a device out the moment an
    // admin resets it or removes the account). cb(cred or null); server data only.
    watchCred: function (id, cb) {
      if (!this.enabled() || !id) return function () {};
      return db.collection("creds").doc(id).onSnapshot(function (d) {
        if (d.metadata.fromCache) return;
        cb(d.exists ? d.data() : null);
      }, function () {});
    },
    // Admin: which scouter ids have a password set.
    listCredIds: function () {
      if (!this.enabled()) return Promise.resolve([]);
      return db.collection("creds").get({ source: "server" })
        .then(function (snap) { return snap.docs.map(function (d) { return d.id; }); });
    },

    // The database refused us (permission denied): nothing is reading or saving.
    isBlocked: function () { return blocked; },
    onBlocked: function (cb) { if (typeof cb !== "function") return; if (blocked) cb(); else blockedCbs.push(cb); },

    // Members an admin gave full admin access (config/admins). The owner always has it.
    getAdmins: function () { var d = cache.config.admins; return (d && Array.isArray(d.ids)) ? d.ids : []; },
    setAdmins: function (ids, byName) {
      if (!this.enabled()) return Promise.reject(new Error("cloud off"));
      var doc = { ids: Array.from(new Set(ids || [])), updatedAt: Date.now(), by: byName || "" };
      cache.config.admins = doc;
      return db.collection("config").doc("admins").set(doc);
    },
    // Team-wide feature switches an admin flips (config/features), e.g. { scoutSchedule: false }.
    getFeatures: function () { return cache.config.features || {}; },
    setFeature: function (name, on) {
      if (!this.enabled()) return Promise.reject(new Error("cloud off"));
      var doc = Object.assign({}, cache.config.features || {}, { updatedAt: Date.now() });
      doc[name] = !!on;
      cache.config.features = doc;
      return db.collection("config").doc("features").set(doc);
    },
    // Members hidden from the member list and leaderboard (config/visibility).
    getHidden: function () { var d = cache.config.visibility; return (d && Array.isArray(d.hidden)) ? d.hidden : []; },
    setHidden: function (ids) {
      if (!this.enabled()) return Promise.reject(new Error("cloud off"));
      var doc = { hidden: Array.from(new Set(ids || [])), updatedAt: Date.now() };
      cache.config.visibility = doc;
      return db.collection("config").doc("visibility").set(doc);
    },

    // ---- Signed-in devices (devices/{deviceId}) ----
    // Each browser that signs in registers itself; deleting its doc signs it out.
    getDevice: function (id) {
      if (!this.enabled() || !id) return Promise.reject(new Error("cloud off"));
      return db.collection("devices").doc(id).get({ source: "server" })
        .then(function (d) { return d.exists ? d.data() : null; });
    },
    setDevice: function (id, doc) {
      if (!this.enabled() || !id) return Promise.reject(new Error("cloud off"));
      return db.collection("devices").doc(id).set(clean(doc));
    },
    // update() (never set) so a device that was just signed out can't re-create itself
    touchDevice: function (id) {
      if (!this.enabled() || !id) return Promise.resolve();
      return db.collection("devices").doc(id).update({ lastSeen: Date.now() }).catch(function () {});
    },
    removeDevice: function (id) {
      if (!this.enabled() || !id) return Promise.reject(new Error("cloud off"));
      return db.collection("devices").doc(id).delete();
    },
    listDevices: function (uid) {
      if (!this.enabled() || !uid) return Promise.resolve([]);
      return db.collection("devices").where("uid", "==", uid).get({ source: "server" })
        .then(function (snap) { return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); });
    },
    // cb(doc or null) from the server only (a cached "missing" must never sign anyone out)
    watchDevice: function (id, cb) {
      if (!this.enabled() || !id) return function () {};
      return db.collection("devices").doc(id).onSnapshot(function (d) {
        if (d.metadata.fromCache) return;
        cb(d.exists ? d.data() : null);
      }, function (e) { log("device watch failed", e); });
    },

    // ---- Auto Scout results (autoscout/{matchKey}, per season) ----
    // Read on demand (no listener). These go through their own error path, not log():
    // until the rules list "autoscout", a refusal here must not raise the red
    // "database blocked" bar for everyone; the results stay on this device instead.
    saveAutoScout: function (doc) {
      if (!this.enabled() || !doc || !doc.key) return Promise.reject(new Error("cloud off"));
      return db.collection(col("autoscout")).doc(doc.key).set(clean(doc));
    },
    listAutoScout: function (eventKey) {
      if (!this.enabled() || !eventKey) return Promise.resolve([]);
      return db.collection(col("autoscout")).where("event", "==", eventKey).get()
        .then(function (snap) { return snap.docs.map(function (d) { return d.data(); }); });
    },
    deleteAutoScout: function (key) {
      if (!this.enabled() || !key) return Promise.reject(new Error("cloud off"));
      return db.collection(col("autoscout")).doc(key).delete();
    },

    onFormChange: function (cb) { if (typeof cb === "function") formCbs.push(cb); },
    // Members an admin trusts to open/lock match betting from Match Scouting (all seasons).
    getBetHosts: function () { var d = cache.config.betHosts; return (d && Array.isArray(d.ids)) ? d.ids : []; },
    setBetHosts: function (ids) {
      if (!this.enabled()) return Promise.reject(new Error("cloud off"));
      var doc = { ids: Array.from(new Set(ids || [])), updatedAt: Date.now() };
      cache.config.betHosts = doc;
      return db.collection("config").doc("betHosts").set(doc);
    },
    // Prime 702: { on, seed, updatedAt, byId, byName } — purely visual, read by api.js.
    getPrime: function () { return cache.config.prime702 || null; },
    onPrimeChange: function (cb) { if (typeof cb === "function") primeCbs.push(cb); },
    setPrime: function (on) {
      if (!this.enabled()) return Promise.reject(new Error("cloud off"));
      var m = me(), prev = cache.config.prime702 || {};
      var doc = { on: !!on, seed: on ? Math.random().toString(36).slice(2, 10) : (prev.seed || ""), updatedAt: Date.now(),
        byId: m ? m.id : "", byName: m ? ((m.first || "") + " " + (m.last || "")).trim() : "" };
      cache.config.prime702 = doc;
      primeStamp = doc.updatedAt; // my own toggle: no popup for me
      return db.collection("config").doc("prime702").set(doc);
    },
    onFirstSync: function (cb) { if (typeof cb !== "function") return; if (firstDone) cb(); else firstCbs.push(cb); },
    getMatchForm: function () { return cache.config[cfgId("matchForm")] ? cache.config[cfgId("matchForm")].schema : null; },
    getPitForm: function () { return cache.config[cfgId("pitForm")] ? cache.config[cfgId("pitForm")].schema : null; },
    getRoster: function () { return cache.config.roster || null; },

    getScouters: function () { return cache.scouters; },
    getSharedBoards: function () { return cache.boards; },
    getSharedTierlists: function () { return cache.tierlists; },
    getAllMatches: function () { return cache.matches; },
    getAllPits: function () { return cache.pits; },

    onChange: function (cb) { if (typeof cb === "function") changeCbs.push(cb); },
  };

  window.Cloud = Cloud;
})();
