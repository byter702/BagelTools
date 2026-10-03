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

  function fire() { changeCbs.forEach(function (cb) { try { cb(); } catch (e) {} }); }
  function fireActivity(d) { activityCbs.forEach(function (cb) { try { cb(d); } catch (e) {} }); }
  function me() { return (window.Store && Store.getMe && Store.getMe()) || null; }
  function eventKey() {
    return (window.Store && Store.getSettings && Store.getSettings().eventKey) || "";
  }
  function log(msg, e) { try { console.warn("[Cloud] " + msg, e || ""); } catch (x) {} }

  function listen() {
    if (!db) return;
    db.collection("scouters").onSnapshot(function (snap) {
      cache.scouters = snap.docs.map(function (d) { return d.data(); });
      fire();
    }, function (e) { log("scouters listen failed", e); });

    db.collection("boards").onSnapshot(function (snap) {
      cache.boards = snap.docs.map(function (d) { return d.data(); });
      fire();
    }, function (e) { log("boards listen failed", e); });

    db.collection("tierlists").onSnapshot(function (snap) {
      cache.tierlists = snap.docs.map(function (d) { return d.data(); });
      fire();
    }, function (e) { log("tierlists listen failed", e); });

    db.collection("matches").onSnapshot(function (snap) {
      cache.matches = snap.docs.map(function (d) { return d.data(); });
      fire();
    }, function (e) { log("matches listen failed", e); });

    db.collection("pits").onSnapshot(function (snap) {
      cache.pits = snap.docs.map(function (d) { return d.data(); });
      fire();
    }, function (e) { log("pits listen failed", e); });

    // Match claims: which team in which match is already being scouted (live lock).
    db.collection("claims").onSnapshot(function (snap) {
      cache.claims = snap.docs.map(function (d) { return d.data(); });
      fire();
    }, function (e) { log("claims listen failed", e); });

    // Activity feed: drives the global "someone just scouted" popup. The first
    // snapshot is a seed (don't pop up on page load); later additions notify.
    db.collection("activity").orderBy("ts", "desc").limit(20).onSnapshot(function (snap) {
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
        if (r && window.Store && Store.mergeRoster) Store.mergeRoster(r.members, r.requests);
      } catch (e) {}
      // First time: if the cloud has no shared form/roster yet but this device
      // has local customizations, push them up so nothing is lost on migration.
      if (!cfgBootstrapped) {
        cfgBootstrapped = true;
        try {
          if (!cache.config.matchForm && window.Store && Store.getMatchSchema && Store.getMatchSchema())
            Cloud.pushMatchForm(Store.getMatchSchema());
          if (!cache.config.pitForm && window.Store && Store.getPitSchema && Store.getPitSchema())
            Cloud.pushPitForm(Store.getPitSchema());
          if (!cache.config.roster && window.Store && Store.getMembers)
            Cloud.pushRoster();
        } catch (e) {}
      }
      fire();
    }, function (e) { log("config listen failed", e); });
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
        ready = true;
        listen();
      } catch (e) { ready = false; log("init failed", e); }
    },

    // Upsert my scouter/profile doc (also serves as a presence heartbeat).
    syncMe: function () {
      if (!this.enabled()) return;
      var m = me(); if (!m || !m.id) return;
      var doc = clean({
        id: m.id, first: m.first || "", last: m.last || "",
        bb: m.bb || 0, matchCount: m.matchCount || 0, pitCount: m.pitCount || 0,
        profilePic: m.profilePic || "",
        lastMatchTeams: m.lastMatchTeams || [], lastPitTeams: m.lastPitTeams || [],
        lastSeen: Date.now(), updatedAt: Date.now(),
      });
      db.collection("scouters").doc(m.id).set(doc, { merge: true })
        .catch(function (e) { log("syncMe failed", e); });
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
        batch.set(db.collection("matches").doc(String(rec.id)), doc, { merge: true });
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
        batch.set(db.collection("pits").doc(String(team)), doc, { merge: true });
      });
      batch.commit().catch(function (e) { log("pushPits failed", e); });
    },

    pushPicklist: function () {
      if (!this.enabled() || !window.Store) return;
      var m = me(); if (!m || !m.id) return;
      var b = Store.getPicklist() || {};
      var doc = clean({
        scouterId: m.id, name: ((m.first || "") + " " + (m.last || "")).trim() || "Scout",
        cols: b.cols || [], grid: b.grid || [], event: eventKey(),
        submittedAt: b.submittedAt || Date.now(),
      });
      db.collection("boards").doc(m.id).set(doc, { merge: true })
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
      db.collection("tierlists").doc(m.id).set(doc, { merge: true })
        .catch(function (e) { log("pushTierlist failed", e); });
    },

    // ---- Admin config: shared form schemas + roster ----
    pushMatchForm: function (schema) {
      if (!this.enabled()) return;
      db.collection("config").doc("matchForm")
        .set({ schema: clean(schema || []), updatedAt: Date.now() })
        .catch(function (e) { log("pushMatchForm failed", e); });
    },
    pushPitForm: function (schema) {
      if (!this.enabled()) return;
      db.collection("config").doc("pitForm")
        .set({ schema: clean(schema || []), updatedAt: Date.now() })
        .catch(function (e) { log("pushPitForm failed", e); });
    },
    clearMatchForm: function () {
      if (!this.enabled()) return;
      cache.config.matchForm = null;
      db.collection("config").doc("matchForm").delete()
        .catch(function (e) { log("clearMatchForm failed", e); });
    },
    clearPitForm: function () {
      if (!this.enabled()) return;
      cache.config.pitForm = null;
      db.collection("config").doc("pitForm").delete()
        .catch(function (e) { log("clearPitForm failed", e); });
    },

    // ---- Shared TEST EVENT (config/testEvent) ----
    // The whole team rehearses on the same synthetic event: the admin's teams +
    // schedule template + "current qual" are stored here, and every device rebuilds
    // the same matches deterministically from applyTestTime(currentQual).
    pushTestEvent: function (payload) {
      if (!this.enabled()) return;
      db.collection("config").doc("testEvent")
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
      db.collection("config").doc("testEvent").set(patch, { merge: true })
        .catch(function (e) { log("pushTestQual failed", e); });
    },
    clearTestEvent: function () {
      if (!this.enabled()) return;
      cache.config.testEvent = null;
      db.collection("config").doc("testEvent").delete()
        .catch(function (e) { log("clearTestEvent failed", e); });
    },
    getTestEvent: function () { return cache.config.testEvent || null; },
    pushRoster: function () {
      if (!this.enabled() || !window.Store) return;
      var members = (Store.getMembers && Store.getMembers()) || {};
      var requests = (Store.getRequests && Store.getRequests()) || {};
      db.collection("config").doc("roster")
        .set(clean({ members: members, requests: requests, updatedAt: Date.now() }))
        .catch(function (e) { log("pushRoster failed", e); });
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
      var cols = ["matches", "pits", "boards", "tierlists"];
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
      batch.delete(db.collection("boards").doc(id));
      batch.delete(db.collection("tierlists").doc(id));
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
      db.collection("claims").doc(this.claimId(ev, matchNumber, team)).set(doc)
        .catch(function (e) { log("pushClaim failed", e); });
    },
    releaseClaim: function (ev, matchNumber, team) {
      if (!this.enabled() || !ev || !matchNumber || !team) return;
      db.collection("claims").doc(this.claimId(ev, matchNumber, team)).delete()
        .catch(function () {});
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
      db.collection("activity").add(doc).catch(function (e) { log("pushActivity failed", e); });
    },
    onActivity: function (cb) { if (typeof cb === "function") activityCbs.push(cb); },

    getMatchForm: function () { return cache.config.matchForm ? cache.config.matchForm.schema : null; },
    getPitForm: function () { return cache.config.pitForm ? cache.config.pitForm.schema : null; },
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
