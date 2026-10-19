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
  async function sbYearLeaderboard(year) {
    const cacheName = "sb.years." + year;
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
      Store.setCache(cacheName, { rows, ts: Date.now() });
      return { rows, fromCache: false };
    } catch (e) {
      const c = Store.getCache(cacheName, null);
      if (c && c.rows) return { rows: c.rows, fromCache: true, cachedAt: c.ts };
      throw e;
    }
  }
  // Synchronous read of the already-cached (already-processed) leaderboard, or null.
  function sbCachedLeaderboard(year) {
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

  return { teamKey, verifyKey, hasKey, effectiveKey, getEvents, getEventTeams, getEventMatches, getEventRankings, getTeamColors, getTeamAvatar,
    sbYearLeaderboard, sbCachedLeaderboard, sbTeamEvents, sbTeamMatches, sbTeamYear, sbEpa,
    getTeamInfo, getTeamYears, getTeamSeason,
    hasNexusKey, nexusPitMap };
})();

window.API = API;
