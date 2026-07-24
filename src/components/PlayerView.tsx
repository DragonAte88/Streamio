import React, { useEffect, useRef, useState } from "react";
import type { Channel } from "../lib/playlist";

function fmt(sec: number | null | undefined) {
  if (sec == null || !isFinite(sec)) return "--:--";
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  const m = Math.floor((sec / 60) % 60).toString().padStart(2, "0");
  const h = Math.floor(sec / 3600);
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export default function PlayerView({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [timePos, setTimePos] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [cacheSecs, setCacheSecs] = useState<number | null>(null);
  const [volume, setVolume] = useState(100);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let offProp: (() => void) | null = null;
    let offExit: (() => void) | null = null;

    (async () => {
      try {
        await window.player.start();
        if (cancelled) return;
        offProp = window.player.onPropertyChange((msg) => {
          if (msg.name === "time-pos") setTimePos(msg.data);
          if (msg.name === "duration") setDuration(msg.data);
          if (msg.name === "pause") setPaused(!!msg.data);
          if (msg.name === "demuxer-cache-duration") setCacheSecs(msg.data);
        });
        offExit = window.player.onExit(() => setError("Playback engine exited unexpectedly."));
        await window.player.load(channel.url);
        setReady(true);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();

    return () => {
      cancelled = true;
      if (offProp) offProp();
      if (offExit) offExit();
      window.player.stop();
      window.player.setBounds({ x: 0, y: 0, width: 0, height: 0, visible: false });
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

  const togglePause = () => {
    if (paused) window.player.play();
    else window.player.pause();
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    if (duration) window.player.seek((pct / 100) * duration, "absolute");
  };

  const onVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    window.player.setVolume(v);
  };

  const pct = duration && timePos != null ? (timePos / duration) * 100 : 0;
  const bufferedSecs = cacheSecs != null ? cacheSecs.toFixed(1) : "0.0";

  return (
    <div className="player-view">
      <div className="player-topbar">
        <button className="back-btn" onClick={onClose}>←</button>
        <div className="title">{channel.name}</div>
      </div>
      <div className="video-area" ref={areaRef}>
        {!ready && !error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9a9aa6" }}>
            Starting playback engine…
          </div>
        )}
        {error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#e6392f" }}>
            {error}
          </div>
        )}
      </div>
      <div className="player-controls">
        <div className="seek-row">
          <span>{fmt(timePos)}</span>
          <input type="range" min={0} max={100} value={isFinite(pct) ? pct : 0} onChange={onSeek} />
          <span>{duration ? fmt(duration) : "LIVE"}</span>
          <span style={{ marginLeft: 12, opacity: 0.6 }}>buffer: {bufferedSecs}s</span>
        </div>
        <div className="controls-row">
          <button className="icon-btn" onClick={togglePause}>{paused ? "▶" : "❚❚"}</button>
          <span style={{ fontSize: 12, color: "#9a9aa6" }}>🔊</span>
          <input type="range" min={0} max={130} value={volume} onChange={onVolume} style={{ width: 100 }} />
        </div>
      </div>
    </div>
  );
}
