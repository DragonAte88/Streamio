import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCatalog } from "../lib/CatalogContext";
import { usePlayback } from "../lib/PlaybackContext";
import { useAuth } from "../lib/auth";
import { Channel } from "../lib/playlist";
import {
  ContinueItem,
  FriendActivityItem,
  WatchStats,
  fetchContinueWatching,
  fetchFriendsActivity,
  fetchWatchHistory,
  fetchWatchStats,
  fetchWatchlist
} from "../lib/api";
import { HomeRow, buildHomeRows } from "../lib/recommend";

export function toChannel(a: any): Channel {
  return {
    id: String(a.id),
    name: a.name,
    url: a.url,
    logo: a.logo || undefined,
    group: a.group_name || a.group || "Uncategorized",
    tvgId: a.tvg_id || undefined
  };
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Personalised + social rows for the Home page: Continue Watching, For You,
 * Friends are watching, taste-based category rows, and Recently Watched.
 *
 * Renders nothing at all when there is no real signal, rather than showing
 * empty shelves - a row that is always present but always empty reads as
 * broken.
 */
export default function RecommendedRows() {
  const { channels } = useCatalog();
  const { play } = usePlayback();
  const { token, user } = useAuth();

  const [continueItems, setContinueItems] = useState<ContinueItem[]>([]);
  const [history, setHistory] = useState<Channel[]>([]);
  const [stats, setStats] = useState<WatchStats | null>(null);
  const [friends, setFriends] = useState<FriendActivityItem[]>([]);
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(!token);

  useEffect(() => {
    if (!token) {
      setLoaded(true);
      return;
    }
    let cancelled = false;

    // Settled individually: a user with no friends yet must still get their
    // own history and recommendations.
    Promise.allSettled([
      fetchContinueWatching(token),
      fetchWatchHistory(token),
      fetchWatchStats(token),
      fetchFriendsActivity(token),
      fetchWatchlist(token)
    ]).then((r) => {
      if (cancelled) return;
      if (r[0].status === "fulfilled") setContinueItems(r[0].value);
      if (r[1].status === "fulfilled") setHistory(r[1].value.map(toChannel));
      if (r[2].status === "fulfilled") setStats(r[2].value);
      if (r[3].status === "fulfilled") setFriends(r[3].value);
      if (r[4].status === "fulfilled") setWatchlistIds(new Set(r[4].value.map((c: any) => String(c.id))));
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const watchedIds = useMemo(() => new Set(history.map((c) => c.id)), [history]);

  const rows: HomeRow[] = useMemo(() => {
    if (!channels.length) return [];
    return buildHomeRows({ catalog: channels, stats, friendsActivity: friends, watchedIds, watchlistIds }, channels);
  }, [channels, stats, friends, watchedIds, watchlistIds]);

  const totalHours = stats?.totals?.seconds ? stats.totals.seconds / 3600 : 0;
  const hasAnything = continueItems.length > 0 || rows.length > 0 || history.length > 0;

  if (!loaded) return null;

  if (!hasAnything) {
    return (
      <div style={{ padding: "24px 48px 0" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>No recommendations yet</div>
        <div style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 6, maxWidth: 560, lineHeight: 1.6 }}>
          {token
            ? "These rows are built from what you actually watch and from friends who share their activity. Watch a few things or add friends in Social and this fills in."
            : "Sign in to get recommendations based on your viewing and your friends' activity."}
        </div>
        {!token && (
          <Link to="/login" className="btn btn-secondary" style={{ textDecoration: "none", display: "inline-block", marginTop: 12 }}>
            Sign in
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      {stats && stats.totals.plays > 0 && (
        <div style={{ display: "flex", gap: 32, padding: "22px 48px 0", flexWrap: "wrap" }}>
          <Stat label="Watch time" value={totalHours >= 1 ? `${totalHours.toFixed(1)}h` : fmtDuration(stats.totals.seconds)} />
          <Stat label="Sessions" value={String(stats.totals.plays)} />
          <Stat label="Channels explored" value={String(stats.totals.distinct_channels)} />
          <Stat label="Top category" value={stats.byGroup[0]?.group_name || "—"} />
          {user && <Stat label="Signed in as" value={user.display_name || user.username || "—"} />}
        </div>
      )}

      {continueItems.length > 0 && (
        <Row title="Continue Watching" subtitle="Pick up where you left off">
          {continueItems.map((item) => {
            const pct = item.duration_seconds ? (item.position_seconds / item.duration_seconds) * 100 : 0;
            const left = Math.max(0, item.duration_seconds - item.position_seconds);
            return (
              <div
                key={`cont-${item.id}`}
                className="card"
                style={item.logo ? { backgroundImage: `url(${item.logo})` } : undefined}
                onClick={() => play(toChannel(item), undefined, { kind: "vod" })}
              >
                <div className="card-group">{fmtDuration(left)} left</div>
                <div className="card-label">{item.name}</div>
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "rgba(0,0,0,0.6)" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)" }} />
                </div>
              </div>
            );
          })}
        </Row>
      )}

      {rows.map((row) => (
        <Row key={row.key} title={row.title} subtitle={row.subtitle}>
          {row.items.map((ch, i) => (
            <div
              key={`${row.key}-${ch.id}`}
              className="card"
              style={ch.logo ? { backgroundImage: `url(${ch.logo})` } : undefined}
              onClick={() => play(ch)}
              title={row.reasons?.[i]}
            >
              {row.reasons?.[i] && <div className="card-group">{row.reasons[i]}</div>}
              <div className="card-label">{ch.name}</div>
            </div>
          ))}
        </Row>
      ))}

      {history.length > 0 && (
        <Row title="Recently Watched">
          {history.map((ch) => (
            <div
              key={`hist-${ch.id}`}
              className="card"
              style={ch.logo ? { backgroundImage: `url(${ch.logo})` } : undefined}
              onClick={() => play(ch)}
            >
              <div className="card-group">{ch.group}</div>
              <div className="card-label">{ch.name}</div>
            </div>
          ))}
        </Row>
      )}
    </>
  );
}

function Row({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="row-section">
      <div className="row-title" style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span>{title}</span>
        {subtitle && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-dim)" }}>{subtitle}</span>}
      </div>
      <div className="row-scroll">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
