import React, { useMemo, useState } from "react";
import { useCatalog } from "../lib/CatalogContext";
import { usePlayback } from "../lib/PlaybackContext";

export default function Search() {
  const { channels, loading } = useCatalog();
  const { play } = usePlayback();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return channels.filter((c) => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [channels, query]);

  return (
    <div className="row-section" style={{ paddingTop: 40 }}>
      <input
        autoFocus
        placeholder="Search channels, categories…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: "100%",
          maxWidth: 480,
          padding: "12px 16px",
          borderRadius: 8,
          border: "1px solid #2a2a35",
          background: "#16161d",
          color: "#f4f4f6",
          fontSize: 15,
          marginBottom: 24
        }}
      />
      {loading && <p style={{ color: "var(--text-dim)" }}>Loading catalog…</p>}
      {!loading && query && results.length === 0 && <p style={{ color: "var(--text-dim)" }}>No results for "{query}".</p>}
      {!loading && results.length > 0 && (
        <div className="row-scroll" style={{ flexWrap: "wrap" }}>
          {results.map((ch) => (
            <div key={ch.id} className="card" style={ch.logo ? { backgroundImage: `url(${ch.logo})` } : undefined} onClick={() => play(ch)}>
              <div className="card-group">{ch.group}</div>
              <div className="card-label">{ch.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
