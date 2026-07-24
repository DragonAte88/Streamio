# Streamio — Full Project Documentation & AI Handoff Guide

Last updated: 2026-07-24, version 0.5.4. This document exists so another AI (or a human)
can pick up this project with zero prior context and be productive immediately.

---

## 1. What this is

Streamio is a native Windows desktop app (`Streamio.exe`, Electron + mpv) for IPTV/M3U8 live TV
and VOD playback, with a full account system, social features (friends/rooms/chat/watch-together),
an admin panel, media upload/management, Discord integration (Rich Presence + OAuth2 account
linking), an in-app auto-updater, and a Developer Dashboard.

It replaced an earlier Roblox-based version of the same idea (`DOCUMENTATION.md` in this repo's
git history / the original `Rokemon` folder covers that prior project) — Roblox's platform
limitations (no live audio API, HTTP rate ceilings, no hardware video decode) made a from-scratch
palette/RLE video codec necessary there. None of that applies here: mpv handles real HLS/M3U8
decode, hardware acceleration, and audio/video sync natively.

## 2. Repository & release locations

- **Source**: https://github.com/DragonAte88/Streamio (public, `main` branch, no protection rules)
- **Releases**: same repo's Releases tab. Each release has three assets:
  - `Streamio-Setup-X.Y.Z.exe` — NSIS installer (~170MB, includes full Electron+Chromium runtime)
  - `latest.yml` — electron-updater's manifest (version, sha512, size) — **required** for the
    in-app auto-updater to detect new versions
  - `Streamio-source-vX.Y.Z.zip` — full source snapshot via `git archive` (guarantees no secrets
    leak, since `git archive` only includes tracked files, and secrets are gitignored/never
    committed)
- **Local dev path**: `C:\Users\OMEN\Desktop\Rokemon\desktop-app`
- **Local test-install path**: `C:\Users\OMEN\Desktop\Streamio` — the user's actual install
  location. **Always test against this exact path**, not just `dist/win-unpacked`, per explicit
  user instruction. Rebuild and `robocopy /MIR` into this folder after every change (see §8).

## 3. Architecture

### 3.1 Desktop app (Electron)

Three real OS windows, not one:

1. **`mainWindow`** — the actual React app (all UI except video/controls).
2. **`videoWindow`** — a blank, frameless child window that exists *only* as mpv's `--wid` render
   target. mpv paints directly into this native window; it has no web content of its own.
3. **`controlsWindow`** — hosts the back button, title, seek bar, play/pause, volume. This is
   **not** a DOM overlay in `mainWindow` — a native window like `videoWindow` always paints above
   *all* content in its owner, so React-rendered controls could never appear "on top of" the
   video regardless of CSS z-index. `controlsWindow` is a separate always-on-top window kept
   positioned identically to `videoWindow` via `moveTop()`.

**Critical detail (found the hard way, see §9.3)**: `controlsWindow` uses `setShape()` to restrict
its actual visible/hit-testable region to just the top bar (76px) and bottom bar (94px) — the
middle is genuinely excluded from the window at the OS level, not just CSS-transparent. This is
because Windows/DWM transparency (`transparent: true` on a `BrowserWindow`) is fragile and was
observed rendering as opaque black instead of see-through, fully hiding a *correctly-rendering*
video underneath it.

Key files:
- `electron/main.js` — window lifecycle, IPC handlers, bounds/shape sync
- `electron/mpvController.js` — spawns mpv, JSON IPC over a named pipe (`streamio-mpvsocket`)
- `electron/playerControls.html` / `playerControls.js` — vanilla JS/HTML for `controlsWindow`
  (deliberately not React — it's a tiny, separate renderer)
- `electron/preload.js` — contextBridge API surface (`window.player`, `window.discord`,
  `window.updater`, `window.system`, `window.playerControlsBridge`), shared across all three
  windows' preload scripts (same file loaded into each)
- `electron/discordRpc.js` — Discord Rich Presence via `@xhayper/discord-rpc`, local IPC only
- `electron/discordOAuth.js` — OAuth2 flow via system browser + a loopback HTTP listener on
  `127.0.0.1:51823`
- `electron/autoUpdater.js` — wraps `electron-updater`, 60s auto-check interval
- `electron/systemStats.js` — local device stats (CPU/mem/disk/network/GPU) via `os` module +
  PowerShell calls, for the Developer Dashboard

### 3.2 Frontend (React + TypeScript + Vite, in `src/`)

Router: `react-router-dom` (`HashRouter`). ~45 routes. Structure:
- `App.tsx` — provider tree (Auth, Settings, Catalog, Playback) + route table
- `components/Layout.tsx` — sidebar (Home/Search/Your Library/Social/Settings/Admin), status
  selector, invite badge count
- `components/PlayerView.tsx` — the *invisible* bounds-reporting div that tells Electron where to
  position `videoWindow`/`controlsWindow`. Does **not** render its own controls (see §3.1).
- `pages/` — one file per route; `pages/settings/*` (19 tabs), `pages/social/*`,
  `pages/admin/*`
- `lib/` — `api.ts` (all backend calls), `auth.tsx`, `SettingsContext.tsx`, `CatalogContext.tsx`,
  `PlaybackContext.tsx`, `badges.ts` (badge catalog), `playlist.ts` (M3U parsing)

### 3.3 Backend (Node/Express + Postgres, in `backend/`)

Deployed on Oracle Cloud, **not** bundled with the client. Runs on Flex-1 only (see §4).

- `backend/api/server.js` — Express app, mounts all route files, runs `db/schema.sql` on every
  boot (idempotent — every statement is `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`)
- `backend/api/routes/` — `auth.js`, `profile.js`, `social.js`, `account.js`, `admin.js`,
  `assets.js`, `discord.js`, `badges.js`, `channels.js`, `watchlist.js`, `artwork.js`
- `backend/api/db/schema.sql` — the entire schema, additive-only migrations (never destructive)
- `backend/api/lib/logBuffer.js` — in-memory ring buffer capturing `console.log/error/warn`,
  exposed via `/admin/logs` for the Developer Dashboard
- `backend/docker-compose.yml` — Postgres + API containers
- `backend/secrets.env` — **gitignored, never committed**. Contains `PGPASSWORD`, `JWT_SECRET`,
  `TMDB_API_KEY`, `OMDB_API_KEY`, `FANART_API_KEY`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
  `DISCORD_REDIRECT_URI`. Exists only on Flex-1 and locally at
  `C:\Users\OMEN\Desktop\Rokemon\desktop-app\backend\secrets.env`. Sourced from
  `C:\Users\OMEN\Desktop\KodiRoblox\FULL_PROJECT_DOCUMENTATION.md` (TMDB/OMDb/FanartTV/Discord
  keys) — that file has its own "do not paste into chat" warning; never echo these values in
  conversation, only pipe them directly file-to-file.

## 4. Oracle Cloud infrastructure

Full detail originally in `ORACLE_CLOUD_INFRASTRUCTURE.md` (project root, outside this repo).
Summary:

| Instance | Public IP | Role | SSH key |
|---|---|---|---|
| Flex-1 | `163.192.40.120` | **The only one actually running anything.** Postgres + API (Docker), Caddy (reverse proxy + HTTPS via sslip.io, terminates TLS at `163-192-40-120.sslip.io`) | `C:\Users\OMEN\.ssh\streamio_oracle_e5` |
| Flex-2 | `170.9.15.10` | Idle. Has a dormant Discord voice-relay bot copied to `~/streamio-bot` but never activated | `C:\Users\OMEN\.ssh\streamio_oracle_flex2` |
| Flex-3 | `138.2.232.225` | Blank/reserved. Was briefly used as a Caddy edge during initial setup, reverted — see §9.1 | `C:\Users\OMEN\.ssh\streamio_oracle_flex3` |

SSH: `ssh -i <key> ubuntu@<ip>`

**Why everything lives on Flex-1 alone**: Flex-1 and Flex-3 turned out to be in separate OCI VCNs
(each auto-created its own on launch; they coincidentally share the `10.0.0.0/16` range, which
looked like they might be peerable but weren't actually on the same network). Rather than set up
real VCN peering for a single reverse-proxy hop, Caddy runs directly on Flex-1 itself.

Public API base: **`https://163-192-40-120.sslip.io`** (hardcoded as `API_BASE` in `src/lib/api.ts`
and as `backendUrl` in Settings > Backend/Sync, user-editable there).

### Deploying a backend change

```bash
KEY1="/c/Users/OMEN/.ssh/streamio_oracle_e5"
scp -i "$KEY1" backend/api/routes/whatever.js ubuntu@163.192.40.120:~/streamio-backend/api/routes/
ssh -i "$KEY1" ubuntu@163.192.40.120 "cd ~/streamio-backend && docker compose --env-file secrets.env up -d --build"
curl -s https://163-192-40-120.sslip.io/health  # {"ok":true,"db":"up"}
```

If `schema.sql` changed, scp it too (`backend/api/db/schema.sql` → `~/streamio-backend/api/db/schema.sql`)
— it's re-applied automatically on container restart.

## 5. Database schema (high level)

All in `backend/api/db/schema.sql`. Tables:
- `users` — email/password/display_name/**username+discriminator** (Discord-style unique handle,
  auto-assigned at registration, immutable after), avatar/banner/accent_color/bio, onboarded,
  **status** (online/idle/dnd/invisible/offline), **role** (user/admin), **can_upload_assets**,
  suspended/suspended_reason, discord_* fields (OAuth tokens + linked identity),
  privacy_show_activity/privacy_allow_friend_requests, **internal_account_id** (format
  `############.#######`, 12 digits + literal `.#` + 6 digits — generated at registration,
  **never included in any user-facing API response**, admin-only via `/admin/users`, exists
  purely for account security/support lookup)
- `channels` — the playable catalog (name/url/logo/group_name)
- `watchlist`, `watch_history` — per-user
- `friend_requests`, `friendships`, `direct_messages` — social graph
- `rooms`, `room_members`, `room_messages`, `room_reads`, `dm_reads`, `room_invites` — watch
  parties: text chat, read receipts, "invite a friend to watch" flow, owner-controlled
  `active_channel_id` sync (clients poll, not websocket-pushed)
- `assets` — uploaded media (mp4/mkv/mp3/images), `published_channel_id` links an asset to a
  catalog `channels` row once an admin publishes it (that's the entire "custom video plays and
  syncs in rooms" story — an upload becomes a normal channel, reusing every system already built,
  not a separate pipeline)
- `user_badges` — `(user_id, badge_slug)` pairs; the actual badge *definitions* (icon, gradient,
  glow, animation) live in code at `src/lib/badges.ts`, not the DB — adding a new badge design
  needs no migration

## 6. What's real vs. explicitly declined vs. not-yet-built

### Explicitly declined (do not build if asked again without new justification)
- **YouTube stream extraction/re-hosting**: violates YouTube ToS (same category as a scraper).
  The only legitimate option is embedding YouTube's official IFrame player (still "in-app" since
  Electron is Chromium, just not literally browser-less).
- **Discord voice relay into DM/Group DM calls**: Discord's API does not allow this for any
  third-party app or bot — confirmed platform restriction, not a missing feature. A bot *can* join
  a shared **guild (server) voice channel** — that code exists dormant on Flex-2 but isn't wired
  up to anything.
- **Bot editing a user's personal Discord presence while their client is closed**: not possible.
  RPC requires a live local IPC connection to a running Discord client, full stop. A *bot account*
  can have its own independent status, but that's the bot's profile, not the user's.

### Real and working (verified end-to-end against the live backend, not just type-checked)
Filters (genre/A-Z/Z-A), identity/discriminator system, presence status, profile customization,
account suspend/reactivate/permanent-wipe (with identifier recycling), admin panel (user
management + asset upload/publish/delete), Discord OAuth2 (real Authorization Code flow, secret
server-side only), read receipts, typing indicators, friend requests, rooms/chat/watch-together
sync, invite-to-watch, badge system, Developer Dashboard (real live stats), auto-updater (checks
real GitHub Releases, downloads, installs, verified restart flow).

### Roadmap (see in-app `/social/roadmap` for the full honest list)
Real-time chat is polling-based (3s), not WebSocket. Guild-voice-channel bot relay exists as code
but isn't activated. Room invites via shareable link, moderation tools, group DMs, and several
other social features are documented as planned, not built.

## 7. Known platform gotchas (found the hard way — don't rediscover these)

1. **electron-builder + winCodeSign on Windows**: fails with `Cannot create symbolic link` unless
   run as admin or Developer Mode is on (a system setting — do not enable it, that's a system
   config change requiring explicit permission). Fix: `signAndEditExecutable: false` and
   `forceCodeSigning: false` in `package.json`'s `build.win` config, plus
   `CSC_IDENTITY_AUTO_DISCOVERY=false` env var when running `npm run dist`. This produces an
   unsigned installer, which is fine for this project.
2. **`.player-view` must be `position: fixed`, never `position: absolute`**, because it lives
   inside `.main-content` which is a scrolling container — `absolute` scrolls with the page
   content, desyncing the native window bounds from where the UI visually appears. Also locks
   background scroll via a `.player-open` class while playing.
3. **mpv `--vo` choice for `--wid` embedding**: `gpu-next` (libplacebo) is *not* reliable for
   embedded windows on all Windows GPU/driver combinations — use `--vo=gpu --gpu-context=d3d11`.
   (This alone did *not* fix a real black-video report — see gotcha #4.)
4. **The real black-video root cause**: confirmed via a verbose mpv log
   (`--log-file=%TEMP%\streamio-mpv.log --msg-level=all=v,vo=trace,gpu=trace,cplayer=v`, see
   `mpvController.js`) that mpv's GPU render pipeline was running perfectly the whole time
   (continuous per-frame shader timing for the full session). The actual cause was
   `controlsWindow`'s `transparent: true` rendering as opaque black instead of see-through on this
   machine — fixed via `setShape()` restricting its real region to just the two control bars (see
   §3.1). **Lesson: when a symptom looks like "rendering is broken," check the actual mpv log
   before guessing at codec/vo args again** — the log is cheap and conclusive; blind arg-swapping
   isn't.
5. **`app.set("trust proxy", 1)`** is required in `server.js`, or Express doesn't trust Caddy's
   `X-Forwarded-Proto` header and generates `http://` URLs (for uploaded asset links) behind an
   HTTPS reverse proxy — a real bug that shipped once and was caught via testing.
6. **`isDestroyed()` checks are not enough** to prevent a real "Object has been destroyed" crash
   on app close — a `move`/`resize` event can still fire between the `close` and `closed` events,
   and `isDestroyed()` can lag one tick behind the native handle actually going away. Fix: a
   `closing` boolean flag set on `"close"` (before teardown starts), checked first in
   `applyVideoBounds()`, plus a defensive `try/catch` around the native calls.
7. **electron-updater's `HttpError.message`** dumps the entire request URL, every response
   header, and any signed tokens into one giant string — never show this raw to a user;
   `autoUpdater.js`'s `shortErrorMessage()` reduces it to a short line.
8. **Large file uploads to GitHub Releases via backgrounded `curl` can silently fail** with no
   error surfaced — always verify via `curl -sI -L <download-url>` and compare `Content-Length` to
   the local file size before telling anyone a release is ready. This was gotten wrong twice in
   this project's history before the verification habit was established.
9. **Never build a source zip by manually listing exclude-globs** (e.g., copying a directory and
   trying to filter out `node_modules`/`secrets.env` with PowerShell wildcards) — a flawed glob
   pattern once included `backend/secrets.env` in a zip that was about to be published. Use
   `git archive --format=zip -o out.zip HEAD` instead — it only includes tracked files, so
   anything gitignored/uncommitted structurally cannot leak.
10. **Screenshot/window-capture tooling is unreliable in this specific sandboxed dev environment**
    — `GetWindowRect`/`CopyFromScreen` via PowerShell, even with correct PID/HWND lookups
    confirmed via `Get-Process`, was repeatedly observed capturing a *different* window's content
    than the one being queried. Root cause not resolved (likely a virtual-display quirk specific
    to this sandbox). Scripts exist at `scripts/screenshot-window.ps1`, `scripts/find-streamio.ps1`
    for future refinement, but do not trust their output without independent verification. There
    is no working click/type automation for native (non-browser) windows in this environment —
    verifying interactive behavior (button clicks, etc.) requires the human user to test and
    report back, or reading real diagnostic logs (mpv's log file, `console.log` forwarded from
    Electron renderer windows into main-process stdout) as the alternative source of truth.

## 8. Standard workflow for any future change

1. Make the code change (backend and/or frontend/electron).
2. `npx tsc --noEmit -p tsconfig.json` (frontend) and/or `node --check <file>.js` (electron/backend
   JS) before doing anything else.
3. If backend changed: scp + `docker compose up -d --build` on Flex-1 (§4), verify via
   `curl https://163-192-40-120.sslip.io/health` and a targeted endpoint test — don't just assume
   it deployed correctly.
4. If Electron/frontend changed: bump `version` in `package.json` (`npm version X.Y.Z
   --no-git-tag-version`), update the hardcoded version string in `src/pages/settings/About.tsx`,
   `CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist`, then
   `robocopy dist\win-unpacked C:\Users\OMEN\Desktop\Streamio /MIR` (kill any running
   `Streamio.exe` first — robocopy can't overwrite a locked exe).
5. Commit + push to `main` (secrets are gitignored, verify with
   `git status --short | grep -i secret` before committing regardless).
6. Cut a GitHub Release: create it via the API with a properly `git archive`'d source zip, upload
   `latest.yml` and the source zip synchronously (fast), then the installer exe in the background
   (~170MB) — **and verify its upload actually completed** (§7.8) before telling the user it's
   ready.
7. Follow the changelog format in `CHANGELOG_STANDARD.md` (➕ Added / ✅ Updated / ❓ Preview /
   ➖ Removed sections) for every release body.

## 9. Discord integration reference

- **Application/Client ID**: `1529308527972192367` (same app used for both RPC and OAuth2 — public
  value, not sensitive, hardcoded in `discordRpc.js` and `discordOAuth.js`)
- **Client Secret**: server-side only, in `secrets.env` on Flex-1, never in any client code
- **OAuth2 Redirect URI** (must be registered in the Discord Developer Portal under this
  application's OAuth2 settings): `http://127.0.0.1:51823/callback` — a loopback HTTP server
  Electron spins up only during the OAuth flow (see `discordOAuth.js`)
- **Scope requested**: `identify` only — nothing else Streamio does requires broader Discord
  permissions. Do not add `bot`/guild-management scopes or an `Administrator` bot permission
  without the user explicitly confirming they want that specific capability built — it was
  offered once via pasted OAuth2 URL generator output and deliberately not adopted since nothing
  in the app uses it.

## 10. For an AI picking this up cold

Read, in order: this file, then `CHANGELOG_STANDARD.md`, then skim recent commits
(`git log --oneline -30`) for the most recent context this file might not yet reflect. Check
`C:\Users\OMEN\Desktop\Streamio\` for what's actually currently installed/tested vs. what's merely
committed. Assume nothing about "current state" without checking — this project has a real
history of a fix being committed and pushed correctly while a *deployment* step (upload, docker
rebuild) silently failed; always verify the live artifact, not just the source.

If continuing via an MCP-connected IDE rather than this exact tool environment: the SSH keys,
`backend/secrets.env`, and the GitHub credential (via Git Credential Manager, already configured
on this machine) are all that's needed to reach every system this project touches. There is no
separate "API" to integrate with beyond standard `ssh`/`scp`, `docker compose`, `git`, and GitHub's
REST API for releases (`https://api.github.com/repos/DragonAte88/Streamio/...`,
`https://uploads.github.com/repos/DragonAte88/Streamio/...` for asset uploads).
