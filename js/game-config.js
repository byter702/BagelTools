/* =============================================================================
   game-config.js  —  per-season game definitions
   -----------------------------------------------------------------------------
   Everything season-specific lives here: the default match-scouting and
   pit-scouting fields for each year. The rest of the app reads from GAME.* and
   renders generically.

   GAME is the definition for the season this device is viewing: the per-device
   choice from Settings (localStorage "bb702.season"), else CONFIG.defaultSeason.
   Each season's scouting data is stored completely separately (see store.js).

   The 2026 match form is organized around the game's periods:
     Auto → Active → Inactive → Endgame → Post-match.
   "Full cycles" counters in Auto / Active / Endgame add up to a robot's total
   cycles per match (shown on the team profile).
   ========================================================================== */

const GAME_2026 = {
  season: 2026,
  name: "REBUILT",
  seasonLabel: "2026 REBUILT",

  /* --------------------------------------------------------------------------
     MATCH SCOUTING FIELDS
     Each field: { key, label, type, ...opts, phase }
     type: number | counter | bool | select | rating | text
     phase groups the fields into sections in the form.
     ------------------------------------------------------------------------ */
  // Four alternating shift periods sit between Transition and Endgame. The two
  // Active shifts (1st/2nd) interleave with two Inactive periods; winning auto
  // flips whether each pair starts Inactive-first or Active-first — see app.js
  // applyPhaseOrder().
  matchPhases: [
    { id: "auto",       label: "Autonomous" },
    { id: "transition", label: "Transition Shift" },
    { id: "active1",    label: "1st Shift" },
    { id: "inactive1",  label: "Inactive (1st)" },
    { id: "active2",    label: "2nd Shift" },
    { id: "inactive2",  label: "Inactive (2nd)" },
    { id: "endgame",    label: "Endgame" },
    { id: "post",       label: "Post-Match" },
  ],

  matchFields: [
    // --- Autonomous ---
    { key: "autoLeave", label: "Left starting zone", type: "bool", phase: "auto",
      help: "Did the robot move out of its starting zone during auto?" },
    { key: "wonAuto", label: "Won auto", type: "bool", phase: "auto" },
    { key: "autoRating", label: "Auto rating", type: "rating", max: 5, phase: "auto" },
    { key: "autoCycles", label: "Full cycles (auto)", type: "counter", min: 0, phase: "auto" },

    // --- Transition Shift (right after auto) ---
    { key: "transCycles", label: "Full cycles (transition)", type: "counter", min: 0, phase: "transition" },
    { key: "transRating", label: "Transition rating", type: "rating", max: 5, phase: "transition" },

    // --- 1st Shift (active) ---
    { key: "teleCycles", label: "Full cycles (1st)", type: "counter", min: 0, phase: "active1" },
    { key: "fuelSource", label: "Fuel delivery (1st)", type: "select", phase: "active1",
      options: ["Robot scores directly", "Feeds human player", "Passes fuel to robot", "Both passing and scoring", "N/A"] },
    { key: "wasDefended", label: "Was defended against (1st)", type: "bool", phase: "active1" },
    { key: "scoringQuality", label: "Scoring quality (1st)", type: "rating", max: 5, phase: "active1" },

    // --- 2nd Shift (active) ---
    { key: "teleCycles2", label: "Full cycles (2nd)", type: "counter", min: 0, phase: "active2" },
    { key: "fuelSource2", label: "Fuel delivery (2nd)", type: "select", phase: "active2",
      options: ["Robot scores directly", "Feeds human player", "Passes fuel to robot", "Both passing and scoring", "N/A"] },
    { key: "wasDefended2", label: "Was defended against (2nd)", type: "bool", phase: "active2" },
    { key: "scoringQuality2", label: "Scoring quality (2nd)", type: "rating", max: 5, phase: "active2" },

    // --- Inactive (1st) ---
    { key: "playedDefense", label: "Played defense (1st)", type: "bool", phase: "inactive1" },
    { key: "defenseRating", label: "Defense quality (1st)", type: "rating", max: 5, phase: "inactive1",
      help: "Only if they played defense. 5 = shut down opponents." },
    { key: "passedFuel", label: "Passed fuel (1st)", type: "bool", phase: "inactive1" },
    { key: "passingRating", label: "Passing rating (1st)", type: "rating", max: 5, phase: "inactive1" },
    { key: "timesPassed", label: "Times passed (1st)", type: "counter", min: 0, phase: "inactive1" },
    { key: "inactiveRating", label: "Inactive rating (1st)", type: "rating", max: 5, phase: "inactive1" },

    // --- Inactive (2nd) ---
    { key: "playedDefense2", label: "Played defense (2nd)", type: "bool", phase: "inactive2" },
    { key: "defenseRating2", label: "Defense quality (2nd)", type: "rating", max: 5, phase: "inactive2",
      help: "Only if they played defense. 5 = shut down opponents." },
    { key: "passedFuel2", label: "Passed fuel (2nd)", type: "bool", phase: "inactive2" },
    { key: "passingRating2", label: "Passing rating (2nd)", type: "rating", max: 5, phase: "inactive2" },
    { key: "timesPassed2", label: "Times passed (2nd)", type: "counter", min: 0, phase: "inactive2" },
    { key: "inactiveRating2", label: "Inactive rating (2nd)", type: "rating", max: 5, phase: "inactive2" },

    // --- Endgame ---
    { key: "endCycles", label: "Full cycles (endgame)", type: "counter", min: 0, phase: "endgame" },
    { key: "endgameRating", label: "Endgame rating", type: "rating", max: 5, phase: "endgame" },
    { key: "endPlayedDefense", label: "Played defense", type: "bool", phase: "endgame" },
    { key: "endDefenseRating", label: "Defense quality", type: "rating", max: 5, phase: "endgame" },
    { key: "endTimesPassed", label: "Times passed fuel", type: "counter", min: 0, phase: "endgame" },
    { key: "endPassRating", label: "Pass rating", type: "rating", max: 5, phase: "endgame" },
    { key: "endWasDefended", label: "Was defended against?", type: "bool", phase: "endgame" },

    // --- Post-match ---
    { key: "diedOrTipped", label: "Died / tipped / disabled", type: "bool", phase: "post",
      help: "Robot broke down, tipped over, or was disabled at any point." },
    { key: "driverSkill", label: "Driver skill", type: "rating", max: 5, phase: "post" },
    { key: "speed", label: "Speed / cycle pace", type: "rating", max: 5, phase: "post" },
    { key: "fouls", label: "Fouls committed", type: "counter", min: 0, phase: "post" },
    { key: "bps", label: "Average BPS (balls per second)", type: "counter", min: 0, phase: "post" },
    { key: "notes", label: "Notes", type: "text", phase: "post",
      placeholder: "Anything strategy needs to know…" },
  ],

  /* --------------------------------------------------------------------------
     PIT SCOUTING FIELDS
     ------------------------------------------------------------------------ */
  pitFields: [
    { key: "drivetrain", label: "Drivetrain", type: "select",
      options: ["Swerve", "Tank / West Coast", "Mecanum", "Other / Unknown"] },
    { key: "weight", label: "Robot weight (lbs)", type: "number", min: 0 },
    { key: "fuelCapacity", label: "Fuel capacity (holds)", type: "number", min: 0 },
    { key: "startPosition", label: "Preferred starting position", type: "select",
      options: ["Depot Trench", "Depot Bump", "Middle", "Outpost Trench", "Outpost Bump", "Any Bump", "Any Trench", "Anywhere"] },
    { key: "shotblocker", label: "Has shotblocker", type: "bool" },
    { key: "canUnderTrench", label: "Can go under trench", type: "bool" },
    { key: "canShoot", label: "Can shoot", type: "bool" },
    { key: "canShootMove", label: "Can Shoot on the Move?", type: "bool" },
    { key: "canClimb", label: "Can Climb", type: "bool" },
    { key: "shooterType", label: "Type of shooter", type: "select",
      options: ["No shooter", "Dye Rotor", "Turret", "Double Turret", "Drum Shooter", "Laned Shooter", "Fixed Shooter", "Other"] },
    { key: "ballsPerSecond", label: "Balls per Second", type: "counter", min: 0 },
    { key: "bestAuto", label: "Best Auto", type: "text" },
    { key: "pitNotes", label: "Comments", type: "text",
      placeholder: "Team demeanor, reliability, anything useful…" },
  ],
};

// 2027 "BIOCORE" (revealed at Kickoff, Jan 9 2027). Until then the defaults are a
// near-blank generic form; admins build the real one in Admin → Match/Pit form.
const GAME_2027 = {
  season: 2027,
  name: "BIOCORE",
  seasonLabel: "2027 BIOCORE",
  matchPhases: [
    { id: "auto", label: "Autonomous" },
    { id: "teleop", label: "Teleop" },
    { id: "endgame", label: "Endgame" },
    { id: "post", label: "Post-Match" },
  ],
  matchFields: [
    { key: "driverSkill", label: "Driver skill", type: "rating", max: 5, phase: "post" },
    { key: "diedOrTipped", label: "Died / tipped / disabled", type: "bool", phase: "post" },
    { key: "notes", label: "Notes", type: "text", phase: "post", placeholder: "Anything strategy needs to know…" },
  ],
  pitFields: [
    { key: "drivetrain", label: "Drivetrain", type: "select", options: ["Swerve", "Tank / West Coast", "Mecanum", "Other / Unknown"] },
    { key: "weight", label: "Robot weight (lbs)", type: "number", min: 0 },
    { key: "pitNotes", label: "Comments", type: "text", placeholder: "Team demeanor, reliability, anything useful…" },
  ],
};

const SEASONS = [GAME_2026, GAME_2027];
const GAME = (() => {
  let want = 0;
  try { want = Number(localStorage.getItem("bb702.season")) || 0; } catch (e) {}
  if (!want) want = Number(window.CONFIG && window.CONFIG.defaultSeason) || 2026;
  return SEASONS.find((g) => g.season === want) || GAME_2026;
})();

window.GAME = GAME;
window.SEASONS = SEASONS;
