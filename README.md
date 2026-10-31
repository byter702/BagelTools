# BagelTools · FRC Team 702

The all-in-one web app for **FRC 702 – The Bagel Bytes** (Culver City High School Robotics).
It's a **hub** that ties the team's tools together behind one login and one member system:
**Scouting**, **Statistics**, a **Parts** manufacturing tracker, and a team-currency economy
(**Bagel Bucks**) that powers **betting** and a **Fantasy Alliance** league.

🔗 **Live:** <https://www.702tools.com/>

- Brand: cyan `#5bbde2` + yellow `#ffc718`, with a per-app accent color (Scouting cyan, Statistics green, Parts orange, Fantasy pink).
- Fonts: **Orbitron** (display) + **Rajdhani** (UI).
- **No build step, no backend of our own** — just static files (`index.html` + `styles.css` + `js/`).
  Scouting is **offline-first**; the shared features sync through **Firebase Firestore**.

> This repo is **private on purpose**: `js/secrets.js` (the team password + admin PIN) is committed so
> the hosted deploy has them. On a static site that value ships to the browser anyway, so it's a deterrent,
> not real security — keep the repo private.

---

## The hub & its apps

Opening the site drops you on the **Home hub** with a big button per app. Inside an app, the sidebar
shows just that app's pages. Everything shares one account, the member roster, and your Bagel Bucks.

| App | Pages | What it's for |
|-----|-------|---------------|
| **Scouting** (cyan) | Match Scouting · Pit Scouting · Auto Scout · Data · Pick List | Scout every match and pit, read the data, and build the pick list. |
| **Statistics** (green) | Teams (BagelStats) · Compare · Event · Events · Matchup | Teams, events and matchups by the numbers (EPA, ranks, charts, predictions). |
| **Parts** (orange) | Board · My Parts · Guide | Track every robot part from Onshape to done, and who's building it. |
| **Fantasy** (pink) | Fantasy Alliance | Season-long draft league paid in Bagel Bucks. |
| **Home / Dashboard** | Profile · Members | The hub itself: countdowns, the live event, team spotlight, your Bagel Bucks, the leaderboard and roster. |
| **System** | Settings · Admin | Theme/season/account, and the admin panel (members, forms, betting). |

---

## Bagel Bucks — the economy that connects everything

**Bagel Bucks (BB)** is the team currency that links scouting to the fun stuff.

- **Earn** BB by scouting — **+25 BB** per match record and **+15 BB** per newly pit-scouted team —
  but only while an event is live **and** an admin has switched earning on (Admin panel). BB is tied to
  your **account** and shared across all your devices.
- **Spend** BB on **Bagel Bets**, the **Fantasy Alliance** and the **Bagel Shop** (below).
- The **Members → Leaderboard** ranks everyone by BB.

Because there's no server, all money moves inside **Firestore transactions**: a bet, refund or payout
reads the balance first and is applied at most once, so two phones can't double-spend or double-pay.

### Bagel Bets
Wager BB on the event as it happens:
- **Match pools** — bet whether a match goes **higher / accurate / lower / upset** vs. a frozen prediction line (run from the Match Scouting page). Matches settle **live, app-wide**, with a win/loss popup — whoever's device sees the result first settles it for everyone.
  **Winnings only pay out on a match you scouted:** a winning bet's prize is held until you save a scouting record
  for that match, then your device claims it automatically (once). Refunds are never held.
- **Alliance-selection predictions** — predict the 8 alliances; scored by exact/role/on.
- **Playoff brackets** — a 100 BB entry to fill an 8-alliance double-elimination bracket.

### Fantasy Alliance
A season-long fantasy league (by grade: Freshman / Sophomore & Junior / Senior). Draft a roster of robots
with a fantasy budget, earn weekly prizes and chase a grand prize, all paid in BB. Stalled draft turns
auto-pick after a few minutes so a league never stalls.

### Bagel Shop (beta, owner only)
A sidebar page (**Shop**) where BB buys collectible **bagel avatars** and **boosts**. While it's in beta only
the owner account (`CONFIG.owner`) sees the page and the bagel avatars.
- **Packs** (50 BB): Elemental, Legends and Enchanted. Each rolls a rarity first, then any bagel of that
  rarity in the pack: Common 50%, Uncommon 25%, Rare 15%, Epic 7%, Legendary 2.5%, Mythic 0.4%, Secret 0.1%.
  Every rarity has its own opening show, and they get bigger the rarer the pull.
- **110 bagels**, each an animated SVG: 107 drawn in code (`js/avatars*.js`) from the reference sheets in
  `media/avatar ref/`, plus three hand-made files in `media/bagels/` (Pharaoh, and the Secret Hallow's End and
  Vampire Lord; Pharaoh and Hallow's End have their own reveal intros), each with a lite cut for small avatars. An equipped bagel replaces your profile picture everywhere: the leaderboard, Profile,
  the scout pop-ups and robot locks on Match Scouting.
- **Duplicates** sell back for BB. **Boosts** (1.5×, 2× or 3× for an hour) multiply the BB you earn for new
  match and pit records. **Luck boosts** (2× for 3 packs, 3× or 5× for 5 packs) make Epic and rarer that many
  times as likely, taking the extra chance from Common.
- Everything is stored on your `scouters/{id}` doc (`avatars`, `avatar`, `boost`, `luck`) and changed in transactions.

---

## Parts — the manufacturing tracker

The **Parts** app is BagelParts ported into BagelTools
(originally a Python server at `github.com/Suhaan27/bagel-parts`). Same rules, now serverless: the whole
board lives in **one Firestore doc** (`bparts/state`) and every change is a transaction on it — exactly
like the old server's lock around `state.json`. PDF drawings and DXF files are stored in **chunks** under
`bpfiles/` (a Firestore doc holds at most ~1 MB).

- **Board** — Projects → mechanisms → parts. Import a BOM by pasting it (or a CSV); parts auto-classify by
  the `type-name` convention (`3dp-`, `fabworks-`, `lasercut-`, `inhouse-`) plus keyword detection for COTS
  (belts, gears, motors, pulleys, shafts, spacers, rollers, collars, electronics). Composite parts expand
  into their pieces. Drag parts between lists, recolor categories, and collapse empty ones to the bottom.
- **Per-type progress stages**, e.g. 3D-print *Unfinished → Designed → Printing → Done*, in-house
  *Unfinished → Designed → Drawing made → In progress → Done*, laser cut *Unfinished → Designed → DXF
  Uploaded → Done*, COTS *Ordered → Arrived → Sorted*.
- **People & assignments** — assign a part (or a whole category) to a teammate; a red **!** flags parts
  that are *ready to make* (in-house with a drawing, laser-cut with a DXF, or a 3D-print/pulley/spacer/shaft
  at "Designed"). **My Parts** shows what you're building.
- **Files** — drag a **PDF drawing** onto an in-house part (opens in a new tab) or a **DXF** onto a laser-cut
  part (downloads); uploading auto-advances the stage. **Undo** moves/assignments with **Ctrl/Cmd-Z**.
- **Save codes** — export/import a project (or the whole board) as a `BP1:…` code, same format as before.
- **Guide** — an in-app page explaining the naming rules and workflow.

---

## Scouting — offline-first

Competition wifi is unreliable, so scouting works with **no internet**. Each scout's records are saved in
their browser (localStorage); with cloud sync on, everyone's data aggregates automatically.

- **Match Scouting** — a season-specific form (2026 **REBUILT**: auto/teleop fuel, auto & endgame Tower
  climb, defense, driver skill, notes). Edit or delete past records.
- **Pit Scouting** — robot capabilities (drivetrain, scoring/intake, climb, auto, role). Questions are
  editable in Admin. Shows a live **Nexus pit map** (green = scouted) when a Nexus key and map are available.
- **Schedule** (2027, admin switch: Admin → Data → Scouting schedule, off by default): sign-ups and station
  assignments; while it's on, match scouting stays locked until a scout signs up.
- **Auto Scout** (beta) — scouts a match from its TBA video. Pick an event and match, connect the YouTube video
  (Chrome/Edge tab capture, "Share this tab") or load a video file, tag the start of auto, the field view, both hubs
  and the six robots, and it follows every robot and every fuel launch (live ETA, field map, pauses to ask when it
  loses a robot). Each alliance's official TBA hub count is split period by period by who was shooting, so robots
  add up to the scoreboard; climbs come from TBA. Shots, accuracy and balls/second are video estimates. Engine:
  `js/autoscout.js` (no libraries); page: `js/autoscout-ui.js`; per-season settings: `GAME.autoScout`.
- **Data** — an always-visible, searchable spreadsheet of every match (and a tab for pits), plus export
  (JSON / CSV), import (merge or replace) and clear-data. With cloud sync it shows the whole team's data.
- **Pick List** — **Alliance selection** (8 alliances × Captain/1st/2nd/3rd, EPA-sorted pool, trait filter,
  Do-Not-Pick), a **Mashup** head-to-head picker, and the playoff **Bracket**.

> Even offline, **export backups often** (Data → Export). Clearing browser data or using a private window
> loses unsynced scouting data.

---

## Statistics / BagelStats (EPA)

- **Teams** — World / State / District leaderboards (official **Statbotics** season EPA + ranks, via a
  CORS-friendly mirror) and an **Event** tab with on-device EPA (auto/teleop/endgame) ranked by **TBA
  rankings** (RP, W-L-T). Sortable columns, frc-colors chips, per-team popups with rank, record and an
  **EPA-over-time graph**.
- **Compare** — overlay up to 6 teams' EPA graphs plus a stat table (Global & Event).
- **Event / Events** — your event's teams, schedule, rankings and awards; search any event.
- **Matchup** — predict any match from team EPAs.

Event/ongoing EPA is computed **on-device** from TBA qual results (`js/epa.js`) so it works live; the
World/State numbers come from Statbotics (needs internet; everything else keeps working if it's down).

---

## Accounts, login & admin

- A **login screen** (first name, last name, team password) gates the site — a client-side deterrent,
  since the password is in the page source.
- New names **register and choose a password**, an **admin approves** them (approval is the final step),
  and then they **log in with that password**. `owner` and a pre-approved allow-list in `js/config.js` can
  always log in; admins approve others in the **Admin** panel. Removing a member signs them out on every
  device, live.
- **Admin** (unlocked with the admin PIN): member roster & approvals, editable scouting forms, and the
  betting/earning controls. A badge shows pending requests.
- Each year's data is **fully separate** — switch season in **Settings → Season**.

---

## Data & sync model

| Data | Where it lives |
|------|----------------|
| Your scouting (match/pit) records | Your browser (localStorage), **offline-first**; mirrored to Firestore when cloud sync is on |
| Accounts, Bagel Bucks, presence, leaderboard, Shop bagels + boosts | **Firestore** (`scouters/…`) — account-based, shared across devices |
| Bets, alliance predictions, brackets, Fantasy | **Firestore** (transactions) — `betlines`, `bets`, `apreds`, `brackets`, `fantasy` |
| Parts board + files | **Firestore** — `bparts/state` (one transactional doc) + `bpfiles/` (chunked PDFs/DXFs) |
| Auto Scout results | This browser, plus **Firestore** `autoscout/{matchKey}` (per season) when the rules allow it |

The shared features (Parts, Bets, Fantasy, team leaderboard/presence) need Firebase configured; scouting by
itself works with none of it.

---

## Configuration

Everything configurable lives in **`js/config.js`**, with the two sensitive values in **`js/secrets.js`**
(copy `js/secrets.example.js` → `js/secrets.js`):

- `defaultTbaKey` — The Blue Alliance "Read" key (free, read-only, regenerate at <https://www.thebluealliance.com/account>).
- `statboticsBase` — Statbotics API base (defaults to a CORS-friendly mirror).
- `nexusApiKey` — optional, for the live pit map (<https://frc.nexus/api>).
- `owner` / `approvedMembers` — who can always log in.
- `defaultSeason` + `countdowns` — the season to open on and the home-page countdowns.
- `firebaseConfig` — paste a free Firebase (Spark plan) web-app config to turn on cloud sync; leave `{}` for local-only.
- **`js/secrets.js`:** `accessPassword` (team login) and `adminPin` (Admin panel).

To change scoring or form fields for a season, edit **`js/game-config.js`** only (2026 REBUILT is built in;
2027 BIOCORE is stubbed for Kickoff).

---

## Run it locally

Static files — serve the folder with anything. With Python:

```bash
py -3 -m http.server 8702     # or: python3 -m http.server 8702
```

Then open **http://localhost:8702**. (Open `index.html` directly and the external data calls may be blocked
by the browser — always go through a server.)

## Deploy

It's a plain static site; the live build (<https://www.702tools.com/>) is hosted on **Vercel** — no build
command, publish the project root. Any static host works (Netlify drop, GitHub Pages, etc.). Firebase is the
only external moving part, and it's optional.

---

## Project structure

```
index.html            App shell + SVG icon sprite
styles.css            Theme (brand + per-app accents), layout, components (dark + light)
js/secrets.js         Team password + admin PIN  (committed; keep the repo private)
js/config.js          TBA key, Statbotics mirror, Nexus key, owner/approved, season, Firebase
js/game-config.js     Per-season scoring + scouting field definitions   ← edit per season
js/store.js           localStorage data layer + export/import + member roster
js/api.js             The Blue Alliance + frc-colors + Statbotics (read-only, cached)
js/epa.js             On-device EPA from TBA match results
js/auth.js            Login / registration gate
js/cloud.js           Firebase Firestore sync + presence (no-op when unconfigured)
js/bets.js            Bagel Bets + Fantasy Alliance (match pools, predictions, brackets, draft)
js/parts.js           Parts data model on Firestore (ported from bagel-parts/server.py)
js/parts-ui.js        Parts board / My Parts / Guide UI
js/avatars.js         Bagel avatars: catalog, rarities, packs, the SVG drawing kit
js/avatars-art-*.js   The 108 coded bagel drawings (bakery = common/uncommon/rare, then epic, legendary, mythic + secret)
js/shop.js            The Bagel Shop page, its transactions and the pack-opening shows
js/app.js             The hub, router and all the views
assets/, media/       Logos and images
```

---

## Privacy & notes

- Network calls are read-only GETs to The Blue Alliance (with your key), frc-colors, Statbotics and
  (optionally) Nexus, plus your own Firebase project for sync.
- Scouting data stays on your device unless you export it or cloud sync is on.
- The committed password/PIN/keys are a deterrent for a shared team tool, not strong security — that's why
  the repo stays private.
