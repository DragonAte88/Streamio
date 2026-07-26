import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { Channel } from "../lib/playlist";
import { useSettings } from "../lib/SettingsContext";
import { usePlayback } from "../lib/PlaybackContext";
import { useAuth } from "../lib/auth";
import { startHistoryEntry, reportProgress } from "../lib/api";

const ROUTE_LABELS: { prefix: string; label: string }[] = [
  { prefix: "/home",     label: "Home" },
  { prefix: "/live-tv",  label: "Live TV" },
  { prefix: "/anime",    label: "Anime" },
  { prefix: "/kids",     label: "Anime" },
  { prefix: "/search",   label: "Search" },
  { prefix: "/library",  label: "Your Library" },
  { prefix: "/social",   label: "Social" },
  { prefix: "/settings", label: "Settings" },
  { prefix: "/admin",    label: "Admin" },
];

function labelForPath(pathname: string): string {
  const match = ROUTE_LABELS.find((r) => pathname.startsWith(r.prefix));
  return match ? match.label : "Home";
}

export default function PlayerView({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const { settings } = useSettings();
  const { mode, kind, toggleMode } = usePlayback();
  const { token } = useAuth();
  const location = useLocation();
  const areaRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Starting player…");
  const backLabelRef = useRef(labelForPath(location.pathname));

  useEffect(() => {
    let cancelled = false;
    let offExit: (() => void) | null = null;
    let offBack: (() => void) | null = null;

    (async () => {
      try {
        // Validate that we have a real stream URL before touching MPV
        const streamUrl = channel.url;
        if (!streamUrl || streamUrl.trim() === "") {
          setError("No stream URL was provided. The video extractor may have timed out.");
          return;
        }

        // Log the URL we're about to play so it shows up in Electron's console
        console.log("[PlayerView] Loading stream:", streamUrl.slice(0, 120));
        setStatus("Starting MPV…");

        await window.player.start({
          channelName: channel.name,
          backLabel: backLabelRef.current,
        });

        if (cancelled) return;

        offExit = window.player.onExit(() => {
          if (!cancelled) setError("Playback engine exited unexpectedly. Check that MPV is installed at C:\\Program Files\\MPV Player\\mpv.exe");
        });
        offBack = window.player.onBack(onClose);

        setStatus("Loading stream…");
        await window.player.load(streamUrl);

        if (cancelled) return;

        setStatus(""); // clear — playerControls.html takes over via 'ready' event
        await window.player.setVolume(settings.defaultVolume);

        if (settings.discordRpcEnabled) {
          window.discord.setWatching(channel.name);
        }
      } catch (e: any) {
        if (!cancelled) {
          const msg = e?.message || String(e);
          console.error("[PlayerView] Error:", msg);

          // Make MPV path errors more actionable
          if (msg.includes("ENOENT") || msg.includes("mpv") || msg.includes("spawn")) {
            setError("MPV player not found.\n\nInstall MPV at:\nC:\\Program Files\\MPV Player\\mpv.exe\n\nThen restart Streamio.");
          } else if (msg.includes("connect timeout") || msg.includes("IPC")) {
            setError("MPV started but couldn't connect (IPC timeout).\n\nThis can happen if another MPV process is running. Restart Streamio.");
          } else {
            setError(msg);
          }
        }
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
  }, [channel.url]); // Re-run when the stream URL changes (next episode)

  // Progress reporting. One history row per viewing session, updated in place
  // every 15s, so Continue Watching has a real resume point. Live channels are
  // skipped: they have no duration, so "resume" is meaningless for them.
  useEffect(() => {
    if (!token || kind === "live") return;

    let historyId: number | null = null;
    let lastPos = 0;
    let lastDur: number | undefined;
    let stopped = false;

    const offProps = window.player.onPropertyChange((msg: any) => {
      if (msg.name === "time-pos" && typeof msg.data === "number") lastPos = msg.data;
      if (msg.name === "duration" && typeof msg.data === "number") lastDur = msg.data;
    });

    startHistoryEntry(token, String(channel.id))
      .then((id) => {
        if (!stopped) historyId = id;
      })
      .catch(() => {});

    const flush = () => {
      if (historyId && lastPos > 0) reportProgress(token, historyId, lastPos, lastDur);
    };
    const interval = setInterval(flush, 15000);

    return () => {
      stopped = true;
      clearInterval(interval);
      offProps();
      flush(); // final write on close, so the resume point is where they left off
    };
  }, [channel.url, token, kind]);

  // Report the video div bounds to main process so MPV knows where to paint.
  // Re-runs on mode change: switching between docked and fullscreen moves the
  // element, and mpv only learns about it from this report.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;

    const report = () => {
      const r = el.getBoundingClientRect();
      window.player.setBounds({
        x: r.x, y: r.y,
        width: r.width, height: r.height,
        visible: true,
      });
    };

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener("scroll", report, true);
    window.addEventListener("resize", report);

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", report, true);
      window.removeEventListener("resize", report);
    };
  }, [mode]);

  // Overlays (spinner / error) are shared by both shells.
  const overlays = (
    <>
      {!error && status && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 12, color: "#ccc",
        }}>
          <div style={{ fontSize: 24, animation: "pvspin 1.2s linear infinite", display: "inline-block" }}>⟳</div>
          <div style={{ fontSize: 14 }}>{status}</div>
          <style>{`@keyframes pvspin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {error && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "24px", textAlign: "center",
          background: "rgba(0,0,0,0.85)",
        }}>
          <div style={{ fontSize: 28, marginBottom: 14 }}>⚠️</div>
          <div style={{
            color: "#ef4444", fontSize: 13, fontWeight: 600,
            maxWidth: 480, lineHeight: 1.7, whiteSpace: "pre-line",
          }}>
            {error}
          </div>
          <button
            onClick={onClose}
            style={{
              marginTop: 22, padding: "8px 22px", borderRadius: 8,
              background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff", fontSize: 13, cursor: "pointer",
            }}
          >
            ← Go Back
          </button>
        </div>
      )}
    </>
  );

  // Docked player. The header sits above the reported video rect on purpose:
  // anything drawn inside those bounds would be painted over by mpv.
  if (mode === "mini") {
    return (
      <div className="player-mini">
        <div className="player-mini-header">
          {kind === "live" && <span className="live-badge">LIVE</span>}
          <span className="player-mini-title" title={channel.name}>{channel.name}</span>
          <button className="player-mini-btn" title="Expand" onClick={toggleMode}>⛶</button>
          <button className="player-mini-btn" title="Close" onClick={onClose}>✕</button>
        </div>
        <div className="player-mini-video" ref={areaRef}>
          {overlays}
        </div>
      </div>
    );
  }

  return (
    <div className="player-view" ref={areaRef}>
      {overlays}
    </div>
  );
}
