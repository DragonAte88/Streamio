import React, { useEffect, useMemo, useState } from "react";
import { useCatalog } from "../lib/CatalogContext";
import { usePlayback } from "../lib/PlaybackContext";
import { useAuth } from "../lib/auth";
import { fetchWatchlist, addToWatchlist, removeFromWatchlist } from "../lib/api";
import {
  ANIME_SORTS,
  AnimeFilters,
  AnimeSort,
  ArtworkFilter,
  DEFAULT_ANIME_FILTERS,
  LETTERS,
  ViewMode,
  applyAnimeFilters,
  selectAnime
} from "../lib/anime";

const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #2a2a35",
  background: "#16161d",
  color: "#f4f4f6",
  fontSize: 13
};

export default function Anime() {
  const { channels, loading } = useCatalog();
  const { play } = usePlayback();
  const { token } = useAuth();

  const [filters, setFilters] = useState<AnimeFilters>(DEFAULT_ANIME_FILTERS);
  const [view, setView] = useState<ViewMode>("grid");
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [myList, setMyList] = useState<Set<string>>(new Set());

  const animeChannels = useMemo(() => selectAnime(channels), [channels]);

  const categories = useMemo(
    () => Array.from(new Set(animeChannels.map((c) => c.group).filter(Boolean))).sort(),
    [animeChannels]
  );

  useEffect(() => {
    if (!token) return;
    fetchWatchlist(token)
      .then((items) => setMyList(new Set(items.map((i) => String(i.id)))))
      .catch(() => {});
  }, [token]);

  const results = useMemo(
    () => applyAnimeFilters(animeChannels, filters, myList, shuffleSeed),
    [animeChannels, filters, myList, shuffleSeed]
  );

  const update = (patch: Partial<AnimeFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const changeSort = (sort: AnimeSort) => {
    // Re-picking Shuffle should visibly reshuffle; every other sort keeps the
    // seed stable so the grid doesn't churn under the user.
    if (sort === "shuffle") setShuffleSeed(Date.now() % 100000);
    update({ sort });
  };

  const toggleMyList = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // don't start playback when hitting the bookmark
    if (!token) return;
    const next = new Set(myList);
    if (next.has(id)) {
      next.delete(id);
      setMyList(next);
      removeFromWatchlist(token, id).catch(() => setMyList(new Set(myList)));
    } else {
      next.add(id);
      setMyList(next);
      addToWatchlist(token, id).catch(() => setMyList(new Set(myList)));
    }
  };

  const isDefault =
    filters.query === "" &&
    filters.category === "all" &&
    filters.letter === "all" &&
    filters.artwork === "any" &&
    !filters.onlyMyList &&
    filters.sort === "recommended";

  const activeSort = ANIME_SORTS.find((s) => s.value === filters.sort);
  const withArtwork = animeChannels.filter((c) => c.logo).length;

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: "28px 48px 0" }}>
        <h1 style={{ margin: 0, fontSize: 30, letterSpacing: -0.5 }}>Anime</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 6, fontSize: 13, maxWidth: 640 }}>
          Animation and anime from your catalog and your own published uploads.
        </p>

        {/* At-a-glance stats */}
        <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
          <Stat label="Titles" value={String(animeChannels.length)} />
          <Stat label="Categories" value={String(categories.length)} />
          <Stat label="With artwork" value={`${withArtwork} / ${animeChannels.length}`} />
          <Stat label="In My List" value={String(animeChannels.filter((c) => myList.has(c.id)).length)} />
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          margin: "20px 48px 0",
          padding: 16,
          background: "#101017",
          border: "1px solid #1e1e28",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Filter by title or category…"
            style={{ ...selectStyle, flex: 1, minWidth: 220 }}
          />

          <select value={filters.category} onChange={(e) => update({ category: e.target.value })} style={selectStyle}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select value={filters.sort} onChange={(e) => changeSort(e.target.value as AnimeSort)} style={selectStyle}>
            {ANIME_SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <select
            value={filters.artwork}
            onChange={(e) => update({ artwork: e.target.value as ArtworkFilter })}
            style={selectStyle}
          >
            <option value="any">Any artwork</option>
            <option value="has">Has artwork</option>
            <option value="missing">Missing artwork</option>
          </select>

          <button
            className="btn btn-secondary"
            onClick={() => update({ onlyMyList: !filters.onlyMyList })}
            style={filters.onlyMyList ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
          >
            {filters.onlyMyList ? "★ My List only" : "☆ My List only"}
          </button>

          <button className="btn btn-secondary" onClick={() => setView(view === "grid" ? "list" : "grid")}>
            {view === "grid" ? "☰ List" : "▦ Grid"}
          </button>

          {!isDefault && (
            <button className="btn btn-secondary" onClick={() => setFilters(DEFAULT_ANIME_FILTERS)}>
              Clear all
            </button>
          )}
        </div>

        {/* A–Z quick jump */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <LetterChip active={filters.letter === "all"} onClick={() => update({ letter: "all" })}>All</LetterChip>
          {LETTERS.map((l) => (
            <LetterChip key={l} active={filters.letter === l} onClick={() => update({ letter: l })}>
              {l}
            </LetterChip>
          ))}
        </div>

        {activeSort?.note && (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Sort: {activeSort.note}</div>
        )}
      </div>

      {/* Results */}
      <div style={{ padding: "20px 48px 0" }}>
        {loading ? (
          <div className="empty-state">Loading catalog…</div>
        ) : animeChannels.length === 0 ? (
          <div className="empty-state">
            No anime or animation found in your current catalog.
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8, maxWidth: 560, margin: "8px auto 0" }}>
              This section pulls in any catalog entry whose category mentions anime, animation, cartoon, or toon —
              and anything you publish yourself through Admin → Assets.
            </div>
          </div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            Nothing matches these filters.
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-secondary" onClick={() => setFilters(DEFAULT_ANIME_FILTERS)}>Clear all</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 12 }}>
              {results.length} title{results.length === 1 ? "" : "s"}
              {results.length !== animeChannels.length && ` of ${animeChannels.length}`}
            </div>

            {view === "grid" ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {results.map((ch) => (
                  <div
                    key={ch.id}
                    className="card"
                    style={ch.logo ? { backgroundImage: `url(${ch.logo})` } : undefined}
                    onClick={() => play(ch)}
                  >
                    <BookmarkButton active={myList.has(ch.id)} onClick={(e) => toggleMyList(ch.id, e)} disabled={!token} />
                    <div className="card-group">{ch.group}</div>
                    <div className="card-label">{ch.name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {results.map((ch) => (
                  <div
                    key={ch.id}
                    onClick={() => play(ch)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "10px 14px",
                      background: "#101017",
                      border: "1px solid #1e1e28",
                      borderRadius: 8,
                      cursor: "pointer"
                    }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 34,
                        borderRadius: 4,
                        flexShrink: 0,
                        background: ch.logo ? `#000 url(${ch.logo}) center/contain no-repeat` : "#1c1c26"
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ch.name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{ch.group}</div>
                    </div>
                    <BookmarkButton active={myList.has(ch.id)} onClick={(e) => toggleMyList(ch.id, e)} disabled={!token} inline />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function LetterChip({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        minWidth: 28,
        padding: "4px 7px",
        fontSize: 12,
        borderRadius: 5,
        cursor: "pointer",
        border: "1px solid " + (active ? "var(--accent)" : "#2a2a35"),
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#fff" : "var(--text-dim)"
      }}
    >
      {children}
    </button>
  );
}

function BookmarkButton({
  active,
  onClick,
  disabled,
  inline
}: {
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  inline?: boolean;
}) {
  if (disabled) return null;
  return (
    <button
      onClick={onClick}
      title={active ? "Remove from My List" : "Add to My List"}
      style={{
        position: inline ? "static" : "absolute",
        top: inline ? undefined : 8,
        right: inline ? undefined : 8,
        zIndex: 2,
        width: 28,
        height: 28,
        borderRadius: "50%",
        cursor: "pointer",
        flexShrink: 0,
        border: "none",
        background: "rgba(0,0,0,0.55)",
        color: active ? "var(--accent)" : "#fff",
        fontSize: 14,
        lineHeight: 1
      }}
    >
      {active ? "★" : "☆"}
    </button>
  );
}
