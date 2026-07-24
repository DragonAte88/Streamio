# Streamio — Full Project Documentation

**Last updated:** 2026-07-24 · **Current version:** 0.5.9 · **Latest commit:** `b286f92`

This document is the single source of truth for the state of the entire Streamio project: the desktop app, the backend, the three Oracle Cloud instances it runs on, and the Discord integration. It is meant to be complete enough that another engineer or another AI session can pick up the project cold.

---

## 1. What Streamio is

A native Windows desktop IPTV/M3U8 media player built on **Electron + mpv**, with a social layer (friends, rooms, DMs, watch-together), account system, admin panel, Discord Rich Presence + OAuth2 login linking, a badge system, and a self-hosted auto-update pipeline via GitHub Releases.

- Local source: `C:\Users\OMEN\Desktop\Rokemon\desktop-app`
- Local test-install (what the shipped installer actually produces): `C:\Users\OMEN\Desktop\Streamio`
- GitHub: [github.com/DragonAte88/Streamio](https://github.com/DragonAte88/Streamio) — public repo, no description set, default branch `main`, created 2026-07-24, ~778 KB, TypeScript primary language, no license file.

---

## 2. Desktop app architecture

### 2.1 Three-window model (why it exists)

Electron main process (`electron/main.js`) creates **three real OS-level windows**, not one window with CSS layers:

1. **`mainWindow`** — the React UI (1440×900, resizable, `dist/index.html` in prod / `http://localhost:5173` in dev).
2. **`videoWindow`** — frameless, non-topmost, invisible-by-design; this is purely the native render target mpv attaches to via `--wid=<hwnd>`.
3. **`controlsWindow`** — frameless, `transparent: true`, `setAlwaysOnTop(true, "screen-saver")`, region-restricted via `setShape()` to just a top bar (`TOP_BAR_HEIGHT = 76px`) and bottom bar (`BOTTOM_BAR_HEIGHT = 94px`); loads `electron/playerControls.html`.

**Why three windows and not a DOM overlay in `mainWindow`:** mpv's native `--wid`-embedded window always paints above *all* renderer content in its owning window, regardless of CSS `z-index`. A DOM overlay living in the same window as mpv can never visually sit "on top of" the video. The only way to layer UI over native video is a second, separate top-level window positioned above it in real OS z-order.

`applyVideoBounds()` in `main.js` keeps `videoWindow`/`controlsWindow` bounds synced to wherever the React `.player-view` div reports its bounds (via `ResizeObserver` + scroll listeners in `PlayerView.tsx`), translated into screen coordinates using `mainWindow.getContentBounds()`.

### 2.2 Electron main-process files (`electron/`)

| File | Responsibility |
|---|---|
| `main.js` | Window lifecycle, IPC handlers, bounds/shape sync, close-crash guard |
| `mpvController.js` | Spawns mpv, JSON IPC over a named pipe |
| `preload.js` | `contextBridge` API surface exposed to renderers |
| `playerControls.html` / `.js` | Vanilla HTML/JS UI for `controlsWindow` (back button, seek bar, play/pause, volume) |
| `autoUpdater.js` | Wraps `electron-updater`, sanitizes error messages |
| `discordRpc.js` | Discord Rich Presence via `@xhayper/discord-rpc` |
| `discordOAuth.js` | Loopback-server OAuth2 code flow |
| `systemStats.js` | CPU/disk/network/GPU stats for the Developer Dashboard |

`app.disableHardwareAcceleration()` is called at the top of `main.js` (added as an additional stability measure alongside the mpv-side `--hwdec-codecs=h264` restriction).

**mpv launch flags** (`mpvController.js`), spawns `C:\Program Files\MPV Player\mpv.exe` (overridable via `MPV_PATH` env var):
```
--wid=<hwnd>
--input-ipc-server=\\.\pipe\streamio-mpvsocket
--idle=yes --force-window=yes --no-osc --no-input-default-bindings --osd-level=0 --keep-open=yes
--hwdec=auto --hwdec-codecs=h264
--vo=gpu --gpu-context=d3d11
--log-file=<tmpdir>\streamio-mpv.log --msg-level=all=v,vo=trace,gpu=trace,cplayer=v
--cache=yes --cache-secs=10 --demuxer-max-bytes=50MiB
--network-timeout=15
--user-agent=Mozilla/5.0 (StreamioDesktop)
```
IPC is JSON-over-named-pipe with request-id correlation, a 5s command timeout, and up to 40 connect retries at 100ms intervals.

**IPC channels** (`preload.js` → `main.js`):
- `window.player`: `start/load/play/pause/seek/setVolume/stop/setBounds/onPropertyChange/onExit/onBack`
- `window.playerControlsBridge`: `requestBack/onMeta/onReady` (used only inside `controlsWindow`)
- `window.discord`: `setWatching/clear/startOAuth/isConnected`
- `window.system`: `getStats`
- `window.updater`: `check/download/install/onStatus/onRestartCountdown`

### 2.3 Frontend (`src/`, React + TypeScript + Vite)

- `components/`: `Badge.tsx`, `ContentRow.tsx`, `FilterBar.tsx`, `HeroBanner.tsx`, `Layout.tsx`, `PersistenceHeartbeat.tsx`, `PlayerView.tsx`, `ProfileCard.tsx`, `SectionTabs.tsx`, `StatusDot.tsx`, `Toggle.tsx`
- `lib/`: `api.ts`, `auth.tsx`, `badges.ts`, `CatalogContext.tsx`, `demoPlaylist.ts`, `navConfig.ts`, `PlaybackContext.tsx`, `playlist.ts`, `playlistSources.ts`, `settings.ts`, `SettingsContext.tsx`
- `pages/`: `Admin.tsx`, `BrowsePlaceholder.tsx`, `Home.tsx`, `Library.tsx`, `LiveTV.tsx`, `Login.tsx`, `MyList.tsx`, `Placeholder.tsx`, `PlaylistAdd.tsx`, `Playlists.tsx`, `Register.tsx`, `Search.tsx`, `Settings.tsx`, `Setup.tsx`, `Social.tsx`
- `pages/admin/`: `AdminAssets.tsx`, `AdminUsers.tsx`, `DevDashboard.tsx`
- `pages/settings/`: `About.tsx`, `Account.tsx`, `Appearance.tsx`, `Audio.tsx`, `Backend.tsx`, `Discord.tsx`, `General.tsx`, `Notifications.tsx`, `Parental.tsx`, `Playback.tsx`, `Shortcuts.tsx`, `Subtitles.tsx`
- `pages/social/`: `Friends.tsx`, `Invites.tsx`, `Requests.tsx`, `Roadmap.tsx`, `RoomDetail.tsx`, `Rooms.tsx`

`PlaybackContext.tsx` holds the single global `playing: Channel | null` state; `PlayerView.tsx` is purely an invisible bounds-reporting `<div>` — it renders no UI of its own, all visible player chrome lives in `controlsWindow`.

**Badge catalog** (`src/lib/badges.ts`, 15 defined): `owner` 👑, `administrator` 🛡️, `developer` ⚙️, `moderator` 🔨, `support` 🧰, `qa_tester` 🧪, `beta_staff` 🚧, `premium` ⭐, `founder` 🚀, `supporter` ❤️, `early_adopter` 🎉, `veteran` 🔥, `verified` ✔, `streamer` 📺, `anime_fan` 🎌. Each has `slug/label/icon/gradient[2]/glow/animated?`. Purely data-driven in frontend code — the DB (`user_badges` table) only stores `(user_id, badge_slug)` pairs, so adding a new badge needs no migration.

### 2.4 Dependencies (`package.json`, v0.5.9)

- **Runtime**: `@xhayper/discord-rpc ^1.3.4`, `electron-updater ^6.8.9`, `iptv-playlist-parser ^0.13.0`, `react-router-dom ^6.30.4`
- **Dev**: `electron ^33.2.1`, `electron-builder ^25.1.8`, `react ^18.3.1`, `react-dom ^18.3.1`, `typescript ^5.7.2`, `vite ^6.0.7`, `@vitejs/plugin-react ^4.3.4`, `concurrently ^9.1.2`, `cross-env ^7.0.3`, `wait-on ^8.0.1`
- **electron-builder config**: `appId: com.dragonate88.streamio`, `win.target: nsis`, unsigned (`forceCodeSigning: false`), `nsis.artifactName: Streamio-Setup-${version}.exe`, publish provider `github` → `DragonAte88/Streamio`

### 2.5 Scripts

- `npm run dev` — concurrently runs Vite dev server + `electron .` in dev mode
- `npm run build` — `vite build` only
- `npm run dist` — `vite build && electron-builder --win` (full installer build)
- `npm start` — production-mode `electron .` against the last `vite build` output

---

## 3. Backend (`backend/`)

Node/Express + Postgres, deployed to Oracle Cloud **Flex-1** via Docker Compose.

### 3.1 Layout

```
backend/
  docker-compose.yml
  secrets.env              (gitignored, not committed)
  api/
    Dockerfile
    package.json
    server.js
    db/pool.js, schema.sql
    lib/logBuffer.js
    middleware/auth.js, roles.js
    routes/account.js, admin.js, artwork.js, assets.js, auth.js,
           badges.js, channels.js, discord.js, profile.js,
           social.js, watchlist.js
```

`server.js`: `trust proxy = 1`, `cors()`, `express.json()`, runs `db/schema.sql` on **every boot** before listening (all statements are `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` — additive-only, safe to re-run), listens on `0.0.0.0:${PORT || 4000}`.

### 3.2 Database schema (`db/schema.sql`)

- **`users`** — `id`, `email` (unique), `password_hash`, `display_name`, `created_at`, plus: `username`, `avatar_url`, `bio`, `onboarded`, `discord_user_id`, `discriminator` (unique `(username, discriminator)` — Discord-style `Name#0001` handle), `banner_url`, `accent_color` (default `#e6392f`), `privacy_show_activity`, `privacy_allow_friend_requests`, `status` (online/idle/dnd/invisible/offline), `last_active_at`, `role` (user/admin), `suspended`, `suspended_reason`, `discord_access_token`, `discord_refresh_token`, `discord_username`, `discord_avatar_url`, **`internal_account_id`** (unique, format `############.#######` — 12-digit + `.#` + 6-digit, admin-only exposure, security/identification purposes), `can_upload_assets`.
- **`channels`** — `id`, `tvg_id`, `name`, `url`, `logo`, `group_name` (default `Uncategorized`), `created_at`.
- **`watchlist`** — composite PK `(user_id, channel_id)`, cascade FKs.
- **`watch_history`** — `id`, `user_id`, `channel_id`, `watched_at`.
- **`friend_requests`** — `from_user_id`, `to_user_id`, `status` (pending/accepted/declined), unique pair.
- **`friendships`** — composite PK `(user_a_id, user_b_id)`.
- **`rooms`** — `id`, `name`, `owner_id`, `is_public`, `active_channel_id`, `discord_voice_channel_id`, `created_at`.
- **`room_members`** — composite PK `(room_id, user_id)`.
- **`room_messages`** — `id`, `room_id`, `user_id`, `body`, `sent_at`.
- **`direct_messages`** — `id`, `from_user_id`, `to_user_id`, `body`, `sent_at`.
- **`room_reads`** / **`dm_reads`** — read-receipt tracking tables, `last_read_message_id`.
- **`room_invites`** — `id`, `room_id`, `from_user_id`, `to_user_id`, `status`.
- **`assets`** — `id`, `uploader_id`, `filename`, `url`, `kind` (video/audio/image), `title`, `category`, `published_channel_id`, `created_at`.
- **`user_badges`** — composite PK `(user_id, badge_slug)`, `granted_at`, `granted_by`.

### 3.3 API routes

| Mount | Auth | Notes |
|---|---|---|
| `GET /health` | none | `SELECT 1`, returns `{ok, db}` |
| `/auth` | none | `POST /register` (bcrypt cost 12, auto-assigns discriminator + internal_account_id, 30d JWT), `POST /login` (423 + short-lived reactivate token if suspended) |
| `/channels` | mixed | `GET /` public; `POST /` requires auth |
| `/watchlist` | required | CRUD + history |
| `/artwork` | none (needs `TMDB_API_KEY`) | TMDB search w/ word-truncation fallback → OMDb poster fallback, in-memory cache (no TTL) |
| `/profile` | required | `GET/PATCH /me`, `POST /presence`, search, lookup |
| `/social` | required | Largest route (327 lines): friends, DMs, rooms, watch-together sync, typing indicators (in-memory, 5s TTL, not persisted), room invites |
| `/account` | mixed | self-suspend, reactivate (short-lived token only), permanent wipe (frees username+discriminator) |
| `/admin` | admin only | `/stats`, `/logs` (2000-line ring buffer), user management, upload-permission grants |
| `/badges` | mixed | read for self/others; grant/revoke admin-only |
| `/auth/discord` | required | server-side OAuth code exchange, identity fetch, `/unlink` |
| `/assets` | uploader-role only | multer disk storage, 4GB limit, `.mp4/.mkv/.mp3/.png/.jpg/.jpeg/.webp` |
| `/uploads` | static | serves the upload directory |

`middleware/auth.js` — JWT Bearer verification. `middleware/roles.js` — per-request `role`/`can_upload_assets` DB lookup for `requireAdmin`/`requireUploader`.

### 3.4 Docker Compose (`backend/docker-compose.yml`)

- `postgres` — `postgres:16-alpine`, volume `pgdata`, env `POSTGRES_USER/PASSWORD/DB=streamio`
- `api` — built from `./api`, port **`127.0.0.1:4000:4000`** (loopback-only, not publicly exposed — Caddy fronts it), env: `PGHOST/PORT/USER/PASSWORD/DATABASE`, `JWT_SECRET`, `TMDB_API_KEY`, `OMDB_API_KEY`, `FANART_API_KEY`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `PORT=4000`, volume `uploads`

`secrets.env` (gitignored, present on both local machine and Flex-1, 398 bytes) supplies these — contents intentionally not read/reproduced in this document.

---

## 4. Oracle Cloud infrastructure — live state as of this audit

### Flex-1 — `163.192.40.120` (SSH key: `~/.ssh/streamio_oracle_e5`, user `ubuntu`)
**Role: production backend.**
- Ubuntu, kernel `5.15.0-1081-oracle`, 45GB disk (9% used), 11GiB RAM (441MiB used)
- `docker ps -a`: `streamio-backend-api-1` (up 14h, `127.0.0.1:4000→4000`), `streamio-backend-postgres-1` (up 17h, `postgres:16-alpine`, no host port mapping)
- Caddy reverse-proxies `163-192-40-120.sslip.io → 127.0.0.1:4000`
- No cron jobs. App lives at `~/streamio-backend/` (deployed via `scp`, not `git pull` — no git repo checked out on the box)
- **Live health check confirmed at audit time**: `curl https://163-192-40-120.sslip.io/health` → `{"ok":true,"db":"up"}`

### Flex-2 — `170.9.15.10` (SSH key: `~/.ssh/streamio_oracle_flex2`, user `ubuntu`)
**Role per original docs: idle / dormant Discord bot host. Actual live state: NOT idle.**
- Ubuntu, kernel `6.17.0-1018-oracle`, **4 active user sessions**
- `docker ps -a`: **`jellyfin` container running** (up 10h, healthy) — not part of the Streamio project
- Caddy active. Plex-related ports open (32400/32401/32600/40043), `plex_update.deb` present
- `~/streamio-bot/` **is present** (`bot.js`, `botInteractions.js`, `commands.js`, `httpServer.js`, `nowPlayingState.js`, `voicePlayback.js`, `package.json`, `Dockerfile`, ~34KB) — matches documented "dormant guild voice-relay bot," and is confirmed *not* running as a container
- **⚠️ Undocumented, unrelated content also present in `~ubuntu`**: `bypass_plex.py`, `bypass_plex_strict.py`, `custom_epg.xml`, `disable_ipv6.py`, `dummy.xml`, `dump_embed.py`, `encoder.m3u`, `fix_m3u.py`, `fix_m3u2.py`, `gen.py`, `map.py`, `map_wco.py`, `settings.json`, `streamio-encoder.py`, `test*.py` (several), `threadfin.zip`, `update_epg.py`, `urls.json`, `wco_code.py`, `wco_scraper.py`, `xepg.json` — IPTV/EPG/Plex scraping and encoding tooling, not part of this project's source tree or documentation.
- **⚠️ Security note**: `settings.json`, `urls.json`, and `xepg.json` in that home directory are **world-writable (`rwxrwxrwx`)**. This was flagged to the user directly and not modified.

### Flex-3 — `138.2.232.225` (SSH key: `~/.ssh/streamio_oracle_flex3`, user `ubuntu`)
**Role: reserved/blank. Matches documentation exactly.**
- Ubuntu, kernel `6.17.0-1018-oracle`, hostname `streamio-flex-discord`
- `docker ps -a`: empty. No matching services running. Only default files in home directory. Only port 22 open (plus rpcbind/DNS).

---

## 5. Discord integration

- **Client ID**: `1529308527972192367` — hardcoded (non-secret) in both `electron/discordRpc.js` and `electron/discordOAuth.js`; same Discord application used for both Rich Presence and OAuth2 login-linking.
- **Client Secret**: server-side only, `DISCORD_CLIENT_SECRET` in `backend/secrets.env` on Flex-1, used in `backend/api/routes/discord.js`'s token exchange. Never present in client code.
- **OAuth2 redirect URI**: `http://127.0.0.1:51823/callback` — a loopback HTTP server Electron starts only during the OAuth flow (`discordOAuth.js`), matching `DISCORD_REDIRECT_URI` on the backend and in `docker-compose.yml`.
- **OAuth scope**: `identify` only.
- **Authorize URL**: `https://discord.com/api/oauth2/authorize?client_id=1529308527972192367&redirect_uri=http%3A%2F%2F127.0.0.1%3A51823%2Fcallback&response_type=code&scope=identify`
- **Token exchange**: `POST https://discord.com/api/oauth2/token` (server-side, `discord.js`)
- **Identity fetch**: `GET https://discord.com/api/users/@me` (server-side, Bearer token)
- **Avatar CDN pattern**: `https://cdn.discordapp.com/avatars/{id}/{avatar}.png`
- **Rich Presence**: activity type 3 (Watching), `details: <channelName>`, `state: "via Streamio"`, `largeImageKey: "streamio_logo"` — silently no-ops if no local Discord client is running.
- **Guild voice-relay bot**: code complete at `~/streamio-bot/` on Flex-2, confirmed **not deployed/running**. No webhook URLs, guild IDs, or channel IDs are hardcoded anywhere in the current repo.

---

## 6. Release history (GitHub Releases — all tagged prerelease)

| Version | Published (UTC) | Headline fix/feature |
|---|---|---|
| v0.5.9 | 2026-07-24 08:27 | **Real fix** for back button: `.layer` wrapper covered the full window and swallowed clicks meant for content painted elsewhere in it — confirmed via live click-target logging, not guesswork |
| v0.5.8 | 2026-07-24 08:10 | Controls window made OS-level topmost (`setAlwaysOnTop`) — turned out not to be the actual root cause, but a legitimate hardening |
| v0.5.7 | 2026-07-24 07:59 | `--hwdec-codecs=h264` restriction, `disableHardwareAcceleration()`, wider back-button hit area |
| v0.5.4 | 2026-07-24 07:16 | Black-video root cause found (transparent `controlsWindow` rendering opaque) and fixed via `setShape()` |
| v0.5.3 | 2026-07-24 07:02 | Fixed player drifting with page scroll (`position: absolute` → `fixed`) |
| v0.5.2 | 2026-07-24 06:47 | Verified v0.5.1 asset integrity, sanitized updater error messages |
| v0.5.1 | 2026-07-24 06:33 | Badge system (15 badges) shipped; first attempt at black-frame fix (`gpu`+`d3d11`, did not fully fix it) |
| v0.5.0 | 2026-07-24 05:59 | Transparent always-on-top controls window architecture introduced |
| v0.4.0 | 2026-07-24 05:25 | 60s auto-updater, changelog modal, install progress bar, restart countdown, Developer Dashboard |
| v0.3.0 | 2026-07-24 05:00 | Identity/presence, profile customization, admin panel, Discord OAuth2, read receipts/typing indicators |
| v0.2.0 | 2026-07-24 04:08 | Login/registration, 42-page router, playlist import, search, My List |
| v0.1.0 | 2026-07-24 03:25 | Phase 1: Electron+mpv player, demo playlist |

Installer size has grown from ~169.6MB (v0.1.0) to ~170.9MB (v0.5.9). `latest.yml` (electron-updater manifest) is a consistent 345 bytes across releases with assets.

**Note:** there is a version-number gap (v0.5.5/v0.5.6 were never released) — v0.5.1 through v0.5.9 were shipped as individually-tagged releases without separate "Bump version" commits for each in git history.

---

## 7. Auto-updater behavior

- `electron-updater`, `autoUpdater.allowPrerelease = true` (required, since every release to date is marked prerelease on GitHub), `autoDownload = false`
- Checks automatically every **60 seconds**, or on-demand via the "Refresh Updater" button in Settings → About
- On update found: button becomes `Update to v<version>`, click triggers manual download with a live progress bar
- On download complete: button becomes `Restart & Install`; clicking it broadcasts a 6-second countdown to the renderer, stops mpv, then calls `quitAndInstall()`
- `shortErrorMessage()` in `autoUpdater.js` maps raw `electron-updater` `HttpError` dumps (which otherwise leak full URLs/headers) into short messages — e.g. HTTP 404 → "No update package found on GitHub yet"

---

## 8. Known gotchas (for future work)

1. **mpv always paints above renderer content in its owning window** — never try to put UI back into `mainWindow`'s DOM over the video; it requires a separate topmost window.
2. **`position: absolute` inside a scrolling ancestor drifts with scroll** — anything meant to track a fixed screen region (like the player bounds reporter) must use `position: fixed`.
3. **A full-screen "layer" `<div>` with `pointer-events: auto` captures clicks everywhere in its box, not just where content is visually painted** — this was the real root cause of the v0.5.0–v0.5.8 back-button saga. Always scope `pointer-events: auto` to the actual visible content elements, not their full-screen positioning wrapper.
4. **`transparent: true` BrowserWindows can render opaque black instead of see-through** on some Windows GPU/driver combinations — `setShape()` sidesteps this by making the non-content region genuinely not part of the window at the OS level.
5. **`isDestroyed()` can lag one tick behind actual native handle teardown** — guard with an explicit `closing` flag set on the `"close"` event (before `"closed"`), not just `isDestroyed()` checks.
6. **electron-updater's raw `HttpError` includes full request URLs/headers** — always sanitize before showing to users.
7. **Backgrounded `curl` uploads to GitHub Releases can silently fail with no visible error** — always verify via `curl -sI -L <download-url>` and compare `Content-Length` to the local file size before telling anyone a release is ready.
8. **`git archive --format=zip -o out.zip HEAD`** is the only safe way to produce a source zip — manual exclude-glob copying has leaked `secrets.env` before.
9. When debugging rendering/click issues, **prefer live diagnostic logging over guessing** — the v0.5.9 fix was found in minutes once click-target logging was added; several earlier releases shipped plausible-sounding fixes that didn't address the actual bug.
10. Packaged Electron builds are `asar`-bundled by default — for fast iteration when debugging, run `npx electron .` directly against source (`NODE_ENV=production npx electron .` loads the built `dist/` without needing a full `electron-builder` repackage).

---

## 9. Standard workflow for shipping a change

1. Make the code change, `npx tsc --noEmit -p tsconfig.json` to verify no type errors
2. Kill any running `Streamio.exe`/`electron.exe` processes
3. Bump `package.json` version (`npm version <x.y.z> --no-git-tag-version`) and `src/pages/settings/About.tsx`'s displayed version string
4. `CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist` — builds `dist/win-unpacked/` and `dist/Streamio-Setup-<version>.exe`
5. `robocopy dist\win-unpacked C:\Users\OMEN\Desktop\Streamio /MIR` — sync into the real test-install path (the only path that should ever be used for testing, per explicit instruction)
6. Commit and push to `main`
7. `git archive --format=zip -o <tmp>\Streamio-source-v<version>.zip HEAD` for the source asset
8. Create the GitHub release (prerelease, changelog per `CHANGELOG_STANDARD.md`'s ➕✅❓➖ format), upload `latest.yml`, the source zip, and the installer exe (large upload should run in the background)
9. **Always verify the large exe upload actually completed** via `curl -sI -L <download-url>` Content-Length match before telling anyone the release is ready — silent background-upload failures have happened before

---

## 10. Explicitly declined / out-of-scope features

- YouTube re-hosting/proxying
- Discord voice-channel relay directly into user DMs
- Bot editing a user's personal Discord presence while their client is closed

## 11. Roadmap / not yet built

- Room-invite deep links
- Moderator tools beyond basic room ownership
- Group DMs (currently 1:1 only)
- WebSocket-based chat (currently 3-second polling)
- Activating the dormant guild voice-relay bot on Flex-2

---

## 12. AI handoff — quick orientation for a new session

- Read this file first, then check `git log --oneline -20` in `desktop-app/` for anything shipped after this doc's "Last updated" date.
- Test builds **only** against `C:\Users\OMEN\Desktop\Streamio\Streamio.exe` (synced via robocopy), never the raw `dist/win-unpacked` copy, per explicit user instruction.
- SSH keys for all three Oracle instances live at `~/.ssh/streamio_oracle*` — no `~/.ssh/config` aliases are set up; connect directly with `-i <key> user@<ip>`.
- Do not read or print `backend/secrets.env` or any `.env` file contents into chat or logs.
- The user's standing instruction: verify large file uploads before declaring a release ready, and prefer live diagnostic evidence over guessing when debugging rendering/input bugs.
