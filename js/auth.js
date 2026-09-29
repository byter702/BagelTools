/* =============================================================================
   auth.js  —  Team login gate (client-side)
   -----------------------------------------------------------------------------
   Shows a login screen before the app. Members enter their FULL NAME (which acts
   like a username — each distinct name is its own account with its own profile,
   Bagel Bucks and stats) and the team password (CONFIG.accessPassword). The
   password is a deterrent to keep other teams out — it lives in the page source,
   so it is not strong security. Every login is logged locally to the member
   roster; unknown names raise an access request visible in the Admin panel.
   ========================================================================== */
const Auth = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function currentUser() { return Store.getSession(); }
  function isLoggedIn() { return !!Store.getSession(); }

  // Only accepted members may enter: the owner, the config allow-list, or an
  // admin-approved member on this device.
  function isAccepted(first, last) {
    const full = (first + " " + last).trim().toLowerCase();
    const owner = ((window.CONFIG && window.CONFIG.owner) || "").trim().toLowerCase();
    if (owner && full === owner) return true;
    const approved = (window.CONFIG && window.CONFIG.approvedMembers) || [];
    if (approved.some((n) => String(n).trim().toLowerCase() === full)) return true;
    try { if (Store.getMembers()[Store.nameKey(first, last)]) return true; } catch (e) {}
    return false;
  }

  function logout() {
    Store.clearSession();
    location.reload();
  }

  function showLogin(onDone) {
    document.getElementById("app").style.display = "none";
    const wrap = document.createElement("div");
    wrap.className = "login-screen";
    wrap.id = "loginScreen";
    wrap.innerHTML = `
      <div class="login-card">
        <img class="login-logo logo-dark" src="assets/logo-dark.png" alt="FRC 702 Bagel Bytes logo" />
        <img class="login-logo logo-light" src="assets/logo.png" alt="FRC 702 Bagel Bytes logo" />
        <h1 class="login-title">Bagel<span>Scout</span></h1>
        <p class="login-sub">FRC 702 Scouting · Members Only</p>
        <form id="loginForm" novalidate>
          <div class="field"><label>Full name</label>
            <input type="text" id="loginName" autocomplete="name" placeholder="First Last" required /></div>
          <div class="field"><label>Team password</label>
            <input type="password" id="loginPass" autocomplete="current-password" placeholder="••••••••" required /></div>
          <div class="login-error" id="loginError" role="alert" hidden></div>
          <button type="submit" class="btn primary block login-btn">
            <svg class="ico"><use href="#ic-shield"/></svg> Enter site
          </button>
        </form>
        <p class="login-foot">Restricted to Team 702. Ask a team lead for the password.</p>
      </div>`;
    document.body.appendChild(wrap);
    const nameInput = wrap.querySelector("#loginName");
    nameInput.focus();

    wrap.querySelector("#loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      // A single "full name" acts like a username. Split into first / last so the
      // roster, approvals and per-account profiles all key off the same identity.
      const full = nameInput.value.trim().replace(/\s+/g, " ");
      const parts = full ? full.split(" ") : [];
      const f = parts[0] || "";
      const l = parts.slice(1).join(" ");
      const p = wrap.querySelector("#loginPass").value;
      const err = wrap.querySelector("#loginError");
      const fail = (msg) => {
        err.textContent = msg; err.hidden = false;
        const card = wrap.querySelector(".login-card");
        card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      };
      if (!f) return fail("Enter your full name.");
      const pw = (window.CONFIG && window.CONFIG.accessPassword) || "";
      if (!pw) return fail("No password configured — see js/config.js.");
      if (p !== pw) return fail("Incorrect password. Ask a team lead.");

      const status = Store.recordLogin(f, l); // always log the attempt for admins
      // Gate: only accepted members may enter.
      if (!isAccepted(f, l)) {
        // Push the access request up to the cloud so admins see it on THEIR device.
        // (This person isn't approved, so startApp/Cloud.init never runs otherwise.)
        try {
          if (window.Cloud) {
            Cloud.init();
            const key = Store.nameKey(f, l);
            const entry = Store.getRequests()[key] || { first: f, last: l, ts: Date.now() };
            Cloud.pushAccessRequest(key, entry);
          }
        } catch (e) {}
        showPending(wrap, f);
        return;
      }

      Store.setSession({ first: f, last: l, ts: Date.now() });
      if (!Store.getSettings().scoutName) Store.setSettings({ scoutName: full });

      wrap.classList.add("bye");
      setTimeout(() => { wrap.remove(); document.getElementById("app").style.display = ""; onDone(status); }, 260);
    });
  }

  function showPending(wrap, first) {
    wrap.querySelector(".login-card").innerHTML = `
      <img class="login-logo logo-dark" src="assets/logo-dark.png" alt="FRC 702 logo" />
      <img class="login-logo logo-light" src="assets/logo.png" alt="FRC 702 logo" />
      <h1 class="login-title">Bagel<span>Scout</span></h1>
      <p class="login-sub">Access pending</p>
      <div class="login-error" style="display:block">Hi ${esc(first)} — your request to join has been sent to the team admins.
        You'll be able to log in once an admin approves you.</div>
      <p class="login-foot">Already approved? Make sure your name is spelled exactly as the admin entered it, then try again.</p>
      <button class="btn ghost block" id="pendingBack" style="margin-top:12px">← Back to login</button>`;
    const b = wrap.querySelector("#pendingBack");
    if (b) b.onclick = () => location.reload();
  }

  return { currentUser, isLoggedIn, logout, showLogin };
})();
window.Auth = Auth;
