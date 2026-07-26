import React, { useEffect, useMemo, useState } from "react";
import { useCatalog } from "../lib/CatalogContext";
import { usePlayback } from "../lib/PlaybackContext";
import {
  LiveChannel,
  Programme,
  buildLiveChannels,
  channelDetailRows,
  fetchChannelMeta,
  fetchGuideMeta,
  fetchStreamMeta,
  nowAndNext,
  parseXmltv,
  programmeProgress
} from "../lib/epg";

type ViewMode = "grid" | "list";

const HOUR_WIDTH = 260; // px per hour on the grid timeline
const ROW_HEIGHT = 62;
const CHANNEL_COL = 240;
const GRID_HOURS = 6;

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #2a2a35",
  background: "#16161d",
  color: "#f4f4f6",
  fontSize: 13
};

export default function LiveTVGuide() {
  const { channels, loading: catalogLoading } = useCatalog();
  const { play } = usePlayback();

  const [view, setView] = useState<ViewMode>("list");
  const [meta, setMeta] = useState<{ ch: any[]; st: any[]; gu: any[] } | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<LiveChannel | null>(null);

  // channelId -> programmes, filled in lazily as guides are fetched
  const [epg, setEpg] = useState<Map<string, Programme[]>>(new Map());
  const [epgLoading, setEpgLoading] = useState<Set<string>>(new Set());

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    // Drives the "now" line and now/next rollover. 30s is frequent enough to
    // feel live without re-rendering a large grid constantly.
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchChannelMeta(), fetchStreamMeta(), fetchGuideMeta()])
      .then(([ch, st, gu]) => {
        if (!cancelled) setMeta({ ch, st, gu });
      })
      .catch((e) => !cancelled && setMetaError(e.message))
      .finally(() => !cancelled && setMetaLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const liveChannels = useMemo(() => {
    if (!meta) return [];
    return buildLiveChannels(channels, meta.ch, meta.st, meta.gu);
  }, [channels, meta]);

  const countries = useMemo(
    () => Array.from(new Set(liveChannels.map((c) => c.meta?.country).filter(Boolean) as string[])).sort(),
    [liveChannels]
  );
  const categories = useMemo(
    () => Array.from(new Set(liveChannels.flatMap((c) => c.meta?.categories || []))).sort(),
    [liveChannels]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return liveChannels.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !String(c.number).includes(q)) return false;
      if (country !== "all" && c.meta?.country !== country) return false;
      if (category !== "all" && !(c.meta?.categories || []).includes(category)) return false;
      return true;
    });
  }, [liveChannels, query, country, category]);

  /** Fetch and parse the first available XMLTV guide for a channel. */
  const loadEpg = async (ch: LiveChannel) => {
    const key = ch.meta?.id;
    if (!key || epg.has(key) || epgLoading.has(key)) return;
    const guide = ch.guides?.[0];
    if (!guide) return;

    setEpgLoading((s) => new Set(s).add(key));
    try {
      const res = await fetch(guide.url);
      if (!res.ok) throw new Error(String(res.status));
      const programmes = parseXmltv(await res.text());

      // One guide file covers many channels - bank all of them, so opening a
      // sibling channel from the same source is instant instead of refetching
      // several MB of XML.
      setEpg((prev) => {
        const next = new Map(prev);
        const grouped = new Map<string, Programme[]>();
        for (const p of programmes) {
          const list = grouped.get(p.channelId) || [];
          list.push(p);
          grouped.set(p.channelId, list);
        }
        for (const [cid, list] of grouped) next.set(cid, list);
        if (!next.has(key)) next.set(key, []);
        return next;
      });
    } catch {
      setEpg((prev) => new Map(prev).set(key, [])); // cache the miss; don't retry in a loop
    } finally {
      setEpgLoading((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  };

  const withProgrammes = (ch: LiveChannel): LiveChannel => {
    const list = ch.meta ? epg.get(ch.meta.id) : undefined;
    if (!list) return ch;
    const { now: n, next } = nowAndNext(list, now);
    return { ...ch, now: n, next };
  };

  const openDetail = (ch: LiveChannel) => {
    setSelected(withProgrammes(ch));
    loadEpg(ch);
  };

  useEffect(() => {
    if (selected) setSelected((s) => (s ? withProgrammes(s) : s));
  }, [epg, now]);

  const gridStart = useMemo(() => {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    return d;
  }, [Math.floor(now.getTime() / 3600000)]);

  if (catalogLoading || metaLoading) {
    return <div className="empty-state" style={{ paddingTop: 80 }}>Loading channels and guide data…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header + controls */}
      <div style={{ padding: "28px 48px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>📡</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, letterSpacing: -0.5 }}>Live TV</h1>
            <p style={{ color: "var(--text-dim)", margin: "4px 0 0", fontSize: 13 }}>
              {liveChannels.length} channels · {liveChannels.filter((c) => c.meta).length} matched to guide data
            </p>
          </div>
        </div>

        {metaError && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#e6a23c" }}>
            Guide metadata unavailable ({metaError}). Channels still play; extra details are hidden.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channel or number…"
            style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          />
          <select value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle}>
            <option value="all">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #2a2a35" }}>
            {(["list", "grid"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  border: "none",
                  cursor: "pointer",
                  background: view === v ? "var(--accent)" : "transparent",
                  color: view === v ? "#fff" : "var(--text-dim)"
                }}
              >
                {v === "list" ? "☰ List" : "▦ Grid"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 10 }}>
          Showing {filtered.length} of {liveChannels.length}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 16, padding: "16px 48px 32px" }}>
        <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
          {view === "list" ? (
            <ListView
              channels={filtered.map(withProgrammes)}
              onOpen={openDetail}
              onPlay={play}
              onNeedEpg={loadEpg}
              selectedId={selected?.id}
            />
          ) : (
            <GridView
              channels={filtered.map(withProgrammes)}
              epg={epg}
              start={gridStart}
              now={now}
              onOpen={openDetail}
              onPlay={play}
              onNeedEpg={loadEpg}
            />
          )}
        </div>

        {selected && (
          <DetailPanel
            channel={selected}
            loadingEpg={!!selected.meta && epgLoading.has(selected.meta.id)}
            onClose={() => setSelected(null)}
            onPlay={() => play(selected)}
          />
        )}
      </div>
    </div>
  );
}

function ListView({
  channels,
  onOpen,
  onPlay,
  onNeedEpg,
  selectedId
}: {
  channels: LiveChannel[];
  onOpen: (c: LiveChannel) => void;
  onPlay: (c: any) => void;
  onNeedEpg: (c: LiveChannel) => void;
  selectedId?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {channels.map((ch) => (
        <div
          key={ch.id}
          onClick={() => onOpen(ch)}
          onMouseEnter={() => onNeedEpg(ch)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "10px 14px",
            background: selectedId === ch.id ? "#191922" : "#101017",
            border: "1px solid " + (selectedId === ch.id ? "var(--accent)" : "#1e1e28"),
            borderRadius: 8,
            cursor: "pointer"
          }}
        >
          <div style={{ width: 40, textAlign: "right", color: "var(--text-dim)", fontSize: 13, fontWeight: 700 }}>
            {ch.number}
          </div>
          <div
            style={{
              width: 56,
              height: 34,
              borderRadius: 4,
              flexShrink: 0,
              background: (ch.logo || ch.meta?.logo)
                ? `#000 url(${ch.logo || ch.meta?.logo}) center/contain no-repeat`
                : "#1c1c26"
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {ch.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {ch.now ? (
                <>
                  <span style={{ color: "var(--accent)" }}>● NOW</span> {ch.now.title}
                  {ch.next && <span style={{ opacity: 0.6 }}> · Next: {ch.next.title}</span>}
                </>
              ) : (
                [ch.meta?.categories?.[0], ch.meta?.country, ch.stream?.quality].filter(Boolean).join(" · ") ||
                ch.group
              )}
            </div>
            {ch.now && (
              <div style={{ height: 3, background: "#1c1c26", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${programmeProgress(ch.now)}%`, background: "var(--accent)" }} />
              </div>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(ch);
            }}
            style={{ flexShrink: 0 }}
          >
            ▶ Watch
          </button>
        </div>
      ))}
    </div>
  );
}

function GridView({
  channels,
  epg,
  start,
  now,
  onOpen,
  onPlay,
  onNeedEpg
}: {
  channels: LiveChannel[];
  epg: Map<string, Programme[]>;
  start: Date;
  now: Date;
  onOpen: (c: LiveChannel) => void;
  onPlay: (c: any) => void;
  onNeedEpg: (c: LiveChannel) => void;
}) {
  const end = new Date(start.getTime() + GRID_HOURS * 3600000);
  const hours = Array.from({ length: GRID_HOURS }, (_, i) => new Date(start.getTime() + i * 3600000));
  const nowOffset = ((now.getTime() - start.getTime()) / 3600000) * HOUR_WIDTH;

  // Only channels actually on screen need their guide fetched.
  useEffect(() => {
    channels.slice(0, 30).forEach(onNeedEpg);
  }, [channels]);

  return (
    <div style={{ overflow: "auto", border: "1px solid #1e1e28", borderRadius: 8 }}>
      <div style={{ minWidth: CHANNEL_COL + GRID_HOURS * HOUR_WIDTH, position: "relative" }}>
        {/* Time header */}
        <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 3, background: "#0d0d13" }}>
          <div style={{ width: CHANNEL_COL, flexShrink: 0, borderRight: "1px solid #1e1e28", padding: "10px 12px", fontSize: 12, color: "var(--text-dim)" }}>
            Channel
          </div>
          {hours.map((h) => (
            <div
              key={h.toISOString()}
              style={{ width: HOUR_WIDTH, flexShrink: 0, padding: "10px 12px", fontSize: 12, color: "var(--text-dim)", borderRight: "1px solid #1e1e28" }}
            >
              {h.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          ))}
        </div>

        {/* Now line */}
        {nowOffset >= 0 && nowOffset <= GRID_HOURS * HOUR_WIDTH && (
          <div
            style={{
              position: "absolute",
              left: CHANNEL_COL + nowOffset,
              top: 0,
              bottom: 0,
              width: 2,
              background: "var(--accent)",
              zIndex: 2,
              pointerEvents: "none"
            }}
          />
        )}

        {/* Rows */}
        {channels.slice(0, 60).map((ch) => {
          const programmes = (ch.meta ? epg.get(ch.meta.id) : undefined) || [];
          const visible = programmes.filter((p) => p.stop > start && p.start < end);

          return (
            <div key={ch.id} style={{ display: "flex", height: ROW_HEIGHT, borderTop: "1px solid #1e1e28" }}>
              <div
                onClick={() => onOpen(ch)}
                style={{
                  width: CHANNEL_COL,
                  flexShrink: 0,
                  borderRight: "1px solid #1e1e28",
                  padding: "8px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  position: "sticky",
                  left: 0,
                  background: "#0d0d13",
                  zIndex: 1
                }}
              >
                <span style={{ color: "var(--text-dim)", fontSize: 12, fontWeight: 700, width: 28 }}>{ch.number}</span>
                <div
                  style={{
                    width: 34,
                    height: 24,
                    flexShrink: 0,
                    borderRadius: 3,
                    background: (ch.logo || ch.meta?.logo)
                      ? `#000 url(${ch.logo || ch.meta?.logo}) center/contain no-repeat`
                      : "#1c1c26"
                  }}
                />
                <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {ch.name}
                </span>
              </div>

              <div style={{ position: "relative", flex: 1 }}>
                {visible.length === 0 ? (
                  <div style={{ padding: "8px 12px", fontSize: 12, color: "#4a4a58" }}>No guide data</div>
                ) : (
                  visible.map((p, i) => {
                    const left = Math.max(0, ((p.start.getTime() - start.getTime()) / 3600000) * HOUR_WIDTH);
                    const right = Math.min(
                      GRID_HOURS * HOUR_WIDTH,
                      ((p.stop.getTime() - start.getTime()) / 3600000) * HOUR_WIDTH
                    );
                    const isNow = p.start <= now && p.stop > now;
                    return (
                      <div
                        key={i}
                        onClick={() => onPlay(ch)}
                        title={`${p.title}\n${p.start.toLocaleTimeString()} – ${p.stop.toLocaleTimeString()}`}
                        style={{
                          position: "absolute",
                          left,
                          width: Math.max(2, right - left - 2),
                          top: 6,
                          bottom: 6,
                          background: isNow ? "rgba(230,57,47,0.22)" : "#14141c",
                          border: "1px solid " + (isNow ? "var(--accent)" : "#22222c"),
                          borderRadius: 4,
                          padding: "4px 8px",
                          overflow: "hidden",
                          cursor: "pointer",
                          fontSize: 12
                        }}
                      >
                        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.title}
                        </div>
                        <div style={{ color: "var(--text-dim)", fontSize: 11 }}>
                          {p.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailPanel({
  channel,
  loadingEpg,
  onClose,
  onPlay
}: {
  channel: LiveChannel;
  loadingEpg: boolean;
  onClose: () => void;
  onPlay: () => void;
}) {
  const rows = channelDetailRows(channel);
  return (
    <div
      style={{
        width: 340,
        flexShrink: 0,
        background: "#101017",
        border: "1px solid #1e1e28",
        borderRadius: 10,
        padding: 18,
        overflowY: "auto"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{channel.name}</div>
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>

      <button className="btn btn-primary" onClick={onPlay} style={{ width: "100%", marginTop: 12 }}>
        ▶ Watch now
      </button>

      {channel.now && (
        <div style={{ marginTop: 16, padding: 12, background: "#16161d", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>● ON NOW</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{channel.now.title}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
            {channel.now.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
            {channel.now.stop.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          {channel.now.description && (
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.5 }}>
              {channel.now.description}
            </div>
          )}
          <div style={{ height: 3, background: "#1c1c26", borderRadius: 2, marginTop: 10, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${programmeProgress(channel.now)}%`, background: "var(--accent)" }} />
          </div>
        </div>
      )}

      {loadingEpg && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 12 }}>Loading programme guide…</div>
      )}

      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5, margin: "20px 0 8px" }}>
        Channel details
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid #17171f", fontSize: 12 }}
          >
            <div style={{ color: "var(--text-dim)", width: 130, flexShrink: 0 }}>{r.label}</div>
            <div style={{ flex: 1, wordBreak: "break-word" }}>{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
