import React from "react";

const SHORTCUTS = [
  ["Space", "Play / Pause"],
  ["← / →", "Seek back / forward 10s"],
  ["↑ / ↓", "Volume up / down"],
  ["F", "Toggle fullscreen"],
  ["Esc", "Close player"],
  ["/", "Focus search"],
  ["M", "Mute"]
];

export default function Shortcuts() {
  return (
    <div>
      <h2>Keyboard Shortcuts</h2>
      <p style={{ color: "var(--text-dim)", marginBottom: 20 }}>Reference only for now — not all are bound in the player yet.</p>
      {SHORTCUTS.map(([key, action]) => (
        <div className="setting-row" key={key}>
          <div className="setting-row-label">{action}</div>
          <div style={{ fontFamily: "monospace", color: "var(--text-dim)" }}>{key}</div>
        </div>
      ))}
    </div>
  );
}
