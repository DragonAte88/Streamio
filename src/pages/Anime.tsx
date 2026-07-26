import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { fetchArtwork } from "../lib/api";
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

  // ── Load WCO lists (interleave so UI appears progressively) ──
  useEffect(() => {
    let cancelled = false;

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
          // Deduplicate by title across types
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

    // Load all 4 types in parallel
    WCO_TYPES.forEach(({ wcoKey }) => loadType(wcoKey));

    return () => {
      cancelled = true;
    };
  }, []);

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
          <div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>Anime & Cartoons</h1>
            <p style={{ color: "var(--text-dim)", margin: "4px 0 0", fontSize: 13 }}>
              On-demand catalog from WCO — dubbed anime, subbed anime, cartoons, and movies.
            </p>
          </div>
        </div>

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
            {/* Result count */}
            <div style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 14 }}>
              {results.length.toLocaleString()} title{results.length === 1 ? "" : "s"}
              {results.length !== allItems.length && ` of ${allItems.length.toLocaleString()}`}
              {loading && <span style={{ marginLeft: 8, opacity: 0.6 }}> (still loading…)</span>}
            </div>

            {view === "grid" ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {results.map((item) => (
                  <AnimeCard
                    key={item.id}
                    item={item}
                    poster={artworkMap.get(item.id) || null}
                    inMyList={myList.has(item.id)}
                    onPosterLoaded={(poster) => setArtwork(item.id, poster)}
                    onToggleMyList={(e) => toggleMyList(item.id, e)}
                    onClick={() => nav("/kids/show", { state: { title: item.title, url: item.url } })}
                    loggedIn={!!token}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {results.map((item) => (
                  <ListRow
                    key={item.id}
                    item={item}
                    poster={artworkMap.get(item.id) || null}
                    inMyList={myList.has(item.id)}
                    onPosterLoaded={(poster) => setArtwork(item.id, poster)}
                    onToggleMyList={(e) => toggleMyList(item.id, e)}
                    onClick={() => nav("/kids/show", { state: { title: item.title, url: item.url } })}
                    loggedIn={!!token}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── AnimeCard (grid) ─────────────────────────────────────────────────────────

function AnimeCard({
  item,
  poster,
  inMyList,
  onPosterLoaded,
  onToggleMyList,
  onClick,
  loggedIn,
}: {
  item: WcoItem;
  poster: string | null;
  inMyList: boolean;
  onPosterLoaded: (poster: string | null) => void;
  onToggleMyList: (e: React.MouseEvent) => void;
  onClick: () => void;
  loggedIn: boolean;
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
          const kind = item.type === "movie" ? "movie" : "tv";
          fetchArtwork(item.title, kind).then((art) => {
            onPosterLoaded(art?.poster || null);
          });
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [item.title, item.type]);

  // Type badge colors
  const typeBadgeColor: Record<string, string> = {
    dub: "#6366f1",
    sub: "#ec4899",
    cartoon: "#f59e0b",
    movie: "#10b981",
  };

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
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        flexShrink: 0,
        background: poster
          ? `url(${poster}) center/cover no-repeat`
          : "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        border: hovered ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "border-color 0.15s, transform 0.15s, box-shadow 0.15s",
        transform: hovered ? "scale(1.05)" : "scale(1)",
        boxShadow: hovered ? "0 12px 40px rgba(0,0,0,0.6)" : "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      {/* Gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: poster
            ? "linear-gradient(to top, rgba(0,0,0,0.92) 40%, rgba(0,0,0,0.05) 100%)"
            : "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(20,20,40,0.6) 100%)",
        }}
      />

      {/* Placeholder icon */}
      {!poster && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -60%)",
            fontSize: 42,
            opacity: 0.2,
          }}
        >
          🎌
        </div>
      )}

      {/* Type badge */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          background: typeBadgeColor[item.type] || "#6366f1",
          color: "#fff",
          fontSize: 10,
          fontWeight: 700,
          padding: "3px 7px",
          borderRadius: 4,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {item.type === "dub" ? "DUB" : item.type === "sub" ? "SUB" : item.type === "movie" ? "MOVIE" : "TOON"}
      </div>

      {/* My List bookmark */}
      {loggedIn && (
        <button
          onClick={onToggleMyList}
          title={inMyList ? "Remove from My List" : "Add to My List"}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: "50%",
            cursor: "pointer",
            border: "none",
            background: "rgba(0,0,0,0.6)",
            color: inMyList ? "#fbbf24" : "rgba(255,255,255,0.7)",
            fontSize: 15,
            lineHeight: "28px",
            textAlign: "center",
            transition: "color 0.15s",
          }}
        >
          {inMyList ? "★" : "☆"}
        </button>
      )}

      {/* Title */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "10px 10px 12px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#fff",
            lineHeight: 1.35,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 10,
            fontWeight: 700,
            color: "var(--accent)",
            textTransform: "uppercase",
            letterSpacing: 1,
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.15s",
          }}
        >
          ▶ View Episodes
        </div>
      </div>
    </div>
  );
}

// ─── ListRow ──────────────────────────────────────────────────────────────────

function ListRow({
  item,
  poster,
  inMyList,
  onPosterLoaded,
  onToggleMyList,
  onClick,
  loggedIn,
}: {
  item: WcoItem;
  poster: string | null;
  inMyList: boolean;
  onPosterLoaded: (poster: string | null) => void;
  onToggleMyList: (e: React.MouseEvent) => void;
  onClick: () => void;
  loggedIn: boolean;
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
          const kind = item.type === "movie" ? "movie" : "tv";
          fetchArtwork(item.title, kind).then((art) => {
            onPosterLoaded(art?.poster || null);
          });
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [item.title, item.type]);

  return (
    <div
      ref={rowRef}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 14px",
        background: hovered ? "#16161f" : "#101017",
        border: `1px solid ${hovered ? "var(--accent)" : "#1e1e28"}`,
        borderRadius: 8,
        cursor: "pointer",
        transition: "border-color 0.12s, background 0.12s",
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          width: 56,
          height: 80,
          borderRadius: 6,
          flexShrink: 0,
          background: poster
            ? `#000 url(${poster}) center/cover no-repeat`
            : "linear-gradient(135deg, #1a1a2e, #16213e)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          opacity: poster ? 1 : 0.4,
        }}
      >
        {!poster && "🎌"}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>{item.category}</div>
      </div>

      {/* Bookmark */}
      {loggedIn && (
        <button
          onClick={onToggleMyList}
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "none",
            background: "transparent",
            color: inMyList ? "#fbbf24" : "rgba(255,255,255,0.4)",
            fontSize: 16,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {inMyList ? "★" : "☆"}
        </button>
      )}

      {/* Play arrow */}
      <div style={{ color: "var(--accent)", fontSize: 13, fontWeight: 700, opacity: hovered ? 1 : 0, transition: "opacity 0.12s" }}>
        ▶
      </div>
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
