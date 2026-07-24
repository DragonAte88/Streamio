import React from "react";

const ITEMS: { label: string; status: "live" | "planned" | "not-possible" }[] = [
  { label: "Friend requests (send/accept/decline)", status: "live" },
  { label: "Friends list", status: "live" },
  { label: "Public & private rooms", status: "live" },
  { label: "Room text chat", status: "live" },
  { label: "Watch-together channel sync (owner-controlled)", status: "live" },
  { label: "Direct messages (1:1)", status: "live" },
  { label: "User search by username/display name", status: "live" },
  { label: "Discord account linking (manual ID)", status: "live" },
  { label: "Discord Rich Presence (profile card)", status: "live" },
  { label: "Bot joins a shared Discord server voice channel and plays room audio", status: "planned" },
  { label: "Bot persistent status independent of your client", status: "planned" },
  { label: "Real-time chat via WebSocket (currently polls every 3s)", status: "planned" },
  { label: "Room invites via shareable link", status: "planned" },
  { label: "Typing indicators", status: "planned" },
  { label: "Read receipts", status: "planned" },
  { label: "Online/offline presence indicators", status: "planned" },
  { label: "Blocking / muting users", status: "planned" },
  { label: "Room moderation (kick, ban, mute)", status: "planned" },
  { label: "Group DMs (3+ people)", status: "planned" },
  { label: "Emoji reactions on messages", status: "planned" },
  { label: "Image/GIF sharing in chat", status: "planned" },
  { label: "Voice activity indicator in rooms", status: "planned" },
  { label: "Screen share / co-watch reactions overlay", status: "planned" },
  { label: "Friend activity feed ('X is watching Y')", status: "planned" },
  { label: "Room discovery/browse (public rooms directory)", status: "planned" },
  { label: "Server-wide announcement channel via bot", status: "planned" },
  { label: "OAuth-based Discord account linking (instead of manual ID paste)", status: "planned" },
  { label: "Sync to a Discord DM or Group DM call", status: "not-possible" },
  { label: "Bot editing your personal Discord presence while your client is closed", status: "not-possible" },
  { label: "Draggable Discord progress-bar scrubber on RPC card", status: "not-possible" }
];

const LABELS: Record<string, string> = { live: "✓ Live", planned: "○ Planned", "not-possible": "✕ Not possible (Discord platform limit)" };
const COLORS: Record<string, string> = { live: "#3ddc84", planned: "var(--text-dim)", "not-possible": "#e6392f" };

export default function Roadmap() {
  return (
    <div className="playlist-list">
      <p style={{ color: "var(--text-dim)", marginBottom: 20, maxWidth: 640 }}>
        Honest status of the social system — what's actually wired up versus planned versus genuinely impossible
        given Discord's API. The "not possible" items aren't skipped for lack of effort; they're confirmed platform
        restrictions (see Settings → Discord for detail).
      </p>
      {ITEMS.map((item) => (
        <div className="setting-row" key={item.label}>
          <div className="setting-row-label">{item.label}</div>
          <div style={{ fontSize: 12, color: COLORS[item.status], whiteSpace: "nowrap", marginLeft: 16 }}>{LABELS[item.status]}</div>
        </div>
      ))}
    </div>
  );
}
