/* =============================================================================
   epa.js  —  On-device EPA (Expected Points Added) from TBA match results
   -----------------------------------------------------------------------------
   A faithful-but-simplified version of Statbotics' EPA, used for the CURRENT /
   ongoing event (computed live from TBA so it stays fresh during a competition
   and needs no external stats service). It is NOT the official Statbotics number
   (that also folds in season-long priors + defensive weighting), but tracks it
   closely for a single event.

   Method (per the Statbotics EPA blog):
     - alliance predicted score = sum of its 3 teams' EPAs
     - each team starts at ~1/3 of the event's average alliance score (prior)
     - after each qual match, per alliance:
         err = actual_alliance_score - predicted_alliance_score
         each team on it:  epa += K(matchesPlayed) * err / 3
     - K (learning rate): 0.5 for N<=6, ramps to 0.3 by N=12, then 0.3
   ========================================================================== */
const EPA = (() => {
  const num = (k) => String(k).replace("frc", "");
  const K = (N) => (N <= 6 ? 0.5 : N <= 12 ? 0.5 - 0.2 * ((N - 6) / 6) : 0.3);

  // Component actual score for an alliance (REBUILT score_breakdown fields).
  const COMPS = ["total", "auto", "teleop", "endgame"];
  function compVal(m, col, comp) {
    const a = m.alliances[col];
    if (comp === "total") return a.score;
    const sb = m.score_breakdown && m.score_breakdown[col];
    if (!sb) return null;
    if (comp === "auto") return sb.totalAutoPoints;
    if (comp === "teleop") return sb.totalTeleopPoints;
    if (comp === "endgame") return sb.endGameTowerPoints;
    return null;
  }

  // matches: TBA FULL match objects (with score_breakdown). Returns ranked list + lookup.
  function computeEvent(matches) {
    const qm = (matches || [])
      .filter((m) => m.comp_level === "qm" && m.alliances &&
        m.alliances.red.score >= 0 && m.alliances.blue.score >= 0)
      .sort((a, b) => a.match_number - b.match_number);
    if (!qm.length) return { ranked: [], byTeam: {}, played: 0, prior: 0, hasBreakdown: false };

    const hasBreakdown = qm.some((m) => m.score_breakdown);

    // prior per component = average alliance component score / 3
    const prior = {};
    COMPS.forEach((cmp) => { let s = 0, k = 0;
      qm.forEach((m) => ["red", "blue"].forEach((col) => { const v = compVal(m, col, cmp); if (v != null) { s += v; k++; } }));
      prior[cmp] = k ? (s / k) / 3 : 0;
    });

    const epa = {}; COMPS.forEach((cmp) => (epa[cmp] = {}));
    const n = {}, teams = new Set();
    qm.forEach((m) => ["red", "blue"].forEach((col) =>
      m.alliances[col].team_keys.forEach((key) => {
        const t = num(key); teams.add(t);
        COMPS.forEach((cmp) => { if (epa[cmp][t] == null) epa[cmp][t] = prior[cmp]; });
        if (n[t] == null) n[t] = 0;
      })));

    for (const m of qm) {
      for (const col of ["red", "blue"]) {
        const t = m.alliances[col].team_keys.map(num);
        COMPS.forEach((cmp) => {
          const val = compVal(m, col, cmp); if (val == null) return;
          const pred = t.reduce((s, x) => s + epa[cmp][x], 0);
          const err = val - pred;
          t.forEach((x) => { epa[cmp][x] += K(n[x]) * err / 3; });
        });
        t.forEach((x) => { n[x]++; });
      }
    }

    const ranked = [...teams]
      .map((t) => ({ team: t, epa: epa.total[t], matches: n[t],
        breakdown: hasBreakdown ? { auto: epa.auto[t], teleop: epa.teleop[t], endgame: epa.endgame[t] } : null }))
      .sort((a, b) => b.epa - a.epa);
    const byTeam = {};
    ranked.forEach((r, i) => { byTeam[r.team] = { epa: r.epa, breakdown: r.breakdown, rank: i + 1, outOf: ranked.length, matches: r.matches }; });
    return { ranked, byTeam, played: qm.length, prior: prior.total, hasBreakdown };
  }

  return { computeEvent };
})();
window.EPA = EPA;
