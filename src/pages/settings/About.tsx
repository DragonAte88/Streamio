import React from "react";

export default function About() {
  return (
    <div>
      <h2>About Streamio</h2>
      <p style={{ color: "var(--text-dim)" }}>Version 0.1.0</p>
      <p style={{ color: "var(--text-dim)" }}>
        Native Windows IPTV/M3U8 player built on Electron + mpv.
      </p>
      <p style={{ color: "var(--text-dim)" }}>
        <a href="https://github.com/DragonAte88/Streamio" style={{ color: "var(--accent)" }}>
          github.com/DragonAte88/Streamio
        </a>
      </p>
    </div>
  );
}
