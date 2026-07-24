import React, { useEffect, useMemo, useState } from "react";
import Sidebar, { NavKey } from "./components/Sidebar";
import HeroBanner from "./components/HeroBanner";
import ContentRow from "./components/ContentRow";
import PlayerView from "./components/PlayerView";
import { Channel, groupChannels, parseM3U } from "./lib/playlist";
import { DEMO_M3U } from "./lib/demoPlaylist";

export default function App() {
  const [nav, setNav] = useState<NavKey>("home");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [playing, setPlaying] = useState<Channel | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setChannels(parseM3U(DEMO_M3U));
  }, []);

  const groups = useMemo(() => groupChannels(channels), [channels]);
  const featured = channels[0];

  const filtered = useMemo(() => {
    if (!query.trim()) return channels;
    const q = query.toLowerCase();
    return channels.filter((c) => c.name.toLowerCase().includes(q));
  }, [channels, query]);

  return (
    <div className="app-shell">
      <Sidebar active={nav} onSelect={setNav} />
      <div className="main-content">
        {nav === "home" && (
          <>
            <HeroBanner channel={featured} onPlay={setPlaying} />
            {groups.map((g) => (
              <ContentRow key={g.name} title={g.name} channels={g.channels} onSelect={setPlaying} />
            ))}
          </>
        )}

        {nav === "live" && (
          <div className="row-section" style={{ paddingTop: 40 }}>
            {groups.map((g) => (
              <ContentRow key={g.name} title={g.name} channels={g.channels} onSelect={setPlaying} />
            ))}
          </div>
        )}

        {nav === "search" && (
          <div className="row-section" style={{ paddingTop: 40 }}>
            <input
              autoFocus
              placeholder="Search channels…"
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
                marginBottom: 24
              }}
            />
            <ContentRow title="Results" channels={filtered} onSelect={setPlaying} />
          </div>
        )}

        {nav === "settings" && (
          <div className="empty-state">
            <h2>Settings</h2>
            <p>Playlist source, account, and backend sync options land here in a later phase.</p>
          </div>
        )}

        {playing && <PlayerView channel={playing} onClose={() => setPlaying(null)} />}
      </div>
    </div>
  );
}
