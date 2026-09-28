/* =============================================================================
   secrets.example.js  —  TEMPLATE for js/secrets.js  (safe to commit)
   -----------------------------------------------------------------------------
   Copy this file to  js/secrets.js  and replace the placeholder values with your
   team's real ones. secrets.js is gitignored, so your real values never get
   committed to the repo.

       cp js/secrets.example.js js/secrets.js     (macOS / Linux)
       copy js\secrets.example.js js\secrets.js   (Windows)

   index.html loads js/secrets.js BEFORE js/config.js, which reads these values
   from window.CONFIG_SECRETS. If secrets.js is missing, the app still loads but
   the access password / admin PIN fall back to blank.
   ========================================================================== */
window.CONFIG_SECRETS = {
  // Team access password — entered on the login screen to open the site.
  accessPassword: "CHANGE_ME",

  // Admin panel PIN — required to open the Admin tab (roster & access requests).
  adminPin: "CHANGE_ME",
};
