import React from "react";
import type { Channel } from "../lib/playlist";

export default function ContentRow({
  title,
  channels,
  onSelect
}: {
  title: string;
  channels: Channel[];
  onSelect: (ch: Channel) => void;
}) {
  return (
    <div className="row-section">
      <div className="row-title">{title}</div>
      <div className="row-scroll">
        {channels.map((ch) => (
          <div
            key={ch.id}
            className="card"
            style={ch.logo ? { backgroundImage: `url(${ch.logo})` } : undefined}
            onClick={() => onSelect(ch)}
          >
            <div className="card-group">{ch.group}</div>
            <div className="card-label">{ch.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
