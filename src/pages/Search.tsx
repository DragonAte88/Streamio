import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCatalog } from "../lib/CatalogContext";
import { usePlayback } from "../lib/PlaybackContext";
import FilterBar, { FilterState } from "../components/FilterBar";
import WcoCard from "../components/WcoCard";

export default function Search() {
  const { channels, groups, loading } = useCatalog();
  const { play } = usePlayback();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>({ genre: "all", sort: "none" });

  const [wcoResults, setWcoResults] = useState<{title: string, url: string}[]>([]);
  const [wcoSearching, setWcoSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setWcoResults([]);
      setWcoSearching(false);
      return;
    }
    const delay = setTimeout(async () => {
      setWcoSearching(true);
      try {
        const results = await window.wco.search(query, "all");
        setWcoResults(results || []);
      } catch (err) {
        setWcoResults([]);
      } finally {
        setWcoSearching(false);
      }
    }, 500);
    return () => clearTimeout(delay);
  }, [query]);

  const localResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    let list = channels.filter((c) => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
    if (filters.genre !== "all") list = list.filter((c) => c.group === filters.genre);
    if (filters.sort === "az" || filters.sort === "rating") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (filters.sort === "za") list = [...list].sort((a, b) => b.name.localeCompare(a.name));
    return list;
  }, [channels, query, filters]);

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
          marginBottom: 8
        }}
      />
      <FilterBar groupNames={groups.map((g) => g.name)} filters={filters} onChange={setFilters} />
      <div style={{ height: 16 }} />
      {loading && <p style={{ color: "var(--text-dim)" }}>Loading catalog…</p>}
      
      {!loading && query && (localResults.length > 0 || wcoResults.length > 0) && (
        <div className="row-scroll" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Live TV Results */}
          {localResults.map((ch) => (
            <div key={ch.id} className="card" style={ch.logo ? { backgroundImage: `url(${ch.logo})` } : undefined} onClick={() => play(ch)}>
              <div className="card-group">{ch.group}</div>
              <div className="card-label">{ch.name}</div>
            </div>
          ))}

          {/* WCO Anime / Cartoon Results */}
          {wcoResults.length > 0 && (
            <>
              <div style={{ width: "100%", padding: "12px 0 4px", fontWeight: 700, fontSize: 13, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>VOD Library</div>
              {wcoResults.map((wco, idx) => (
                <WcoCard
                  key={`wco-${idx}`}
                  title={wco.title}
                  url={wco.url}
                  kind="tv"
                  onClick={() => navigate("/kids/show", { state: { title: wco.title, url: wco.url } })}
                />
              ))}
            </>
          )}
        </div>
      )}

      {wcoSearching && <p style={{ color: "var(--text-dim)", marginTop: 12 }}>Searching VOD library…</p>}

      {!loading && !wcoSearching && query && localResults.length === 0 && wcoResults.length === 0 && (
        <p style={{ color: "var(--text-dim)" }}>No results for "{query}".</p>
      )}
    </div>
  );
}
