import React, { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { usePlayback } from "../../lib/PlaybackContext";
import { ContinueItem, fetchContinueWatching } from "../../lib/api";
import { toChannel } from "../../components/RecommendedRows";

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export default function ContinueWatching() {
  const { token } = useAuth();
  const { play } = usePlayback();
  const [items, setItems] = useState<ContinueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchContinueWatching(token)
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (!token) return <div className="empty-state">Sign in to track your progress across devices.</div>;
  if (loading) return <div className="empty-state">Loading…</div>;
  if (error) return <div className="empty-state">Couldn't load progress: {error}</div>;

  if (items.length === 0) {
    return (
      <div className="empty-state">
        Nothing in progress.
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8, maxWidth: 520, margin: "8px auto 0", lineHeight: 1.6 }}>
          Anything you start but don't finish shows up here with a resume point. Live channels are excluded — there's
          no position to resume to on a continuous stream.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => {
        const pct = item.duration_seconds ? (item.position_seconds / item.duration_seconds) * 100 : 0;
        return (
          <div
            key={item.id}
            onClick={() => play(toChannel(item), undefined, { kind: "vod" })}
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              padding: "12px 14px",
              background: "#101017",
              border: "1px solid #1e1e28",
              borderRadius: 8,
              cursor: "pointer"
            }}
          >
            <div
              style={{
                width: 96,
                height: 54,
                flexShrink: 0,
                borderRadius: 4,
                background: item.logo ? `#000 url(${item.logo}) center/contain no-repeat` : "#1c1c26"
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                {fmt(item.position_seconds)} of {fmt(item.duration_seconds)} · {Math.round(pct)}% watched
              </div>
              <div style={{ height: 4, background: "#1c1c26", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)" }} />
              </div>
            </div>
            <button className="btn btn-primary" style={{ flexShrink: 0 }}>▶ Resume</button>
          </div>
        );
      })}
    </div>
  );
}
