import React from "react";
import type { Channel } from "../lib/playlist";

export default function HeroBanner({ channel, onPlay }: { channel?: Channel; onPlay: (ch: Channel) => void }) {
  if (!channel) return null;
  return (
    <div className="hero">
      <div className="hero-content">
        <div className="hero-eyebrow">Featured · {channel.group}</div>
        <div className="hero-title">{channel.name}</div>
        <div className="hero-desc">
          Live now. Jump in instantly with real hardware-accelerated playback and synced audio.
        </div>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => onPlay(channel)}>▶ Play</button>
          <button className="btn btn-secondary">+ My List</button>
        </div>
      </div>
    </div>
  );
}
