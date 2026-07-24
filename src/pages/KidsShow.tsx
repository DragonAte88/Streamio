import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { usePlayback, PlaybackItem } from "../lib/PlaybackContext";
import ContextMenu, { ContextMenuOption } from "../components/ContextMenu";

type WCOEpisode = { title: string; url: string; season?: string };

export default function KidsShow() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const state = location.state as { url?: string, title?: string } | null;
  const url = searchParams.get("url") || state?.url;
  const title = searchParams.get("title") || state?.title;
  
  const nav = useNavigate();
  const { play } = usePlayback();
  
  const [episodes, setEpisodes] = useState<WCOEpisode[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, options: ContextMenuOption[] } | null>(null);

  useEffect(() => {
    if (!url && !title) {
      nav(-1);
      return;
    }
    
    const processEpisodes = (eps: WCOEpisode[]) => {
        let foundSeasons = new Set<string>();
        const processed = eps.map(ep => {
            let s = "Season 1";
            const match = ep.title.match(/(?:Season|Book|S)\s*0*(\d+)/i);
            if (match) {
                s = "Season " + match[1];
            } else if (ep.title.toLowerCase().includes("movie") || ep.title.toLowerCase().includes("ova")) {
                s = "Movies & OVAs";
            }
            foundSeasons.add(s);
            return { ...ep, season: s };
        });
        
        const seasonList = Array.from(foundSeasons).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
        setSeasons(seasonList);
        if (seasonList.length > 0) setSelectedSeason(seasonList[0]);
        
        setEpisodes(processed);
        setLoading(false);
    };

    if (!url && title) {
        window.wco.search(title, "all").then(res => {
            if (res.length > 0) {
                window.wco.getEpisodes(res[0].url).then(processEpisodes);
            } else {
                setLoading(false);
            }
        });
    } else if (url) {
        window.wco.getEpisodes(url).then(processEpisodes).catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [url, title, nav]);

  const handlePlay = (startIndex: number, filteredEps: WCOEpisode[]) => {
    const ep = filteredEps[startIndex];
    const restOfEpisodes = filteredEps.slice(startIndex + 1).map(e => ({
        id: e.url,
        name: `${title} - ${e.title}`,
        wcoUrl: e.url,
        group: "VOD"
    }));

    play({
        id: ep.url,
        name: `${title} - ${ep.title}`,
        wcoUrl: ep.url,
        group: "VOD"
    }, restOfEpisodes);
  };

  const handleContextMenu = (e: React.MouseEvent, index: number, filteredEps: WCOEpisode[]) => {
      e.preventDefault();
      
      const options: ContextMenuOption[] = [
          {
              label: "Play from here",
              onClick: () => handlePlay(index, filteredEps)
          },
          {
              label: "Add to My List",
              onClick: () => alert("Added to My List! (UI placeholder)")
          },
          {
              label: "Add to Playlist",
              onClick: () => alert("Add to Playlist (UI placeholder)")
          }
      ];
      
      setContextMenu({ x: e.clientX, y: e.clientY, options });
  };

  const filteredEpisodes = selectedSeason === "All" ? episodes : episodes.filter(e => e.season === selectedSeason);

  return (
    <div className="scroll-container">
      <div style={{ padding: 40, paddingBottom: 20 }}>
        <button className="btn" onClick={() => nav(-1)} style={{ marginBottom: 24 }}>
          ← Back
        </button>
        
        <h2>{title}</h2>
        <p style={{ color: "var(--text-dim)", marginBottom: 24 }}>Select an episode to play.</p>

        {loading && <div style={{ color: "var(--text-dim)" }}>Loading episodes...</div>}

        {!loading && episodes.length === 0 && (
          <div style={{ color: "var(--text-dim)" }}>No episodes found.</div>
        )}

        {!loading && seasons.length > 1 && (
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
                <button 
                    className="btn" 
                    style={{ background: selectedSeason === "All" ? "var(--accent)" : "var(--bg-card)" }}
                    onClick={() => setSelectedSeason("All")}
                >
                    All
                </button>
                {seasons.map(s => (
                    <button 
                        key={s} 
                        className="btn" 
                        style={{ background: selectedSeason === s ? "var(--accent)" : "var(--bg-card)" }}
                        onClick={() => setSelectedSeason(s)}
                    >
                        {s}
                    </button>
                ))}
            </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 800 }}>
          {filteredEpisodes.map((ep, i) => (
            <div
              key={i}
              onClick={() => handlePlay(i, filteredEpisodes)}
              onContextMenu={(e) => handleContextMenu(e, i, filteredEpisodes)}
              style={{
                background: "var(--bg-card)",
                padding: "16px 20px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
            >
              <div style={{ fontWeight: 500 }}>{ep.title}</div>
              <div style={{ color: "var(--accent)", fontSize: 13, textTransform: "uppercase", fontWeight: 600 }}>
                Play
              </div>
            </div>
          ))}
        </div>
      </div>
      {contextMenu && (
          <ContextMenu 
              x={contextMenu.x} 
              y={contextMenu.y} 
              options={contextMenu.options} 
              onClose={() => setContextMenu(null)} 
          />
      )}
    </div>
  );
}
