/* =============================================================================
   game-config.js  —  FRC 2026 "REBUILT" game definition
   -----------------------------------------------------------------------------
   Everything season-specific lives here. To adapt for a future season, edit
   this file only: the match-scouting fields and pit-scouting fields. The rest
   of the app reads from GAME.* and renders generically.

   The match form is organized around the game's periods:
     Auto → Active → Inactive → Endgame → Post-match.
   "Full cycles" counters in Auto / Active / Endgame add up to a robot's total
   cycles per match (shown on the team profile).
   ========================================================================== */

const GAME = {
  season: 2026,
  name: "REBUILT",
  seasonLabel: "2026 REBUILT",

  /* --------------------------------------------------------------------------
     MATCH SCOUTING FIELDS
     Each field: { key, label, type, ...opts, phase }
     type: number | counter | bool | select | rating | text
     phase groups the fields into sections in the form.
     ------------------------------------------------------------------------ */
  // The two shift phases (active / inactive) reorder around the Transition Shift
  // based on the "Won auto" toggle — see app.js applyPhaseOrder().
  matchPhases: [
    { id: "auto",       label: "Autonomous" },
    { id: "active",     label: "Active" },
    { id: "transition", label: "Transition Shift" },
    { id: "inactive",   label: "Inactive" },
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

    // --- Active ---
    { key: "teleCycles", label: "Full cycles (active)", type: "counter", min: 0, phase: "active" },
    { key: "fuelSource", label: "Fuel delivery", type: "select", phase: "active",
      options: ["Robot scores directly", "Feeds human player", "Passes fuel to robot", "Both passing and scoring", "N/A"] },
    { key: "wasDefended", label: "Was defended against", type: "bool", phase: "active" },
    { key: "scoringQuality", label: "Scoring quality", type: "rating", max: 5, phase: "active" },

    // --- Transition Shift (always between the two shifts) ---
    { key: "transCycles", label: "Full cycles (transition)", type: "counter", min: 0, phase: "transition" },
    { key: "transRating", label: "Transition rating", type: "rating", max: 5, phase: "transition" },

    // --- Inactive ---
    { key: "playedDefense", label: "Played defense", type: "bool", phase: "inactive" },
    { key: "defenseRating", label: "Defense quality", type: "rating", max: 5, phase: "inactive",
      help: "Only if they played defense. 5 = shut down opponents." },
    { key: "passedFuel", label: "Passed fuel", type: "bool", phase: "inactive" },
    { key: "passingRating", label: "Passing rating", type: "rating", max: 5, phase: "inactive" },
    { key: "timesPassed", label: "Times passed", type: "counter", min: 0, phase: "inactive" },
    { key: "inactiveRating", label: "Inactive rating", type: "rating", max: 5, phase: "inactive" },

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
      options: ["Depot Trench", "Depot Bump", "Middle", "Outpost Trench", "Outpost Bump"] },
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

window.GAME = GAME;
