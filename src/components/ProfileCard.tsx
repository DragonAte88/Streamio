import React from "react";
import StatusDot from "./StatusDot";
import { PresenceStatus } from "../lib/api";

export interface ProfileCardData {
  display_name?: string | null;
  username?: string | null;
  discriminator?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  accent_color?: string | null;
  bio?: string | null;
  status?: PresenceStatus | null;
}

export default function ProfileCard({ user }: { user: ProfileCardData }) {
  const accent = user.accent_color || "#e6392f";
  return (
    <div style={{ width: 320, borderRadius: 12, overflow: "hidden", background: "var(--bg-card)", border: "1px solid #24242f" }}>
      <div
        style={{
          height: 80,
          background: user.banner_url ? `url(${user.banner_url}) center/cover` : `linear-gradient(135deg, ${accent}, #7c5cff)`
        }}
      />
      <div style={{ padding: "0 16px 16px", marginTop: -32 }}>
        <div style={{ position: "relative", width: 64, height: 64 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "var(--bg-card)",
              border: "4px solid var(--bg-card)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28
            }}
          >
            {user.avatar_url || "👤"}
          </div>
          <div style={{ position: "absolute", right: 0, bottom: 0 }}>
            <StatusDot status={user.status} size={16} />
          </div>
        </div>

        <div style={{ marginTop: 10, fontWeight: 700, fontSize: 16 }}>{user.display_name || user.username}</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
          {user.username}
          <span style={{ opacity: 0.6 }}>#{user.discriminator || "0000"}</span>
        </div>
        {user.bio && <div style={{ fontSize: 13, color: "var(--text)", borderTop: "1px solid #24242f", paddingTop: 10 }}>{user.bio}</div>}
      </div>
    </div>
  );
}
