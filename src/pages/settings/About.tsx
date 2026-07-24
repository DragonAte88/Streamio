import React, { useEffect, useState } from "react";

interface UpdaterStatus {
  state: string;
  version?: string;
  percent?: number;
  message?: string;
  releaseNotes?: string;
}

export default function About() {
  const [status, setStatus] = useState<UpdaterStatus>({ state: "idle" });
  const [showChangelog, setShowChangelog] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    const offStatus = window.updater.onStatus(setStatus);
    const offCountdown = window.updater.onRestartCountdown(({ secondsLeft }) => setCountdown(secondsLeft));
    return () => {
      offStatus();
      offCountdown();
    };
  }, []);

  const check = () => window.updater.check();
  const download = () => window.updater.download();
  const install = () => window.updater.install();

  const buttonLabel = () => {
    switch (status.state) {
      case "checking":
        return "Checking…";
      case "available":
        return `Update to v${status.version}`;
      case "downloading":
        return `Downloading… ${status.percent ?? 0}%`;
      case "downloaded":
        return "Restart && Install";
      default:
        return "Refresh Updater";
    }
  };

  const onButtonClick = () => {
    if (status.state === "available") download();
    else if (status.state === "downloaded") install();
    else check();
  };

  return (
    <div>
      <h2>About Streamio</h2>
      <p style={{ color: "var(--text-dim)" }}>Version 0.5.3</p>
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
        Auto-checks GitHub Releases every minute. The playback engine (mpv) and its codec support update
        independently via winget, not through this — codec support tracks whatever mpv version is installed on this
        machine. There's no separate "Oracle Cloud update" concept; the backend is deployed server-side and needs
        nothing from the client.
      </p>

      <div className="setting-row">
        <div style={{ flex: 1 }}>
          <div className="setting-row-label">
            {status.state === "idle" && "Ready to check"}
            {status.state === "checking" && "Checking for updates…"}
            {status.state === "up-to-date" && "You're on the latest version"}
            {status.state === "available" && `Update available: v${status.version}`}
            {status.state === "downloading" && "Downloading update…"}
            {status.state === "downloaded" && `Update ready to install (v${status.version})`}
            {status.state === "error" && `Update check failed: ${status.message}`}
          </div>
          {status.state === "downloading" && (
            <div style={{ background: "#1c1c26", borderRadius: 6, height: 8, marginTop: 8, overflow: "hidden", maxWidth: 300 }}>
              <div style={{ background: "var(--accent)", height: "100%", width: `${status.percent ?? 0}%`, transition: "width 0.2s" }} />
            </div>
          )}
          {(status.state === "available" || status.state === "downloaded") && status.releaseNotes && (
            <a onClick={() => setShowChangelog(true)} style={{ fontSize: 12, color: "var(--accent)", cursor: "pointer" }}>
              View changelog
            </a>
          )}
        </div>
        <button className="btn btn-primary" onClick={onButtonClick} disabled={status.state === "checking" || status.state === "downloading"}>
          {buttonLabel()}
        </button>
      </div>

      {countdown !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            zIndex: 100
          }}
        >
          <div style={{ fontSize: 48, fontWeight: 800 }}>{countdown}</div>
          <div style={{ color: "var(--text-dim)", marginTop: 8 }}>Restarting Streamio to finish installing…</div>
        </div>
      )}

      {showChangelog && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90 }}
          onClick={() => setShowChangelog(false)}
        >
          <div
            style={{ background: "var(--bg-card)", borderRadius: 12, padding: 24, width: 480, maxHeight: "70vh", overflowY: "auto", border: "1px solid #24242f" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>What's new in v{status.version}</h3>
              <button className="icon-btn" onClick={() => setShowChangelog(false)}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", whiteSpace: "pre-wrap" }}>{status.releaseNotes}</div>
          </div>
        </div>
      )}
    </div>
  );
}
