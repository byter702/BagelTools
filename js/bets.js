/* =============================================================================
   bets.js  —  Bagel Bets: match pools, alliance predictions, playoff brackets,
               and the season-long Fantasy Alliance. Everything is paid in the
               real Bagel Bucks balance (scouters/{id}.bb).
   -----------------------------------------------------------------------------
   No server, so money moves only inside Firestore TRANSACTIONS: a bet, a refund
   or a payout reads the doc first and is applied at most once, so two devices
   can't double-spend or double-pay. Any device that sees a finished match can
   settle it (whoever gets there first; the rest see "already settled").
   Collections (all keyed by event/year, so no season suffix):
     betlines/{matchKey}         the frozen prediction line + house seeds
     bets/{matchKey}__{uid}      one person's stake on one match (one pool)
     apreds/{event}__{uid}       alliance-selection prediction grid
     brackets/{event}__{uid}     playoff bracket picks (100 BB to enter)
     fantasy/{year}_{league}     a whole fantasy league in one doc
   ========================================================================== */
const Bets = (() => {
  "use strict";

  /* ---- Rules -------------------------------------------------------------- */
  const POOLS = ["higher", "accurate", "lower", "upset"];
  const SEED = 100;              // the house's opening bet, split across the 4 pools
  const PLAYOFF_MULT = 2;        // playoff payouts are doubled
  const AP_PAY = { exact: 50, role: 25, on: 10, none: 0 };
  const ROUND_BB = { 1: 10, 2: 20, 3: 50, 4: 75, 5: 100, 6: 100 };
  const BRACKET_FEE = 100;
  const FP_START = 200, ROSTER = 4, MIN_PRICE = 5;
  const WEEK_WIN = 250, GRAND_PRIZE = 10000;
  const AUTO_PICK_MS = 3 * 60 * 1000;   // a stalled draft turn can be auto-picked after 3 min
  const LEAGUES = [["freshman", "Freshman"], ["sophomore", "Sophomore"], ["junior", "Junior"], ["senior", "Senior"]];

  // 8-alliance double elimination (TBA playoff_type 10): sf1..sf13, then finals.
  const DE8 = [
    { id: "m1", round: 1, red: { seed: 1 }, blue: { seed: 8 } },
    { id: "m2", round: 1, red: { seed: 4 }, blue: { seed: 5 } },
    { id: "m3", round: 1, red: { seed: 2 }, blue: { seed: 7 } },
    { id: "m4", round: 1, red: { seed: 3 }, blue: { seed: 6 } },
    { id: "m5", round: 2, lower: true, red: { L: "m1" }, blue: { L: "m2" } },
    { id: "m6", round: 2, lower: true, red: { L: "m3" }, blue: { L: "m4" } },
    { id: "m7", round: 2, red: { W: "m1" }, blue: { W: "m2" } },
    { id: "m8", round: 2, red: { W: "m3" }, blue: { W: "m4" } },
    { id: "m9", round: 3, lower: true, red: { L: "m7" }, blue: { W: "m6" } },
    { id: "m10", round: 3, lower: true, red: { L: "m8" }, blue: { W: "m5" } },
    { id: "m11", round: 4, red: { W: "m7" }, blue: { W: "m8" } },
    { id: "m12", round: 4, lower: true, red: { W: "m10" }, blue: { W: "m9" } },
    { id: "m13", round: 5, lower: true, red: { L: "m11" }, blue: { W: "m12" } },
    { id: "f", round: 6, red: { W: "m11" }, blue: { W: "m13" } },
  ];

  /* ---- Firestore plumbing ------------------------------------------------- */
  const db = () => (window.Cloud && Cloud.enabled() && window.firebase) ? firebase.firestore() : null;
  const inc = (n) => firebase.firestore.FieldValue.increment(n);
  const me = () => (window.Store && Store.getMe && Store.getMe()) || {};
  const myName = () => { const m = me(); return `${m.first || ""} ${m.last || ""}`.trim(); };
  const scRef = (d, uid) => d.collection("scouters").doc(uid);

  const cache = { lines: {}, bets: {}, mine: {}, apreds: {}, brackets: {}, fantasy: {} };
  const ready = {};
  const subs = {};
  let cbs = [];
  const fire = () => cbs.forEach((cb) => { try { cb(); } catch (e) { console.warn("[Bets]", e); } });
  function listen(name, query) {
    if (subs[name]) { subs[name](); delete subs[name]; }
    cache[name] = {}; ready[name] = false;
    if (!query) return;
    subs[name] = query.onSnapshot((snap) => {
      const next = {};
      snap.docs.forEach((d) => { next[d.id] = d.data(); });
      cache[name] = next; ready[name] = true; fire();
    }, (e) => { console.warn("[Bets] listen " + name + " failed", e); ready[name] = true; fire(); });
  }
  let watchedEvent = null, watchedUser = null, watchedYear = null;
  // Live data for one event (+ my own bets everywhere, + the fantasy year).
  function watch(eventKey, year) {
    const d = db(); if (!d) return;
    if (eventKey !== watchedEvent) {
      watchedEvent = eventKey;
      const q = (c) => eventKey ? d.collection(c).where("event", "==", eventKey) : null;
      listen("lines", q("betlines")); listen("bets", q("bets"));
      listen("apreds", q("apreds")); listen("brackets", q("brackets"));
    }
    const uid = me().id;
    if (uid && uid !== watchedUser) { watchedUser = uid; listen("mine", d.collection("bets").where("uid", "==", uid)); }
    if (year && year !== watchedYear) { watchedYear = year; listen("fantasy", d.collection("fantasy").where("year", "==", year)); }
  }
  const isReady = (...names) => names.every((n) => ready[n]);

  // Sandbox testing hook: lets a read-only test page fake docs (never used live).
  function _inject(name, docs) { cache[name] = Object.assign({}, cache[name], docs); ready[name] = true; fire(); }

  /* ---- Shared match helpers ---------------------------------------------- */
  const COMP_ORDER = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
  const played = (m) => !!(m && m.alliances && m.alliances.red.score >= 0 && m.alliances.blue.score >= 0);
  const teamsOf = (m, c) => ((m.alliances && m.alliances[c] && m.alliances[c].team_keys) || []).map((k) => String(k).replace("frc", ""));
  const isPlayoff = (m) => m.comp_level !== "qm";
  const matchOrder = (a, b) => (COMP_ORDER[a.comp_level] - COMP_ORDER[b.comp_level]) ||
    ((a.set_number || 0) - (b.set_number || 0)) || (a.match_number - b.match_number);
  const startAt = (m) => ((m.predicted_time || m.time || 0) * 1000) || 0;

  // open = can bet · locked = about to start / running · final = result posted.
  // A match also locks once any LATER match has a score (covers events with no times).
  function matchState(m, all) {
    if (played(m)) return "final";
    if (teamsOf(m, "red").length < 3 || teamsOf(m, "blue").length < 3) return "tbd";
    const t = startAt(m);
    if (t && Date.now() >= t - 60 * 1000) return "locked";
    const later = (all || []).some((x) => x !== m && matchOrder(x, m) > 0 && played(x));
    return later ? "locked" : "open";
  }

  /* ---- 1. Match pools ----------------------------------------------------- */
  // pred = { redWin (0..1), redScore, blueScore } from Statbotics (or EPA fallback).
  function makeLine(pred) {
    const redFav = pred.redWin >= 0.5;
    const conf = Math.min(0.97, Math.max(0.5, redFav ? pred.redWin : 1 - pred.redWin));
    const ws = redFav ? pred.redScore : pred.blueScore, ls = redFav ? pred.blueScore : pred.redScore;
    const diff = Math.max(1, Math.round((ws || 0) - (ls || 0)));
    const tol = Math.max(3, Math.round(diff * 0.25));
    const third = Math.round(conf * SEED / 3 * 100) / 100;
    return {
      winner: redFav ? "red" : "blue", conf: Math.round(conf * 1000) / 1000, diff, tol,
      redScore: Math.round(pred.redScore || 0), blueScore: Math.round(pred.blueScore || 0),
      seeds: { higher: third, accurate: third, lower: third, upset: Math.round((SEED - third * 3) * 100) / 100 },
    };
  }
  // Which pool won: margin = favourite's score − underdog's score.
  function outcome(line, m) {
    if (!played(m)) return null;
    const r = m.alliances.red.score, b = m.alliances.blue.score;
    const margin = line.winner === "red" ? r - b : b - r;
    if (margin < 0) return { pool: "upset", margin };
    if (Math.abs(margin - line.diff) <= line.tol) return { pool: "accurate", margin };
    return { pool: margin > line.diff ? "higher" : "lower", margin };
  }
  // Human labels for the four pools, given a line.
  function poolLabels(line) {
    const fav = line.winner === "red" ? "Red" : "Blue", dog = line.winner === "red" ? "Blue" : "Red";
    const lo = Math.max(0, line.diff - line.tol), hi = line.diff + line.tol;
    return {
      higher: { name: "Blowout", cond: `${fav} wins by more than ${hi}` },
      accurate: { name: "Called it", cond: `${fav} wins by ${lo}–${hi}` },
      lower: { name: "Closer", cond: lo > 0 ? `${fav} wins by under ${lo} (or ties)` : `${fav} barely wins or ties` },
      upset: { name: "Upset", cond: `${dog} wins` },
    };
  }
  const betsOn = (matchKey) => Object.values(cache.bets).filter((b) => b.match === matchKey);
  // Pool totals incl. the house seeds, plus what PEOPLE put in each.
  function pools(line, bets) {
    const user = { higher: 0, accurate: 0, lower: 0, upset: 0 }, count = { higher: 0, accurate: 0, lower: 0, upset: 0 };
    bets.forEach((b) => { if (user[b.pool] != null) { user[b.pool] += b.amount || 0; count[b.pool]++; } });
    const seeds = (line && line.seeds) || { higher: 0, accurate: 0, lower: 0, upset: 0 };
    const total = {}; POOLS.forEach((p) => { total[p] = (seeds[p] || 0) + user[p]; });
    const pot = POOLS.reduce((s, p) => s + total[p], 0);
    return { user, count, total, pot, seeds };
  }
  // What a NEW stake of `add` on `pool` would return per BB (incl. playoff doubling).
  function estMultiplier(line, bets, pool, add, playoff) {
    const p = pools(line, bets);
    const mine = p.user[pool] + (add || 0);
    if (mine <= 0) return null;
    return (p.pot + (add || 0)) / mine * (playoff ? PLAYOFF_MULT : 1);
  }
  // Payout per bet id. Winners split the WHOLE pot (seeds included) by stake vs the
  // other people in the winning pool. Nobody on the winning pool → everyone refunded.
  function payouts(line, bets, out, playoff) {
    const p = pools(line, bets), res = {};
    const winners = bets.filter((b) => b.pool === out.pool);
    const winStake = winners.reduce((s, b) => s + (b.amount || 0), 0);
    bets.forEach((b) => {
      if (!winStake) res[b.id] = { payout: b.amount || 0, refund: true };
      else res[b.id] = { payout: b.pool === out.pool ? Math.floor(p.pot * (b.amount || 0) / winStake * (playoff ? PLAYOFF_MULT : 1)) : 0 };
    });
    return res;
  }

  // Markets are run from Match Scouting: a host (admin or a member they trust) OPENS
  // betting on a match (the line freezes then), scouts bet and may change their
  // pick while it's open, and START MATCH locks every bet in. Results settle as usual.
  async function openMarket({ event, match, line }) {
    const d = db(); if (!d) throw new Error("OFFLINE");
    if (!line) throw new Error("NO_LINE");
    const ref = d.collection("betlines").doc(match.key);
    return d.runTransaction(async (tx) => {
      const s = await tx.get(ref), cur = s.exists ? s.data() : null;
      if (cur && cur.status && cur.status !== "open") throw new Error("LOCKED");
      if (cur && cur.void) throw new Error("VOID");
      if (cur && cur.status === "open") return cur;
      const ln = Object.assign({}, line, { event, match: match.key, comp: match.comp_level, label: matchLabel(match), status: "open",
        openedAt: Date.now(), openedBy: me().id || "", openedByName: myName() });
      tx.set(ref, ln);
      return ln;
    });
  }
  async function lockMarket(matchKey) {
    const d = db(); if (!d) throw new Error("OFFLINE");
    const ref = d.collection("betlines").doc(matchKey);
    return d.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new Error("NOT_OPEN");
      if (s.data().status !== "open") return false;
      tx.update(ref, { status: "locked", lockedAt: Date.now(), lockedBy: me().id || "", lockedByName: myName() });
      return true;
    });
  }
  // Bet (or add to / switch) while the market is open. amount may be 0 when only switching pools.
  async function placeBet({ event, match, pool, amount }) {
    const d = db(); if (!d) throw new Error("OFFLINE");
    const uid = me().id; amount = Math.floor(Number(amount) || 0);
    if (!uid) throw new Error("NO_USER");
    if (amount < 0) throw new Error("AMOUNT");
    if (!POOLS.includes(pool)) throw new Error("POOL");
    const lineRef = d.collection("betlines").doc(match.key);
    const betRef = d.collection("bets").doc(match.key + "__" + uid);
    const meRef = scRef(d, uid);
    return d.runTransaction(async (tx) => {
      const ls = await tx.get(lineRef), bs = await tx.get(betRef), ms = await tx.get(meRef);
      const ln = ls.exists ? ls.data() : null;
      if (!ln || ln.status !== "open") throw new Error(ln && ln.status === "locked" ? "LOCKED" : "NOT_OPEN");
      if (ln.void) throw new Error("VOID");
      const prev = bs.exists ? bs.data() : null;
      if (prev && prev.settled) throw new Error("SETTLED");
      if (!amount && !(prev && prev.pool !== pool)) throw new Error("AMOUNT");
      const bal = (ms.exists && ms.data().bb) || 0;
      if (bal < amount) throw new Error("FUNDS");
      tx.set(betRef, { id: betRef.id, event, match: match.key, comp: match.comp_level, label: matchLabel(match), uid, name: myName(),
        pool, amount: (prev ? prev.amount || 0 : 0) + amount, ts: Date.now(), settled: false });
      if (amount) tx.set(meRef, { id: uid, bb: inc(-amount) }, { merge: true });
      return ln;
    });
  }
  async function cancelBet(matchKey) {
    const d = db(); if (!d) throw new Error("OFFLINE");
    const uid = me().id;
    const betRef = d.collection("bets").doc(matchKey + "__" + uid), lineRef = d.collection("betlines").doc(matchKey);
    return d.runTransaction(async (tx) => {
      const bs = await tx.get(betRef), ls = await tx.get(lineRef);
      if (!bs.exists) throw new Error("NONE");
      if (!ls.exists || ls.data().status !== "open") throw new Error("LOCKED");
      const b = bs.data();
      if (b.settled) throw new Error("SETTLED");
      tx.delete(betRef);
      tx.set(scRef(d, uid), { id: uid, bb: inc(b.amount || 0) }, { merge: true });
      return b.amount || 0;
    });
  }
  // Pay one bet exactly once.
  function payBet(d, betId, pay, extra) {
    const ref = d.collection("bets").doc(betId);
    return d.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists || s.data().settled) return 0;
      const b = s.data();
      tx.update(ref, Object.assign({ settled: true, payout: pay.payout, refund: !!pay.refund, settledAt: Date.now() }, extra || {}));
      if (pay.payout > 0) tx.set(scRef(d, b.uid), { id: b.uid, bb: inc(pay.payout) }, { merge: true });
      return pay.payout;
    });
  }
  // Pay every unsettled bet on one finished market exactly once, then mark the market
  // FINAL with its result saved. A final market can't reopen, so moving the test event
  // back in time (scores disappear) never pays anyone twice.
  async function settleLine(d, m, ln, bs) {
    if (!ln || ln.void) return 0;
    const res = ln.result || null;
    let out;
    if (res) out = { pool: res.pool, margin: res.margin };
    else if (played(m)) out = outcome(ln, m);
    else return 0;
    const pay = payouts(ln, bs, out, (ln.comp || m.comp_level) !== "qm");
    let n = 0;
    const red = res ? res.red : m.alliances.red.score, blue = res ? res.blue : m.alliances.blue.score;
    for (const b of bs) if (!b.settled) { await payBet(d, b.id, pay[b.id], { outcome: out.pool, red: red == null ? null : red, blue: blue == null ? null : blue }); n++; }
    if (ln.status !== "final") {
      const result = res || { pool: out.pool, margin: out.margin == null ? null : out.margin, red: m.alliances.red.score, blue: m.alliances.blue.score };
      const ref = d.collection("betlines").doc(ln.match || m.key);
      await d.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists || s.data().status === "final") return;
        tx.update(ref, { status: "final", result, settledAt: Date.now() });
      });
    }
    return n;
  }
  // Settle every finished match of the event we're watching. `matches` = TBA list.
  let settling = false;
  async function settleEvent(matches) {
    const d = db(); if (!d || settling || !isReady("lines", "bets")) return 0;
    settling = true; let n = 0;
    try {
      for (const m of matches || []) {
        const ln = cache.lines[m.key];
        if (!ln || ln.void) continue;
        const bs = betsOn(m.key);
        if (ln.status === "final" && !bs.some((b) => !b.settled)) continue;
        if (!played(m) && !ln.result) continue;
        n += await settleLine(d, m, ln, bs);
      }
    } catch (e) { console.warn("[Bets] settle failed", e); } finally { settling = false; }
    return n;
  }
  // My open bets at OTHER events: fetch those events' results and settle them too.
  async function settleMyOtherEvents(fetchMatches) {
    const d = db(); if (!d || !isReady("mine")) return 0;
    const open = Object.values(cache.mine).filter((b) => !b.settled && b.event !== watchedEvent);
    const events = [...new Set(open.map((b) => b.event))];
    let n = 0;
    for (const ev of events) {
      try {
        const ms = await fetchMatches(ev);
        for (const b of open.filter((x) => x.event === ev)) {
          const m = (ms || []).find((x) => x.key === b.match);
          if (!m) continue;
          const [ls, bq] = await Promise.all([d.collection("betlines").doc(m.key).get(), d.collection("bets").where("match", "==", m.key).get()]);
          if (!ls.exists) continue;
          const ln = ls.data();
          if (!played(m) && !ln.result) continue;
          n += await settleLine(d, m, ln, bq.docs.map((x) => x.data()));
        }
      } catch (e) { console.warn("[Bets] settle " + ev + " failed", e); }
    }
    return n;
  }
  // Admin: void a match market (bad data, replay…): everyone gets their stake back.
  async function voidMarket(matchKey, eventKey) {
    const d = db(); if (!d) throw new Error("OFFLINE");
    await d.collection("betlines").doc(matchKey).set({ void: true, event: eventKey, match: matchKey }, { merge: true });
    const q = await d.collection("bets").where("match", "==", matchKey).get();
    let n = 0;
    for (const doc of q.docs) { const b = doc.data(); if (!b.settled) { await payBet(d, b.id, { payout: b.amount || 0, refund: true }, { outcome: "void" }); n++; } }
    return n;
  }
  function matchLabel(m) {
    if (!m) return "";
    if (m.comp_level === "qm") return "Q" + m.match_number;
    if (m.comp_level === "sf") return "Playoff " + m.set_number;
    if (m.comp_level === "f") return "Final " + m.match_number;
    return m.comp_level.toUpperCase() + (m.set_number || "") + "-" + m.match_number;
  }

  /* ---- 2. Alliance-selection predictions ---------------------------------- */
  // grid: array of 8 rows, each [captain, pick1, pick2(, pick3)] team numbers or "".
  // actual: TBA /alliances → picks (["frc254", …]) per alliance in seed order.
  function scoreAlliances(grid, actual) {
    const act = (actual || []).map((a) => (a.picks || []).map((k) => String(k).replace("frc", "")));
    const cells = [];
    let total = 0, filled = 0, exact = 0;
    grid.forEach((row, a) => row.forEach((t, c) => {
      if (!t) { cells.push({ a, c, t: "", kind: "empty", pts: 0 }); return; }
      filled++;
      let kind = "none";
      if (act[a] && act[a][c] === t) kind = "exact";
      else if (act.some((r) => r[c] === t)) kind = "role";
      else if (act.some((r) => r.includes(t))) kind = "on";
      const pts = AP_PAY[kind]; total += pts; if (kind === "exact") exact++;
      cells.push({ a, c, t, kind, pts, actual: act[a] ? act[a][c] || "" : "" });
    }));
    return { total, filled, exact, cells, accuracy: filled ? exact / filled : 0 };
  }
  const apId = (event, uid) => event + "__" + uid;
  async function saveAlliancePred(event, grid, cols) {
    const d = db(); if (!d) throw new Error("OFFLINE");
    const uid = me().id;
    const ref = d.collection("apreds").doc(apId(event, uid));
    return d.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.exists && s.data().settled) throw new Error("SETTLED");
      tx.set(ref, { id: ref.id, event, uid, name: myName(), cols, slots: [].concat(...grid.map((r) => r.slice(0, cols).concat(Array(Math.max(0, cols - r.length)).fill("")))),
        ts: Date.now(), settled: false });
    });
  }
  const gridOf = (doc) => {
    const cols = (doc && doc.cols) || 3, s = (doc && doc.slots) || [];
    return Array.from({ length: 8 }, (_, a) => Array.from({ length: cols }, (_, c) => s[a * cols + c] || ""));
  };
  async function settleAlliancePreds(actual) {
    const d = db(); if (!d || !isReady("apreds") || !actual || actual.length < 8) return 0;
    let n = 0;
    for (const doc of Object.values(cache.apreds)) {
      if (doc.settled) continue;
      const sc = scoreAlliances(gridOf(doc), actual);
      const ref = d.collection("apreds").doc(doc.id);
      try {
        await d.runTransaction(async (tx) => {
          const s = await tx.get(ref); if (!s.exists || s.data().settled) return;
          tx.update(ref, { settled: true, payout: sc.total, exact: sc.exact, filled: sc.filled, settledAt: Date.now() });
          if (sc.total > 0) tx.set(scRef(d, doc.uid), { id: doc.uid, bb: inc(sc.total) }, { merge: true });
        });
        n++;
      } catch (e) { console.warn("[Bets] alliance settle failed", e); }
    }
    return n;
  }

  /* ---- 3. Playoff bracket ------------------------------------------------- */
  // Who plays in a bracket slot under a set of picks: { m1: 1, m2: 5, … } (alliance numbers).
  function bracketParticipants(picks) {
    const res = {};
    const side = (spec) => {
      if (spec.seed) return spec.seed;
      const id = spec.W || spec.L, w = picks[id], p = res[id];
      if (!w || !p) return null;
      if (spec.W) return w;
      return p.red === w ? p.blue : p.red;
    };
    DE8.forEach((m) => { res[m.id] = { red: side(m.red), blue: side(m.blue) }; });
    return res;
  }
  // Drop picks that no longer make sense after an earlier pick changed.
  function cleanPicks(picks) {
    const out = Object.assign({}, picks);
    for (let i = 0; i < 3; i++) {
      const parts = bracketParticipants(out);
      DE8.forEach((m) => { const p = parts[m.id]; if (out[m.id] && (!p || (out[m.id] !== p.red && out[m.id] !== p.blue))) delete out[m.id]; });
    }
    return out;
  }
  // Actual winners from TBA: sf set n ↔ m<n>, finals = best of 3. allianceOf(team) → 1..8.
  function bracketActual(matches, alliances) {
    const seedOf = {};
    (alliances || []).forEach((a, i) => (a.picks || []).concat(a.backup && a.backup.in ? [a.backup.in] : [])
      .forEach((k) => { seedOf[String(k).replace("frc", "")] = i + 1; }));
    const winOf = (m) => {
      if (!played(m)) return null;
      const w = m.winning_alliance || (m.alliances.red.score > m.alliances.blue.score ? "red" : m.alliances.blue.score > m.alliances.red.score ? "blue" : "");
      if (!w) return null;
      const t = teamsOf(m, w).find((x) => seedOf[x]);
      return t ? seedOf[t] : null;
    };
    const res = {};
    (matches || []).filter((m) => m.comp_level === "sf").forEach((m) => { const w = winOf(m); if (w) res["m" + m.set_number] = w; });
    const fins = (matches || []).filter((m) => m.comp_level === "f");
    const wins = {}; fins.forEach((m) => { const w = winOf(m); if (w) wins[w] = (wins[w] || 0) + 1; });
    Object.entries(wins).forEach(([a, n]) => { if (n >= 2) res.f = Number(a); });
    return res;
  }
  function scoreBracket(picks, actual) {
    let total = 0, correct = 0, decided = 0;
    const per = {};
    DE8.forEach((m) => {
      if (!actual[m.id]) return;
      decided++;
      const ok = picks[m.id] === actual[m.id];
      per[m.id] = ok;
      if (ok) { correct++; total += ROUND_BB[m.round]; }
    });
    const perfect = decided === DE8.length && correct === DE8.length;
    return { total: perfect ? total * 2 : total, correct, decided, perfect, per };
  }
  const bracketDone = (picks) => DE8.every((m) => picks && picks[m.id]);
  async function saveBracket(event, picks, submit) {
    const d = db(); if (!d) throw new Error("OFFLINE");
    const uid = me().id;
    const ref = d.collection("brackets").doc(event + "__" + uid);
    return d.runTransaction(async (tx) => {
      const s = await tx.get(ref), prev = s.exists ? s.data() : null;
      if (prev && prev.settled) throw new Error("SETTLED");
      const already = !!(prev && prev.submitted);
      if (submit && !already) {
        if (!bracketDone(picks)) throw new Error("INCOMPLETE");
        const ms = await tx.get(scRef(d, uid));
        if (((ms.exists && ms.data().bb) || 0) < BRACKET_FEE) throw new Error("FUNDS");
        tx.set(scRef(d, uid), { id: uid, bb: inc(-BRACKET_FEE) }, { merge: true });
      }
      if (already && !bracketDone(picks)) throw new Error("INCOMPLETE");
      tx.set(ref, { id: ref.id, event, uid, name: myName(), picks, submitted: already || !!submit,
        submittedAt: already ? prev.submittedAt : (submit ? Date.now() : null), ts: Date.now(), settled: false });
    });
  }
  async function settleBrackets(actual) {
    const d = db(); if (!d || !isReady("brackets") || !actual || !actual.f) return 0;
    let n = 0;
    for (const doc of Object.values(cache.brackets)) {
      if (doc.settled || !doc.submitted) continue;
      const sc = scoreBracket(doc.picks || {}, actual);
      const ref = d.collection("brackets").doc(doc.id);
      try {
        await d.runTransaction(async (tx) => {
          const s = await tx.get(ref); if (!s.exists || s.data().settled) return;
          tx.update(ref, { settled: true, payout: sc.total, correct: sc.correct, perfect: sc.perfect, settledAt: Date.now() });
          if (sc.total > 0) tx.set(scRef(d, doc.uid), { id: doc.uid, bb: inc(sc.total) }, { merge: true });
        });
        n++;
      } catch (e) { console.warn("[Bets] bracket settle failed", e); }
    }
    return n;
  }

  /* ---- 4. Fantasy Alliance ------------------------------------------------- */
  // The fantasy season is the next one to kick off: Aug–Dec plays next year's game.
  function fantasyYear(now) { const d = now || new Date(); return d.getMonth() >= 7 ? d.getFullYear() + 1 : d.getFullYear(); }
  function kickoffAt(year) {
    const c = ((window.CONFIG && CONFIG.countdowns) || []).find((x) => /kickoff/i.test(x.label || "") && String(x.at || "").startsWith(String(year)));
    if (c) return new Date(c.at).getTime();
    const d = new Date(year, 0, 1); while (d.getDay() !== 6) d.setDate(d.getDate() + 1); // first Saturday of January
    d.setHours(9); return d.getTime();
  }
  // Price from last season's EPA rank: #1 = 100 FP, falling off fast, floor 5 FP.
  function priceTable(prevRows) {
    const rows = (prevRows || []).filter((r) => r.epa != null).slice().sort((a, b) => b.epa - a.epa);
    const N = rows.length || 1, map = {};
    rows.forEach((r, i) => { map[String(r.team)] = { price: Math.max(MIN_PRICE, Math.round(100 * Math.pow(1 - i / N, 3))), rank: i + 1, epa: r.epa, name: r.name || "" }; });
    return map;
  }
  const priceOf = (table, t) => (table[String(t)] && table[String(t)].price) || MIN_PRICE;
  const leagueId = (year, lg) => year + "_" + lg;
  const leagueDoc = (year, lg) => cache.fantasy[leagueId(year, lg)] || null;
  const myLeague = (year) => { const uid = me().id; return LEAGUES.map(([k]) => leagueDoc(year, k)).find((L) => L && L.members && L.members[uid]) || null; };
  const members = (L) => Object.entries((L && L.members) || {}).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0)).map(([id, v]) => Object.assign({ id }, v));
  // Whose turn: snake order over ROSTER rounds.
  function draftTurn(L) {
    const dr = L && L.draft; if (!dr || dr.status !== "live") return null;
    const order = dr.order || [], n = order.length, i = (dr.picks || []).length;
    if (!n || i >= n * ROSTER) return null;
    const round = Math.floor(i / n), pos = i % n;
    return { uid: order[round % 2 === 0 ? pos : n - 1 - pos], round: round + 1, pick: i + 1, of: n * ROSTER };
  }
  const takenIn = (L) => { const s = new Set(); Object.values((L && L.rosters) || {}).forEach((r) => (r.teams || []).forEach((t) => s.add(String(t)))); return s; };
  // The most this player can spend on the next team and still afford the rest.
  function maxSpend(r) { const left = ROSTER - ((r && r.teams) || []).length; return ((r && r.fp) ?? FP_START) - MIN_PRICE * Math.max(0, left - 1); }

  function lgTx(year, lg, fn) {
    const d = db(); if (!d) return Promise.reject(new Error("OFFLINE"));
    const ref = d.collection("fantasy").doc(leagueId(year, lg));
    return d.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const L = s.exists ? s.data() : { id: leagueId(year, lg), year, league: lg, members: {}, draft: { status: "waiting" }, rosters: {}, trades: [], weeks: {} };
      const res = await fn(L, tx, d);
      tx.set(ref, L);
      return res;
    });
  }
  function joinLeague(year, lg) {
    const uid = me().id;
    const other = myLeague(year); if (other && other.league !== lg) return Promise.reject(new Error("IN_LEAGUE"));
    return lgTx(year, lg, (L) => {
      if (L.members[uid]) return;
      L.members[uid] = { name: myName(), joinedAt: Date.now() };
      if (L.draft.status !== "waiting") L.rosters[uid] = { teams: [], fp: FP_START, lineups: {} }; // late joiner: free agents only
    });
  }
  function leaveLeague(year, lg) {
    const uid = me().id;
    return lgTx(year, lg, (L) => {
      if (L.draft.status !== "waiting") throw new Error("DRAFTED");
      delete L.members[uid];
    });
  }
  function startDraft(year, lg) {
    return lgTx(year, lg, (L) => {
      if (L.draft.status !== "waiting") return false;
      const ids = Object.keys(L.members);
      if (ids.length < 2) throw new Error("TOO_FEW");
      for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      L.draft = { status: "live", order: ids, picks: [], startedAt: Date.now(), turnStartedAt: Date.now() };
      L.rosters = {}; ids.forEach((id) => { L.rosters[id] = { teams: [], fp: FP_START, lineups: {} }; });
      return true;
    });
  }
  // Draft a team (me, or anyone's turn after AUTO_PICK_MS via auto=true).
  function draftPick(year, lg, team, table, auto) {
    team = String(team);
    return lgTx(year, lg, (L) => {
      const turn = draftTurn(L); if (!turn) throw new Error("NOT_LIVE");
      if (!auto && turn.uid !== me().id) throw new Error("NOT_TURN");
      if (auto && Date.now() - (L.draft.turnStartedAt || 0) < AUTO_PICK_MS && turn.uid !== me().id) throw new Error("WAIT");
      const r = L.rosters[turn.uid] || (L.rosters[turn.uid] = { teams: [], fp: FP_START, lineups: {} });
      const taken = takenIn(L);
      let pick = team;
      if (auto) { // best affordable team left
        const cap = maxSpend(r);
        pick = Object.entries(table).filter(([t, v]) => !taken.has(t) && v.price <= cap).sort((a, b) => b[1].price - a[1].price || a[1].rank - b[1].rank)[0];
        pick = pick ? pick[0] : null;
        if (!pick) throw new Error("NONE");
      }
      if (taken.has(pick)) throw new Error("TAKEN");
      const price = priceOf(table, pick);
      if (price > maxSpend(r)) throw new Error("FP");
      r.teams.push(pick); r.fp = (r.fp ?? FP_START) - price;
      L.draft.picks.push({ uid: turn.uid, team: pick, price, ts: Date.now(), auto: !!auto });
      L.draft.turnStartedAt = Date.now();
      if (!draftTurn(L)) { L.draft.status = "done"; L.draft.doneAt = Date.now(); Object.values(L.rosters).forEach((x) => { x.bench = x.teams[ROSTER - 1] || null; }); }
      return pick;
    });
  }
  // Bench a team from the next week that hasn't locked yet onwards.
  function setBench(year, lg, team, week) {
    const uid = me().id;
    return lgTx(year, lg, (L) => {
      const r = L.rosters[uid]; if (!r || !(r.teams || []).includes(String(team))) throw new Error("NOT_YOURS");
      r.lineups = r.lineups || {}; r.lineups[week] = String(team); // earlier weeks keep their own bench
    });
  }
  // Free agent: drop one of mine, add an unrostered team; costs its FP, FP never refunds.
  function freeAgent(year, lg, drop, add, table, week) {
    const uid = me().id; drop = String(drop); add = String(add);
    return lgTx(year, lg, (L) => {
      if (L.draft.status === "live") throw new Error("DRAFTING");
      const r = L.rosters[uid] || (L.rosters[uid] = { teams: [], fp: FP_START, lineups: {} });
      if (takenIn(L).has(add)) throw new Error("TAKEN");
      const price = priceOf(table, add);
      if (drop && !r.teams.includes(drop)) throw new Error("NOT_YOURS");
      if (!drop && r.teams.length >= ROSTER) throw new Error("FULL");
      if (price > (r.fp ?? FP_START) - (drop ? 0 : MIN_PRICE * Math.max(0, ROSTER - r.teams.length - 1))) throw new Error("FP");
      const wasBench = drop && benchFor(r, week) === drop;
      if (drop) r.teams = r.teams.map((t) => t === drop ? add : t); else r.teams.push(add);
      r.fp = (r.fp ?? FP_START) - price;
      r.lineups = r.lineups || {};
      if (wasBench) r.lineups[week] = add;
      if (r.teams.length === ROSTER && !r.bench) r.bench = r.teams[ROSTER - 1];
      (L.moves = L.moves || []).push({ uid, drop, add, price, ts: Date.now() });
    });
  }
  function proposeTrade(year, lg, to, give, get) {
    const uid = me().id;
    return lgTx(year, lg, (L) => {
      const a = L.rosters[uid], b = L.rosters[to];
      if (!a || !b || !a.teams.includes(String(give)) || !b.teams.includes(String(get))) throw new Error("BAD_TRADE");
      L.trades = (L.trades || []).filter((t) => !(t.status === "pending" && t.from === uid && t.to === to && t.give === String(give) && t.get === String(get)));
      L.trades.push({ id: Math.random().toString(36).slice(2, 9), from: uid, to, give: String(give), get: String(get), status: "pending", ts: Date.now() });
    });
  }
  function answerTrade(year, lg, id, accept, week) {
    const uid = me().id;
    return lgTx(year, lg, (L) => {
      const t = (L.trades || []).find((x) => x.id === id);
      if (!t || t.status !== "pending") throw new Error("GONE");
      if (t.to !== uid && !(t.from === uid && !accept)) throw new Error("NOT_YOURS");
      if (!accept) { t.status = t.from === uid ? "cancelled" : "declined"; return; }
      const a = L.rosters[t.from], b = L.rosters[t.to];
      if (!a.teams.includes(t.give) || !b.teams.includes(t.get)) { t.status = "expired"; return; }
      const aBench = benchFor(a, week) === t.give, bBench = benchFor(b, week) === t.get;
      a.teams = a.teams.map((x) => x === t.give ? t.get : x);
      b.teams = b.teams.map((x) => x === t.get ? t.give : x);
      a.lineups = a.lineups || {}; b.lineups = b.lineups || {};
      if (aBench) a.lineups[week] = t.get;
      if (bBench) b.lineups[week] = t.give;
      t.status = "accepted"; t.doneAt = Date.now();
    });
  }
  function benchFor(r, week) {
    if (!r) return null;
    const keys = Object.keys(r.lineups || {}).map(Number).filter((w) => w <= week).sort((a, b) => b - a);
    const b = keys.length ? r.lineups[keys[0]] : (r.bench || (r.teams || [])[ROSTER - 1]);
    return (r.teams || []).includes(b) ? b : (r.teams || [])[ROSTER - 1] || null;
  }
  const activeFor = (r, week) => { const b = benchFor(r, week); return ((r && r.teams) || []).filter((t) => t !== b).slice(0, 3); };

  // Season weeks from TBA's official week numbers (full /events/{year}): regionals and
  // districts by week (postponed one-offs late in the year are ignored), then Champs.
  function seasonWeeks(events) {
    const day = (str) => { const [y, m, d] = str.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
    const byWk = {};
    (events || []).forEach((e) => {
      if (!e.start_date) return;
      let k = null;
      if ([0, 1, 2, 5].includes(e.event_type) && e.week != null && e.week <= 8) k = e.week;
      else if (e.event_type === 3 || e.event_type === 4) k = 100;
      if (k != null) (byWk[k] = byWk[k] || []).push(e);
    });
    return Object.keys(byWk).map(Number).sort((a, b) => a - b).map((k, i) => {
      const evs = byWk[k];
      return { idx: i, label: k === 100 ? "Champs" : "Week " + (k + 1),
        lock: Math.min(...evs.map((e) => day(e.start_date))),
        end: Math.max(...evs.map((e) => day(e.end_date || e.start_date))) + 864e5,
        events: evs.map((e) => e.key) };
    });
  }
  const openWeek = (weeks) => { const w = (weeks || []).find((x) => Date.now() < x.lock); return w ? w.idx : (weeks.length ? weeks[weeks.length - 1].idx + 1 : 0); };
  // Round-robin pairing for week k (circle method; odd count → one bye).
  function pairings(ids, k) {
    const a = ids.slice(); if (a.length < 2) return [];
    if (a.length % 2) a.push(null);
    const n = a.length, r = k % (n - 1);
    const rest = a.slice(1); const rot = rest.slice(rest.length - r).concat(rest.slice(0, rest.length - r));
    const arr = [a[0]].concat(rot), out = [];
    for (let i = 0; i < n / 2; i++) out.push([arr[i], arr[n - 1 - i]]);
    return out.filter(([x, y]) => x || y);
  }
  // Lineups freeze when a week locks: the first device to notice saves who was active.
  function snapWeek(year, lg, idx) {
    return lgTx(year, lg, (L) => {
      L.snaps = L.snaps || {};
      if (L.snaps[idx]) return false;
      const snap = {};
      Object.entries(L.rosters || {}).forEach(([id, r]) => { snap[id] = activeFor(r, idx); });
      L.snaps[idx] = snap;
      return true;
    });
  }
  const lineupFor = (L, id, idx) => (L.snaps && L.snaps[idx] && L.snaps[idx][id]) || activeFor(L.rosters && L.rosters[id], idx);
  // ptsOf(team) → RP that team earned in this week's events (supplied by the UI).
  function weekScores(L, week, ptsOf) {
    const ids = members(L).map((m) => m.id).filter((id) => L.rosters && L.rosters[id]);
    return pairings(ids, week.idx).map(([a, b]) => {
      const pa = a ? lineupFor(L, a, week.idx).reduce((s, t) => s + (ptsOf(t) || 0), 0) : 0;
      const pb = b ? lineupFor(L, b, week.idx).reduce((s, t) => s + (ptsOf(t) || 0), 0) : 0;
      return { a, b, pa, pb, winner: !a || !b ? (a || b) : pa > pb ? a : pb > pa ? b : "tie" };
    });
  }
  function standings(L) {
    const rows = {};
    members(L).forEach((m) => { rows[m.id] = { id: m.id, name: m.name, w: 0, l: 0, t: 0, pts: 0, bb: 0 }; });
    Object.values((L && L.weeks) || {}).forEach((wk) => (wk.results || []).forEach((g) => {
      if (!g.a || !g.b) return;
      [[g.a, g.pa], [g.b, g.pb]].forEach(([id, p]) => { if (rows[id]) rows[id].pts += p; });
      if (g.winner === "tie") { if (rows[g.a]) rows[g.a].t++; if (rows[g.b]) rows[g.b].t++; }
      else { const lo = g.winner === g.a ? g.b : g.a; if (rows[g.winner]) rows[g.winner].w++; if (rows[lo]) rows[lo].l++; }
    }));
    return Object.values(rows).sort((x, y) => (y.w + y.t / 2) - (x.w + x.t / 2) || y.pts - x.pts || x.name.localeCompare(y.name));
  }
  // Pay a finished week (250 BB to each winner, 125 each on a tie) exactly once.
  function settleWeek(year, lg, week, results) {
    return lgTx(year, lg, (L, tx, d) => {
      L.weeks = L.weeks || {};
      if (L.weeks[week.idx] && L.weeks[week.idx].settled) return false;
      L.weeks[week.idx] = { settled: true, label: week.label, results, settledAt: Date.now() };
      results.forEach((g) => {
        if (!g.a || !g.b) return;
        if (g.winner === "tie") [g.a, g.b].forEach((id) => tx.set(scRef(d, id), { id, bb: inc(WEEK_WIN / 2) }, { merge: true }));
        else tx.set(scRef(d, g.winner), { id: g.winner, bb: inc(WEEK_WIN) }, { merge: true });
      });
      return true;
    });
  }
  function payChampion(year, lg, weeksTotal) {
    return lgTx(year, lg, (L, tx, d) => {
      if (L.champ && L.champ.paid) return null;
      if (Object.values(L.weeks || {}).filter((w) => w.settled).length < weeksTotal) return null;
      const top = standings(L)[0]; if (!top) return null;
      L.champ = { uid: top.id, name: top.name, paid: true, at: Date.now() };
      tx.set(scRef(d, top.id), { id: top.id, bb: inc(GRAND_PRIZE) }, { merge: true });
      return top;
    });
  }

  return {
    POOLS, SEED, PLAYOFF_MULT, AP_PAY, ROUND_BB, BRACKET_FEE, DE8, FP_START, ROSTER, MIN_PRICE, WEEK_WIN, GRAND_PRIZE, AUTO_PICK_MS, LEAGUES,
    cache, watch, isReady, onChange: (cb) => { cbs.push(cb); return () => { cbs = cbs.filter((x) => x !== cb); }; }, _inject,
    played, teamsOf, isPlayoff, matchOrder, matchState, matchLabel,
    makeLine, outcome, poolLabels, pools, betsOn, estMultiplier, payouts, openMarket, lockMarket, placeBet, cancelBet, settleEvent, settleMyOtherEvents, voidMarket,
    scoreAlliances, gridOf, saveAlliancePred, settleAlliancePreds,
    bracketParticipants, cleanPicks, bracketActual, scoreBracket, bracketDone, saveBracket, settleBrackets,
    fantasyYear, kickoffAt, priceTable, priceOf, leagueDoc, myLeague, members, draftTurn, takenIn, maxSpend,
    joinLeague, leaveLeague, startDraft, draftPick, setBench, freeAgent, proposeTrade, answerTrade, benchFor, activeFor,
    seasonWeeks, openWeek, pairings, weekScores, standings, settleWeek, payChampion, snapWeek, lineupFor,
  };
})();

window.Bets = Bets;
