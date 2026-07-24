import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { fetchWatchHistory, ApiChannel } from "../lib/api";
import { usePlayback } from "../lib/PlaybackContext";
import { Channel } from "../lib/playlist";

function toChannel(c: ApiChannel): Channel {
  return { id: String(c.id), name: c.name, url: c.url, logo: c.logo || undefined, group: c.group_name, tvgId: c.tvg_id || undefined };
}

export default function RecentlyWatched() {
  const { token, user } = useAuth();
  const { play } = usePlayback();
  const nav = useNavigate();
  const [items, setItems] = useState<ApiChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchWatchHistory(token)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [token]);

  if (!user) {
    return (
      <div className="empty-state">
        <h2>Recently Watched</h2>
        <p>Sign in to view your watch history.</p>
        <button className="btn btn-primary" onClick={() => nav("/login")}>Sign In</button>
      </div>
    );
  }

  if (loading) return <div className="empty-state">Loading…</div>;
  if (items.length === 0) return <div className="empty-state"><h2>Recently Watched</h2><p>You haven't watched anything yet.</p></div>;

  return (
    <div className="row-section" style={{ paddingTop: 40 }}>
      <div className="row-title">Recently Watched</div>
      <div className="row-scroll" style={{ flexWrap: "wrap" }}>
        {items.map((c) => (
          <div
            key={c.id}
            className="card"
            style={c.logo ? { backgroundImage: `url(${c.logo})` } : undefined}
            onClick={() => play(toChannel(c))}
          >
            <div className="card-group">{c.group_name}</div>
            <div className="card-label">{c.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
