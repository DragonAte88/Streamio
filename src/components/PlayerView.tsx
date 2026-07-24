import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { Channel } from "../lib/playlist";
import { useSettings } from "../lib/SettingsContext";

const ROUTE_LABELS: { prefix: string; label: string }[] = [
  { prefix: "/home", label: "Home" },
  { prefix: "/live-tv", label: "Live TV" },
  { prefix: "/search", label: "Search" },
  { prefix: "/library", label: "Your Library" },
  { prefix: "/social", label: "Social" },
  { prefix: "/settings", label: "Settings" },
  { prefix: "/admin", label: "Admin" }
];

function labelForPath(pathname: string): string {
  const match = ROUTE_LABELS.find((r) => pathname.startsWith(r.prefix));
  return match ? match.label : "Home";
}

export default function PlayerView({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const { settings } = useSettings();
  const location = useLocation();
  const areaRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const backLabelRef = useRef(labelForPath(location.pathname));

  useEffect(() => {
    let cancelled = false;
    let offExit: (() => void) | null = null;
    let offBack: (() => void) | null = null;

    (async () => {
      try {
        await window.player.start({ channelName: channel.name, backLabel: backLabelRef.current });
        if (cancelled) return;
        offExit = window.player.onExit(() => setError("Playback engine exited unexpectedly."));
        offBack = window.player.onBack(onClose);
        await window.player.load(channel.url);
        await window.player.setVolume(settings.defaultVolume);
        if (settings.discordRpcEnabled) window.discord.setWatching(channel.name);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();

    return () => {
      cancelled = true;
      if (offExit) offExit();
      if (offBack) offBack();
      window.player.stop();
      window.player.setBounds({ x: 0, y: 0, width: 0, height: 0, visible: false });
      window.discord.clear();
    };
  }, [channel.url]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      window.player.setBounds({ x: r.x, y: r.y, width: r.width, height: r.height, visible: true });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener("scroll", report, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", report, true);
    };
  }, []);

  return (
    <div className="player-view" ref={areaRef}>
      {error && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#e6392f" }}>
          {error}
        </div>
      )}
    </div>
  );
}
