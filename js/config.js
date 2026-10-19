/* =============================================================================
   config.js  —  App configuration
   -----------------------------------------------------------------------------
   BUILT-IN THE BLUE ALLIANCE KEY
   Paste your team's TBA "Read" API key between the quotes below. Once set,
   scouts never have to enter a key — the app connects automatically.

       defaultTbaKey: "PASTE_YOUR_KEY_HERE",

   Get / regenerate a key at:  https://www.thebluealliance.com/account

   NOTE: because this is a static site, whatever you put here ships in the page
   and is visible to anyone who views source. That's an accepted tradeoff for a
   shared team tool — TBA read keys are read-only, rate-limited, and free to
   regenerate. If it's ever abused, make a new one and replace it here.

   A scout can still override this with their own key under Settings → Advanced
   (stored only in their browser); that override takes priority over this value.
   ========================================================================== */

/* Local-only secrets live in js/secrets.js (loaded before this file and kept out
   of the repo via .gitignore). If that file is missing, SECRETS is an empty
   object and the values below fall back to blanks — copy js/secrets.example.js to
   js/secrets.js to set the real access password and admin PIN. */
var SECRETS = window.CONFIG_SECRETS || {};

window.CONFIG = {
  defaultTbaKey: "2lCewAZsm3RbWBge07WoKnsq9jyhqfFT8tuH7Qdna9Wt4b8Ja9B7A2TOMxUIJZjX",

  /* --- Team access password ---------------------------------------------------
     Members must enter this on the login screen to open the site. Set it in
     js/secrets.js (accessPassword). (Client-side gate: it keeps casual users from
     other teams out, but it is visible in page source and is not strong security.)
  */
  accessPassword: SECRETS.accessPassword || "",

  // Admin panel PIN — required to open the Admin tab. Set it in js/secrets.js.
  adminPin: SECRETS.adminPin || "",

  /* --- Statbotics (BagelStats World/State EPA) --------------------------------
     Base URL for the Statbotics REST API. Defaults to the Popcorn Penguins
     mirror (api-statbotics.popcornpenguins.com), which is currently reliable and
     CORS-enabled. If you prefer the official one, use "https://api.statbotics.io/v3".
  */
  statboticsBase: "https://api-statbotics.popcornpenguins.com/v3",

  /* --- Nexus (frc.nexus) pit map ---------------------------------------------
     Paste your Nexus API key to enable the live pit map on the Pit Scouting page.
     Get / check your key at https://frc.nexus/api (requires a Nexus login).
     Note: pit map data is usually only published while an event is LIVE.
  */
  nexusApiKey: "fsbexOmWUmrBJmMOvO-oHuXWK4U",

  /* --- Access control --------------------------------------------------------
     Only accepted members may enter. `owner` can ALWAYS log in (and counts as
     accepted). `approvedMembers` is a pre-approved allow-list that ships with the
     app so every device recognizes these people; admins can also approve names on
     the fly (Admin panel), stored per-device and carried in backups. Names match
     case-insensitively as "First Last".
  */
  owner: "Samuel Wright",
  approvedMembers: ["Samuel Wright"],

  /* --- Season ----------------------------------------------------------------
     The season every device opens on. Anyone can switch years for themselves in
     Settings → Season; each year's scouting data is kept completely separate. */
  defaultSeason: 2026,

  /* --- Dashboard countdowns ---------------------------------------------------
     Shown as one card on the Dashboard with ‹ › arrows to flip between them.
     `at` is an ISO time with its UTC offset; past ones hide automatically. */
  countdowns: [
    { label: "2027 Kickoff", sub: "BIOCORE game reveal", where: "Livestream · 9:00 AM PT", at: "2027-01-09T09:00:00-08:00" },
    { label: "Los Angeles Event", sub: "CA District Los Angeles Event", where: "El Segundo, CA", at: "2027-03-19T08:00:00-07:00", eventKey: "2027calas" },
    { label: "San Gabriel Valley Event", sub: "CA District San Gabriel Valley Event", where: "Rosemead, CA", at: "2027-04-02T08:00:00-07:00", eventKey: "2027casgv" },
  ],

  /* --- Firebase (optional cloud sync) ----------------------------------------
     Leave this EMPTY ({}) to run fully offline / local-only — everything works,
     but scouters only see their own data. To turn on cross-scout sharing
     (shared leaderboard, presence, everyone's match/pit data, and other
     scouters' pick lists), paste your Firebase web-app config object here:

       firebaseConfig: {
         apiKey: "...",
         authDomain: "your-project.firebaseapp.com",
         projectId: "your-project",
         storageBucket: "your-project.appspot.com",
         messagingSenderId: "...",
         appId: "...",
       },

     Create a free (Spark plan) project at https://console.firebase.google.com,
     add a Web app, enable Cloud Firestore, and copy its config here. Profile
     pictures are stored as small compressed images inside Firestore, so you do
     NOT need Firebase Storage or a paid plan. See the README for full steps.
  */
  firebaseConfig: {
    apiKey: "AIzaSyD-Bu6zE_PfeWC_8OBsGpUT0OAegiPe4yI",
    authDomain: "bagelscout-e0bce.firebaseapp.com",
    projectId: "bagelscout-e0bce",
    storageBucket: "bagelscout-e0bce.firebasestorage.app",
    messagingSenderId: "715921761523",
    appId: "1:715921761523:web:352dbf2817fde44826c386",
    measurementId: "G-92LWK0807R",
  },
};
