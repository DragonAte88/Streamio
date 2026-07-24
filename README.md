# Streamio

Native Windows media player (`Streamio.exe`) for IPTV/M3U8 live TV, built to replace an earlier
Roblox-based version that was fundamentally limited by the platform (no live audio, an HTTP
rate ceiling, no hardware video decode). Playback here runs through **mpv**, so HLS/M3U8 decode,
hardware acceleration, and audio/video sync are handled by a real, proven media engine instead of
a from-scratch codec.

## Structure

- `electron/` — Electron main process: window management, mpv process control over JSON IPC,
  Discord Rich Presence.
- `src/` — React/TypeScript frontend: sidebar nav, hero banner, content rows, search, player view.
- `backend/` — Express + Postgres API (accounts, channel catalog, watchlist/history), deployed to
  Oracle Cloud (Flex-1).

## Running locally

```
npm install
npm run dev
```

## Building the Windows installer

```
npm run dist
```

Produces `dist/Streamio-Setup-<version>.exe` (NSIS installer, unsigned).

## Backend

The API runs on Oracle Cloud Flex-1, private-network only, fronted by Caddy on Flex-3
(`138-2-232-225.sslip.io`) for public HTTPS. See `backend/` for the Express app and Postgres schema.
