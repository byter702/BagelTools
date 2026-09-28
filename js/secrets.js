/* =============================================================================
   secrets.js  —  LOCAL-ONLY secrets  (DO NOT COMMIT)
   -----------------------------------------------------------------------------
   This file is listed in .gitignore so it stays off GitHub. It holds the values
   that gate access to the site. config.js reads them from window.CONFIG_SECRETS.

   To set up on a new machine: copy secrets.example.js to secrets.js and fill in
   the real values below.

   NOTE: because this is a static site, whatever ships here is still visible to
   anyone who opens the deployed page's source. This gate is a deterrent, not
   strong security — keeping it out of the public repo just avoids publishing it.
   ========================================================================== */
window.CONFIG_SECRETS = {
  // Team access password — entered on the login screen to open the site.
  accessPassword: "bagelplanet2027",

  // Admin panel PIN — required to open the Admin tab (roster & access requests).
  adminPin: "fmc2056",
};
