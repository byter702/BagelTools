/* ===========================================================================
   parts-bot.js — Discord pings for Bagel Parts, with NO bot and NO server.

   Posts straight from the browser to a Discord channel webhook:
     • Auto-ping: the moment a part someone's assigned to is ready to make, the
       first open tab that notices posts "<@id>, you are ready to make type-name."
       exactly once (deduped in the shared board via Parts.claimReadyPings).
     • Digest:    an admin posts one grouped message per teammate on demand.

   People are matched by the numeric Discord USER ID on their profile (a webhook
   can only notify by id, not by username). The webhook URL lives in Firestore
   config (set in the admin panel), never in this code.

   Load AFTER parts.js + cloud.js and BEFORE app.js.
   ======================================================================== */
(function () {
  "use strict";

  function webhook() { return (window.Cloud && Cloud.getPartsWebhook && Cloud.getPartsWebhook()) || ""; }
  function hasWebhook() { return !!webhook(); }

  // uid (scouter id) -> their Discord user id, if they've set one.
  function discordId(uid) {
    var list = (window.Cloud && Cloud.getScouters && Cloud.getScouters()) || [];
    for (var i = 0; i < list.length; i++) { if (list[i] && list[i].id === uid) return (list[i].discord || "").trim(); }
    return "";
  }

  // Every ready-to-make part with at least one assignee: { key, label, uids }.
  // label is the "type-name" form the Parts board uses (e.g. inhouse-DriveRail).
  function readyAssignments() {
    if (!window.Parts || !Parts.view) return [];
    var v = Parts.view();
    var byPart = {};
    (v.people || []).forEach(function (p) {
      if (!p.uid) return;
      (p.parts || []).forEach(function (k) { (byPart[k] = byPart[k] || []).push(p.uid); });
    });
    var out = [];
    (v.mechanisms || []).forEach(function (m) {
      (m.parts || []).forEach(function (p) {
        if (!Parts.readyToMake(p)) return;
        var uids = byPart[p.key] || [];
        if (uids.length) out.push({ key: p.key, label: p.type + "-" + p.name, uids: uids });
      });
    });
    return out;
  }

  var labelByKey = {};   // remembered so a ping still has a name even if the part just changed

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // POST one message; retry once on Discord's rate limit.
  async function post(url, content) {
    var res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content, allowed_mentions: { parse: ["users"] } }),
    });
    if (res.status === 429) {
      var j = await res.json().catch(function () { return {}; });
      await sleep((Number(j.retry_after) || 1) * 1000 + 150);
      return post(url, content);
    }
    if (!res.ok) throw new Error("webhook " + res.status);
    return true;
  }

  var running = false;
  // Fires on every board change. Pings each newly-ready assigned part once.
  async function autoPing() {
    if (running || !hasWebhook() || !window.Parts) return;
    var s = Parts.state(); if (!s || !s.parts) return;
    var ra = readyAssignments();
    ra.forEach(function (r) { labelByKey[r.key] = r.label; });

    // First run ever: adopt whatever's ready now as the baseline, ping nothing.
    if (!s.pingSeeded) {
      var all = [];
      ra.forEach(function (r) { r.uids.forEach(function (u) { all.push([r.key, u]); }); });
      try { await Parts.claimReadyPings(all, true); } catch (e) { /* retried next snapshot */ }
      return;
    }

    // Candidates = ready pairs with a usable Discord id that we haven't sent yet.
    var pending = [];
    ra.forEach(function (r) {
      r.uids.forEach(function (u) {
        if (!discordId(u)) return;
        if (s.pinged && s.pinged[r.key] && s.pinged[r.key][u]) return;
        pending.push([r.key, u]);
      });
    });
    if (!pending.length) return;

    running = true;
    try {
      var claimed = await Parts.claimReadyPings(pending, false);   // only THIS tab's claims come back
      for (var i = 0; i < claimed.length; i++) {
        var key = claimed[i][0], uid = claimed[i][1], id = discordId(uid);
        if (!id) continue;
        try { await post(webhook(), "<@" + id + ">, you are ready to make " + (labelByKey[key] || key) + "."); }
        catch (e) { /* leave it claimed; the digest can recover a missed ping */ }
      }
    } catch (e) { /* transaction lost a race — fine, another tab handled it */ }
    finally { running = false; }
  }

  // Admin action: one message per teammate listing all their ready parts.
  // Resolves with { people, parts } counts; rejects if the webhook is unset.
  async function sendDigest() {
    var url = webhook();
    if (!url) throw new Error("No webhook set");
    var ra = readyAssignments();
    var byUid = {};
    ra.forEach(function (r) { r.uids.forEach(function (u) { (byUid[u] = byUid[u] || []).push(r.label); }); });
    var uids = Object.keys(byUid).filter(function (u) { return discordId(u); });
    if (!uids.length) { await post(url, "No parts are ready to make right now. 🥯"); return { people: 0, parts: 0 }; }
    var parts = 0;
    for (var i = 0; i < uids.length; i++) {
      var id = discordId(uids[i]), lines = byUid[uids[i]];
      parts += lines.length;
      await post(url, "<@" + id + ">, your ready parts are:\n" + lines.map(function (l) { return "• " + l; }).join("\n"));
      if (i < uids.length - 1) await sleep(350);   // stay under the webhook rate limit
    }
    return { people: uids.length, parts: parts };
  }

  var started = false;
  function init() {
    if (started || !window.Parts) return; started = true;
    Parts.watch();                                   // listen to the board site-wide so pings fire from any open tab
    Parts.onChange(function () { autoPing(); });      // fire-and-forget on every change
  }

  window.PartsBot = { init: init, sendDigest: sendDigest, hasWebhook: hasWebhook };
})();
