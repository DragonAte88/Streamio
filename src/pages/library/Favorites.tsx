import React, { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { usePlayback } from "../../lib/PlaybackContext";
import { fetchFavorites, removeFavorite } from "../../lib/api";
import { Channel } from "../../lib/playlist";
import { toChannel } from "../../components/RecommendedRows";

export default function Favorites() {
  const { token } = useAuth();
  const { play } = usePlayback();
  const [items, setItems] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchFavorites(token)
      .then((rows) => setItems(rows.map(toChannel)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const unfavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    const prev = items;
    setItems((list) => list.filter((c) => c.id !== id)); // optimistic
    removeFavorite(token, id).catch(() => setItems(prev)); // roll back on failure
  };

  if (!token) return <div className="empty-state">Sign in to keep favorites.</div>;
  if (loading) return <div className="empty-state">Loading…</div>;
  if (error) return <div className="empty-state">Couldn't load favorites: {error}</div>;

  if (items.length === 0) {
    return (
      <div className="empty-state">
        No favorites yet.
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8, maxWidth: 520, margin: "8px auto 0", lineHeight: 1.6 }}>
          Favorites are for channels you come back to often — separate from My List, which is more of a "watch this
          later" queue.
        </div>
      </div>
    );
  }

  return (
    <div className="row-scroll" style={{ flexWrap: "wrap" }}>
      {items.map((ch) => (
        <div
          key={ch.id}
          className="card"
          style={ch.logo ? { backgroundImage: `url(${ch.logo})` } : undefined}
          onClick={() => play(ch)}
        >
          <button
            onClick={(e) => unfavorite(ch.id, e)}
            title="Remove from Favorites"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 2,
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "none",
              cursor: "pointer",
              background: "rgba(0,0,0,0.55)",
              color: "var(--accent)",
              fontSize: 14
            }}
          >
            ★
          </button>
          <div className="card-group">{ch.group}</div>
          <div className="card-label">{ch.name}</div>
        </div>
      ))}
    </div>
  );
}
