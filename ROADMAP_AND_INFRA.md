# Streamio — Outstanding Work &amp; Infrastructure Setup Guide

**As of:** 2026-07-24, v0.5.9. Companion to [`PROJECT_DOCUMENTATION.md`](./PROJECT_DOCUMENTATION.md) (read that first for current-state architecture). This document is forward-looking: everything listed below does **not** exist yet and needs to be built, plus a full guide for formally provisioning all three Oracle Cloud Flex instances into this project.

---

# PART 1 — Outstanding Features, Systems, and Settings

Every item below is grouped by area. Each has: what's missing, why, and concretely what needs to be created (DB tables/columns, backend endpoints, frontend files) to make it real. Nothing here is theoretical — the placeholder pages and their exact rationale already exist in `src/lib/navConfig.ts`, quoted where relevant.

## 1.1 Browse / VOD catalog (8 stub pages, `src/pages/BrowsePlaceholder.tsx`)

None of these render real content today — they all hit the same `BrowsePlaceholder` component with a static title/description. Live TV (`/live-tv`) is the only fully working catalog view.

| Page | Path | What's needed |
|---|---|---|
| Movies | `/movies` | A VOD catalog. Requires: (1) a `content_type` or separate `movies` table (`id, title, tmdb_id, year, poster_url, source_url, runtime_minutes, created_at`), (2) an ingestion path — either manual admin entry via a new `/admin/content` route, or bulk import from an M3U8 VOD group, (3) `GET /movies` + `GET /movies/:id` backend routes, (4) wire into the existing `artwork.js` TMDB proxy for posters (already built, just needs a caller) |
| TV Shows | `/tv-shows` | Same as Movies but with season/episode hierarchy. Needs `shows`, `seasons`, `episodes` tables (`episodes.show_id`, `season_number`, `episode_number`, `source_url`). Frontend needs an episode-list UI component that doesn't exist yet |
| Sports | `/sports` | Simplest of the eight — just a filtered view of `channels` where `group_name = 'Sports'`. No new DB work; just a `GET /channels?group=Sports` query param on the existing `channels.js` route (currently takes none) and a frontend page reusing `ContentRow.tsx` |
| News | `/news` | Identical pattern to Sports — filter by `group_name = 'News'` |
| Kids | `/kids` | Same filter pattern, but should also gate on Parental Controls (see §1.4) once that's real — a kids channel should never appear if parental mode is active with kids content disabled, or conversely should be the *only* thing visible in kids-lock mode |
| Trending | `/trending` | Needs a ranking query against `watch_history`: `SELECT channel_id, COUNT(*) FROM watch_history WHERE watched_at > now() - interval '7 days' GROUP BY channel_id ORDER BY count DESC`. New endpoint `GET /channels/trending`. Will be empty/meaningless until there's real usage data accumulating |
| New Releases | `/new-releases` | Trivial once Movies/TV Shows exist — `ORDER BY created_at DESC LIMIT 20` across whichever content tables exist |
| Channel Guide | `/guide` | The biggest lift here. Needs a real EPG (Electronic Program Guide) data model: a `programs` table (`channel_id, title, description, start_time, end_time`) populated from an XMLTV source, a grid-view frontend component (time-axis × channel-axis), and a backend ingestion job to pull/parse XMLTV on a schedule. This is a multi-day feature on its own, not a quick add |

## 1.2 Library tabs (4 stub pages, `src/pages/Placeholder.tsx` inside `/library`)

`My List` and `Playlists` are fully real. These four are not:

| Page | What's needed |
|---|---|
| Favorites | Distinct from My List (watchlist) — needs its own table, e.g. `favorites (user_id, channel_id, added_at)`, and a `/favorites` route pair mirroring `watchlist.js`. Frontend: a heart/star toggle wired the same way the existing watchlist "+" button works |
| Continue Watching | Requires resume-position tracking that **does not exist at all today** — `watch_history` only logs a play *event* with a timestamp, not a playback offset. Needs: `watch_history.position_seconds` column, an IPC/API call from `PlayerView.tsx` on unmount/pause to persist current `time-pos`, and a `GET /watchlist/continue` endpoint returning the most recent unfinished entries |
| Recently Watched | The backing data (`watch_history`) already exists server-side and is already being written to on every play. Only missing piece: a `GET /watch-history?limit=20` endpoint and a frontend page that calls it — this is the cheapest item on this entire list to ship |
| Downloads | Not applicable until VOD (Movies/TV Shows, §1.1) exists — live channels can't meaningfully be "downloaded." Low priority; blocked on §1.1 |

## 1.3 Settings pages (7 stub pages, under `/settings`)

`General`, `Playback`, `Appearance`, `Account`, `Backend`, `Discord`, `Subtitles`, `Audio`, `Parental` (UI shell only — see below), `Notifications`, `Shortcuts`, and `About` all render real functional UI. These do not:

| Page | What's needed |
|---|---|
| Kodi Sync | Optional companion sync to a Kodi install — was in the original 25-feature scope but never built. Needs research into Kodi's JSON-RPC API before any implementation work starts; treat as a standalone research spike, not a quick feature |
| Cast &amp; Remote | Mobile remote-control / casting to other devices. This implies a **second client app** (mobile) or at minimum a lightweight pairing protocol (QR-code pairing + a WebSocket control channel added to the backend). Large, multi-system feature |
| Profiles | Multiple viewer profiles per single account (Netflix-style). Needs a `profiles` table (`id, user_id, name, avatar, is_kids_profile`), a profile-switcher UI on login, and every user-scoped table/query (watchlist, watch_history, favorites) re-scoped to `profile_id` instead of `user_id`. This is a real schema migration, not additive — plan it carefully, it touches almost every table in §3.2 of the main doc |
| Stats for Nerds | Live playback diagnostics (fps, buffer health, bandwidth, dropped frames) — mpv already exposes all of this via observable properties (`estimated-vf-fps`, `cache-buffering-state`, `demuxer-cache-duration` is already observed for the buffer indicator). Cheapest way to build this: extend `mpvController.js`'s `observe()` calls and add a debug overlay toggle in `playerControls.js`. Should NOT require new backend work — this is a pure Electron+mpv feature |
| Help &amp; Support | Static FAQ/support content page. Trivial — just needs actual content written and a static page component |
| Privacy Policy | Legal text. Needs to be drafted (by the project owner, not generated) and rendered as a static page |
| Terms of Service | Same as Privacy Policy — legal text needed, not code |

**Parental Controls** (`/settings/parental`) currently has a settings UI shell but nothing in the app actually *enforces* it yet — no page currently checks a parental-lock state before rendering restricted content, because there's no restricted-content concept yet (ties into Kids category in §1.1). This needs: a `parental_pin_hash` + `parental_enabled` column on `users` (or on `profiles` once that exists), a lock-check gate in `Layout.tsx` or a route guard, and rating metadata on content tables to actually restrict against.

## 1.4 Social system gaps

From `PROJECT_DOCUMENTATION.md` §11 (Roadmap), confirmed still true:

- **Room-invite deep links** — currently invites only work through the in-app Social → Invites flow; there's no shareable URL (`streamio://room/<id>` or a web-based join link) that opens the app directly into a room. Needs a custom protocol handler registered in `electron-builder`'s `nsis` config (`protocols` field) and an Electron `app.setAsDefaultProtocolClient` call, plus a deep-link router in `main.js`
- **Moderator tools beyond room ownership** — no kick/mute/ban-from-room capability exists. Needs new `room_members.role` column (`owner|mod|member`), new admin-style endpoints under `/social/rooms/:id/members/:userId` (PATCH role, DELETE to kick), and UI in `RoomDetail.tsx`
- **Group DMs** — `direct_messages` is strictly 1:1 today (`from_user_id`/`to_user_id`). Real group DM support needs a schema rework similar to `rooms`/`room_members` — likely the cleanest path is to make DMs a special case of rooms (`rooms.is_dm boolean`) rather than a parallel system
- **WebSocket-based chat** — current chat is 3-second polling (mentioned in `social.js`). This is a real scalability/latency problem once there's more than a couple of concurrent users. Needs a WebSocket server added to `backend/api/server.js` (e.g. `ws` package), replacing the polling `GET /social/rooms/:id/messages` call pattern with a push model. This is a meaningful backend architecture change — plan a maintenance window since it touches the primary chat path in production
- **Guild voice-relay Discord bot** — code is complete and sitting at `~/streamio-bot/` on Flex-2 (confirmed via audit) but has never been deployed as a running service. To activate: build+push its Docker image on Flex-2, add it to a compose file there, wire `rooms.discord_voice_channel_id` (already exists in schema) to actually trigger the bot joining a voice channel when a room starts co-watching. This is "finish deploying already-written code," not new development

## 1.5 Admin / Developer Dashboard gaps

- No content moderation queue for user-uploaded assets (`/admin/assets` currently just lists/deletes, no flagging or review workflow)
- No audit log of admin actions (grants, suspensions, deletions) — `admin.js` performs these but doesn't record who did what/when. Add an `admin_actions` table and log every mutating admin endpoint call to it
- Developer Dashboard's Oracle Cloud reachability checks only ping Flex-1 today (confirmed in `DevDashboard.tsx` per earlier build) — once Flex-2/Flex-3 are formally brought into the project (Part 2 below), the dashboard should surface real status for all three, not just Flex-1

## 1.6 Known-incomplete but lower priority

- In-app crash reporting (currently relies on manual log-file inspection; no Sentry-style capture-and-report pipeline)
- No rate-limiting on any backend route (auth endpoints in particular — `/auth/login` and `/auth/register` are unprotected against brute force/spam registration today)
- No email verification on registration (`auth.js` accepts any email string with no confirmation step)
- No password-reset flow (only self-service change-while-logged-in via `/account`, no "forgot password" email flow — there's no email-sending capability configured anywhere in the project at all yet)

---

# PART 2 — Formally Provisioning All Three Flex Instances

## 2.1 Current state (as of this audit) vs. target state

| | Current role | Current reality | Target role |
|---|---|---|---|
| **Flex-1** | Production backend | Correctly running `streamio-backend-api` + `postgres:16-alpine` behind Caddy at `163-192-40-120.sslip.io`. Healthy | **No change** — this is already correctly provisioned. Keep as-is |
| **Flex-2** | "Idle / dormant Discord bot host" (per stale docs) | Actually running an unrelated Jellyfin server, Plex processes, and a pile of undocumented IPTV/EPG scraping scripts (some world-writable) alongside the never-deployed `~/streamio-bot/` | Dedicated Discord bot host + secondary services (see §2.3) |
| **Flex-3** | "Reserved/blank" | Genuinely empty — only default ubuntu files, nothing running | First real workload assignment (see §2.4) |

## 2.2 SSH access (already exists, just documenting it)

Keys are already present locally at:
```
~/.ssh/streamio_oracle_e5      → Flex-1  (163.192.40.120, user ubuntu)
~/.ssh/streamio_oracle_flex2   → Flex-2  (170.9.15.10,   user ubuntu)
~/.ssh/streamio_oracle_flex3   → Flex-3  (138.2.232.225, user ubuntu)
~/.ssh/streamio_oracle         → (general/original key, purpose predates the per-instance split — verify before relying on it for a specific box)
```
No `~/.ssh/config` aliases exist yet. To make this less error-prone for future sessions, create one:

```
# ~/.ssh/config
Host streamio-flex1
    HostName 163.192.40.120
    User ubuntu
    IdentityFile ~/.ssh/streamio_oracle_e5

Host streamio-flex2
    HostName 170.9.15.10
    User ubuntu
    IdentityFile ~/.ssh/streamio_oracle_flex2

Host streamio-flex3
    HostName 138.2.232.225
    User ubuntu
    IdentityFile ~/.ssh/streamio_oracle_flex3
```
After this, connect with `ssh streamio-flex1` instead of the full `-i` invocation. **This file does not exist yet — creating it is itself one of the setup steps below.**

## 2.3 Flex-2 — cleanup and formal Discord-bot provisioning

**Step 1 — Resolve the unrelated Jellyfin/Plex/scraper content first.** Before deploying anything Streamio-related here, get an explicit answer on whether the existing Jellyfin container, Plex processes, and the ~20 loose Python/JSON/XML files in `~ubuntu` (`bypass_plex.py`, `wco_scraper.py`, `xepg.json`, etc.) are wanted, abandoned, or need to be removed. At minimum, fix the file permissions regardless of the decision — `settings.json`, `urls.json`, and `xepg.json` are currently world-writable (`chmod 644` or tighter, never leave app config world-writable on an internet-facing box). This is a prerequisite, not optional cleanup — deploying a Discord bot with real tokens onto a box with world-writable files owned by unrelated services is a genuine credential-exposure risk.

**Step 2 — Deploy the existing bot code.** The bot itself (`bot.js`, `botInteractions.js`, `commands.js`, `httpServer.js`, `nowPlayingState.js`, `voicePlayback.js`) already exists at `~/streamio-bot/` and is fully written — this is a deployment task, not a development task:
```bash
ssh streamio-flex2
cd ~/streamio-bot
docker build -t streamio-discord-bot .
```
Add a service block to a new `~/streamio-bot/docker-compose.yml` (doesn't exist yet):
```yaml
services:
  bot:
    build: .
    restart: unless-stopped
    env_file: .env
```
Create `~/streamio-bot/.env` with `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID=1529308527972192367` (same app ID as RPC/OAuth — confirm whether the bot needs its own bot-user token, which is a *different* secret from the OAuth client secret on Flex-1), and `BACKEND_API_URL=https://163-192-40-120.sslip.io` so the bot can call the Flex-1 API for room/channel state.

**Step 3 — Wire the backend to it.** `rooms.discord_voice_channel_id` already exists in the schema (currently unused). `backend/api/routes/social.js`'s room-sync endpoint should, when a room's watch-together session starts, call the bot's `httpServer.js` HTTP endpoint (already built) to trigger a voice-channel join. This requires knowing `httpServer.js`'s actual route surface — read that file before wiring it up, it wasn't included in the audit's read set.

**Step 4 — Caddy entry.** Flex-2 already runs Caddy (confirmed active). Add a site block for the bot's HTTP server if it needs to be reachable from Flex-1, e.g.:
```
170-9-15-10.sslip.io {
    reverse_proxy 127.0.0.1:<bot-http-port>
}
```

## 2.4 Flex-3 — first real workload

Flex-3 is genuinely empty today. Reasonable candidate workloads, in order of how directly they extend already-planned features from Part 1:

1. **EPG ingestion service** (feeds §1.1's Channel Guide) — a small scheduled job (cron or systemd timer) that pulls an XMLTV source, parses it, and pushes parsed programs into Flex-1's Postgres over the network (Flex-1's Postgres currently has no host port mapping — either add one restricted to Flex-3's IP, or run this job on Flex-1 instead and keep Flex-3 for something stateless)
2. **Static asset / artwork cache** — a Caddy or nginx instance caching TMDB/OMDb artwork responses to reduce repeated external API calls from `artwork.js`'s currently-unbounded in-memory cache (which is per-process and lost on every backend restart)
3. **Staging/canary backend** — a second copy of `backend/api` + a separate Postgres, used to test schema migrations (e.g. the Profiles rework in §1.3, or the DM→rooms merge in §1.4) before applying them to Flex-1's production database

Given Flex-3 is currently unused and the biggest schema-risk item on this whole list is the **Profiles migration** (§1.3) and **group-DM rework** (§1.4) — both are non-additive schema changes — provisioning Flex-3 as a **staging backend** first is the lowest-risk starting point. It lets every future non-additive migration get tested against real Postgres before touching Flex-1.

**Provisioning steps for staging backend on Flex-3:**
```bash
ssh streamio-flex3
sudo apt update && sudo apt install -y docker.io docker-compose-plugin caddy
mkdir -p ~/streamio-backend
# scp backend/ contents from local machine, same as the Flex-1 deploy pattern
# (Flex-1 was deployed via scp, not git pull — match that pattern for consistency)
```
Then mirror Flex-1's `docker-compose.yml` and `secrets.env` (**generate fresh secrets for staging — never copy `JWT_SECRET` or DB passwords from production to a staging box**), and add a Caddy block:
```
138-2-232-225.sslip.io {
    reverse_proxy 127.0.0.1:4000
}
```

## 2.5 Developer Dashboard integration

Once Flex-2 and Flex-3 have real, intentional workloads (not incidental clutter), update `src/pages/admin/DevDashboard.tsx` to add reachability/health checks for all three sslip.io endpoints, not just Flex-1's. This makes the "Oracle Cloud networking statistics" section of the dashboard (built per the original request) actually reflect the full three-instance footprint instead of just production.

---

# Suggested build order

This list is roughly ordered by (a) how much of it is genuinely new work vs. finishing existing code, and (b) dependency between items:

1. Flex-2 cleanup (§2.3 Step 1) — do this before anything else touches that box
2. Recently Watched (§1.2) — cheapest real feature on the list, backing data already exists
3. Sports/News category filters (§1.1) — trivial, reuses existing `channels` table and `ContentRow.tsx`
4. Deploy the already-written Discord bot to Flex-2 (§2.3 Steps 2-4)
5. Stats for Nerds (§1.3) — pure Electron/mpv work, no backend dependency
6. Favorites (§1.2) — small, mirrors the existing watchlist pattern exactly
7. Flex-3 staging backend provisioning (§2.4) — do this *before* attempting the Profiles or group-DM schema reworks
8. Continue Watching / resume-position tracking (§1.2)
9. Everything else in Part 1, roughly in the order listed
