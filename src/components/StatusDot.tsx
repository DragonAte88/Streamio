import React from "react";
import { PresenceStatus } from "../lib/api";

const COLORS: Record<PresenceStatus, string> = {
  online: "#3ddc84",
  idle: "#f0b132",
  dnd: "#e6392f",
  invisible: "#3a3a44",
  offline: "#5a5a66"
};

export const STATUS_LABELS: Record<PresenceStatus, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  invisible: "Invisible",
  offline: "Offline"
};

export default function StatusDot({ status, size = 10 }: { status: PresenceStatus | null | undefined; size?: number }) {
  const color = COLORS[status || "offline"];
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        border: "2px solid var(--bg)",
        flexShrink: 0
      }}
    />
  );
}
