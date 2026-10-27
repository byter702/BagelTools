/* =============================================================================
   auth.js  —  Accounts: register → password → admin approval, then log in
   -----------------------------------------------------------------------------
   Identity = first + last name combined into ONE username ("first last", split on
   the first space — the same key the old full-name login used, so every existing
   account, its Bagel Bucks and its stats carry straight over).

   REGISTER  first, last, Registry Key → the person creates a password (twice) →
             access request → an admin approves (any time later: the page lets them
             in by itself, or they just log in once approved).
   LOG IN    first, last, password. Members from before passwords existed create
             one on their next login (Registry Key required).

   Passwords are hashed in the browser (PBKDF2-SHA256, random salt) and only the
   hash is stored, in Firestore creds/{scouterId}. That stops anyone from signing
   in as someone else through the site; it is not server-enforced security.
   ========================================================================== */
const Auth = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (n) => `<svg class="ico" aria-hidden="true"><use href="#ic-${n}"/></svg>`;

  const SESSION_V = 2;   // sessions from before passwords (v1) are dropped → everyone signs in once
  const ITER = 150000;   // PBKDF2 rounds
  const MIN_PW = 6;

  // Names are matched without caring about capitals (accounts are keyed on the
  // lowercased name), but always shown with a capital first letter:
  // "samuel" / "SAMUEL" → "Samuel"; mixed case like "McDonald" is kept as typed.
  function properName(s) {
    return String(s || "").trim().split(/\s+/).filter(Boolean).map((w) => {
      const base = (w === w.toLowerCase() || w === w.toUpperCase()) ? w.toLowerCase() : w;
      return base.replace(/(^|[-'’])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
    }).join(" ");
  }
  function canon(first, last) {
    const full = properName(String(first || "") + " " + String(last || ""));
    const parts = full ? full.split(" ") : [];
    return { first: parts[0] || "", last: parts.slice(1).join(" "), full };
  }

  (() => {
    const s = Store.getSession(); if (!s) return;
    if (s.v !== SESSION_V) return Store.clearSession();
    // sessions saved as typed ("samuel wright") get their capitals back
    const c = canon(s.first, s.last);
    if (c.first !== s.first || c.last !== s.last) Store.setSession(Object.assign({}, s, { first: c.first, last: c.last }));
  })();

  function currentUser() { const s = Store.getSession(); return s && s.v === SESSION_V ? s : null; }
  function isLoggedIn() { return !!currentUser(); }

  // Accepted = the owner, the config allow-list, or an admin-approved member.
  function isAccepted(first, last) {
    const full = (first + " " + last).trim().toLowerCase();
    const owner = ((window.CONFIG && window.CONFIG.owner) || "").trim().toLowerCase();
    if (owner && full === owner) return true;
    const approved = (window.CONFIG && window.CONFIG.approvedMembers) || [];
    if (approved.some((n) => String(n).trim().toLowerCase() === full)) return true;
    try { if (Store.getMembers()[Store.nameKey(first, last)]) return true; } catch (e) {}
    return false;
  }
  const hasRequest = (who) => !!Store.getRequests()[Store.nameKey(who.first, who.last)];
  const registryKey = () => (window.CONFIG && window.CONFIG.accessPassword) || "";

  /* ---- Password hashing --------------------------------------------------- */
  const toB64 = (u8) => btoa(String.fromCharCode(...u8));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function derive(pw, salt, iter) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64(salt), iterations: iter }, key, 256);
    return toB64(new Uint8Array(bits));
  }
  async function makeCred(pw, who) {
    const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
    return { salt, hash: await derive(pw, salt, ITER), iter: ITER, algo: "pbkdf2-sha256", name: who.full, updatedAt: Date.now() };
  }
  async function verify(pw, cred) {
    const h = await derive(pw, cred.salt, cred.iter || ITER);
    let diff = h.length ^ String(cred.hash).length;
    for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ String(cred.hash).charCodeAt(i);
    return diff === 0;
  }
  const cloudOn = () => !!(window.Cloud && Cloud.enabled());
  const cloudConfigured = () => !!(window.CONFIG && window.CONFIG.firebaseConfig && window.CONFIG.firebaseConfig.apiKey);
  // An account's password record: object, null (none set yet), or undefined (offline — can't tell).
  async function lookupCred(id) {
    if (cloudOn()) {
      try { const c = await Cloud.getCred(id); Store.cacheCred(id, c); return c; } catch (e) {}
    } else if (!cloudConfigured()) {
      return Store.getCachedCred(id); // local-only install: this device is the source of truth
    }
    return Store.getCachedCred(id) || undefined;
  }
  async function saveCred(id, cred) {
    if (cloudOn()) await Cloud.setCred(id, cred);
    else if (cloudConfigured()) throw new Error("offline");
    Store.cacheCred(id, cred);
  }
  async function waitRoster() { if (cloudOn()) await Cloud.whenConfig(5000); }

  // Logging out also takes this device off the account's device list (waits a moment at most).
  function logout() {
    const done = () => { Store.clearSession(); location.reload(); };
    if (!cloudOn() || !Cloud.removeDevice) return done();
    Promise.race([Cloud.removeDevice(Store.getDevice().id).catch(() => {}), new Promise((r) => setTimeout(r, 1500))]).then(done);
  }

  // Signed out on this device, with a note for the login screen, then a fresh page.
  const REMOVED_MSG = "An admin removed you from the team roster. Ask a team lead if that's a mistake.";
  function kick(msg) {
    if (!currentUser()) return;
    try { sessionStorage.setItem("bb702.authMsg", msg); } catch (e) {}
    Store.clearSession(); location.reload();
  }
  // Ends this session if the account's password was reset or changed elsewhere.
  async function checkSession() {
    const s = currentUser(); if (!s || !cloudOn()) return;
    try {
      const c = await Cloud.getCred(Store.scouterIdFor(s.first, s.last));
      if (!c || (s.cv && c.updatedAt !== s.cv)) kick(isAccepted(s.first, s.last) ? "Your password was reset. Log in again." : REMOVED_MSG);
    } catch (e) {} // offline: keep the session
  }
  // Live, on every open device: removed from the roster → signed out now. (Called by
  // cloud.js whenever the server's roster changes.)
  function enforceRoster() {
    const s = currentUser();
    if (s && !isAccepted(s.first, s.last)) kick(REMOVED_MSG);
  }
  // Live, on every open device: password reset or account removed → signed out now.
  function watchSession() {
    const s = currentUser(); if (!s || !cloudOn() || !Cloud.watchCred) return;
    Cloud.watchCred(Store.scouterIdFor(s.first, s.last), (c) => {
      const cur = currentUser(); if (!cur) return;
      if (!c || (cur.cv && c.updatedAt !== cur.cv)) kick(isAccepted(cur.first, cur.last) ? "Your password was reset. Log in again." : REMOVED_MSG);
    });
    trackDevice();
  }

  /* ---- Signed-in devices (Settings → Your devices) ---------------------------
     Every browser that signs in has a devices/{id} doc. Signing a device out from
     another one deletes that doc; the device sees it disappear and logs out. */
  const SIGNED_OUT_MSG = "You were signed out from another device.";
  function deviceInfo() {
    const ua = navigator.userAgent || "";
    const os = /iPhone/.test(ua) ? "iPhone" : (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) ? "iPad"
      : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet") : /CrOS/.test(ua) ? "Chromebook"
      : /Windows/.test(ua) ? "Windows PC" : /Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux PC" : "Device";
    const br = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /OPR\//.test(ua) ? "Opera"
      : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Browser";
    return { label: os + " · " + br, kind: /iPhone|phone/.test(os) ? "phone" : /iPad|tablet/.test(os) ? "tablet" : "computer" };
  }
  let deviceWatching = false, lastTouch = 0;
  async function trackDevice() {
    const s = currentUser(); if (!s || !cloudOn() || !Cloud.getDevice) return;
    const dev = Store.getDevice(), uid = Store.scouterIdFor(s.first, s.last);
    let doc;
    try { doc = await Cloud.getDevice(dev.id); } catch (e) { return; } // offline: next time
    if (!currentUser()) return;
    if (doc && doc.uid === uid && dev.reg === s.ts) { lastTouch = Date.now(); Cloud.touchDevice(dev.id); }
    else if (!doc && dev.reg === s.ts) return kick(SIGNED_OUT_MSG); // signed out elsewhere while this one was closed
    else {
      const info = deviceInfo(), now = Date.now();
      try { await Cloud.setDevice(dev.id, { uid, name: s.first + " " + s.last, label: info.label, kind: info.kind, created: now, lastSeen: now, session: s.ts }); }
      catch (e) { return; }
      Store.setDeviceReg(s.ts); lastTouch = now;
    }
    if (deviceWatching) return;
    deviceWatching = true;
    Cloud.watchDevice(dev.id, (d) => {
      const cur = currentUser();
      if (cur && !d && Store.getDevice().reg === cur.ts) kick(SIGNED_OUT_MSG);
    });
  }
  // "Last active" on the device list: refreshed at most every 30 minutes.
  function touchDevice() {
    if (!currentUser() || !cloudOn() || !Cloud.touchDevice || Date.now() - lastTouch < 30 * 60 * 1000) return;
    if (Store.getDevice().reg !== currentUser().ts) return;
    lastTouch = Date.now(); Cloud.touchDevice(Store.getDevice().id);
  }

  /* ---- Screen --------------------------------------------------------------- */
  let wrap = null, onDoneCb = null, pollTimer = null, failCount = 0, lockUntil = 0;
  const $ = (sel) => wrap.querySelector(sel);
  const val = (sel) => { const el = $(sel); return el ? el.value : ""; };
  const clearPoll = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };

  function showLogin(onDone) {
    onDoneCb = onDone;
    document.getElementById("app").style.display = "none";
    try { if (window.Cloud) Cloud.init(); } catch (e) {}
    wrap = document.createElement("div");
    wrap.className = "auth-screen";
    wrap.id = "loginScreen";
    wrap.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand">
          <img class="auth-logo logo-dark" src="assets/logo-dark.png" alt="FRC 702 Bagel Bytes logo" />
          <img class="auth-logo logo-light" src="assets/logo.png" alt="FRC 702 Bagel Bytes logo" />
          <div><h1 class="auth-title">Bagel<span>Tools</span></h1><p class="auth-tag">FRC 702 · Members only</p></div>
        </div>
        <div class="auth-tabs" id="authTabs" role="tablist">
          <span class="auth-tab-pill"></span>
          <button type="button" role="tab" data-tab="login">Log in</button>
          <button type="button" role="tab" data-tab="register">Register</button>
        </div>
        <div id="authStage"></div>
      </div>`;
    document.body.appendChild(wrap);
    $("#authTabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]"); if (!b || b.classList.contains("on")) return;
      const who = canon(val("#aFirst"), val("#aLast"));
      if (b.dataset.tab === "register") showRegisterView(who, "from-right"); else showLoginView("", who, "from-left");
    });
    // Delegated: show/hide password, inline "register here" links.
    wrap.addEventListener("click", (e) => {
      const eye = e.target.closest("[data-eye]");
      if (eye) {
        const inp = $("#" + eye.dataset.eye); if (!inp) return;
        const show = inp.type === "password";
        inp.type = show ? "text" : "password";
        eye.innerHTML = icon(show ? "eye-off" : "eye");
        eye.setAttribute("aria-label", show ? "Hide password" : "Show password");
        return;
      }
      if (e.target.closest("[data-go-register]")) showRegisterView(canon(val("#aFirst"), val("#aLast")), "from-right");
    });
    let msg = "";
    try { msg = sessionStorage.getItem("bb702.authMsg") || ""; sessionStorage.removeItem("bb702.authMsg"); } catch (e) {}
    showLoginView(msg);
  }

  function setTabs(active) {
    const t = $("#authTabs");
    t.hidden = !active;
    if (!active) return;
    t.querySelectorAll("[data-tab]").forEach((b) => {
      const on = b.dataset.tab === active;
      b.classList.toggle("on", on); b.setAttribute("aria-selected", on);
    });
    $(".auth-tab-pill").classList.toggle("right", active === "register");
  }

  function stage(html, dir) {
    clearPoll();
    const st = $("#authStage");
    st.innerHTML = `<div class="auth-view ${dir || ""}">${html}</div>`;
    const first = [...st.querySelectorAll("input")].find((i) => !i.value);
    if (first && !(window.matchMedia && matchMedia("(pointer: coarse)").matches)) first.focus();
  }

  const field = (id, label, type, ico, attrs = "") => `
    <label class="auth-field" for="${id}"><span class="auth-label">${label}</span>
      <span class="auth-input">${icon(ico)}<input id="${id}" type="${type}" ${attrs} />${type === "password"
        ? `<button type="button" class="auth-eye" data-eye="${id}" aria-label="Show password">${icon("eye")}</button>` : ""}</span>
    </label>`;
  const nameRow = (who) => `<div class="auth-row">
      ${field("aFirst", "First name", "text", "user", `autocomplete="username" placeholder="First" value="${esc(who && who.first)}"`)}
      ${field("aLast", "Last name", "text", "user", `autocomplete="username" placeholder="Last" value="${esc(who && who.last)}"`)}
    </div>`;
  // Password managers save ONE username per password. A hidden "username" field
  // ("First Last") sits right before the password box: it's what gets saved, and
  // when a manager fills it back in we split it into the first/last boxes.
  const userField = (who) => `<input id="aUser" class="auth-user" type="text" name="username" autocomplete="username"
      tabindex="-1" aria-hidden="true" value="${esc(who ? (who.full || [who.first, who.last].filter(Boolean).join(" ")) : "")}" />`;
  function wireUserField() {
    const u = $("#aUser"), f = $("#aFirst"), l = $("#aLast");
    if (!u) return;
    const toNames = () => {
      const v = u.value.trim(); if (!v || !f) return;
      const i = v.indexOf(" ");
      if (v === (val("#aFirst") + " " + val("#aLast")).trim()) return;
      f.value = i < 0 ? v : v.slice(0, i); l.value = i < 0 ? "" : v.slice(i + 1).trim();
    };
    const toUser = () => { u.value = (val("#aFirst") + " " + val("#aLast")).trim(); };
    u.addEventListener("input", toNames); u.addEventListener("change", toNames);
    // The name boxes also offer saved logins. A manager fills them with the whole
    // "First Last" username (not typed keystrokes), so split it across both boxes.
    const fromBox = (e) => {
      const box = e.target, v = box.value.trim();
      const typed = e.inputType && /^(insertText|delete|insertCompositionText)/.test(e.inputType);
      if (!typed && v.includes(" ")) {
        const i = v.indexOf(" ");
        f.value = v.slice(0, i); l.value = v.slice(i + 1).trim();
      } else if (!typed && box === l && v && v === u.value.split(" ").slice(1).join(" ")) {
        f.value = u.value.split(" ")[0];
      }
      toUser();
    };
    if (f) { f.addEventListener("input", fromBox); l.addEventListener("input", fromBox); f.addEventListener("change", fromBox); l.addEventListener("change", fromBox); }
    // Chrome/Edge/Android: ask the browser's password manager for the saved login
    // as soon as ANY of the three boxes is tapped, and fill all three at once.
    let asked = false;
    const askSaved = async () => {
      if (asked || !window.PasswordCredential || !navigator.credentials) return;
      asked = true;
      try {
        const c = await navigator.credentials.get({ password: true, mediation: "optional" });
        if (!c || !c.id || !c.password || !u.isConnected) return;
        u.value = c.id; u.dispatchEvent(new Event("change"));
        const pw = $("#aPass"); if (pw) pw.value = c.password;
      } catch (e) { /* not supported / dismissed */ }
    };
    [f, l, $("#aPass")].forEach((x) => x && x.addEventListener("focus", askSaved));
    // some browsers autofill silently on page load (no event): check a few times
    let n = 0; const t = setInterval(() => { toNames(); if (++n > 10 || !u.isConnected) clearInterval(t); }, 300);
  }
  const steps = (n) => `<ol class="auth-steps" aria-label="Registration progress">
      ${["Request", "Password", "Approval"].map((t, i) => {
        const st = i + 1 < n ? "done" : i + 1 === n ? "on" : "";
        return `<li class="${st}"><span class="auth-step-dot">${st === "done" ? icon("check") : i + 1}</span><span>${t}</span></li>`;
      }).join("")}
    </ol>`;
  const submitBtn = (label) => `<button type="submit" class="auth-btn"><span class="auth-btn-label">${label}</span>${icon("arrow-right")}</button>`;

  function fail(msg, isHtml) {
    const err = $(".auth-error"); if (!err) return;
    if (isHtml) err.innerHTML = msg; else err.textContent = msg;
    err.hidden = false;
    const card = $(".auth-card");
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
  }
  function busy(btn, on, label) {
    if (!btn || !btn.isConnected) return;
    btn.disabled = on; btn.classList.toggle("loading", on);
    if (label) btn.querySelector(".auth-btn-label").textContent = label;
  }

  /* ---- Log in ---------------------------------------------------------------- */
  function showLoginView(note, who, dir) {
    setTabs("login");
    stage(`
      <form class="auth-form" id="loginForm" novalidate>
        <p class="auth-lead">Welcome back! Log in with your name and password.</p>
        ${note ? `<div class="auth-note">${esc(note)}</div>` : ""}
        ${nameRow(who)}
        ${userField(who)}
        ${field("aPass", "Password", "password", "lock", `autocomplete="current-password" placeholder="Your password"`)}
        <div class="auth-error" role="alert" hidden></div>
        ${submitBtn("Log in")}
        <button type="button" class="auth-link" id="forgotBtn">Forgot your password?</button>
        <p class="auth-micro" id="forgotHint" hidden>Ask a team admin to reset it from the Admin panel, then log in and create a new one.</p>
      </form>`, dir);
    $("#forgotBtn").onclick = () => { $("#forgotHint").hidden = !$("#forgotHint").hidden; };
    $("#loginForm").onsubmit = onLogin;
    wireUserField();
  }

  async function onLogin(e) {
    e.preventDefault();
    if (Date.now() < lockUntil) return fail(`Too many wrong tries. Wait ${Math.ceil((lockUntil - Date.now()) / 1000)}s and try again.`);
    if (!val("#aFirst") && val("#aUser")) $("#aUser").dispatchEvent(new Event("change"));
    const who = canon(val("#aFirst"), val("#aLast"));
    const pw = val("#aPass");
    if (!who.first) return fail("Enter your first name.");
    const btn = $(".auth-btn");
    busy(btn, true, "Checking…");
    try {
      await waitRoster();
      const cred = await lookupCred(Store.scouterIdFor(who.first, who.last));
      if (!isAccepted(who.first, who.last)) {
        // Registered (password set) but not approved yet: right password → the waiting screen.
        if (cred) {
          if (!pw) return fail("Enter your password.");
          if (!(await verify(pw, cred))) {
            if (++failCount >= 5) { failCount = 0; lockUntil = Date.now() + 30000; }
            return fail("Wrong password.");
          }
          if (!hasRequest(who)) sendRequest(who); // e.g. the request got cleared: ask again
          return showPendingView(who, false, cred);
        }
        if (cred === undefined) return fail("Can't reach the server to check your password. Check your connection and try again.");
        if (hasRequest(who)) return showPendingView(who, false, null);
        return fail(`No account for “${esc(who.full)}” yet. <button type="button" class="auth-inline" data-go-register>Register here</button>`, true);
      }
      if (cred === undefined) return fail("Can't reach the server to check your password. Check your connection and try again.");
      if (cred === null) return showSetPasswordView(who, { needKey: true, existing: true });
      if (!pw) return fail("Enter your password.");
      if (!(await verify(pw, cred))) {
        if (++failCount >= 5) { failCount = 0; lockUntil = Date.now() + 30000; }
        return fail("Wrong password. Forgot it? Ask an admin to reset it.");
      }
      rememberLogin(who, pw);
      signIn(who, cred);
    } catch (err) {
      console.warn("[Auth] login failed", err);
      fail("Something went wrong. Try again.");
    } finally { busy(btn, false, "Log in"); }
  }

  /* ---- Register ------------------------------------------------------------- */
  function showRegisterView(who, dir) {
    setTabs("register");
    stage(`
      ${steps(1)}
      <form class="auth-form" id="regForm" novalidate>
        <p class="auth-lead">New here? Request an account and create your password. A team admin approves it after that, even if they're away right now.</p>
        ${nameRow(who)}
        ${field("aKey", "Registry Key", "password", "key", `autocomplete="off" placeholder="Ask a team lead"`)}
        <p class="auth-micro">Your first and last name together become your username.</p>
        <div class="auth-error" role="alert" hidden></div>
        ${submitBtn("Next: create a password")}
      </form>`, dir);
    $("#regForm").onsubmit = onRegister;
  }

  async function onRegister(e) {
    e.preventDefault();
    const who = canon(val("#aFirst"), val("#aLast"));
    if (!who.first || !who.last) return fail("Enter your first and last name.");
    if (!registryKey()) return fail("No Registry Key is configured — see js/secrets.js.");
    if (val("#aKey") !== registryKey()) return fail("That Registry Key isn't right. Ask a team lead for it.");
    const btn = $(".auth-btn");
    busy(btn, true, "Checking…");
    try {
      await waitRoster();
      const cred = await lookupCred(Store.scouterIdFor(who.first, who.last));
      if (cred === undefined) return fail("Can't reach the server. Check your connection and try again.");
      if (isAccepted(who.first, who.last)) {
        if (cred) return showLoginView(`You already have an account, ${who.first}. Log in below.`, who, "from-left");
        return showSetPasswordView(who, { needKey: false, existing: true });
      }
      // Already registered (password set, maybe still waiting): log in to check on it.
      if (cred) return showLoginView(`${who.first}, you already registered. Log in with your password to see if you're approved yet.`, who, "from-left");
      showSetPasswordView(who, { needKey: false, newReg: true });
    } catch (err) {
      console.warn("[Auth] register failed", err);
      fail("Something went wrong. Try again.");
    } finally { busy(btn, false, "Next: create a password"); }
  }
  // The access request admins see (approval is the last step, after the password).
  function sendRequest(who) {
    Store.recordLogin(who.first, who.last); // creates the pending request locally
    const key = Store.nameKey(who.first, who.last);
    const entry = Store.getRequests()[key] || { first: who.first, last: who.last, ts: Date.now() };
    if (cloudOn()) Cloud.pushAccessRequest(key, entry);
  }

  /* ---- Waiting for approval -------------------------------------------------- */
  // cred = their saved password record (they registered under the new order). Without
  // one (a request from before approval came last), approval leads to creating it.
  function showPendingView(who, justSent, cred) {
    setTabs(null);
    clearPoll();
    stage(`
      ${steps(3)}
      <div class="auth-wait">
        <div class="auth-radar">${icon("bell")}</div>
        <h2 class="auth-h">Waiting for approval</h2>
        <div class="login-pending">Hi ${esc(who.first)}! ${justSent ? "Your password is saved and your request was sent to" : "Your request is still with"} the team admins.
          ${cred ? `<b>You can close this page.</b> Once an admin approves you, just log in with your name and password. Keep it open and you'll be let in automatically.`
            : `<b>Keep this page open. As soon as you're approved, you'll create your password right here.</b>`}</div>
        <button type="button" class="auth-link" id="pendBack">← Back to log in</button>
      </div>`, "from-right");
    $("#pendBack").onclick = () => { clearPoll(); showLoginView("", who, "from-left"); };
    pollTimer = setInterval(() => {
      if (!wrap || !wrap.isConnected) return clearPoll();
      try { if (isAccepted(who.first, who.last)) { clearPoll(); showApproved(who, cred); } } catch (e) {}
    }, 2000);
  }
  function showApproved(who, cred) {
    stage(`${steps(4)}
      <div class="auth-wait"><div class="auth-burst">${icon("check")}</div>
        <h2 class="auth-h">You're approved!</h2><p class="auth-micro">${cred ? "Welcome to BagelTools…" : "Now let's set up your password…"}</p></div>`);
    setTimeout(() => {
      if (!wrap || !wrap.isConnected) return;
      if (cred) signIn(who, cred); else showSetPasswordView(who, { needKey: false });
    }, 1300);
  }

  /* ---- Create password ------------------------------------------------------- */
  function showSetPasswordView(who, opts) {
    setTabs(null);
    const label = opts.existing ? "Save password & log in" : opts.newReg ? "Save password & send request" : "Create account";
    stage(`
      ${opts.existing ? `<div class="auth-badge">${icon("shield")} Secure your account</div>` : steps(opts.newReg ? 2 : 4)}
      <form class="auth-form" id="pwForm" novalidate>
        <p class="auth-lead">${opts.existing
          ? `Welcome back, <b>${esc(who.first)}</b>! Your account doesn't have a password yet. Create one so nobody else can log in as you.`
          : opts.newReg ? `Hi <b>${esc(who.first)}</b>! Create a password you'll remember. Then a team admin approves your account.`
          : `Last step, <b>${esc(who.first)}</b>: create a password you'll remember.`}</p>
        <div class="auth-who">${icon("user")}<span>${esc(who.full)}</span></div>
        ${userField(who)}
        ${opts.needKey ? field("aKey", "Registry Key", "password", "key", `autocomplete="off" placeholder="Team registry key"`) : ""}
        ${field("aNew", "New password", "password", "lock", `autocomplete="new-password" placeholder="At least ${MIN_PW} characters"`)}
        ${field("aConfirm", "Type it again", "password", "lock", `autocomplete="new-password" placeholder="Repeat your password"`)}
        <ul class="auth-reqs">
          <li data-req="len">${icon("check")} At least ${MIN_PW} characters</li>
          <li data-req="match">${icon("check")} Both passwords match</li>
        </ul>
        <div class="auth-error" role="alert" hidden></div>
        ${submitBtn(label)}
        <button type="button" class="auth-link" id="pwBack">← Cancel</button>
      </form>`, "from-right");
    const reqs = () => {
      const a = val("#aNew"), b = val("#aConfirm");
      $('[data-req="len"]').classList.toggle("ok", a.length >= MIN_PW);
      $('[data-req="match"]').classList.toggle("ok", !!a && a === b);
    };
    $("#aNew").oninput = reqs; $("#aConfirm").oninput = reqs;
    $("#pwBack").onclick = () => showLoginView("", who, "from-left");
    $("#pwForm").onsubmit = async (e) => {
      e.preventDefault();
      const a = val("#aNew"), b = val("#aConfirm");
      if (opts.needKey && val("#aKey") !== registryKey()) return fail("That Registry Key isn't right. Ask a team lead for it.");
      if (a.length < MIN_PW) return fail(`Your password needs at least ${MIN_PW} characters.`);
      if (a !== b) return fail("The two passwords don't match.");
      const btn = $(".auth-btn");
      busy(btn, true, "Saving…");
      try {
        const id = Store.scouterIdFor(who.first, who.last);
        const existing = await lookupCred(id);
        if (existing === undefined) return fail("Can't reach the server. Check your connection and try again.");
        if (existing) return fail("This account already has a password. If that wasn't you, ask an admin to reset it.");
        const cred = await makeCred(a, who);
        await saveCred(id, cred);
        rememberLogin(who, a);
        await waitRoster();
        if (opts.newReg && !isAccepted(who.first, who.last)) { sendRequest(who); return showPendingView(who, true, cred); }
        signIn(who, cred);
      } catch (err) {
        console.warn("[Auth] set password failed", err);
        fail("Couldn't save your password. Check your connection and try again.");
      } finally { busy(btn, false, label); }
    };
  }

  // Offer to save "First Last" + password in the browser's password manager
  // (the browser asks the user first; does nothing where unsupported).
  function rememberLogin(who, pw) {
    try {
      if (window.PasswordCredential && navigator.credentials && pw)
        navigator.credentials.store(new PasswordCredential({ id: who.full, password: pw, name: who.full })).catch(() => {});
    } catch (e) {}
  }

  /* ---- Enter the app --------------------------------------------------------- */
  function signIn(who, cred) {
    clearPoll();
    // the name as the team roster has it (keeps deliberate capitals like "McDonald")
    const m = Store.getMembers()[Store.nameKey(who.first, who.last)];
    if (m && m.first) who = canon(m.first, m.last);
    Store.cacheCred(Store.scouterIdFor(who.first, who.last), cred);
    const status = Store.getMembers()[Store.nameKey(who.first, who.last)] ? Store.recordLogin(who.first, who.last) : "known";
    Store.setSession({ first: who.first, last: who.last, ts: Date.now(), v: SESSION_V, cv: cred.updatedAt });
    if (!Store.getSettings().scoutName) Store.setSettings({ scoutName: who.full });
    $(".auth-card").classList.add("auth-done");
    setTimeout(() => wrap.classList.add("bye"), 320);
    setTimeout(() => {
      wrap.remove(); wrap = null;
      document.getElementById("app").style.display = "";
      if (onDoneCb) onDoneCb(status);
    }, 600);
  }

  return { currentUser, isLoggedIn, logout, showLogin, checkSession, enforceRoster, watchSession, touchDevice, properName };
})();
window.Auth = Auth;
