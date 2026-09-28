# Bagel Bytes Scouting · FRC Team 702

An offline-first scouting web app for **FRC 702 – The Bagel Bytes** (Culver City High School Robotics),
built for the **2026 REBUILT** season. It handles **match scouting, pit scouting, strategy, and pick-lists**,
and pulls event/team data from **The Blue Alliance** and team colors from **frc-colors.com**.

- Team colors: cyan `#5bbde2` + yellow `#ffc718`
- Font: **Orbitron** (display) + Rajdhani (UI)
- No build step, no backend — just static files. Works offline once an event is loaded.

---

## Quick start (run locally)

You need Python 3 (already installed on this machine as the `py` launcher).

```bash
py -3 -m http.server 8702
```

Then open **http://localhost:8702** in your browser.

> Opening `index.html` directly as a file (`file://`) will load the UI, but The Blue Alliance
> data calls may be blocked by the browser. Always run it through a server (the command above,
> or real hosting below).

---

## One-time setup (a mentor/lead does this once)

Everything you configure lives in **`js/config.js`**:

```js
window.CONFIG = {
  defaultTbaKey: "your-tba-key-here",     // The Blue Alliance "Read" key
  accessPassword: "bagelplanet2027",       // password scouts type on the login screen
  adminPin: "fmc2056",                     // PIN to open the Admin panel
  statboticsBase: "https://api-statbotics.popcornpenguins.com/v3",  // BagelStats World/State EPA (mirror)
};
```

The **pit map** is now set from a pasted image link inside the app (**Settings → Pit map**), not a config key.

> **Optional cloud sync** (Firebase) lets scouts share a live leaderboard, online
> status, everyone's match/pit data, and each other's pick lists. It's off by default
> (`firebaseConfig: {}`) and the app works fully offline without it. See
> **[Cloud sync (optional)](#cloud-sync-optional)** below to turn it on.

1. **Add the team's Blue Alliance key** — paste your free TBA "Read" key as `defaultTbaKey`.
   Get / regenerate one at <https://www.thebluealliance.com/account>. Once set, **scouts never
   have to enter a key**. (It's a static site, so the key ships in the page source; TBA read keys
   are read-only, rate-limited, and free to regenerate, so this is an accepted tradeoff.)
2. **Set the team password & admin PIN** if you want to change them from the defaults above.
3. **Pick your event** — right on the **Dashboard**, tap **Choose event** (or click the event name at the
   bottom-left of the sidebar from any page). This caches the team list + schedule for **offline use** —
   do it at home on wifi first.
4. *(Optional)* **Pit map** — in **Settings → Pit map**, paste a link to your event's pit-map image and toggle it
   on. The Pit Scouting page shows the image above a team grid that turns green as pits get scouted (toggle off
   for events with no map).

## Login & access control

- Opening the site shows a **login screen**: first name, last name, and the **team password**.
  This keeps other teams out. *(It's a client-side gate — a deterrent, not bank-grade security,
  since the password is in the page source.)*
- Every login is recorded to a local **member roster**. The first time a new name signs in, it
  raises an **access request**.
- The **Admin** tab (unlocked with the admin PIN) shows the roster and any pending requests, with
  **Approve / Deny**. Already-registered names don't create new requests. A badge on the Admin nav
  item shows how many requests are waiting.
- Because the app is **offline-first**, the roster/requests live per-device. To aggregate logins
  from scouts' phones onto your admin device, have them **Data → Export** and import the file
  (**Data → Import → Merge**) — the roster merges automatically.
- Scouts can **log out** from the button next to their name in the sidebar.

Each scout just: opens the site, logs in with their name + the team password, and starts scouting.

> A single scout can also use their own personal key on their own device via
> **Settings → The Blue Alliance → Advanced** (stored only in their browser, overrides the built-in one).

---

## How it's used at a competition (offline)

Because competition wifi is unreliable, this app is **offline-first**:

- All scouting data is saved in **your browser** (localStorage). No internet needed to scout.
- Each scout works on their own phone/tablet. To combine everyone's data:
  1. Each scout goes to **Data → Export → Full backup (.json)**.
  2. Send the files to one “lead” device (AirDrop, email, USB, Drive…).
  3. On the lead device, **Data → Import** each file with mode **Merge**.
- The lead device now has all data for **Strategy**, **Pick List**, and CSV exports.

> ⚠️ Data lives per-device and per-browser. **Export backups often.** Clearing browser data
> or using a private window will lose unsaved scouting data.

---

## Features

| Page | What it does |
|------|--------------|
| **Dashboard** | Prominent event chooser and recent records. During a live event: **next match, last 5 matches, and live TBA rankings**. |
| **Members** | Three subpages. **Profile** — your Bagel Bucks, matches/pits scouted, last teams scouted & pit-scouted, online status, and a profile-picture upload. **Leaderboard** — everyone ranked by Bagel Bucks (big BB total + "# M · # P"). **Scouters** — the whole roster alphabetically with online status. Tap anyone to open their profile. |
| **Teams** | Every team at your event, with frc-colors swatches, averages, and a detail view. Sort by Team #, Name A–Z, or EPA. |
| **Match Scouting** | REBUILT-specific form: auto/teleop fuel, auto & endgame Tower climb, defense, driver skill, notes. Edit/delete past records. |
| **Pit Scouting** | Robot capabilities (drivetrain, fuel scoring/intake, max climb, auto, role). Questions are **editable in the Admin panel**. Shows a live **Nexus pit map** (green = scouted, red = not) when a Nexus key is set and a map is available. |
| **BagelStats** | EPA stats. Tabs: **World / State / District** (official Statbotics season EPA + ranks, with state & district dropdowns, **all active teams paginated 25/page**) and **Event** (on-device EPA + auto/teleop/endgame, ranked by **TBA rankings** with **ranking score (RP)** and **W-L-T**). **Click any column header to sort.** frc-colors chips; click a row to open the team. Each team's popup shows world/event rank, season **W-L-T**, and an **EPA-over-time line graph** (Season view has per-event dividers). |
| **Compare** | Add up to 6 teams and overlay their **EPA graphs**, plus a stat-comparison table (EPA, auto/teleop/endgame, ranks, record). Subtabs: **Global** & **Event**. |
| **Pick List** | Three subpages. **Alliance selection** — 8 alliances × Captain/1st/2nd/3rd (**capped at the 3rd pick**), drag or tap teams from an EPA-sorted pool into slots, **one multiselect trait filter**, Do-Not-Pick zone, single-click a team to view its stats, Submit. **Tierlist** — sort every team into **S–F** by dragging (or an **Auto-rate by EPA** button), plus **Clear list** and Submit. **Scouters lists** — see the alliance boards & tier lists other scouts submitted (needs cloud sync). |
| **Data** | An **always-visible growing spreadsheet** of every match record (and a tab for all pit records) — no export needed to read the data; with cloud sync on it aggregates every scout's data. Plus export (JSON backup / CSV), import (merge or replace), and clear-data. |
| **Bagel Bucks (BB)** | A team currency scouts earn **only while the event is live *and* an admin has approved it** (Admin panel): **+10 BB** per match scouted, **+5 BB** per new team pit-scouted. Drives the Members leaderboard. |
| **Settings** | TBA key, event selection, scout name, light/dark theme. |

### 2026 REBUILT scoring used for “estimated points”
- Fuel (auto or teleop): **1 pt** each
- Auto Tower climb Level 1: **15 pts**
- Endgame Tower climb: **L1 = 10, L2 = 20, L3 = 30**
- (Ranking points for reference: Energized ≥100 fuel, Supercharged ≥360 fuel, Traversal ≥50 tower pts)

To adjust fields or point values for a future season, edit **`js/game-config.js`** only.

### BagelStats / EPA
- **World & State** leaderboards and each team's **world rank** come from **Statbotics'** public, keyless API
  (`api.statbotics.io`) — cached for offline use. These need internet + Statbotics being up; if it's unreachable,
  those views show a friendly notice and everything else keeps working.
- **Event / ongoing EPA** is computed **on-device** from TBA qual-match results (see `js/epa.js`) — no external
  stats service, works live during a competition. It's a faithful but simplified EPA (event-only, no season priors),
  so it tracks Statbotics closely but isn't identical.
- On a team's popup you'll see **World rank**, **current Event rank**, and EPA three ways — **all events (season)**,
  **last event**, and **ongoing event**. Clicking World rank or Event rank jumps to the matching BagelStats tab.

---

## Cloud sync (optional)

By default the app is **local-only** — nothing leaves a device except manual exports.
Turning on Firebase adds **realtime cross-scout sharing** while keeping the offline-first
behavior (if the network drops, everything keeps working and syncs when it's back).

**What you get with it on:**
- **Members → Leaderboard / Scouters** show *everyone* on the team, their Bagel Bucks,
  and live **online status**.
- **Data** aggregates every scout's match + pit records into the one growing table.
- **Pick List → Scouters lists** shows the alliance boards and tier lists other scouts submit.
- Profile pictures sync too (stored as small compressed images **inside Firestore** — no
  Firebase Storage and **no paid plan** needed; the free **Spark** plan is enough).

**One-time setup (a mentor/lead):**
1. Go to <https://console.firebase.google.com> → **Add project** (free Spark plan is fine).
2. In the project, **Build → Firestore Database → Create database** → start in **test mode**
   (or production mode, then paste the rules below). Pick a region close to you.
3. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an app →
   copy the `firebaseConfig` object it shows you.
4. Paste it into **`js/config.js`** as the `firebaseConfig` value, e.g.:
   ```js
   firebaseConfig: {
     apiKey: "AIza…",
     authDomain: "bagelscout.firebaseapp.com",
     projectId: "bagelscout",
     storageBucket: "bagelscout.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef",
   },
   ```
5. Re-open the site — the Members pages and Scouters lists now show the whole team.

**Firestore security rules.** This is a client-only app with no user accounts, so the
simplest workable rules allow read/write to the five collections it uses. Paste these in
**Firestore → Rules** (they at least scope access to just this app's collections):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /{coll}/{doc} {
      allow read, write: if coll in ['scouters','matches','pits','boards','tierlists'];
    }
  }
}
```
> ⚠️ These rules are **open** (anyone with your config can read/write those collections).
> That's an accepted tradeoff for a keyless team tool — same spirit as the client-side
> password gate. If you want it locked down, add Firebase Anonymous Auth and require
> `request.auth != null`. Don't store anything sensitive in scouting data.

**Turning it back off:** set `firebaseConfig: {}` again — the app returns to local-only.

---

## Deploy it (host anywhere)

It's a plain static site — upload the whole folder to any static host.

**GitHub Pages**
1. Create a repo and push these files.
2. Repo **Settings → Pages → Deploy from branch → `main` / root**.
3. Visit `https://<you>.github.io/<repo>/`.

**Netlify / Vercel:** drag-and-drop the folder (Netlify Drop) or import the repo — no build command, publish directory = project root.

---

## Project structure

```
index.html            App shell + icon sprite
styles.css            Theme (team colors), layout, components (dark + light)
js/config.js          TBA key, team password, admin PIN, Firebase config (optional)
js/game-config.js     REBUILT 2026 scoring + scouting field definitions  ← edit per season
js/store.js           localStorage data layer + export/import + member roster
js/api.js             The Blue Alliance + frc-colors + Statbotics (read-only, cached)
js/epa.js             On-device EPA computation from TBA match results
js/auth.js            Login gate
js/cloud.js           Optional Firebase Firestore sync (no-op when unconfigured)
js/app.js             Router + all views (incl. Members, Pick List, BagelStats & Admin)
assets/logo.png       Team 702 logo
Media/702-logo.png    Original logo
```

---

## Privacy & notes
- The only network calls are read-only GETs to `thebluealliance.com` (with your key) and `api.frc-colors.com`.
- Your scouting data never leaves your device except when *you* export a file.
- Team colors shown on other teams' cards come from frc-colors.com; 702's own branding uses the exact team hexes.
