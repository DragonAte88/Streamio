import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePlayback } from "../lib/PlaybackContext";
import { fetchArtwork } from "../lib/api";
import ContextMenu, { ContextMenuOption } from "../components/ContextMenu";

type WCOEpisode = { title: string; url: string; season: string; epNum: number };

// ─── Season detection ──────────────────────────────────────────────────────────

function detectSeason(title: string): string {
  // "Season 2", "S2", "Book 2", "Part 2", "Arc 2"
  const m =
    title.match(/\b(?:Season|Book|Part|Arc|Series|S)\s*0*(\d+)/i) ||
    title.match(/\bSeason\s*(\d+)/i);
  if (m) return `Season ${m[1]}`;
  if (/\b(?:Movie|Film|Special|OVA|ONA|Short)\b/i.test(title)) return "Movies & Specials";
  return "Season 1";
}

function parseEpisodeNumber(title: string): number {
  const m = title.match(/(?:Ep(?:isode)?\.?\s*|#\s*)(\d+)/i) || title.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 0;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function KidsShow() {
  const location = useLocation();
  const nav = useNavigate();
  const { play } = usePlayback();

  const state = location.state as { url?: string; title?: string } | null;
  const showUrl = state?.url ?? new URLSearchParams(location.search).get("url") ?? "";
  const showTitle = state?.title ?? new URLSearchParams(location.search).get("title") ?? "Show";

  // ── State ──
  const [episodes, setEpisodes] = useState<WCOEpisode[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Artwork
  const [poster, setPoster] = useState<string | null>(null);
  const [backdrop, setBackdrop] = useState<string | null>(null);
  const [overview, setOverview] = useState<string | null>(null);

  // Playback state: which episode is currently "active"
  const [activeEpUrl, setActiveEpUrl] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; options: ContextMenuOption[] } | null>(null);

  // Hover
  const [hoveredUrl, setHoveredUrl] = useState<string | null>(null);

  // ── Fetch artwork once ──
  useEffect(() => {
    if (!showTitle) return;
    const kind = showTitle.toLowerCase().includes("movie") ? "movie" : "tv";
    fetchArtwork(showTitle, kind).then((art) => {
      if (art?.poster) setPoster(art.poster);
      if (art?.background) setBackdrop(art.background);
      if (art?.overview) setOverview(art.overview);
    });
  }, [showTitle]);

  // ── Fetch episodes ──
  const loadEpisodes = async (attempt = 0) => {
    if (!showUrl && !showTitle) { nav(-1); return; }
    setLoading(true);
    setError(null);
    setEpisodes([]);

    try {
      let raw: { title: string; url: string }[] = [];

      if (showUrl) {
        raw = await window.wco.getEpisodes(showUrl);
      } else {
        // No URL — search by title, pick first result
        const results = await window.wco.search(showTitle, "all");
        if (results.length > 0) {
          raw = await window.wco.getEpisodes(results[0].url);
        }
      }

      if (raw.length === 0 && attempt < 2) {
        // Auto-retry up to 2 times before showing error
        console.log(`[KidsShow] 0 episodes on attempt ${attempt + 1}, retrying…`);
        await new Promise(r => setTimeout(r, 3000));
        return loadEpisodes(attempt + 1);
      }

      const processed: WCOEpisode[] = raw.map((ep, i) => ({
        ...ep,
        season: detectSeason(ep.title),
        epNum: parseEpisodeNumber(ep.title) || i + 1,
      }));

      const seasonSet = new Set(processed.map(e => e.season));
      const seasonList = Array.from(seasonSet).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      );

      setEpisodes(processed);
      setSeasons(seasonList);
      setSelectedSeason(seasonList.length > 0 ? seasonList[0] : "All");
    } catch (err: any) {
      setError(err?.message || "Failed to load episodes.");
    } finally {
      setLoading(false);
      setRetryCount(c => c + 1);
    }
  };

  useEffect(() => { loadEpisodes(); }, [showUrl, showTitle]);

  // ── Play episode ──
  const handlePlay = async (startIndex: number, list: WCOEpisode[]) => {
    const ep = list[startIndex];
    if (!ep) return;

    setActiveEpUrl(ep.url);
    setExtracting(true);

    // Extract the real stream URL via the scraper
    const streamUrl = await window.wco.extractVideo(ep.url).catch(() => null);
    setExtracting(false);

    if (!streamUrl) {
      alert(`Could not extract stream for: ${ep.title}\n\nWCO may be blocking the request. Try the Refresh button on the Anime page.`);
      return;
    }

    // Build queue from remaining episodes in the list
    const queue = list.slice(startIndex + 1).map(e => ({
      id: e.url,
      name: `${showTitle} — ${e.title}`,
      url: streamUrl, // placeholder; real extraction done per-episode in player
      wcoUrl: e.url,
      group: "VOD",
    }));

    play({
      id: ep.url,
      name: `${showTitle} — ${ep.title}`,
      url: streamUrl,
      wcoUrl: ep.url,
      group: "VOD",
    }, queue);
  };

  // ── Context menu ──
  const openContextMenu = (e: React.MouseEvent, idx: number, list: WCOEpisode[]) => {
    e.preventDefault();
    const options: ContextMenuOption[] = [
      { label: "▶ Play from here", onClick: () => handlePlay(idx, list) },
      {
        label: "★ Add to My List",
        onClick: () => {
          const stored: string[] = JSON.parse(localStorage.getItem("wco_mylist") || "[]");
          if (!stored.includes(showUrl)) {
            stored.push(showUrl);
            localStorage.setItem("wco_mylist", JSON.stringify(stored));
          }
          alert(`"${showTitle}" added to My List.`);
        },
      },
      {
        label: "＋ Add to Playlist",
        onClick: () => alert("Playlist feature — coming soon."),
      },
    ];
    setContextMenu({ x: e.clientX, y: e.clientY, options });
  };

  const filteredEps =
    selectedSeason === "All" ? episodes : episodes.filter(e => e.season === selectedSeason);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 60 }}>
      {/* ── Backdrop ── */}
      {backdrop && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            background: `url(${backdrop}) center/cover no-repeat`,
            opacity: 0.08,
            pointerEvents: "none",
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1, padding: "32px 48px 0" }}>
        {/* ── Back button ── */}
        <button
          className="btn btn-secondary"
          onClick={() => nav(-1)}
          style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 6 }}
        >
          ← Back
        </button>

        {/* ── Show header ── */}
        <div style={{ display: "flex", gap: 28, marginBottom: 32, alignItems: "flex-start" }}>
          {poster && (
            <img
              src={poster}
              alt={showTitle}
              style={{
                width: 140,
                height: 210,
                objectFit: "cover",
                borderRadius: 10,
                flexShrink: 0,
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}
            />
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>
              {showTitle}
            </h1>
            {overview && (
              <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6, maxWidth: 680, margin: "0 0 16px" }}>
                {overview}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {episodes.length > 0 && (
                <span
                  style={{
                    fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                    background: "rgba(99,102,241,0.15)", color: "var(--accent)",
                    border: "1px solid rgba(99,102,241,0.3)",
                  }}
                >
                  {episodes.length} Episode{episodes.length !== 1 ? "s" : ""}
                </span>
              )}
              {seasons.length > 0 && (
                <span
                  style={{
                    fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                    background: "rgba(255,255,255,0.07)", color: "var(--text-dim)",
                  }}
                >
                  {seasons.length} Season{seasons.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Loading / error states ── */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "60px 0", color: "var(--text-dim)" }}>
            <div style={{ fontSize: 36, animation: "spin 1.4s linear infinite" }}>⟳</div>
            <div style={{ fontSize: 14 }}>Loading episodes from WCO…</div>
            <div style={{ fontSize: 12, opacity: 0.5 }}>This may take 10–20 seconds on first load.</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              padding: "20px 24px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.08)", color: "#ef4444", maxWidth: 560,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Failed to load episodes</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>{error}</div>
            <button
              className="btn btn-secondary"
              style={{ marginTop: 14 }}
              onClick={() => loadEpisodes()}
            >
              ↺ Retry
            </button>
          </div>
        )}

        {!loading && !error && episodes.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-dim)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No episodes found</div>
            <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 480, margin: "0 auto 20px" }}>
              WCO may be slow or behind a Cloudflare challenge. Try refreshing.
            </div>
            <button className="btn btn-secondary" onClick={() => loadEpisodes()}>
              ↺ Retry
            </button>
          </div>
        )}

        {/* ── Season tabs ── */}
        {!loading && seasons.length > 1 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            <SeasonTab active={selectedSeason === "All"} onClick={() => setSelectedSeason("All")}>
              All ({episodes.length})
            </SeasonTab>
            {seasons.map(s => (
              <SeasonTab key={s} active={selectedSeason === s} onClick={() => setSelectedSeason(s)}>
                {s} ({episodes.filter(e => e.season === s).length})
              </SeasonTab>
            ))}
          </div>
        )}

        {/* ── Episode list ── */}
        {!loading && filteredEps.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 860 }}>
            {filteredEps.map((ep, i) => {
              const isActive = ep.url === activeEpUrl;
              const isHovered = ep.url === hoveredUrl;

              return (
                <div
                  key={ep.url + i}
                  onClick={() => handlePlay(i, filteredEps)}
                  onContextMenu={(e) => openContextMenu(e, i, filteredEps)}
                  onMouseEnter={() => setHoveredUrl(ep.url)}
                  onMouseLeave={() => setHoveredUrl(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "14px 18px",
                    borderRadius: 10,
                    background: isActive
                      ? "rgba(99,102,241,0.15)"
                      : isHovered
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(255,255,255,0.025)",
                    border: `1px solid ${isActive ? "rgba(99,102,241,0.5)" : isHovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)"}`,
                    cursor: isActive && extracting ? "wait" : "pointer",
                    transition: "background 0.1s, border-color 0.1s",
                  }}
                >
                  {/* Episode number */}
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: isActive ? "var(--accent)" : "rgba(255,255,255,0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: isActive ? "#fff" : "var(--text-dim)",
                      flexShrink: 0,
                    }}
                  >
                    {isActive && extracting ? (
                      <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
                    ) : (
                      ep.epNum || i + 1
                    )}
                  </div>

                  {/* Title */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? "#fff" : "#e4e4f0",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ep.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                      {ep.season}
                    </div>
                  </div>

                  {/* Play indicator */}
                  <div
                    style={{
                      color: isActive ? "var(--accent)" : "rgba(255,255,255,0.3)",
                      fontSize: isHovered || isActive ? 15 : 13,
                      fontWeight: 700,
                      transition: "all 0.12s",
                      opacity: isHovered || isActive ? 1 : 0.4,
                    }}
                  >
                    {isActive && extracting ? "…" : "▶"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Context menu ── */}
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

// ─── Season tab ───────────────────────────────────────────────────────────────

function SeasonTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 18px",
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        border: `1px solid ${active ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
        background: active ? "var(--accent)" : "rgba(255,255,255,0.05)",
        color: active ? "#fff" : "var(--text-dim)",
        transition: "all 0.12s",
      }}
    >
      {children}
    </button>
  );
}
