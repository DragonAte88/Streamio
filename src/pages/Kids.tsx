import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

type WCOResult = { title: string; url: string };

export default function Kids() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"dub"|"sub"|"cartoon"|"all">("all");
  const [results, setResults] = useState<WCOResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  
  const nav = useNavigate();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setSearched(true);
    
    try {
      const res = await window.wco.search(query, filter);
      setResults(res);
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleShowClick = (show: WCOResult) => {
    nav(`/kids/show?url=${encodeURIComponent(show.url)}&title=${encodeURIComponent(show.title)}`);
  };

  return (
    <div className="scroll-container">
      <div style={{ padding: 40, paddingBottom: 20 }}>
        <h2>Kids & Cartoons (VOD)</h2>
        <p style={{ color: "var(--text-dim)", marginBottom: 24 }}>
          Search for cartoons, anime, and movies. Powered by WCO natively within Streamio.
        </p>

        <form onSubmit={handleSearch} style={{ display: "flex", gap: 12, marginBottom: 32 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 500 }}>
            <input
              type="text"
              placeholder="Search shows..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px 12px 16px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                color: "var(--text)",
                fontSize: 16,
              }}
            />
          </div>
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value as any)}
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text)",
            }}
          >
            <option value="all">All</option>
            <option value="dub">Dubbed Anime</option>
            <option value="sub">Subbed Anime</option>
            <option value="cartoon">Cartoons</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {searched && !loading && results.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-dim)", padding: 40 }}>
            No results found for "{query}".
          </div>
        )}

        {results.length > 0 && (
          <div>
            <div className="row-title">Search Results ({results.length})</div>
            <div className="row-scroll" style={{ flexWrap: "wrap", overflow: "visible" }}>
              {results.map((r, i) => (
                <div
                  key={i}
                  className="card"
                  onClick={() => handleShowClick(r)}
                  style={{ width: 180, height: 260, backgroundColor: "var(--bg-card)" }}
                >
                  <div className="card-group" style={{ whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', marginTop: 'auto', paddingBottom: 30 }}>
                    {r.title}
                  </div>
                  <div className="card-label">View Episodes</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
