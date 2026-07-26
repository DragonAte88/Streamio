import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { fetchArtwork, API_BASE } from "../lib/api";
import {
  ANIME_SORTS,
  AnimeFilters,
  AnimeSort,
  ArtworkFilter,
  DEFAULT_ANIME_FILTERS,
  LETTERS,
  ViewMode,
  WcoItem,
  WCO_TYPE_LABELS,
  applyAnimeFilters,
} from "../lib/anime";

// ─── Refresh system types ──────────────────────────────────────────────────────

type RefreshStatus = "idle" | "checking" | "ok" | "error";

interface SystemStatus {
  label: string;
  url: string;
  status: RefreshStatus;
  latency?: number;
  detail?: string;
}

const FLEX_SYSTEMS: { label: string; url: string }[] = [
  { label: "Flex-1 (Production API)", url: `${API_BASE}/health` },
  { label: "Flex-3 (Staging API)",    url: "https://167-234-210-42.sslip.io/health" },
  { label: "Flex-2 (Bot Server)",     url: "https://170-9-15-10.sslip.io/health" },
];

async function pingSystem(url: string): Promise<{ ok: boolean; latency: number; detail: string }> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const latency = Date.now() - start;
    let detail = "";
    try { const j = await res.json(); detail = j.status || j.message || ""; } catch {}
    return { ok: res.ok, latency, detail: detail || (res.ok ? "online" : `HTTP ${res.status}`) };
  } catch (e: any) {
    return { ok: false, latency: Date.now() - start, detail: e?.message?.includes("timeout") ? "timed out" : "unreachable" };
  }
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #2a2a35",
  background: "#16161d",
  color: "#f4f4f6",
  fontSize: 13,
  cursor: "pointer",
};

const WCO_TYPES: Array<{ type: "dub" | "sub" | "cartoon" | "movie"; wcoKey: "dub" | "sub" | "cartoon" | "movie" }> = [
  { type: "dub", wcoKey: "dub" },
  { type: "sub", wcoKey: "sub" },
  { type: "cartoon", wcoKey: "cartoon" },
  { type: "movie", wcoKey: "movie" },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function Anime() {
  const nav = useNavigate();
  const { token } = useAuth();

  // ── WCO data loading ──
  const [allItems, setAllItems] = useState<WcoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTypes, setLoadingTypes] = useState<Set<string>>(new Set(["dub", "sub", "cartoon", "movie"]));

  // ── Artwork: map from item id → poster URL (or null = no poster) ──
  const [artworkMap, setArtworkMap] = useState<Map<string, string | null>>(new Map());

  // ── My List ──
  const [myList, setMyList] = useState<Set<string>>(new Set());

  // ── Filters / sort / view ──
  const [filters, setFilters] = useState<AnimeFilters>(DEFAULT_ANIME_FILTERS);
  const [view, setView] = useState<ViewMode>("grid");
  const [shuffleSeed, setShuffleSeed] = useState(1);

  // ── Refresh panel ──
  const [showRefresh, setShowRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [systems, setSystems] = useState<SystemStatus[]>(
    FLEX_SYSTEMS.map((s) => ({ ...s, status: "idle" as RefreshStatus }))
  );
  const [scraperStatus, setScraperStatus] = useState<RefreshStatus>("idle");
  const [artworkStatus, setArtworkStatus] = useState<RefreshStatus>("idle");
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const loadTrigger = useRef(0);

  // ── Load WCO lists — re-runs when loadTrigger increments (i.e. on refresh) ──
  useEffect(() => {
    let cancelled = false;
    setAllItems([]);
    setLoadingTypes(new Set(["dub", "sub", "cartoon", "movie"]));
    setLoading(true);

    async function loadType(key: "dub" | "sub" | "cartoon" | "movie") {
      try {
        const raw: { title: string; url: string }[] = await window.wco.getList(key);
        if (cancelled) return;
        const items: WcoItem[] = raw.map((r, i) => ({
          id: `${key}-${i}`,
          title: r.title,
          url: r.url,
          type: key,
          category: WCO_TYPE_LABELS[key],
        }));
        setAllItems((prev) => {
          const existing = new Set(prev.map((p) => p.title.toLowerCase()));
          const fresh = items.filter((it) => !existing.has(it.title.toLowerCase()));
          return [...prev, ...fresh];
        });
        setLoadingTypes((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } catch (err) {
        console.error(`[Anime] Failed to load WCO ${key}:`, err);
        setLoadingTypes((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    }

    WCO_TYPES.forEach(({ wcoKey }) => loadType(wcoKey));
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTrigger.current]);

  // Done loading when all 4 types resolved
  useEffect(() => {
    if (loadingTypes.size === 0) setLoading(false);
  }, [loadingTypes]);

  // ── Lazy artwork fetching ──
  // We batch-fetch artwork for visible items via IntersectionObserver in the cards
  const setArtwork = useCallback((id: string, poster: string | null) => {
    setArtworkMap((prev) => {
      if (prev.get(id) === poster) return prev;
      const next = new Map(prev);
      next.set(id, poster);
      return next;
    });
  }, []);

  // ── Full Refresh: scraper + artwork cache + backends ──
  const performRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setShowRefresh(true);

    // 1. Reset all system statuses to "checking"
    setSystems(FLEX_SYSTEMS.map((s) => ({ ...s, status: "checking" })));
    setScraperStatus("checking");
    setArtworkStatus("checking");

    // 2. Ping all 3 Flex backends in parallel
    const pingPromises = FLEX_SYSTEMS.map(async (sys, i) => {
      const result = await pingSystem(sys.url);
      setSystems((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: result.ok ? "ok" : "error", latency: result.latency, detail: result.detail };
        return next;
      });
    });

    // 3. Reset WCO scraper (clears Cloudflare session + list cache)
    const scraperPromise = window.wco.refresh()
      .then(() => setScraperStatus("ok"))
      .catch(() => setScraperStatus("error"));

    // 4. Clear local artwork cache so cards re-fetch from backend
    const artworkPromise = new Promise<void>((resolve) => {
      setArtworkMap(new Map());
      setArtworkStatus("ok");
      resolve();
    });

    // Wait for everything
    await Promise.all([...pingPromises, scraperPromise, artworkPromise]);

    // 5. Trigger WCO re-load
    loadTrigger.current += 1;

    setLastRefreshAt(new Date());
    setRefreshing(false);
  };

  // ── My List — load from localStorage (offline) ──
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("wco_mylist") || "[]");
      setMyList(new Set(stored));
    } catch {}
  }, []);

  const toggleMyList = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMyList((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("wco_mylist", JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // ── Derived data ──
  const results = useMemo(
    () => applyAnimeFilters(allItems, filters, myList, shuffleSeed, artworkMap),
    [allItems, filters, myList, shuffleSeed, artworkMap]
  );

  const totalByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of allItems) counts[it.type] = (counts[it.type] || 0) + 1;
    return counts;
  }, [allItems]);

  const isDefault =
    filters.query === "" &&
    filters.category === "all" &&
    filters.letter === "all" &&
    filters.artwork === "any" &&
    !filters.onlyMyList &&
    filters.sort === "recommended";

  const update = (patch: Partial<AnimeFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const changeSort = (sort: AnimeSort) => {
    if (sort === "shuffle") setShuffleSeed(Date.now() % 100000);
    update({ sort });
  };

  // ── Pagination ──
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);

  // Reset to page 0 whenever filters or sort change
  useEffect(() => { setPage(0); }, [filters, shuffleSeed]);

  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pagedResults = results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const activeSort = ANIME_SORTS.find((s) => s.value === filters.sort);
  const withArtwork = Array.from(artworkMap.values()).filter(Boolean).length;

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* ── Hero Header ────────────────────────────────── */}
      <div
        style={{
          padding: "32px 48px 0",
          background: "linear-gradient(to bottom, rgba(99,102,241,0.08) 0%, transparent 100%)",
          borderBottom: "1px solid rgba(99,102,241,0.12)",
          marginBottom: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <span style={{ fontSize: 32 }}>🎌</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>Anime & Cartoons</h1>
            <p style={{ color: "var(--text-dim)", margin: "4px 0 0", fontSize: 13 }}>
              On-demand catalog from WCO — dubbed anime, subbed anime, cartoons, and movies.
            </p>
          </div>
          {/* Refresh button */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <button
              onClick={performRefresh}
              disabled={refreshing}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "9px 18px",
                borderRadius: 8,
                border: "1px solid rgba(99,102,241,0.4)",
                background: refreshing ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.1)",
                color: refreshing ? "rgba(255,255,255,0.5)" : "var(--accent)",
                fontSize: 13,
                fontWeight: 700,
                cursor: refreshing ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                letterSpacing: 0.3,
              }}
              title="Refresh WCO catalog, artwork cache, and ping all backend servers"
            >
              <span style={{
                display: "inline-block",
                animation: refreshing ? "spin 1s linear infinite" : "none",
                fontSize: 15,
              }}>⟳</span>
              {refreshing ? "Refreshing…" : "Refresh All"}
            </button>
            {lastRefreshAt && (
              <div style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "right" }}>
                Last: {lastRefreshAt.toLocaleTimeString()}
              </div>
            )}
            {(showRefresh) && (
              <button
                onClick={() => setShowRefresh((v) => !v)}
                style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                {showRefresh ? "▲ Hide status" : "▼ Show status"}
              </button>
            )}
          </div>
        </div>

        {/* Refresh status panel */}
        {showRefresh && (
          <RefreshPanel
            systems={systems}
            scraperStatus={scraperStatus}
            artworkStatus={artworkStatus}
            onClose={() => setShowRefresh(false)}
          />
        )}

        {/* Stats bar */}
        <div style={{ display: "flex", gap: 28, marginTop: 18, marginBottom: 20, flexWrap: "wrap" }}>
          <Stat label="Total Titles" value={String(allItems.length)} loading={loading} />
          <Stat label="Dubbed Anime" value={String(totalByType["dub"] || 0)} loading={loadingTypes.has("dub")} accent />
          <Stat label="Subbed Anime" value={String(totalByType["sub"] || 0)} loading={loadingTypes.has("sub")} accent />
          <Stat label="Cartoons" value={String(totalByType["cartoon"] || 0)} loading={loadingTypes.has("cartoon")} accent />
          <Stat label="Movies" value={String(totalByType["movie"] || 0)} loading={loadingTypes.has("movie")} accent />
          <Stat label="Artwork loaded" value={`${withArtwork}`} loading={false} />
          <Stat label="My List" value={String(myList.size)} loading={false} />
        </div>

        {/* Type quick-filter pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["all", "dub", "sub", "cartoon", "movie"] as const).map((t) => (
            <button
              key={t}
              onClick={() => update({ category: t })}
              style={{
                padding: "6px 16px",
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                background:
                  filters.category === t
                    ? "var(--accent)"
                    : "rgba(255,255,255,0.07)",
                color: filters.category === t ? "#fff" : "var(--text-dim)",
                transition: "all 0.15s",
              }}
            >
              {t === "all" ? "All" : WCO_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Controls Panel ─────────────────────────────── */}
      <div
        style={{
          margin: "18px 48px 0",
          padding: "14px 16px",
          background: "#101017",
          border: "1px solid #1e1e28",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Row 1: Search + Sort + Artwork filter + Toggles */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="🔍 Search by title…"
            style={{ ...selectStyle, flex: 1, minWidth: 220 }}
          />

          <select
            value={filters.sort}
            onChange={(e) => changeSort(e.target.value as AnimeSort)}
            style={selectStyle}
          >
            {ANIME_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={filters.artwork}
            onChange={(e) => update({ artwork: e.target.value as ArtworkFilter })}
            style={selectStyle}
          >
            <option value="any">All artwork</option>
            <option value="has">Has poster</option>
            <option value="missing">No poster yet</option>
          </select>

          <button
            className="btn btn-secondary"
            onClick={() => update({ onlyMyList: !filters.onlyMyList })}
            style={filters.onlyMyList ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
          >
            {filters.onlyMyList ? "★ My List" : "☆ My List"}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setView(view === "grid" ? "list" : "grid")}
          >
            {view === "grid" ? "☰ List" : "▦ Grid"}
          </button>

          {!isDefault && (
            <button className="btn btn-secondary" onClick={() => setFilters(DEFAULT_ANIME_FILTERS)}>
              ✕ Clear
            </button>
          )}
        </div>

        {/* Row 2: A–Z strip */}
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
          <LetterChip active={filters.letter === "all"} onClick={() => update({ letter: "all" })}>
            All
          </LetterChip>
          {LETTERS.map((l) => (
            <LetterChip key={l} active={filters.letter === l} onClick={() => update({ letter: l })}>
              {l}
            </LetterChip>
          ))}
        </div>

        {activeSort?.note && (
          <div style={{ fontSize: 11, color: "var(--text-dim)", paddingLeft: 2 }}>ℹ {activeSort.note}</div>
        )}
      </div>

      {/* ── Results ────────────────────────────────────── */}
      <div style={{ padding: "20px 48px 0" }}>
        {loading && allItems.length === 0 ? (
          <LoadingGrid />
        ) : results.length === 0 ? (
          <div className="empty-state">
            {allItems.length === 0 ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎌</div>
                <div>Loading WCO catalog…</div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8 }}>
                  Fetching dubbed anime, subbed anime, cartoons, and movies from WCO.
                </div>
              </>
            ) : (
              <>
                Nothing matches these filters.
                <div style={{ marginTop: 14 }}>
                  <button className="btn btn-secondary" onClick={() => setFilters(DEFAULT_ANIME_FILTERS)}>
                    Clear all filters
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Result count + page info */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div style={{ color: "var(--text-dim)", fontSize: 13 }}>
                {results.length.toLocaleString()} title{results.length === 1 ? "" : "s"}
                {results.length !== allItems.length && ` of ${allItems.length.toLocaleString()}`}
                {loading && <span style={{ marginLeft: 8, opacity: 0.6 }}>(still loading…)</span>}
                <span style={{ marginLeft: 10, opacity: 0.5 }}>— Page {page + 1} of {pageCount}, showing {pagedResults.length}</span>
              </div>

              {/* Top pagination bar */}
              {pageCount > 1 && (
                <Pagination page={page} pageCount={pageCount} onChange={setPage} />
              )}
            </div>

            {view === "grid" ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {pagedResults.map((item) => (
                  <AnimeCard
                    key={item.id}
                    item={item}
                    poster={artworkMap.get(item.id) || null}
                    inMyList={myList.has(item.id)}
                    onPosterLoaded={(poster) => setArtwork(item.id, poster)}
                    onToggleMyList={(e) => toggleMyList(item.id, e)}
                    onClick={() => nav("/kids/show", { state: { title: item.title, url: item.url, type: item.type } })}
                    loggedIn={!!token}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pagedResults.map((item) => (
                  <ListRow
                    key={item.id}
                    item={item}
                    poster={artworkMap.get(item.id) || null}
                    inMyList={myList.has(item.id)}
                    onPosterLoaded={(poster) => setArtwork(item.id, poster)}
                    onToggleMyList={(e) => toggleMyList(item.id, e)}
                    onClick={() => nav("/kids/show", { state: { title: item.title, url: item.url, type: item.type } })}
                    loggedIn={!!token}
                  />
                ))}
              </div>
            )}

            {/* Bottom pagination bar */}
            {pageCount > 1 && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 32 }}>
                <Pagination page={page} pageCount={pageCount} onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── AnimeCard (grid) ─────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { bg: string; label: string; glow: string }> = {
  dub:     { bg: "#6366f1", label: "DUB",   glow: "rgba(99,102,241,0.5)" },
  sub:     { bg: "#ec4899", label: "SUB",   glow: "rgba(236,72,153,0.5)" },
  cartoon: { bg: "#f59e0b", label: "TOON",  glow: "rgba(245,158,11,0.5)" },
  movie:   { bg: "#10b981", label: "MOVIE", glow: "rgba(16,185,129,0.5)" },
};

function AnimeCard({
  item, poster, inMyList, onPosterLoaded, onToggleMyList, onClick, loggedIn,
}: {
  item: WcoItem; poster: string | null; inMyList: boolean;
  onPosterLoaded: (poster: string | null) => void;
  onToggleMyList: (e: React.MouseEvent) => void;
  onClick: () => void; loggedIn: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !fetchedRef.current) {
          fetchedRef.current = true;
          observer.disconnect();
          fetchArtwork(item.title, item.type === "movie" ? "movie" : "tv")
            .then((art) => onPosterLoaded(art?.poster || null));
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [item.title, item.type]);

  const badge = TYPE_BADGE[item.type] || TYPE_BADGE.dub;

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: 160,
        height: 240,
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        flexShrink: 0,
        background: poster
          ? `url(${poster}) center/cover no-repeat`
          : `linear-gradient(145deg, #1e1e30 0%, #12121e 100%)`,
        // Glow ring matching type color on hover
        border: hovered ? `2px solid ${badge.bg}` : "2px solid rgba(255,255,255,0.06)",
        transition: "border-color 0.18s, transform 0.18s cubic-bezier(.34,1.56,.64,1), box-shadow 0.18s",
        transform: hovered ? "scale(1.07) translateY(-3px)" : "scale(1)",
        boxShadow: hovered
          ? `0 20px 48px rgba(0,0,0,0.7), 0 0 0 1px ${badge.glow}`
          : "0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      {/* ── Bottom scrim ONLY — just enough to read the title ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          // Only dark at the very bottom, fully clear at top-60%
          background: poster
            ? "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 30%, transparent 60%)"
            : "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(15,15,30,0.5) 100%)",
          transition: "opacity 0.18s",
        }}
      />

      {/* ── Glass shine layer (glossy look) ── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "45%",
          background: "linear-gradient(to bottom, rgba(255,255,255,0.10) 0%, transparent 100%)",
          borderRadius: "12px 12px 0 0",
          pointerEvents: "none",
        }}
      />

      {/* ── Placeholder icon (no poster) ── */}
      {!poster && (
        <div style={{
          position: "absolute", top: "38%", left: "50%",
          transform: "translate(-50%, -50%)", fontSize: 44, opacity: 0.18,
        }}>🎌</div>
      )}

      {/* ── Type badge ── */}
      <div style={{
        position: "absolute", top: 9, left: 9,
        background: badge.bg,
        color: "#fff", fontSize: 9.5, fontWeight: 800,
        padding: "3px 8px", borderRadius: 5,
        letterSpacing: 0.8, textTransform: "uppercase",
        boxShadow: `0 2px 8px ${badge.glow}`,
      }}>
        {badge.label}
      </div>

      {/* ── My List bookmark ── */}
      {loggedIn && (
        <button
          onClick={onToggleMyList}
          title={inMyList ? "Remove from My List" : "Add to My List"}
          style={{
            position: "absolute", top: 8, right: 8,
            width: 28, height: 28, borderRadius: "50%",
            cursor: "pointer", border: "none",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            color: inMyList ? "#fbbf24" : "rgba(255,255,255,0.7)",
            fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
            transition: "color 0.15s, background 0.15s",
          }}
        >
          {inMyList ? "★" : "☆"}
        </button>
      )}

      {/* ── Title + action bar at bottom ── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "8px 10px 11px",
      }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: "#fff",
          lineHeight: 1.35, textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {item.title}
        </div>

        {/* Hover reveal play bar */}
        <div style={{
          marginTop: 6,
          display: "flex", alignItems: "center", gap: 4,
          opacity: hovered ? 1 : 0,
          transform: hovered ? "translateY(0)" : "translateY(4px)",
          transition: "opacity 0.15s, transform 0.15s",
        }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: badge.bg, textTransform: "uppercase", letterSpacing: 1 }}>
            ▶ {item.type === "movie" ? "Watch" : "View Episodes"}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}


// ─── ListRow ──────────────────────────────────────────────────────────────────

function ListRow({
  item, poster, inMyList, onPosterLoaded, onToggleMyList, onClick, loggedIn,
}: {
  item: WcoItem; poster: string | null; inMyList: boolean;
  onPosterLoaded: (poster: string | null) => void;
  onToggleMyList: (e: React.MouseEvent) => void;
  onClick: () => void; loggedIn: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !fetchedRef.current) {
          fetchedRef.current = true;
          observer.disconnect();
          fetchArtwork(item.title, item.type === "movie" ? "movie" : "tv")
            .then((art) => onPosterLoaded(art?.poster || null));
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [item.title, item.type]);

  const badge = TYPE_BADGE[item.type] || TYPE_BADGE.dub;

  return (
    <div
      ref={rowRef}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "10px 14px",
        background: hovered ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.025)",
        border: `1px solid ${hovered ? badge.bg : "rgba(255,255,255,0.06)"}`,
        borderRadius: 10,
        cursor: "pointer",
        transition: "border-color 0.12s, background 0.12s, box-shadow 0.12s",
        boxShadow: hovered ? `0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px ${badge.glow}` : "none",
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: 52, height: 76, borderRadius: 7, flexShrink: 0,
        background: poster
          ? `url(${poster}) center/cover no-repeat`
          : `linear-gradient(145deg, #1e1e30, #12121e)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20, opacity: poster ? 1 : 0.3,
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        overflow: "hidden",
      }}>
        {!poster && "🎌"}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{
            fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 4,
            background: badge.bg, color: "#fff", letterSpacing: 0.8, textTransform: "uppercase",
          }}>{badge.label}</span>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{item.category}</span>
        </div>
      </div>

      {/* Bookmark */}
      {loggedIn && (
        <button
          onClick={onToggleMyList}
          style={{
            width: 30, height: 30, borderRadius: "50%", border: "none",
            background: "transparent",
            color: inMyList ? "#fbbf24" : "rgba(255,255,255,0.3)",
            fontSize: 16, cursor: "pointer", flexShrink: 0,
            transition: "color 0.15s",
          }}
        >{inMyList ? "★" : "☆"}</button>
      )}

      {/* Play arrow */}
      <div style={{
        color: badge.bg, fontSize: 13, fontWeight: 800,
        opacity: hovered ? 1 : 0, transition: "opacity 0.12s",
      }}>▶</div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (p: number) => void }) {
  // Show max 7 page buttons with ellipsis
  const getPages = (): (number | "…")[] => {
    if (pageCount <= 9) return Array.from({ length: pageCount }, (_, i) => i);
    const pages: (number | "…")[] = [0];
    const left = Math.max(1, page - 2);
    const right = Math.min(pageCount - 2, page + 2);
    if (left > 1) pages.push("…");
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < pageCount - 2) pages.push("…");
    pages.push(pageCount - 1);
    return pages;
  };

  const btn = (content: React.ReactNode, targetPage: number | null, active = false, disabled = false) => (
    <button
      key={String(content) + String(targetPage)}
      onClick={() => targetPage !== null && onChange(targetPage)}
      disabled={disabled}
      style={{
        minWidth: 34, height: 34, padding: "0 10px",
        borderRadius: 7, border: `1px solid ${active ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
        background: active ? "var(--accent)" : "rgba(255,255,255,0.05)",
        color: active ? "#fff" : disabled ? "rgba(255,255,255,0.2)" : "var(--text-dim)",
        fontSize: 13, fontWeight: active ? 700 : 500,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.12s",
      }}
    >{content}</button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {btn("‹ Prev", page - 1, false, page === 0)}
      {getPages().map((p, i) =>
        p === "…"
          ? <span key={`ellipsis-${i}`} style={{ color: "var(--text-dim)", padding: "0 4px" }}>…</span>
          : btn(p + 1, p, p === page)
      )}
      {btn("Next ›", page + 1, false, page === pageCount - 1)}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingGrid() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 160,
            height: 240,
            borderRadius: 10,
            background: "linear-gradient(90deg, #16161d 25%, #1c1c2a 50%, #16161d 75%)",
            backgroundSize: "400% 100%",
            animation: "shimmer 1.4s ease infinite",
            animationDelay: `${(i % 8) * 80}ms`,
          }}
        />
      ))}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 100% 0 }
          100% { background-position: -100% 0 }
        }
      `}</style>
    </div>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  loading,
  accent,
}: {
  label: string;
  value: string;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? "rgba(99,102,241,0.08)" : "transparent",
        padding: accent ? "8px 14px" : "0",
        borderRadius: accent ? 8 : 0,
        border: accent ? "1px solid rgba(99,102,241,0.15)" : "none",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: accent ? 20 : 22, fontWeight: 800, marginTop: 2 }}>
        {loading ? <span style={{ opacity: 0.3 }}>—</span> : value}
      </div>
    </div>
  );
}

// ─── LetterChip ───────────────────────────────────────────────────────────────

function LetterChip({
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
        minWidth: 26,
        padding: "3px 6px",
        fontSize: 11,
        borderRadius: 5,
        cursor: "pointer",
        border: "1px solid " + (active ? "var(--accent)" : "#2a2a35"),
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#fff" : "var(--text-dim)",
        transition: "background 0.1s, border-color 0.1s",
      }}
    >
      {children}
    </button>
  );
}

// ─── RefreshPanel ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<RefreshStatus, string> = {
  idle:     "#3a3a4a",
  checking: "#f59e0b",
  ok:       "#10b981",
  error:    "#ef4444",
};

const STATUS_ICON: Record<RefreshStatus, string> = {
  idle:     "○",
  checking: "◌",
  ok:       "●",
  error:    "✕",
};

function RefreshPanel({
  systems,
  scraperStatus,
  artworkStatus,
  onClose,
}: {
  systems: SystemStatus[];
  scraperStatus: RefreshStatus;
  artworkStatus: RefreshStatus;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        margin: "12px 0 0",
        padding: "14px 18px",
        background: "rgba(10,10,18,0.8)",
        border: "1px solid rgba(99,102,241,0.2)",
        borderRadius: 10,
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--text-dim)" }}>
          System Status
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
        {/* Flex backends */}
        {systems.map((sys) => (
          <StatusRow
            key={sys.label}
            label={sys.label}
            status={sys.status}
            detail={sys.latency != null && sys.status !== "idle" ? `${sys.detail} · ${sys.latency}ms` : sys.detail}
          />
        ))}

        {/* WCO Scraper */}
        <StatusRow
          label="WCO Scraper (cache + browser)"
          status={scraperStatus}
          detail={
            scraperStatus === "ok" ? "Cache cleared, window restarted" :
            scraperStatus === "checking" ? "Reinitializing…" :
            scraperStatus === "error" ? "Failed to reset" : undefined
          }
        />

        {/* Artwork Cache */}
        <StatusRow
          label="Artwork Cache (local)"
          status={artworkStatus}
          detail={
            artworkStatus === "ok" ? "Cleared — posters will reload on scroll" :
            artworkStatus === "checking" ? "Clearing…" : undefined
          }
        />

        {/* WCO Lists */}
        <StatusRow
          label="WCO Catalog (dub · sub · cartoon · movie)"
          status={artworkStatus === "ok" ? "checking" : "idle"}
          detail="Re-fetching from WCO…"
        />
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes statusPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function StatusRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: RefreshStatus;
  detail?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 7,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${status === "ok" ? "rgba(16,185,129,0.2)" : status === "error" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <span
        style={{
          fontSize: 14,
          color: STATUS_COLOR[status],
          animation: status === "checking" ? "statusPulse 0.8s ease-in-out infinite" : "none",
          flexShrink: 0,
        }}
      >
        {STATUS_ICON[status]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#e4e4f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </div>
        {detail && (
          <div style={{ fontSize: 11, color: status === "error" ? "#ef4444" : "var(--text-dim)", marginTop: 1 }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

