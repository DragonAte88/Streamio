import React, { useEffect, useState } from "react";

export default function About() {
  const [status, setStatus] = useState<{ state: string; version?: string; percent?: number; message?: string }>({
    state: "idle"
  });

  useEffect(() => {
    return window.updater.onStatus(setStatus);
  }, []);

  const check = () => window.updater.check();
  const download = () => window.updater.download();
  const install = () => window.updater.install();

  return (
    <div>
      <h2>About Streamio</h2>
      <p style={{ color: "var(--text-dim)" }}>Version 0.2.0</p>
      <p style={{ color: "var(--text-dim)" }}>Native Windows IPTV/M3U8 player built on Electron + mpv.</p>
      <p style={{ color: "var(--text-dim)" }}>
        <a href="https://github.com/DragonAte88/Streamio" style={{ color: "var(--accent)" }}>
          github.com/DragonAte88/Streamio
        </a>
      </p>

      <h3 style={{ fontSize: 14, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 28 }}>
        Updates
      </h3>
      <p style={{ color: "var(--text-dim)", fontSize: 13, maxWidth: 520 }}>
        Checks GitHub Releases for a newer app build and installs it in place. The playback engine (mpv) and its
        codec support update independently via winget, not through this — video/audio codec support tracks whatever
        mpv version is installed on this machine, same as any other player. There's no separate "Oracle Cloud
        update" concept; the backend is deployed by us server-side and doesn't require anything from the client.
      </p>

      <div className="setting-row">
        <div>
          <div className="setting-row-label">
            {status.state === "idle" && "Ready to check"}
            {status.state === "checking" && "Checking for updates…"}
            {status.state === "up-to-date" && "You're on the latest version"}
            {status.state === "available" && `Update available: v${status.version}`}
            {status.state === "downloading" && `Downloading… ${status.percent ?? 0}%`}
            {status.state === "downloaded" && `Update ready to install (v${status.version})`}
            {status.state === "error" && `Update check failed: ${status.message}`}
          </div>
        </div>
        {(status.state === "idle" || status.state === "up-to-date" || status.state === "error") && (
          <button className="btn btn-secondary" onClick={check}>Check for Updates</button>
        )}
        {status.state === "available" && (
          <button className="btn btn-primary" onClick={download}>Download Update</button>
        )}
        {status.state === "downloaded" && (
          <button className="btn btn-primary" onClick={install}>Restart & Install</button>
        )}
      </div>
    </div>
  );
}
