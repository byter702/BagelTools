# Bagel Parts Discord bot

Pings FRC 702 teammates on Discord when a part they're assigned to in **Bagel Parts** becomes ready to make — once per part, never a stream of repeats. An admin can also fire off a per-person digest of everyone's ready parts from the website.

- **Auto ping** — the moment a part a person is assigned to is ready (drawing uploaded, DXF uploaded, or a 3D-print / pulley / spacer / shaft marked *Designed*), the bot posts:
  > @person, you are ready to make `inhouse-DriveRail`.

  It remembers who it has pinged for which part, so nobody gets spammed. A person also gets pinged if they're added to a part that was *already* ready.
- **Admin digest** — from the website: **Admin → Data → "Ping everyone their ready parts"**. The bot then posts one message per person who has ready parts:
  > @person, your ready parts are:
  > • `inhouse-DriveRail`
  > • `lasercut-SidePlate`

People are matched by the Discord username they set on their own profile in BagelTools: **Members → (your profile) → Discord**.

---

## 1. Create the bot in Discord

1. Go to the **[Discord Developer Portal](https://discord.com/developers/applications)** → **New Application**. Name it (e.g. "Bagel Parts").
2. Open the **Bot** tab.
   - Click **Reset Token**, then **Copy** the token. This is your `DISCORD_TOKEN` — keep it secret.
   - Scroll to **Privileged Gateway Intents** and turn **ON** **Server Members Intent**. (This lets the bot turn a saved username into a real @mention.) Save.
3. Open the **OAuth2 → URL Generator** tab.
   - Under **Scopes**, check **bot**.
   - Under **Bot Permissions**, check **Send Messages** and **Read Message History**.
   - Copy the generated URL at the bottom, open it in your browser, pick your **702 server**, and authorize.

## 2. Get the channel and server IDs

1. In Discord: **User Settings → Advanced → Developer Mode = ON**.
2. **Right-click the one channel** you want the bot to post in → **Copy Channel ID** → that's `CHANNEL_ID`.
3. **Right-click your server's icon** → **Copy Server ID** → that's `GUILD_ID`.

The bot only ever posts in the single `CHANNEL_ID` you give it.

## 3. Run it

You need [Node.js 18+](https://nodejs.org).

```bash
cd discord-bot
npm install
cp .env.example .env     # then open .env and paste in your three values
npm start
```

When it's working you'll see `Logged in as <bot name>` and `Resolved N member handles.` in the console.

## 4. Keep it running (free hosting)

The bot has to stay online to watch the board. Easiest free-tier options:

- **[Railway](https://railway.app)** — "New Project → Deploy from GitHub repo", set the root directory to `discord-bot`, and add `DISCORD_TOKEN`, `CHANNEL_ID`, `GUILD_ID` as variables. Start command: `npm start`.
- **[Render](https://render.com)** — "New → Background Worker", root `discord-bot`, build `npm install`, start `npm start`, add the same three env vars.
- **A Raspberry Pi / spare computer** — `npm install` then run `npm start` under [pm2](https://pm2.keymetrics.io/) (`pm2 start index.js --name bagel-bot`) so it restarts on reboot.

No database or billing is needed — the bot reads the same free Firestore project the website already uses.

---

## Notes

- **"@person" shows as plain text, not a real ping.** The username on that person's profile doesn't match anyone in the server, or the **Server Members Intent** (step 1.2) is off. Fix the profile username or the intent.
- **Nothing happens when a part becomes ready.** Check the console for errors, confirm the part actually has an assignee and meets the ready rule, and confirm the person set their Discord username.
- The bot won't re-ping on restart: it keeps a record in Firestore (`bparts/pinglog`) of every part/person it has already pinged, and prunes entries for parts that no longer exist.
- Changing a part's category/name or un-archiving it can make the bot treat it as new and ping again — that's expected.
