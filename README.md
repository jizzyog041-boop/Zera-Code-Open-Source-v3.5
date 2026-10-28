# 💚 Zera Music Bot
Node.js • discord.js v14 • Lavalink (lavalink-client v2) • green/dark anime theme

## Setup
1. Install Node 20+.
2. `cp .env.example .env` and fill `DISCORD_TOKEN` (+ optional `STAFF_ROLE_ID`, `VERIFIED_ROLE_ID`, `OWNER_IDS`).
3. Discord Developer Portal → Bot → enable **Server Members Intent** and **Message Content Intent**.
4. `npm install` then `npm start`.
5. Make sure the bot is in your support server (log channels, panels, welcome live there).

## What's inside
- `/help` banner + category select menu (paged), 500+ commands (`z!` prefix, @mention, and 64 slash commands — Discord allows max 100 slash commands)
- Now Playing: auto-posted green embed, live progress bar, buttons (prev/pause/skip/stop/loop, vol-/vol+, shuffle, queue, like) + filter select menu
- Voice-channel status = current song title
- `/mood` Mood-Based Autoplay (10 moods × 5 languages, trending priority, mood lock, reset)
- 37 filters, favorites + playlists, 24/7, DJ role, per-server prefix
- Tickets (staff application / support / bug report) with transcripts, verify button, welcome + invite tracker, boosters log, autorole
- Full logging into your log channels, anti-nuke alerts, raid mode
- Rotating status: servers / users / commands / vibes / moods
- Thanks-for-invite message in the new server + DM to the inviter

## v2 changes
- **Components V2** UI everywhere that matters: help (banner → quote blocks → category select), Now Playing, queue, mood panel, ticket/verify panels, welcome, invite tracker, boosters, thanks-for-invite. Needs discord.js ≥ 14.19.
- **SQLite** (`data/zera.sqlite`): server settings, warns, favorites, playlists, play history (`/topsongs`, `/mytop`). Uses `better-sqlite3`; falls back to Node's built-in `node:sqlite` (Node 22.5+).
- **Animated emojis**: 7 GIF emojis in `assets/emojis/` are auto-uploaded as *application emojis* on first start (usable in every server). To use your own, drop GIFs named `zera_<name>.gif` there.
- `assets/zera-welcome-banner.gif` = animated welcome banner.

## v3 changes
- **Now Playing image card** (green/dark, `src/music/card.js`): album art, title, artist, requester, **time (pill + progress bar) and volume** are drawn into an image that is re-rendered every 12 s and on every button press, so it "edits live". Needs `@napi-rs/canvas` (installed by `npm install`). Malayalam/Tamil/Hindi titles render via bundled fonts in `assets/fonts` (add more .ttf/.otf there if you need other scripts).
- **Icon buttons**: prev, ‑10s, pause/play, +10s, next / loop, shuffle, stop, lyrics, save / vol‑, vol+, queue, autoplay + filter menu.
- **Animated emojis in every message**: `src/decorate.js` converts ✅ ❌ ⚠️ 🎵 🎶 💚 ✨ 🎧 🔥 👑 🔔 ⭐ 🔴 🌊 💿 ⏳ 🎤 into Zera's animated emojis in all embeds, V2 text and replies. 33 emoji assets are auto-uploaded as application emojis at first start.
- **Voice channel status** = animated eq emoji + song title. If Discord rejects custom emojis there it silently falls back to 🎵; set `VC_STATUS_EMOJI=false` to always use 🎵.
- **Idle VC status** = when the music ends but Zera is still in the VC (queue finished, `/join`, 24/7 mode) the status becomes an animated butterfly + `Use /play and play music` (change with `VC_IDLE_TEXT`, disable with `VC_IDLE_STATUS=false`). When Zera leaves the VC the status is cleared.
- **Invite thank-you**: ~3 s after being added, the inviter (or the server owner if DMs are closed) gets a DM with a thank-you + the support server link, and the server gets a thank-you message too. The result is written to `bot-add-log`.

## v4 changes
- **Every emoji is animated**: 94 extra animated emojis (made from the Noto set) + the handmade ones. `src/decorate.js` converts emojis in embeds, V2 text, replies, **buttons and select-menu options** (select *placeholders* can't show custom emojis, so the emoji is dropped there). First start uploads ~130 emojis as application emojis in the background — it can take a few minutes; until then unicode is shown.
- **/help** = Diva-style layout: banner → title + intro + tips + logo thumbnail → *Command Categories* → *Links* → category dropdown. `/help <command>` shows usage, aliases, permissions.
- **Mention Zera** (just `@Zera`) → "Hello, How are you machachee?".
- **Premium** (`/premium`): Free / Zera Plus / Zera Pro. Edit prices & limits in `src/config.js → premium.plans`.
  - Plus: queue 500, volume 150%, 24/7 mode, premium filters, card themes (`/theme`), 15 playlists × 200 songs.
  - Pro: + queue 2000, 24/7 auto-rejoin after restart, custom 15-band `/eq`, 40 playlists × 500 songs.
  - Selling without a payment API: you (bot owner) run `premium-gen <plus|pro> <days> <count> [guild|user]` → codes arrive in your DM → customer runs `/redeem` (or presses **Redeem Code** in `/premium`). Manual: `premium-grant <id> <tier> <days> [guild|user]`, `premium-revoke`, `premium-list`, `premium-codes`. **Set `OWNER_IDS` in `.env`.**
  - Optional Discord App Subscriptions: put your SKU ids in `PREMIUM_SKU_PLUS` / `PREMIUM_SKU_PRO` (+ `PREMIUM_URL`, `VOTE_URL`).

## Notes
- The free Lavalink node needs the YouTube plugin for `ytsearch/ytmsearch`; if search fails, try another node in `.env`.
- Panels (tickets/verify) are auto-posted once on first start.
- Invite link uses `permissions=8` (Administrator). Prefer a smaller permission set for a public bot.

## Event (`/event`)
- `/event start` / `/event stop` (Manage Server) • `/event progress` (everyone, private).
- Tasks: invite 5 friends • say **hai** in the hai channel • send feedback (min 10 chars) • stay 3 min in the event VC. Channel ids + numbers: `src/config.js → event`.
- First member to finish everything gets a **Zera Pro** redeem code by DM (`EVENT_REWARD_DAYS`, default 30), the winner + all task details are announced in the giveaway channel, and the event stops automatically.
- Redeem rules: a code works once, and each user can redeem one code per 24 h.

## Database Collector
- Channel `1562018538787704883` (`DB_COLLECT_CHANNEL_ID`) gets ONE big panel with a **Collect All Database** button.
- **Owner only** (`OWNER_IDS` in `.env`). Anyone else gets a private "owner only" reply.
- Press it → the bot replies privately with a fresh snapshot: `zera-<date>.sqlite` (consistent copy, WAL included) + any other `.json/.db` files in `data/`. If the files exceed the server upload limit they are sent gzip-compressed (`.gz`).
- The panel is posted once. On restart the bot re-uses the saved message (or adopts the existing one and deletes extra copies), so it never duplicates.

## Zera Next Gen (top premium tier) + `/custombot`
- Tiers are now **Free → Plus → Pro → Next Gen**. Next Gen = everything in Pro (24/7 auto-rejoin, EQ…) + bigger limits (queue 5000, volume 200%, 100 playlists × 1000 songs) + `/custombot`. Edit price/limits in `src/config.js → premium.plans.nextgen`.
- Owner tools accept the new tier: `premium-gen nextgen 30 1 guild`, `premium-grant <server_id> nextgen 30 guild`.
- **`/custombot`** (Manage Server, needs **Next Gen on that server**): options `nickname`, `bio`, `avatar`, `banner` (any of them). It changes Zera's profile **only in that server** (Discord per-server bot profile). `/custombot` with no options shows the current state. `/custombot-reset` returns to the original anytime.
- **Auto revert:** every 3 min the bot checks all servers that have a custom profile; if Next Gen ended (expired / revoked / downgraded) it resets name, avatar, banner and bio to the originals. Also runs right after `premium-revoke`. Bot restarts don't lose track (stored in the `custombot` table).
- Next Gen must be a **server** code/grant (`guild` scope) — a personal (`user`) Next Gen does not unlock `/custombot` in other servers.
- Bot needs **Change Nickname** permission for the nickname part (Administrator invite already has it).


## Owner-only Restart Panel
- Channel: `1562081864909459516` (override with `RESTART_PANEL_CHANNEL_ID`).
- On startup, the bot creates or edits one green/dark image panel with status and recent restart logs; the panel message ID and log state are stored in the existing SQLite `kv` table.
- Only Discord IDs listed in `OWNER_IDS` can use **Restart Bot**. Other users receive a private denial.
- The restart exits cleanly so the hosting supervisor can restart the bot. Enable **Auto Restart / Restart on exit** in your host panel; without a supervisor, the bot will remain offline after pressing restart.
- Database path is unchanged (`data/zera.sqlite`, unless `DB_FILE` is set). Do not delete the `data/` folder or change `DB_FILE` if you want to keep the same database.


## Owner-only Host Info panel
- Panel channel: `1562106847274602627` (`HOSTINFO_PANEL_CHANNEL_ID`).
- The `Forgot Hostinfo` button responds ephemerally to configured `OWNER_IDS` only.
- Set `HOSTINFO_URL`, `HOSTINFO_EMAIL`, and `HOSTINFO_PASSWORD` as hosting environment variables. Do not put real credentials in source code or commit them to GitHub.
- Because a hosting password was shared in chat, change it before configuring the new password in the environment variables.

## Premium Buy Tickets
- Channel `1562379011114410075` (`PREMIUM_BUY_CHANNEL_ID`) gets ONE panel: full Zera Premium explanation (Plus / Pro / Next Gen, prices & limits come from `src/config.js → premium.plans`) + 3 buttons: **Zera Plus**, **Zera Pro**, **Zera Next Gen**.
- Pressing a button opens a **private ticket** (`plus-<name>` etc.) visible only to the customer, every ID in `OWNER_IDS` (who are in the server) and the optional `STAFF_ROLE_ID`. One open premium ticket per user.
- Buttons inside the ticket: **Close** (customer/owners, saves transcript) • **Add** (owners: add another user) • **Email** • **Phone Number** • **UPI Name** • **Transaction ID** (each opens a form, values are validated and shown live in the ticket; the same Transaction ID can't be used in two tickets) • **Payment Proof** (press, then send the screenshot in the channel within 5 min).
- When all 5 items are filled the owners are pinged once. Verify the payment, then run `premium-gen` / `premium-grant` to activate the plan.
- Optional `PREMIUM_UPI_ID` / `PREMIUM_UPI_NAME` show your UPI id inside every ticket. Bot needs **Manage Channels** in that server.
- The panel is posted once, re-used after restarts, and auto-updated if you change prices/limits in the config.

## Bot presence (Playing line + VR icon)
- Profile **Playing** line rotates every 15 s (`PRESENCE_ROTATE_SECONDS`, min 10): `{servers} Servers` → `{users} Users` → `{vc} Voice Channels Joined` → `Powered By Zera and AMC` (`src/presence.js`). Numbers are live. Change the list with `PLAYING_TEXTS` (separate texts with `|`, placeholders `{servers}` `{users}` `{vc}`). `{vc}` = voice channels Zera is currently joined in. The old custom status is no longer set by default (Discord shows a custom status in front of the Playing line and hides it); set `KEEP_CUSTOM_STATUS=true` to bring it back.
- **VR icon:** the bot tells Discord it connects from a VR client (gateway IDENTIFY properties). It's an undocumented trick, so Discord may change or ignore it any time. Set `BOT_VR_ICON=false` to turn it off. The status itself stays *online* (the icon only replaces the platform indicator). Needs a full restart (not only a reconnect) to apply.

## v5 – Green Butterfly emoji pack
- 63 neon-green animated emojis added to `assets/emojis/` (auto-uploaded as application emojis): 15 music/ui (eq, disc, note, heart, sparkle, wave, rings, leaf) + 48 butterflies (6 wings × 8 motions).
- Mapping lives in `src/emojis.js → PACK`: 🎶 eq_bars · 💿 disc_vinyl · 🎵 note_float · 💚 heart · ✨ spark_star · 🌟 spark_twinkle · 🌊 wave · 🔴 rings · ⏳ leaf_spin · 🍃 leaf_sway · 🦋 butterfly (+ `butterfly2/3/4`). Use them in code with `em('butterfly')`.
- The other 441 pack GIFs (all 8 greens) are in `assets/emojis_pack/`. Set `EMOJI_FULL=true` once to upload them all (takes ~10 min), then re-map anything in `PACK`.
- `EMOJI_PACK=false` turns the new mapping off (back to the old zera_* emojis).

## v5.1 – Zera Companion update system
- Every server starts on **Zera Companion V1**. While a server is on V1, any command (prefix or slash) and the old Now-Playing / queue / mood / search buttons show an **Update panel** instead of running.
- A member with **Manage Server** (or the server owner / bot owner) presses **🦋 Update to V3.5** → the server becomes **Zera Companion V3.5** (stored per server in the `kv` table, key `companion:<guildId>`) and everything works. Others get a private "ask an admin" message.
- `/update` (`z!update`) shows the panel any time (or "already up to date"). Owner only: `z!update reset` puts the current server back on V1 for testing.
- Edit name/version, allowed commands and the "What's new" list in `src/config.js → companion`.
- Version shows in the `@Zera` greeting and `/stats`.

## Fast start & sound quality (V3.7)
- **/play speed:** Discord ack, voice connect and song search now run **at the same time**; the confirmation message and the audio start in parallel; repeated searches come from a 15-minute cache; if a search source is slow or empty the next one starts in parallel (`SEARCH_HEDGE_MS`).
- **Sound quality:** Zera raises the voice channel bitrate to the server maximum when it joins (`HQ_BITRATE=false` to disable), and the default volume is 100% (`DEFAULT_VOLUME`). Codec/resampler quality is set by the Lavalink node — see `docs/lavalink-hq-application.yml` (only works on a node you host).
- **Bug fixes:** `/leave` now works while Zera is idle in a VC · `/play` or `/join` from another VC while Zera is idle moves it instead of refusing · skipping the last song no longer makes a **24/7** bot leave · long SoundCloud URLs in `/search` no longer break · Now Playing no longer errors if the track ends before the card is built.
