/* =============================================================================
   BagelParts Discord bot
   -----------------------------------------------------------------------------
   Watches the shared Parts board in Firestore and @-pings a teammate in ONE
   Discord channel the first time a part they're assigned to is "ready to make"
   (and only once — a pinged part/person pair is remembered). An admin can also
   trigger a per-person digest of everyone's ready parts from the BagelTools
   Admin panel (Admin → Data → "Ping everyone their ready parts").

   People are matched by the Discord username they set on their BagelTools
   profile (Members → Profile → Discord).

   Setup lives in README.md. You only need three environment variables:
     DISCORD_TOKEN   the bot token
     CHANNEL_ID      the one channel it may post in
     GUILD_ID        the server id (lets it turn usernames into real @mentions)
   ========================================================================== */
"use strict";
try { require("dotenv").config(); } catch (_) { /* dotenv is optional; hosts set real env vars */ }
const { Client, GatewayIntentBits } = require("discord.js");
const { initializeApp } = require("firebase/app");
const { getFirestore, doc, collection, onSnapshot, getDoc, setDoc } = require("firebase/firestore");

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID || "";
if (!TOKEN || !CHANNEL_ID) { console.error("Set DISCORD_TOKEN and CHANNEL_ID (see README.md)."); process.exit(1); }

// The same public web-app config BagelTools uses (js/config.js). Not a secret —
// it only identifies the Firestore project. Override via env if you ever fork it.
const firebaseConfig = {
  apiKey: process.env.FB_API_KEY || "AIzaSyD-Bu6zE_PfeWC_8OBsGpUT0OAegiPe4yI",
  authDomain: process.env.FB_AUTH_DOMAIN || "bagelscout-e0bce.firebaseapp.com",
  projectId: process.env.FB_PROJECT_ID || "bagelscout-e0bce",
  storageBucket: process.env.FB_STORAGE || "bagelscout-e0bce.firebasestorage.app",
  messagingSenderId: process.env.FB_SENDER || "715921761523",
  appId: process.env.FB_APP_ID || "1:715921761523:web:352dbf2817fde44826c386",
};

/* ---- Parts classification (ported verbatim from js/parts.js) --------------- */
const STAGES = {
  "3dp": ["Unfinished", "Designed", "Printing", "Done"],
  "fabworks": ["Unfinished", "Designed", "Ordered", "Arrived"],
  "lasercut": ["Unfinished", "Designed", "DXF Uploaded", "Done"],
  "inhouse": ["Unfinished", "Designed", "Drawing made", "In progress", "Done"],
  "belt": ["Ordered", "Arrived", "Sorted"], "gear": ["Ordered", "Arrived", "Sorted"],
  "motor": ["Ordered", "Arrived", "Sorted"], "pulley": ["Unfinished", "Designed", "Printing", "Done"],
  "shaft": ["Unfinished", "Designed", "In progress", "Done"], "spacer": ["Unfinished", "Designed", "Printing", "Done"],
  "roller": ["Ordered", "Arrived", "Sorted"], "collar": ["Ordered", "Arrived", "Sorted"],
  "electronics": ["Ordered", "Arrived", "Sorted"],
};
const CUSTOM_STAGES = ["Ordered", "Arrived", "Sorted"];
const NAME_RE = /^\s*(3dp|fabworks|lasercut|inhouse)\s*[-_: ]\s*(.+?)\s*$/i;
const BELT_RE = /\bbelts?\b/i, GEAR_RE = /\bgears?\b/i;
const MOTOR_RE = /\bmotors?\b|\bkraken\b|\bfalcon\b|\bneos?\b|\bcims?\b|\bvortex\b|\bminions?\b|\b775\s*pro\b/i;
const PULLEY_RE = /\bpull?e?ys?\b/i, SPACER_RE = /\bspacers?\b/i;
const ROLLER_RE = /\brollers?\b|\bsushi\b|\bcompliant\s*wheels?\b|\bstar\s*wheels?\b|\bflappers?\b/i;
const COLLAR_RE = /\bcollars?\b/i, BEARING_RE = /\bbearings?\b/i;
const ELECTRONICS_RE = /\b(roborio|rio|system\s*core|systemcore|pdh|pdp|pcm|vrm|batter(?:y|ies)|breakers?|radios?|pigeons?|can\s*range|canrange|can\s*coder|cancoder|canivore|candle|limelights?|cameras?|ethernet|switch(?:es)?|rsl|spark\s*max|sparkmax|talon\w*|compressors?|solenoids?|leds?)\b/i;
const SHAFT_RE = /\bshafts?\b|\bchurros?\b|\bthunder\s*hex\b|\brounded\s+hex\b/i;

function classify(raw) {
  raw = String(raw || "");
  const m = raw.match(NAME_RE);
  if (m) return [m[1].toLowerCase(), m[2]];
  if (BEARING_RE.test(raw)) return [null, raw];
  for (const [t, rx] of [["belt", BELT_RE], ["gear", GEAR_RE], ["pulley", PULLEY_RE], ["roller", ROLLER_RE], ["collar", COLLAR_RE],
    ["spacer", SPACER_RE], ["electronics", ELECTRONICS_RE], ["shaft", SHAFT_RE], ["motor", MOTOR_RE]]) {
    if (rx.test(raw)) return [t, raw.trim()];
  }
  return [null, raw];
}
const customIds = (s) => new Set((s.customTypes || []).map((t) => t.id));
function effectiveType(rec, s) {
  const ov = rec.typeOverride;
  if (ov && (STAGES[ov] || customIds(s).has(ov))) return ov;
  return classify(rec.rawName || rec.name || "")[0];
}
const stagesFor = (type, s) => STAGES[type] || (type && customIds(s).has(type) ? CUSTOM_STAGES : []);

// All ready-to-make parts in the board, each with the uids they're assigned to.
// Returns [{ key, label, uids:[...] }]. `label` is the "category-name" form.
function readyParts(s) {
  if (!s || !s.parts) return [];
  const assignByKey = {};
  (s.people || []).forEach((p) => { if (p.uid) (p.parts || []).forEach((k) => { (assignByKey[k] = assignByKey[k] || []).push(p.uid); }); });
  const out = [];
  for (const [key, rec] of Object.entries(s.parts)) {
    if (rec.archived) continue;
    const type = effectiveType(rec, s);
    if (!type) continue;
    const st = stagesFor(type, s), stage = Math.min(rec.stage || 0, Math.max(st.length - 1, 0));
    const done = st.length && stage === st.length - 1;
    if (done) continue;
    let ready = false;
    if (type === "inhouse") ready = !!rec.drawing;
    else if (type === "lasercut") ready = !!rec.dxf;
    else if (["3dp", "pulley", "spacer", "shaft"].includes(type)) ready = st[stage] === "Designed";
    if (!ready) continue;
    const uids = assignByKey[key] || [];
    if (!uids.length) continue;
    const name = classify(rec.rawName || rec.name || "")[1] || rec.name || rec.rawName || key;
    out.push({ key, label: `${type}-${name}`, uids });
  }
  return out;
}

/* ---- Firestore ------------------------------------------------------------- */
const db = getFirestore(initializeApp(firebaseConfig));
const PINGLOG = doc(db, "bparts", "pinglog");
const SEP = "\u001f";   // unit-separator: joins partKey + uid in a dedup pair

let scouterDiscord = {};   // uid -> discord username
let pinged = new Set();    // "<partKey>__<uid>" already pinged
let lastState = null;
let lastCmdTs = null;

async function loadPinglog() {
  try { const d = await getDoc(PINGLOG); const a = (d.exists() && d.data().pairs) || []; pinged = new Set(a); }
  catch (e) { console.warn("pinglog load failed", e.message); }
}
async function savePinglog() {
  try { await setDoc(PINGLOG, { pairs: [...pinged], updatedAt: Date.now() }); } catch (e) { console.warn("pinglog save failed", e.message); }
}

/* ---- Discord --------------------------------------------------------------- */
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
let channel = null;
const memberByName = new Map();   // lowercased username / tag -> userId

async function refreshMembers() {
  if (!GUILD_ID) return;
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();
    memberByName.clear();
    members.forEach((m) => {
      memberByName.set(m.user.username.toLowerCase(), m.id);
      if (m.user.discriminator && m.user.discriminator !== "0") memberByName.set(`${m.user.username}#${m.user.discriminator}`.toLowerCase(), m.id);
    });
    console.log(`Resolved ${memberByName.size} member handles.`);
  } catch (e) { console.warn("member fetch failed (enable the Server Members Intent?):", e.message); }
}
// Turn the username a teammate saved into a real @mention when we can; else plain text.
function mentionFor(uid) {
  const handle = (scouterDiscord[uid] || "").trim().replace(/^@/, "");
  if (!handle) return null;
  const id = memberByName.get(handle.toLowerCase());
  return id ? `<@${id}>` : `@${handle}`;
}

async function post(text) {
  if (!channel) return;
  for (const chunk of splitMessage(text)) { try { await channel.send(chunk); } catch (e) { console.warn("send failed", e.message); } }
}
function splitMessage(text) {   // Discord caps a message at 2000 chars
  const lines = text.split("\n"), out = []; let cur = "";
  for (const l of lines) { if ((cur + l + "\n").length > 1900) { out.push(cur); cur = ""; } cur += l + "\n"; }
  if (cur.trim()) out.push(cur);
  return out.length ? out : [text];
}

/* ---- The two behaviours ---------------------------------------------------- */
// 1) Live: a newly-ready assigned part → one ping, once.
async function handleState(s) {
  lastState = s;
  const parts = readyParts(s);
  let changed = false;
  for (const part of parts) {
    for (const uid of part.uids) {
      const pair = `${part.key}${SEP}${uid}`;   // SEP is a control char that can't occur in a key or uid
      if (pinged.has(pair)) continue;
      pinged.add(pair); changed = true;
      const who = mentionFor(uid);
      if (who) await post(`${who}, you are ready to make ${part.label}.`);
    }
  }
  // Prune pairs whose part no longer exists so the doc stays small.
  const validKeys = new Set(Object.keys((s && s.parts) || {}));
  for (const pair of pinged) { if (!validKeys.has(pair.slice(0, pair.lastIndexOf(SEP)))) { pinged.delete(pair); changed = true; } }
  if (changed) await savePinglog();
}
// 2) Admin digest: one message per teammate listing all their ready parts.
async function sendDigest() {
  const s = lastState; if (!s) return;
  const parts = readyParts(s), byUid = {};
  parts.forEach((p) => p.uids.forEach((uid) => { (byUid[uid] = byUid[uid] || []).push(p.label); }));
  const uids = Object.keys(byUid);
  if (!uids.length) { await post("No parts are ready to make right now. 🥯"); return; }
  const blocks = uids.map((uid) => {
    const who = mentionFor(uid) || "(unlinked scout)";
    return `${who}, your ready parts are:\n${byUid[uid].map((l) => `• ${l}`).join("\n")}`;
  });
  await post(blocks.join("\n\n"));
}

/* ---- Wire up --------------------------------------------------------------- */
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try { channel = await client.channels.fetch(CHANNEL_ID); } catch (e) { console.error("Can't see that channel — check CHANNEL_ID and the bot's access."); }
  await loadPinglog();
  await refreshMembers();
  setInterval(refreshMembers, 10 * 60 * 1000);   // keep handles fresh as people join

  onSnapshot(collection(db, "scouters"), (snap) => {
    const next = {}; snap.forEach((d) => { const v = d.data(); if (v && v.discord) next[d.id] = v.discord; });
    scouterDiscord = next;
  }, (e) => console.warn("scouters listen failed", e.message));

  onSnapshot(doc(db, "bparts", "state"), (snap) => { handleState(snap.exists() ? snap.data() : {}).catch((e) => console.warn(e.message)); },
    (e) => console.warn("state listen failed", e.message));

  onSnapshot(doc(db, "config", "bot_command"), (snap) => {
    const cmd = snap.exists() ? snap.data() : null; if (!cmd || !cmd.ts) return;
    if (lastCmdTs === null) { lastCmdTs = cmd.ts; return; }   // don't fire for a command issued before we started
    if (cmd.ts !== lastCmdTs) { lastCmdTs = cmd.ts; if (cmd.type === "digest") sendDigest().catch((e) => console.warn(e.message)); }
  }, (e) => console.warn("command listen failed", e.message));
});

client.login(TOKEN).catch((e) => { console.error("Discord login failed:", e.message); process.exit(1); });
