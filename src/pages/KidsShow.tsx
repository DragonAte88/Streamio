import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePlayback } from "../lib/PlaybackContext";
import { fetchArtwork } from "../lib/api";
import ContextMenu, { ContextMenuOption } from "../components/ContextMenu";

type WCOEpisode = { title: string; url: string; season: string; epNum: number };

// ─── Season detection ──────────────────────────────────────────────────────────

function detectSeason(title: string): string {
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

function isMovieType(type?: string, url?: string, title?: string): boolean {
  if (type === "movie") return true;
  if (url && (url.includes("/movie/") || url.includes("/movies/"))) return true;
  if (title && /\b(the movie|movie \d|film)\b/i.test(title) && !/episode/i.test(title)) return false; // show-level movie title, still has episodes
  return false;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function KidsShow() {
  const location = useLocation();
  const nav = useNavigate();
  const { play } = usePlayback();

  const state = location.state as { url?: string; title?: string; type?: string } | null;
  const params = new URLSearchParams(location.search);
  const showUrl   = state?.url   ?? params.get("url")   ?? "";
  const showTitle = state?.title ?? params.get("title") ?? "Show";
  const showType  = state?.type  ?? params.get("type")  ?? "";

  const isMovie = isMovieType(showType, showUrl, showTitle);

  // ── State ──
  const [episodes, setEpisodes]         = useState<WCOEpisode[]>([]);
  const [seasons, setSeasons]           = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("All");
  const [loading, setLoading]           = useState(true);
  const [loadingMsg, setLoadingMsg]     = useState("Connecting to WCO…");
  const [error, setError]               = useState<string | null>(null);

  // Artwork
  const [poster, setPoster]     = useState<string | null>(null);
  const [backdrop, setBackdrop] = useState<string | null>(null);
  const [overview, setOverview] = useState<string | null>(null);
  const [artLoaded, setArtLoaded] = useState(false);

  // Playback
  const [activeEpUrl, setActiveEpUrl] = useState<string | null>(null);
  const [extracting, setExtracting]   = useState(false);

  // Context menu / hover
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; options: ContextMenuOption[] } | null>(null);
  const [hoveredUrl, setHoveredUrl]   = useState<string | null>(null);

  // ── Fetch artwork ──
  useEffect(() => {
    if (!showTitle) return;
    fetchArtwork(showTitle, isMovie ? "movie" : "tv").then((art) => {
      if (art?.poster)     setPoster(art.poster);
      if (art?.background) setBackdrop(art.background);
      if (art?.overview)   setOverview(art.overview);
      setArtLoaded(true);
    }).catch(() => setArtLoaded(true));
  }, [showTitle, isMovie]);

  // ── If it's a movie, extract stream and play immediately ──
  useEffect(() => {
    if (!isMovie || !showUrl) return;
    (async () => {
      setLoading(true);
      setLoadingMsg("Extracting movie stream…");
      const streamUrl = await window.wco.extractVideo(showUrl).catch(() => null);
      setLoading(false);
      if (streamUrl) {
        play({ id: showUrl, name: showTitle, url: streamUrl, wcoUrl: showUrl, group: "VOD" }, []);
      } else {
        setError("Could not extract movie stream. WCO may be blocking the request.");
      }
    })();
  }, [isMovie, showUrl]);

  // ── Fetch episodes (non-movie) ──
  const loadEpisodes = async (attempt = 0) => {
    if (isMovie) return;
    if (!showUrl && !showTitle) { nav(-1); return; }
    setLoading(true);
    setError(null);
    setEpisodes([]);

    const msgs = [
      "Connecting to WCO…",
      "Waiting for Cloudflare clearance…",
      "Loading episode list…",
    ];
    let msgIdx = 0;
    const msgTimer = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, msgs.length - 1);
      setLoadingMsg(msgs[msgIdx]);
    }, 5000);

    try {
      let raw: { title: string; url: string }[] = [];

      if (showUrl) {
        raw = await window.wco.getEpisodes(showUrl);
      } else {
        const results = await window.wco.search(showTitle, "all");
        if (results.length > 0) raw = await window.wco.getEpisodes(results[0].url);
      }

      clearInterval(msgTimer);

      if (raw.length === 0 && attempt < 2) {
        setLoadingMsg(`Retrying… (attempt ${attempt + 2})`);
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
      setSelectedSeason(seasonList[0] ?? "All");
    } catch (err: any) {
      clearInterval(msgTimer);
      setError(err?.message || "Failed to load episodes.");
    } finally {
      clearInterval(msgTimer);
      setLoading(false);
      setLoadingMsg("Connecting to WCO…");
    }
  };

  useEffect(() => { loadEpisodes(); }, [showUrl, showTitle]);

  // ── Play episode ──
  const handlePlay = async (startIndex: number, list: WCOEpisode[]) => {
    const ep = list[startIndex];
    if (!ep) return;

    setActiveEpUrl(ep.url);
    setExtracting(true);

    const streamUrl = await window.wco.extractVideo(ep.url).catch(() => null);
    setExtracting(false);

    if (!streamUrl) {
      alert(`Could not extract stream for:\n${ep.title}\n\nTry the Refresh button on the Anime page.`);
      setActiveEpUrl(null);
      return;
    }

    const queue = list.slice(startIndex + 1).map(e => ({
      id: e.url, name: `${showTitle} — ${e.title}`,
      url: streamUrl, wcoUrl: e.url, group: "VOD",
    }));

    play({
      id: ep.url, name: `${showTitle} — ${ep.title}`,
      url: streamUrl, wcoUrl: ep.url, group: "VOD",
    }, queue);
  };

  // ── Context menu ──
  const openContextMenu = (e: React.MouseEvent, idx: number, list: WCOEpisode[]) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX, y: e.clientY,
      options: [
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
        { label: "＋ Add to Playlist", onClick: () => alert("Playlist — coming soon.") },
      ],
    });
  };

  const filteredEps = selectedSeason === "All"
    ? episodes
    : episodes.filter(e => e.season === selectedSeason);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 60, position: "relative" }}>
      {/* ── Backdrop ── */}
      {backdrop && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 0,
          background: `url(${backdrop}) center/cover no-repeat`,
          opacity: 0.07, pointerEvents: "none",
        }} />
      )}

      <div style={{ position: "relative", zIndex: 1, padding: "32px 48px 0" }}>
        <button
          className="btn btn-secondary"
          onClick={() => nav(-1)}
          style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 6 }}
        >
          ← Back
        </button>

        {/* ── Two-column layout: episode list  |  poster panel ── */}
        <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>

          {/* ── LEFT: show header + episodes ── */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Show header */}
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>
                {showTitle}
              </h1>
              {overview && (
                <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.65, maxWidth: 660, margin: "0 0 14px" }}>
                  {overview}
                </p>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {episodes.length > 0 && (
                  <Chip color="rgba(99,102,241,0.15)" borderColor="rgba(99,102,241,0.3)" textColor="var(--accent)">
                    {episodes.length} Episode{episodes.length !== 1 ? "s" : ""}
                  </Chip>
                )}
                {seasons.length > 0 && (
                  <Chip color="rgba(255,255,255,0.06)" borderColor="rgba(255,255,255,0.1)" textColor="var(--text-dim)">
                    {seasons.length} Season{seasons.length !== 1 ? "s" : ""}
                  </Chip>
                )}
                {isMovie && (
                  <Chip color="rgba(16,185,129,0.12)" borderColor="rgba(16,185,129,0.3)" textColor="#10b981">
                    Movie
                  </Chip>
                )}
              </div>
            </div>

            {/* ── Loading ── */}
            {loading && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "60px 0", color: "var(--text-dim)" }}>
                <div style={{ fontSize: 38, animation: "kspin 1.4s linear infinite", display: "inline-block" }}>⟳</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{loadingMsg}</div>
                <div style={{ fontSize: 12, opacity: 0.5, maxWidth: 360, textAlign: "center" }}>
                  {isMovie ? "Movie stream extraction takes 10–20 seconds." : "Episode list takes 10–25 seconds on first load (Cloudflare clearance required)."}
                </div>
                <style>{`@keyframes kspin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {/* ── Error ── */}
            {!loading && error && (
              <div style={{
                padding: "20px 24px", borderRadius: 10,
                border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)",
                color: "#ef4444", maxWidth: 560,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Failed to load</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>{error}</div>
                <button className="btn btn-secondary" style={{ marginTop: 14 }} onClick={() => loadEpisodes()}>
                  ↺ Retry
                </button>
              </div>
            )}

            {/* ── No episodes ── */}
            {!loading && !error && !isMovie && episodes.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-dim)" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No episodes found</div>
                <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 420, margin: "0 auto 20px" }}>
                  WCO may be slow or blocked by Cloudflare. Try retrying or use the Refresh button on the Anime page.
                </div>
                <button className="btn btn-secondary" onClick={() => loadEpisodes()}>↺ Retry</button>
              </div>
            )}

            {/* ── Season tabs ── */}
            {!loading && seasons.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {filteredEps.map((ep, i) => {
                  const isActive  = ep.url === activeEpUrl;
                  const isHovered = ep.url === hoveredUrl;
                  return (
                    <div
                      key={ep.url + i}
                      onClick={() => handlePlay(i, filteredEps)}
                      onContextMenu={(e) => openContextMenu(e, i, filteredEps)}
                      onMouseEnter={() => setHoveredUrl(ep.url)}
                      onMouseLeave={() => setHoveredUrl(null)}
                      style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "12px 16px", borderRadius: 10,
                        background: isActive
                          ? "rgba(99,102,241,0.18)"
                          : isHovered ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.025)",
                        border: `1px solid ${isActive ? "rgba(99,102,241,0.55)" : isHovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)"}`,
                        cursor: "pointer",
                        transition: "background 0.1s, border-color 0.1s",
                        boxShadow: isActive ? "0 4px 20px rgba(99,102,241,0.2)" : "none",
                      }}
                    >
                      {/* Ep number badge */}
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: isActive ? "var(--accent)" : "rgba(255,255,255,0.08)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, color: isActive ? "#fff" : "var(--text-dim)",
                        flexShrink: 0,
                      }}>
                        {isActive && extracting
                          ? <span style={{ animation: "kspin 1s linear infinite", display: "inline-block" }}>⟳</span>
                          : ep.epNum || i + 1}
                      </div>

                      {/* Title + season */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: isActive ? 700 : 500,
                          color: isActive ? "#fff" : "#e4e4f0",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {ep.title}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                          {ep.season}
                        </div>
                      </div>

                      {/* Play */}
                      <div style={{
                        color: "var(--accent)", fontSize: isHovered || isActive ? 14 : 12,
                        fontWeight: 800, opacity: isHovered || isActive ? 1 : 0.3,
                        transition: "all 0.12s",
                      }}>
                        {isActive && extracting ? "…" : "▶"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── RIGHT: Poster panel ── */}
          <div style={{
            width: 220, flexShrink: 0, position: "sticky", top: 32,
          }}>
            {/* Poster frame */}
            <div style={{
              width: 220, height: 330, borderRadius: 14, overflow: "hidden",
              background: "linear-gradient(145deg, #1e1e30, #12121e)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
              position: "relative",
            }}>
              {poster ? (
                <img
                  src={poster}
                  alt={showTitle}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{
                  width: "100%", height: "100%",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: 12, color: "rgba(255,255,255,0.15)",
                }}>
                  <span style={{ fontSize: 48 }}>🎌</span>
                  <span style={{ fontSize: 12 }}>No artwork yet</span>
                </div>
              )}

              {/* Glass shine */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: "40%",
                background: "linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, transparent 100%)",
                borderRadius: "14px 14px 0 0", pointerEvents: "none",
              }} />

              {/* Type badge */}
              {showType && (
                <div style={{
                  position: "absolute", top: 10, left: 10,
                  background: showType === "movie" ? "#10b981"
                    : showType === "dub" ? "#6366f1"
                    : showType === "sub" ? "#ec4899"
                    : "#f59e0b",
                  color: "#fff", fontSize: 10, fontWeight: 800,
                  padding: "3px 9px", borderRadius: 5,
                  letterSpacing: 0.8, textTransform: "uppercase",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                }}>
                  {showType === "movie" ? "MOVIE"
                    : showType === "dub" ? "DUB"
                    : showType === "sub" ? "SUB"
                    : "TOON"}
                </div>
              )}
            </div>

            {/* Metadata below poster */}
            <div style={{ marginTop: 16, padding: "0 4px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4, marginBottom: 8 }}>
                {showTitle}
              </div>
              {!isMovie && episodes.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
                  {episodes.length} episodes across {seasons.length} season{seasons.length !== 1 ? "s" : ""}
                </div>
              )}
              {isMovie && (
                <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }}>
                  🎬 Movie
                </div>
              )}
              {!poster && !artLoaded && (
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8, opacity: 0.6 }}>
                  Loading artwork…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          options={contextMenu.options}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeasonTab({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600,
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

function Chip({ color, borderColor, textColor, children }: {
  color: string; borderColor: string; textColor: string; children: React.ReactNode;
}) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
      background: color, color: textColor, border: `1px solid ${borderColor}`,
    }}>
      {children}
    </span>
  );
}
