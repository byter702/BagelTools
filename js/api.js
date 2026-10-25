/* =============================================================================
   api.js  —  The Blue Alliance (TBA) + frc-colors integration
   -----------------------------------------------------------------------------
   All calls are READ-ONLY GETs. Results are cached in localStorage so that once
   you've loaded an event at home (with wifi), the team list / schedule / colors
   are available offline at the venue. The TBA key is stored only in the user's
   browser and sent only to thebluealliance.com.
   ========================================================================== */

const API = (() => {
  const TBA_BASE = "https://www.thebluealliance.com/api/v3";
  const COLORS_BASE = "https://api.frc-colors.com/v1";

  function teamKey(n) { return "frc" + String(n).replace(/\D/g, ""); }

  // A scout's own key (Settings → Advanced) wins; otherwise use the built-in one.
  function effectiveKey() {
    const own = (Store.getSettings().tbaKey || "").trim();
    if (own) return own;
    return (window.CONFIG && window.CONFIG.defaultTbaKey || "").trim();
  }
  function hasKey() { return !!effectiveKey(); }

  async function tba(path) {
    const key = effectiveKey();
    if (!key) throw new Error("NO_KEY");
    const res = await fetch(TBA_BASE + path, {
      headers: { "X-TBA-Auth-Key": key, "accept": "application/json" },
    });
    if (res.status === 401) throw new Error("BAD_KEY");
    if (!res.ok) throw new Error("TBA_" + res.status);
    return res.json();
  }

  // Try network; on failure fall back to cache (offline-first).
  async function cachedTba(cacheName, path) {
    try {
      const data = await tba(path);
      Store.setCache(cacheName, { data, ts: Date.now() });
      return { data, fromCache: false };
    } catch (e) {
      const cached = Store.getCache(cacheName, null);
      if (cached) return { data: cached.data, fromCache: true, cachedAt: cached.ts };
      throw e;
    }
  }

  async function verifyKey() {
    // /status is the lightest authenticated endpoint.
    await tba("/status");
    return true;
  }

  async function getEvents(year) {
    const { data, fromCache, cachedAt } = await cachedTba("events." + year, "/events/" + year + "/simple");
    // Sort by start date, most relevant first.
    data.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
    return { events: data, fromCache, cachedAt };
  }

  // The admin "test event" (2026test) is synthesized locally, never on TBA —
  // serve its cached team list / schedule directly instead of hitting the API.
  const TEST_EVENT_KEY = "2026test";

  async function getEventTeams(eventKey) {
    if (eventKey === TEST_EVENT_KEY) {
      const c = Store.getCache("teams." + eventKey, null);
      return { teams: (c && c.data) || [], fromCache: true, cachedAt: c && c.ts };
    }
    const { data, fromCache, cachedAt } =
      await cachedTba("teams." + eventKey, "/event/" + eventKey + "/teams/simple");
    data.sort((a, b) => a.team_number - b.team_number);
    return { teams: data, fromCache, cachedAt };
  }

  async function getEventMatches(eventKey) {
    if (eventKey === TEST_EVENT_KEY) {
      const c = Store.getCache("matches." + eventKey, null);
      return { matches: (c && c.data) || [], fromCache: true, cachedAt: c && c.ts };
    }
    // full matches (not /simple) so we get score_breakdown for auto/teleop/endgame EPA
    const { data, fromCache, cachedAt } =
      await cachedTba("matches." + eventKey, "/event/" + eventKey + "/matches");
    return { matches: data, fromCache, cachedAt };
  }

  async function getEventRankings(eventKey) {
    if (eventKey === TEST_EVENT_KEY) {
      const c = Store.getCache("matches." + eventKey, null);
      return { rankings: rankingsFromMatches((c && c.data) || []), fromCache: true };
    }
    const { data, fromCache, cachedAt } =
      await cachedTba("rankings." + eventKey, "/event/" + eventKey + "/rankings");
    return { rankings: (data && data.rankings) || [], fromCache, cachedAt };
  }

  // Compute standings from played matches (used by the synthetic test event, and
  // as an offline fallback). RP-style scoring: win=2, tie=1, loss=0; primary sort
  // is average ranking points, matching how modern TBA rankings sort.
  function rankingsFromMatches(matches) {
    const scored = (m) => m && m.alliances && m.alliances.red.score >= 0 && m.alliances.blue.score >= 0;
    const stat = {}; // teamKey -> {rp, w, l, t, played}
    const bump = (keys, rp, res) => (keys || []).forEach((k) => {
      const s = stat[k] || (stat[k] = { rp: 0, w: 0, l: 0, t: 0, played: 0 });
      s.rp += rp; s.played++; s[res]++;
    });
    matches.filter((m) => m.comp_level === "qm" && scored(m)).forEach((m) => {
      const rs = m.alliances.red.score, bs = m.alliances.blue.score;
      const rk = m.alliances.red.team_keys, bk = m.alliances.blue.team_keys;
      if (rs > bs) { bump(rk, 2, "w"); bump(bk, 0, "l"); }
      else if (bs > rs) { bump(rk, 0, "l"); bump(bk, 2, "w"); }
      else { bump(rk, 1, "t"); bump(bk, 1, "t"); }
    });
    return Object.keys(stat).map((k) => {
      const s = stat[k];
      return { team_key: k, sort_orders: [s.played ? s.rp / s.played : 0],
        record: { wins: s.w, losses: s.l, ties: s.t } };
    }).sort((a, b) =>
      b.sort_orders[0] - a.sort_orders[0] ||
      b.record.wins - a.record.wins ||
      (+a.team_key.replace("frc", "")) - (+b.team_key.replace("frc", ""))
    ).map((r, i) => { r.rank = i + 1; return r; });
  }

  /* TBA team avatar (40x40 PNG). Cached per team; "" means "no avatar" so we
     don't refetch. Returns a data: URL or null. */
  async function getTeamAvatar(team) {
    team = String(team);
    const cache = Store.getCache("avatars", {});
    if (Object.prototype.hasOwnProperty.call(cache, team)) return cache[team] || null;
    try {
      const year = (window.GAME && window.GAME.season) || 2026;
      const media = await tba("/team/frc" + team + "/media/" + year);
      const av = Array.isArray(media) ? media.find((m) => m.type === "avatar") : null;
      const url = av && av.details && av.details.base64Image ? "data:image/png;base64," + av.details.base64Image : "";
      cache[team] = url;
      // soft cap to protect quota
      const keys = Object.keys(cache);
      if (keys.length > 600) keys.slice(0, 200).forEach((k) => delete cache[k]);
      Store.setCache("avatars", cache);
      return url || null;
    } catch (e) { return null; } // don't cache failures — allow retry
  }

  /* frc-colors: batch endpoint /v1/team?team=1&team=2 ...
     Response shape: { teams: { "254": { colors: { primaryHex, secondaryHex } } } }
     No auth required. We cache aggressively since colors rarely change. */
  async function getTeamColors(teamNumbers) {
    const cache = Store.getCache("colors", {});
    const missing = teamNumbers.filter((n) => !cache[n]);
    if (missing.length) {
      try {
        // frc-colors caps batch size; chunk to be safe.
        for (let i = 0; i < missing.length; i += 100) {
          const chunk = missing.slice(i, i + 100);
          const qs = chunk.map((n) => "team=" + encodeURIComponent(n)).join("&");
          const res = await fetch(COLORS_BASE + "/team?" + qs, { headers: { accept: "application/json" } });
          if (res.ok) {
            const json = await res.json();
            const teams = json.teams || {};
            chunk.forEach((n) => {
              const c = teams[n] && teams[n].colors;
              cache[n] = c
                ? { primary: c.primaryHex, secondary: c.secondaryHex, verified: !!c.verified }
                : { primary: null, secondary: null, verified: false };
            });
          }
        }
        Store.setCache("colors", cache);
      } catch (e) {
        console.warn("frc-colors fetch failed (using cache/fallback)", e);
      }
    }
    const out = {};
    teamNumbers.forEach((n) => { out[n] = cache[n] || { primary: null, secondary: null, verified: false }; });
    return out;
  }

  /* ---- Statbotics (BagelStats) — public, keyless -------------------------- */
  const SB_BASE = (window.CONFIG && window.CONFIG.statboticsBase) || "https://api.statbotics.io/v3";
  async function sbFetch(path) {
    const res = await fetch(SB_BASE + path, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("SB_" + res.status);
    return res.json();
  }
  async function sbCached(cacheName, path) {
    try {
      const data = await sbFetch(path);
      Store.setCache(cacheName, { data, ts: Date.now() });
      return { data, fromCache: false };
    } catch (e) {
      const c = Store.getCache(cacheName, null);
      if (c) return { data: c.data, fromCache: true, cachedAt: c.ts };
      throw e;
    }
  }

  // Tolerant extractors — Statbotics v3 nests EPA under `epa`; shapes vary a
  // little between seasons, so probe several known paths.
  function sbEpa(row) {
    if (!row) return null;
    const e = row.epa;
    if (e == null) return firstNum(row.total_epa, row.epa_end, row.norm_epa);
    if (typeof e === "number") return e;
    return firstNum(
      e.breakdown && e.breakdown.total_points,
      e.total_points && e.total_points.mean,
      typeof e.total_points === "number" ? e.total_points : null,
      e.mean, e.unitless, e.norm
    );
  }
  function sbBreakdown(row) {
    const b = (row && row.epa && row.epa.breakdown) || {};
    return {
      auto: firstNum(b.auto_points, b.auto),
      teleop: firstNum(b.teleop_points, b.teleop),
      endgame: firstNum(b.endgame_points, b.endgame),
    };
  }
  function sbTeam(row) { return String(firstNum(row.team, row.team_num, row.num) ?? row.team ?? ""); }
  function sbName(row) { return row.name || row.team_name || ""; }
  function sbState(row) { return row.state || (row.epa && row.epa.state) || row.state_prov || null; }
  function sbRecord(row) {
    const r = (row.record && (row.record.season || row.record.qual || row.record)) || {};
    return { w: firstNum(r.wins) || 0, l: firstNum(r.losses) || 0, t: firstNum(r.ties) || 0 };
  }
  function firstNum(...vals) {
    for (const v of vals) if (typeof v === "number" && !isNaN(v)) return v;
    return null;
  }

  function sbRankObj(r, which) {
    const ranks = r && r.epa && r.epa.ranks;
    const o = ranks && ranks[which];
    return o && typeof o.rank === "number" ? { rank: o.rank, count: o.team_count } : null;
  }
  function sbDistrict(r) { return (r.district || (r.epa && r.epa.district) || null); }
  function processYear(data) {
    const rows = (Array.isArray(data) ? data : [])
      .map((r) => ({ team: sbTeam(r), name: sbName(r), state: sbState(r), district: sbDistrict(r),
        epa: sbEpa(r), breakdown: sbBreakdown(r), record: sbRecord(r),
        // official ranks straight from Statbotics (fallback filled in below)
        worldRank: (sbRankObj(r, "total") || {}).rank ?? null,
        worldCount: (sbRankObj(r, "total") || {}).count ?? null,
        stateRank: (sbRankObj(r, "state") || {}).rank ?? null,
        stateCount: (sbRankObj(r, "state") || {}).count ?? null,
        districtRank: (sbRankObj(r, "district") || {}).rank ?? null,
        districtCount: (sbRankObj(r, "district") || {}).count ?? null }))
      .filter((r) => r.epa != null)
      .sort((a, b) => b.epa - a.epa);
    rows.forEach((r, i) => { if (r.worldRank == null) r.worldRank = i + 1; });
    const sc = {}, dc = {};
    rows.forEach((r) => {
      if (r.state && r.stateRank == null) { sc[r.state] = (sc[r.state] || 0) + 1; r.stateRank = sc[r.state]; }
      if (r.district && r.districtRank == null) { dc[r.district] = (dc[r.district] || 0) + 1; r.districtRank = dc[r.district]; }
    });
    return rows;
  }
  // Full-year leaderboard for EVERY active team (paginated, 1000/page; API caps limit at 1000).
  // We cache the MINIMAL processed rows (not the huge raw objects) to protect the storage quota.
  // Past seasons (BagelStats year picker) live only in memory — each full leaderboard
  // is ~1MB, and localStorage needs that room for the current season + offline data.
  const memYears = {};
  // maxAgeMs: reuse a saved copy younger than this instead of re-downloading ~4 pages.
  async function sbYearLeaderboard(year, maxAgeMs) {
    const cacheName = "sb.years." + year;
    const persist = Number(year) === Number(window.GAME && GAME.season);
    if (!persist && memYears[year]) return { rows: memYears[year], fromCache: true };
    if (persist && maxAgeMs) {
      const c = Store.getCache(cacheName, null);
      if (c && c.rows && Date.now() - (c.ts || 0) < maxAgeMs) return { rows: c.rows, fromCache: false, savedAt: c.ts };
    }
    try {
      let all = [], off = 0;
      while (off <= 20000) {
        const data = await sbFetch(`/team_years?year=${year}&metric=epa&ascending=false&limit=1000&offset=${off}`);
        if (!Array.isArray(data) || !data.length) break;
        all = all.concat(data);
        if (data.length < 1000) break;
        off += 1000;
      }
      const rows = processYear(all);
      if (persist) Store.setCache(cacheName, { rows, ts: Date.now() }); else memYears[year] = rows;
      return { rows, fromCache: false };
    } catch (e) {
      const c = Store.getCache(cacheName, null);
      if (c && c.rows) return { rows: c.rows, fromCache: true, cachedAt: c.ts };
      throw e;
    }
  }
  // Synchronous read of the already-cached (already-processed) leaderboard, or null.
  function sbCachedLeaderboard(year) {
    if (memYears[year]) return memYears[year];
    const c = Store.getCache("sb.years." + year, null);
    return c && c.rows ? c.rows : null;
  }

  // A team's per-match EPA over the year (for the EPA-over-time line graph).
  // Cache only the trimmed rows (the raw payload is ~150KB per team — too big for the quota).
  async function sbTeamMatches(team, year) {
    const cacheName = "sb.tm." + team + "." + year;
    const t = String(team);
    const trim = (arr) => (Array.isArray(arr) ? arr : []).map((m) => {
      const e = m.epas && m.epas[t];
      return { event: m.event, week: m.week, time: m.time || m.predicted_time || 0,
        epa: e ? e.epa : null,
        auto: e ? firstNum(e.auto_epa) : null, teleop: e ? firstNum(e.teleop_epa) : null, endgame: e ? firstNum(e.endgame_epa) : null,
        offseason: (m.week == null) };
    }).filter((r) => r.epa != null).sort((a, b) => (a.time || 0) - (b.time || 0));
    try {
      const data = await sbFetch("/matches?team=" + team + "&year=" + year + "&limit=300");
      const rows = trim(data);
      Store.setCache(cacheName, { rows, ts: Date.now() });
      return rows;
    } catch (e) {
      const c = Store.getCache(cacheName, null);
      if (c && c.rows) return c.rows;
      throw e;
    }
  }

  // A single team's per-event EPA rows for the year (last-event EPA, team profile).
  async function sbTeamEvents(team, year) {
    const { data, fromCache } = await sbCached("sb.te." + team + "." + year,
      "/team_events?team=" + team + "&year=" + year + "&limit=100");
    const rows = (Array.isArray(data) ? data : []).map((r) => {
      const rec = r.record || {}, q = rec.qual || {}, tot = rec.total || {};
      return {
        team: sbTeam(r), event: r.event, name: r.event_name || r.name,
        week: firstNum(r.week), epa: sbEpa(r), breakdown: sbBreakdown(r),
        rank: firstNum(q.rank), numTeams: firstNum(q.num_teams),
        record: { w: firstNum(tot.wins) || 0, l: firstNum(tot.losses) || 0, t: firstNum(tot.ties) || 0, winrate: firstNum(tot.winrate) },
      };
    });
    return { rows, fromCache };
  }

  // One team's season summary from Statbotics: EPA + breakdown, official ranks, record.
  async function sbTeamYear(team, year) {
    const { data, fromCache } = await sbCached("sb.ty." + team + "." + year, "/team_year/" + team + "/" + year);
    const ranks = (data && data.epa && data.epa.ranks) || {};
    const rk = (o) => (o && typeof o.rank === "number") ? { rank: o.rank, count: o.team_count, pct: firstNum(o.percentile) } : null;
    const rec = (data && data.record) || {};
    return {
      fromCache, epa: sbEpa(data), breakdown: sbBreakdown(data),
      country: data && data.country, state: data && data.state, district: data && data.district,
      ranks: { world: rk(ranks.total), country: rk(ranks.country), state: rk(ranks.state), district: rk(ranks.district) },
      record: { w: firstNum(rec.wins) || 0, l: firstNum(rec.losses) || 0, t: firstNum(rec.ties) || 0, winrate: firstNum(rec.winrate) },
    };
  }

  // Every season a team played on Statbotics: EPA (points + normalized), world rank, record.
  async function sbTeamHistory(team) {
    const { data } = await sbCached("sb.th." + team, "/team_years?team=" + team + "&limit=100");
    return (Array.isArray(data) ? data : []).map((r) => {
      const e = r.epa || {}, rk = e.ranks && e.ranks.total, rec = r.record || {};
      return {
        year: r.year, epa: sbEpa(r), norm: firstNum(e.norm, e.unitless),
        worldRank: rk ? firstNum(rk.rank) : null, worldCount: rk ? firstNum(rk.team_count) : null, pct: rk ? firstNum(rk.percentile) : null,
        record: { w: firstNum(rec.wins) || 0, l: firstNum(rec.losses) || 0, t: firstNum(rec.ties) || 0 },
      };
    }).sort((a, b) => a.year - b.year);
  }
  /* ---- Browsing other events / years (universal search + Event Search) ----
     Held in memory only, so exploring never fills the localStorage needed for
     the selected event's offline data. */
  const memTba = {}, memSb = {};
  function tbaMem(path) {
    if (!memTba[path]) memTba[path] = tba(path).catch((e) => { delete memTba[path]; throw e; });
    return memTba[path];
  }
  function sbMem(path) {
    if (!memSb[path]) memSb[path] = sbFetch(path).catch((e) => { delete memSb[path]; throw e; });
    return memSb[path];
  }
  // Each team's EPA after its LAST offseason event of a year → { team: {epa, breakdown, event, eventName} }.
  const memOff = {};
  function sbOffseasonEpa(year) {
    if (!memOff[year]) memOff[year] = (async () => {
      let all = [], off = 0;
      while (off <= 20000) {
        const data = await sbFetch(`/team_events?year=${year}&type=offseason&limit=1000&offset=${off}`);
        if (!Array.isArray(data) || !data.length) break;
        all = all.concat(data);
        if (data.length < 1000) break;
        off += 1000;
      }
      const map = {};
      all.forEach((r) => {
        const t = sbTeam(r), e = sbEpa(r);
        if (!t || e == null) return;
        if (map[t] && (map[t].time || 0) >= (r.time || 0)) return;
        map[t] = { epa: e, breakdown: sbBreakdown(r), event: r.event, eventName: r.event_name || r.event, time: r.time || 0 };
      });
      return map;
    })().catch((e) => { delete memOff[year]; throw e; });
    return memOff[year];
  }
  // Short-lived memory cache for live data (alliances, schedules, rankings).
  const memTtl = {};
  function tbaTtl(path, ttlMs) {
    const c = memTtl[path];
    if (c && Date.now() - c.at < ttlMs) return c.p;
    const p = tba(path).catch((e) => { if (memTtl[path] && memTtl[path].p === p) delete memTtl[path]; throw e; });
    memTtl[path] = { at: Date.now(), p };
    return p;
  }
  // Bagel Bets: Statbotics' per-match predictions for an event → { matchKey: {redWin, redScore, blueScore} }.
  const memPreds = {};
  async function sbEventPreds(eventKey, ttlMs = 60000) {
    const c = memPreds[eventKey];
    if (c && Date.now() - c.at < ttlMs) return c.map;
    const rows = await sbFetch("/matches?event=" + eventKey + "&limit=500");
    const map = {};
    (Array.isArray(rows) ? rows : []).forEach((m) => {
      const p = m.pred || {};
      if (p.red_win_prob == null) return;
      map[m.key] = { redWin: Number(p.red_win_prob), redScore: Number(p.red_score) || 0, blueScore: Number(p.blue_score) || 0 };
    });
    memPreds[eventKey] = { at: Date.now(), map };
    return map;
  }
  // The admin test event is built on the device: its schedule, alliances and info never touch TBA.
  const testCached = (name) => { const c = Store.getCache(name, null); return (c && c.data) || []; };
  const eventMatchesLive = (key, ttlMs = 45000) => key === TEST_EVENT_KEY ? Promise.resolve(testCached("matches." + key))
    : tbaTtl("/event/" + key + "/matches/simple", ttlMs).then((d) => Array.isArray(d) ? d : []);
  const eventAlliances = (key, ttlMs = 60000) => key === TEST_EVENT_KEY ? Promise.resolve(testCached("alliances." + key))
    : tbaTtl("/event/" + key + "/alliances", ttlMs).then((d) => Array.isArray(d) ? d : []);
  const eventRankingsLive = (key, ttlMs = 300000) => tbaTtl("/event/" + key + "/rankings", ttlMs);
  // TBA's OPR for an event (TBA → event → Insights) as { frc254: 61.2, … }, or null.
  const eventOprs = (key) => key === TEST_EVENT_KEY ? Promise.resolve(null)
    : tbaTtl("/event/" + key + "/oprs", 600000).then((d) => (d && d.oprs) || null).catch(() => null);
  const eventInfo = (key) => key === TEST_EVENT_KEY
    ? Promise.resolve({ key, name: "Test event", year: Number(key.slice(0, 4)), event_type: 99, playoff_type: 10, playoff_type_string: "Double Elimination Bracket (8 Alliances)" })
    : tbaMem("/event/" + key);
  const eventsFullYear = (year) => tbaMem("/events/" + year).then((d) => Array.isArray(d) ? d : []); // has official week numbers
  // A team's events in a year (fantasy scoring). Saved for 12h — it rarely changes.
  async function teamEventKeys(team, year) {
    const name = "tev." + team + "." + year, c = Store.getCache(name, null);
    if (c && Date.now() - c.ts < 12 * 3600000) return c.data;
    try {
      const d = await tba("/team/frc" + team + "/events/" + year + "/keys");
      Store.setCache(name, { data: d || [], ts: Date.now() });
      return d || [];
    } catch (e) { if (c) return c.data; throw e; }
  }
  async function eventsForYear(year) {
    if (Number(year) === Number(window.GAME && GAME.season)) {
      try { return (await getEvents(year)).events; } catch (e) { /* fall through to memory */ }
    }
    const d = await tbaMem("/events/" + year + "/simple");
    return (Array.isArray(d) ? d : []).slice().sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  }
  // Everything about one event: info, teams, rankings, matches, awards (+ Statbotics EPA per team).
  async function getEventDetail(key) {
    const opt = (p) => tbaMem(p).catch(() => null);
    const [info, teams, rankings, matches, awards, sb] = await Promise.all([
      tbaMem("/event/" + key), opt("/event/" + key + "/teams/simple"), opt("/event/" + key + "/rankings"),
      opt("/event/" + key + "/matches"), opt("/event/" + key + "/awards"), // full matches: they carry the match videos
      sbMem("/team_events?event=" + key + "&limit=200").catch(() => null),
    ]);
    const epa = {};
    (Array.isArray(sb) ? sb : []).forEach((r) => { epa[sbTeam(r)] = { epa: sbEpa(r), breakdown: sbBreakdown(r) }; });
    return { info, teams: (teams || []).slice().sort((a, b) => a.team_number - b.team_number),
      rankings: (rankings && rankings.rankings) || [], matches: matches || [], awards: awards || [], epa };
  }

  // A team's whole history on TBA: every award and every event, all years.
  async function getTeamHistory(team) {
    const tk = teamKey(team);
    const get = (name, path) => cachedTba(name, path).then((r) => r.data).catch(() => null);
    const [awards, events] = await Promise.all([
      get("tawardsall." + team, "/team/" + tk + "/awards"),
      get("teventsall." + team, "/team/" + tk + "/events/simple"),
    ]);
    if (!awards && !events) throw new Error("TBA_OFFLINE");
    return { awards: awards || [], events: events || [] };
  }

  /* ---- TBA: one team's profile + a season of results (team profile page) ---- */
  async function getTeamInfo(team) {
    return (await cachedTba("teaminfo." + team, "/team/" + teamKey(team))).data;
  }
  async function getTeamYears(team) {
    const d = (await cachedTba("teamyears." + team, "/team/" + teamKey(team) + "/years_participated")).data;
    return (Array.isArray(d) ? d : []).slice().sort((a, b) => b - a);
  }
  // Events (with dates/locations), per-event status (rank, record, alliance,
  // playoff result), awards and every match for one team in one season.
  async function getTeamSeason(team, year) {
    const tk = teamKey(team), base = "/team/" + tk;
    const get = (name, path) => cachedTba(name, path).then((r) => r.data).catch(() => null);
    const [events, statuses, awards, matches] = await Promise.all([
      get("tevents." + team + "." + year, base + "/events/" + year), // full: includes week + type
      get("tstatus." + team + "." + year, base + "/events/" + year + "/statuses"),
      get("tawards." + team + "." + year, base + "/awards/" + year),
      get("tmatches." + team + "." + year, base + "/matches/" + year + "/simple"),
    ]);
    if (!events) throw new Error("TBA_OFFLINE");
    return { events, statuses: statuses || {}, awards: awards || [], matches: matches || [] };
  }

  /* ---- Nexus (frc.nexus) — live pit map ----------------------------------- */
  function nexusKey() { return (window.CONFIG && window.CONFIG.nexusApiKey || "").trim(); }
  function hasNexusKey() { return !!nexusKey(); }

  // Returns { teams: [{team, address}], fromCache } or throws.
  // Only returns pit locations when Nexus has published them (usually live events).
  async function nexusPitMap(eventKey) {
    const cacheName = "nexus.pits." + eventKey;
    const key = nexusKey();
    if (key) {
      try {
        const res = await fetch("https://frc.nexus/api/v1/event/" + eventKey,
          { headers: { "Nexus-Api-Key": key, accept: "application/json" } });
        if (res.status === 403) throw new Error("NEXUS_BADKEY");
        if (!res.ok) throw new Error("NEXUS_" + res.status);
        const data = await res.json();
        // Nexus exposes pit locations as `pitAddresses` (team -> address string).
        const pa = data.pitAddresses || data.pits || {};
        let teams = [];
        if (Array.isArray(pa)) {
          teams = pa.map((p) => ({ team: String(p.team || p.teamNumber || p.number), address: p.address || p.location || p.pit || "" }));
        } else if (pa && typeof pa === "object") {
          teams = Object.entries(pa).map(([team, v]) => ({ team: String(team),
            address: typeof v === "string" ? v : (v && (v.address || v.location || v.pit)) || "" }));
        }
        teams = teams.filter((t) => t.team && t.team !== "undefined");
        Store.setCache(cacheName, { teams, ts: Date.now() });
        return { teams, fromCache: false };
      } catch (e) {
        const c = Store.getCache(cacheName, null);
        if (c) return { teams: c.teams, fromCache: true, cachedAt: c.ts };
        throw e;
      }
    }
    const c = Store.getCache(cacheName, null);
    if (c) return { teams: c.teams, fromCache: true, cachedAt: c.ts };
    throw new Error("NEXUS_NOKEY");
  }

  /* ---- Prime 702 (Admin → Prime 702, just for fun) -----------------------------
     While config/prime702 is on, every stat READ that pages display gives 702 a
     boosted COPY: 1.4–1.7× the best team in each stat, #1 everywhere, unbeaten,
     and an Impact Award + Winner banner at every event it finished. Cached and
     stored data never change, and betting/fantasy ask for the raw numbers. */
  const PRIME = "702";
  function primeOn() { const p = window.Cloud && Cloud.getPrime && Cloud.getPrime(); return p && p.on ? p : null; }
  // A stable 1.4–1.7 multiplier per stat (same on every device for one activation).
  function primeMult(p, key) {
    let h = 2166136261; const s = String(p.seed || "prime") + ":" + key;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 1.4 + ((h >>> 0) % 1001) / 1000 * 0.3;
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  const isPrime = (t) => String(t).replace("frc", "") === PRIME;
  function topsOf(rows) {
    const t = { epa: null, auto: null, teleop: null, endgame: null };
    (rows || []).forEach((r) => {
      if (isPrime(r.team)) return;
      const b = r.breakdown || {};
      if (r.epa != null && (t.epa == null || r.epa > t.epa)) t.epa = r.epa;
      ["auto", "teleop", "endgame"].forEach((k) => { if (b[k] != null && (t[k] == null || b[k] > t[k])) t[k] = b[k]; });
    });
    return t;
  }
  // Boosted EPA + breakdown from the best values; the total stays 1.4–1.7× the best total.
  function primeStats(p, tops, salt) {
    const k = (x) => primeMult(p, x + (salt || ""));
    const b = { auto: null, teleop: null, endgame: null };
    ["auto", "teleop", "endgame"].forEach((x) => { if (tops[x] != null) b[x] = tops[x] * k(x); });
    const parts = b.auto != null && b.teleop != null && b.endgame != null;
    let epa = parts ? b.auto + b.teleop + b.endgame : (tops.epa || 0) * k("epa");
    if (tops.epa) {
      const target = Math.min(tops.epa * 1.7, Math.max(tops.epa * 1.4, epa));
      if (parts && epa) ["auto", "teleop", "endgame"].forEach((x) => { b[x] = b[x] * target / epa; });
      epa = target;
    }
    return { epa: r1(epa), breakdown: { auto: b.auto == null ? null : r1(b.auto), teleop: b.teleop == null ? null : r1(b.teleop), endgame: b.endgame == null ? null : r1(b.endgame) } };
  }
  const unbeaten = (rec) => { const g = rec ? (rec.w || 0) + (rec.l || 0) + (rec.t || 0) : 0; return Object.assign({}, rec, { w: g || 12, l: 0, t: 0, winrate: 1 }); };
  const primeMemo = new WeakMap();
  // Season leaderboard rows → 702 on top; everyone it passed slides down one rank.
  function primeRows(rows) {
    const p = primeOn(); if (!p || !Array.isArray(rows)) return rows;
    const memo = primeMemo.get(rows); if (memo && memo.seed === p.seed) return memo.out;
    const me = rows.find((r) => isPrime(r.team)); if (!me) return rows;
    const st = primeStats(p, topsOf(rows));
    const old = { w: me.worldRank, s: me.stateRank, d: me.districtRank };
    const out = rows.map((r) => {
      if (r === me) return Object.assign({}, r, st, { record: unbeaten(r.record), worldRank: 1, stateRank: r.stateRank != null ? 1 : null, districtRank: r.districtRank != null ? 1 : null, prime: true });
      let c = null;
      const bump = (k, was, same) => { if (same && was != null && r[k] != null && r[k] < was) { c = c || Object.assign({}, r); c[k] = r[k] + 1; } };
      bump("worldRank", old.w, true);
      bump("stateRank", old.s, !!r.state && r.state === me.state);
      bump("districtRank", old.d, !!r.district && r.district === me.district);
      return c || r;
    }).sort((a, b) => b.epa - a.epa);
    primeMemo.set(rows, { seed: p.seed, out });
    return out;
  }
  // Best values of a season even when its leaderboard isn't downloaded (top 3 only).
  async function primeTops(year) {
    const rows = memYears[year] || (Store.getCache("sb.years." + year, null) || {}).rows;
    if (rows && rows.length) return topsOf(rows);
    try {
      const d = await sbMem(`/team_years?year=${year}&metric=epa&ascending=false&limit=3`);
      return topsOf((Array.isArray(d) ? d : []).map((r) => ({ team: sbTeam(r), epa: sbEpa(r), breakdown: sbBreakdown(r) })));
    } catch (e) { return null; }
  }
  async function primeTeamYear(team, year, res) {
    const p = primeOn(); if (!p || !isPrime(team) || !res) return res;
    const tops = await primeTops(year); if (!tops || !tops.epa) return res;
    const st = primeStats(p, tops), ranks = {};
    Object.entries(res.ranks || {}).forEach(([k, o]) => { ranks[k] = o ? Object.assign({}, o, { rank: 1, pct: 1 }) : o; });
    return Object.assign({}, res, st, { ranks, record: unbeaten(res.record), prime: true });
  }
  async function primeTeamEvents(team, year, res) {
    const p = primeOn(); if (!p || !isPrime(team) || !res || !res.rows || !res.rows.length) return res;
    const tops = await primeTops(year); if (!tops || !tops.epa) return res;
    const st = primeStats(p, tops), n = res.rows.length;
    return Object.assign({}, res, { rows: res.rows.map((r, i) => {
      const g = 0.9 + 0.1 * (i + 1) / n; // gets even better every event
      return Object.assign({}, r, { epa: r1(st.epa * g), breakdown: { auto: r1((st.breakdown.auto || 0) * g), teleop: r1((st.breakdown.teleop || 0) * g), endgame: r1((st.breakdown.endgame || 0) * g) },
        rank: r.rank != null ? 1 : r.rank, record: unbeaten(r.record) });
    }) });
  }
  async function primeTeamMatches(team, year, rows) {
    const p = primeOn(); if (!p || !isPrime(team) || !Array.isArray(rows) || !rows.length) return rows;
    const tops = await primeTops(year); if (!tops || !tops.epa) return rows;
    const st = primeStats(p, tops), last = rows[rows.length - 1].epa || 1, k = st.epa / last;
    return rows.map((r) => Object.assign({}, r, { epa: r1((r.epa || 0) * k), auto: r.auto == null ? null : r1(r.auto * k), teleop: r.teleop == null ? null : r1(r.teleop * k), endgame: r.endgame == null ? null : r1(r.endgame * k) }));
  }
  function primeHistory(team, rows) {
    const p = primeOn(); if (!p || !isPrime(team) || !Array.isArray(rows)) return rows;
    return rows.map((r) => {
      const norm = Math.round(2150 * primeMult(p, "norm" + r.year));
      return Object.assign({}, r, { norm, epa: r.epa != null && r.norm ? r1(r.epa * norm / r.norm) : r.epa, worldRank: r.worldRank != null ? 1 : r.worldRank, pct: 1, record: unbeaten(r.record) });
    });
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const OFFICIAL = [0, 1, 2, 3, 4, 5];
  // Winner (and, at official events, Impact) for 702 at every event it finished.
  function primeAwardsFor(events, awards) {
    const mine = (a) => (a.recipient_list || []).some((r) => r.team_key === "frc" + PRIME);
    const have = new Set((awards || []).filter(mine).map((a) => a.event_key + ":" + a.award_type));
    const extra = [];
    (events || []).forEach((e) => {
      if (!e || !e.key || !(e.end_date && e.end_date < today())) return;
      const year = e.year || Number(String(e.key).slice(0, 4));
      const rl = [{ team_key: "frc" + PRIME, awardee: null }];
      if (OFFICIAL.includes(e.event_type) && !have.has(e.key + ":0")) extra.push({ name: year >= 2023 ? "FIRST Impact Award" : "Chairman's Award", award_type: 0, event_key: e.key, year, recipient_list: rl, prime: true });
      if (!have.has(e.key + ":1")) extra.push({ name: "Winner", award_type: 1, event_key: e.key, year, recipient_list: rl, prime: true });
    });
    return (awards || []).concat(extra);
  }
  function primeHistoryAwards(team, res) {
    if (!primeOn() || !isPrime(team) || !res) return res;
    return Object.assign({}, res, { awards: primeAwardsFor(res.events, res.awards) });
  }
  // A season: rank 1 + event winner everywhere it finished, and it wins every match.
  function primeSeason(team, res) {
    if (!primeOn() || !isPrime(team) || !res) return res;
    const tk = "frc" + PRIME, done = {};
    (res.events || []).forEach((e) => { if (e.end_date && e.end_date < today()) done[e.key] = true; });
    const statuses = {};
    Object.entries(res.statuses || {}).forEach(([k, st]) => {
      if (!st || !done[k]) { statuses[k] = st; return; }
      const q = st.qual && st.qual.ranking;
      const played = q ? (q.matches_played || ((q.record || {}).wins || 0) + ((q.record || {}).losses || 0) + ((q.record || {}).ties || 0)) : 0;
      statuses[k] = Object.assign({}, st, {
        qual: st.qual ? Object.assign({}, st.qual, { ranking: Object.assign({}, q, { rank: 1, record: { wins: played, losses: 0, ties: 0 } }) }) : st.qual,
        playoff: Object.assign({}, st.playoff, { level: "f", status: "won", double_elim_round: "Finals", record: { wins: 5, losses: 0, ties: 0 } }),
        alliance: { name: "Alliance 1", number: 1, pick: 0, backup: null },
      });
    });
    (res.events || []).forEach((e) => { if (done[e.key] && !statuses[e.key]) statuses[e.key] = { playoff: { level: "f", status: "won", double_elim_round: "Finals" }, alliance: { name: "Alliance 1", number: 1, pick: 0 } }; });
    const matches = (res.matches || []).map((m) => {
      const a = m.alliances; if (!a || a.red.score < 0 || a.blue.score < 0) return m;
      const mine = (a.red.team_keys || []).includes(tk) ? "red" : (a.blue.team_keys || []).includes(tk) ? "blue" : null;
      if (!mine) return m;
      const other = mine === "red" ? "blue" : "red";
      if (a[mine].score > a[other].score) return m;
      const hi = Math.max(a.red.score, a.blue.score), lo = Math.min(a.red.score, a.blue.score);
      const red = Object.assign({}, a.red, { score: mine === "red" ? (hi === lo ? hi + 1 : hi) : lo });
      const blue = Object.assign({}, a.blue, { score: mine === "blue" ? (hi === lo ? hi + 1 : hi) : lo });
      return Object.assign({}, m, { alliances: { red, blue }, winning_alliance: mine });
    });
    return Object.assign({}, res, { statuses, matches, awards: primeAwardsFor(res.events, res.awards) });
  }
  // TBA rankings list → 702 is #1 (unbeaten); everyone above it slides down.
  function primeRankList(list) {
    if (!primeOn() || !Array.isArray(list)) return list;
    const i = list.findIndex((r) => r.team_key === "frc" + PRIME); if (i < 0) return list;
    const me = list[i], rec = me.record || {}, played = me.matches_played || (rec.wins || 0) + (rec.losses || 0) + (rec.ties || 0);
    return [Object.assign({}, me, { rank: 1, record: { wins: played, losses: 0, ties: 0 } })]
      .concat(list.filter((_, j) => j !== i).map((r) => r.rank < me.rank ? Object.assign({}, r, { rank: r.rank + 1 }) : r));
  }
  function primeEventDetail(res) {
    const p = primeOn(); if (!p || !res) return res;
    const there = (res.teams || []).some((t) => isPrime(t.team_number)) || (res.rankings || []).some((r) => r.team_key === "frc" + PRIME);
    if (!there) return res;
    const epa = Object.assign({}, res.epa);
    if (epa[PRIME]) epa[PRIME] = primeStats(p, topsOf(Object.entries(res.epa).map(([t, v]) => ({ team: t, epa: v.epa, breakdown: v.breakdown }))), ":" + ((res.info && res.info.key) || ""));
    const ev = res.info ? [Object.assign({}, res.info, { year: res.info.year })] : [];
    return Object.assign({}, res, { epa, rankings: primeRankList(res.rankings), awards: primeAwardsFor(ev, res.awards) });
  }
  // On-device event EPA (epa.js) → 702 first.
  function primeEventEpa(res) {
    const p = primeOn(); if (!p || !res || !res.byTeam || !res.byTeam[PRIME]) return res;
    const st = primeStats(p, topsOf(res.ranked || []), ":event");
    const ranked = [Object.assign({}, res.ranked.find((r) => isPrime(r.team)), { epa: st.epa, breakdown: res.hasBreakdown ? st.breakdown : null })]
      .concat(res.ranked.filter((r) => !isPrime(r.team)));
    const byTeam = {};
    ranked.forEach((r, i) => { byTeam[r.team] = Object.assign({}, res.byTeam[r.team], { epa: r.epa, breakdown: r.breakdown, rank: i + 1 }); });
    return Object.assign({}, res, { ranked, byTeam });
  }
  // Offseason EPA map (Charts) → 702 boosted against the other offseason teams.
  function primeOffMap(map) {
    const p = primeOn(); if (!p || !map || !map[PRIME]) return map;
    const st = primeStats(p, topsOf(Object.entries(map).map(([t, v]) => ({ team: t, epa: v.epa, breakdown: v.breakdown }))), ":off");
    return Object.assign({}, map, { [PRIME]: Object.assign({}, map[PRIME], st) });
  }
  const primeMultipliers = () => { const p = primeOn(); return p ? { epa: primeMult(p, "epa"), auto: primeMult(p, "auto"), teleop: primeMult(p, "teleop"), endgame: primeMult(p, "endgame") } : null; };

  return { teamKey, verifyKey, hasKey, effectiveKey, getEvents, getEventTeams, getEventMatches, getTeamColors, getTeamAvatar, sbEpa,
    getTeamInfo, getTeamYears, eventsForYear, sbEventPreds, eventMatchesLive, eventsFullYear, eventAlliances, eventInfo, teamEventKeys, eventOprs,
    hasNexusKey, nexusPitMap,
    // Prime 702-aware reads (pass raw = true for the real numbers: betting, fantasy)
    sbYearLeaderboard: (year, maxAgeMs, raw) => sbYearLeaderboard(year, maxAgeMs).then((r) => raw ? r : Object.assign({}, r, { rows: primeRows(r.rows) })),
    sbCachedLeaderboard: (year, raw) => raw ? sbCachedLeaderboard(year) : primeRows(sbCachedLeaderboard(year)),
    sbTeamYear: (t, y) => sbTeamYear(t, y).then((r) => primeTeamYear(t, y, r)),
    sbTeamEvents: (t, y) => sbTeamEvents(t, y).then((r) => primeTeamEvents(t, y, r)),
    sbTeamMatches: (t, y) => sbTeamMatches(t, y).then((r) => primeTeamMatches(t, y, r)),
    sbTeamHistory: (t) => sbTeamHistory(t).then((r) => primeHistory(t, r)),
    getTeamSeason: (t, y) => getTeamSeason(t, y).then((r) => primeSeason(t, r)),
    getTeamHistory: (t) => getTeamHistory(t).then((r) => primeHistoryAwards(t, r)),
    getEventDetail: (k) => getEventDetail(k).then(primeEventDetail),
    getEventRankings: (k) => getEventRankings(k).then((r) => Object.assign({}, r, { rankings: primeRankList(r.rankings) })),
    eventRankingsLive: (k, ttl) => eventRankingsLive(k, ttl).then((r) => r && r.rankings ? Object.assign({}, r, { rankings: primeRankList(r.rankings) }) : r),
    sbOffseasonEpa: (y) => sbOffseasonEpa(y).then(primeOffMap),
    primeOn, primeEventEpa, primeMultipliers };
})();

window.API = API;
