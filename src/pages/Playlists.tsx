import React, { useState } from "react";
import { Link } from "react-router-dom";
import { listSources, removeSource, PlaylistSource } from "../lib/playlistSources";

export default function Playlists() {
  const [sources, setSources] = useState<PlaylistSource[]>(listSources());

  const remove = (id: string) => {
    removeSource(id);
    setSources(listSources());
  };

  return (
    <div className="playlist-list">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Playlists</h2>
        <Link to="/library/playlists/add" className="btn btn-primary">+ Add Playlist</Link>
      </div>

      {sources.length === 0 && (
        <p style={{ color: "var(--text-dim)" }}>No playlists imported yet. Add an M3U/M3U8 URL to get started.</p>
      )}

      {sources.map((s) => (
        <div className="playlist-item" key={s.id}>
          <div>
            <div style={{ fontWeight: 600 }}>{s.name}</div>
            <div className="playlist-meta">{s.channelCount} channels · {s.url}</div>
          </div>
          <button className="btn btn-secondary" onClick={() => remove(s.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
