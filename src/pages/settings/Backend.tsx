import React, { useState } from "react";
import { useSettings } from "../../lib/SettingsContext";

export default function Backend() {
  const { settings, update } = useSettings();
  const [url, setUrl] = useState(settings.backendUrl);
  const [status, setStatus] = useState<string | null>(null);

  const test = async () => {
    setStatus("checking…");
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      setStatus(data.ok ? "✓ reachable, DB up" : "reachable but unhealthy");
    } catch {
      setStatus("✗ unreachable");
    }
  };

  return (
    <div>
      <h2>Backend / Sync</h2>
      <div className="setting-row">
        <div style={{ flex: 1 }}>
          <div className="setting-row-label">Backend URL</div>
          <div className="setting-row-desc">The Oracle Cloud API used for accounts, catalog, and watchlist sync.</div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ width: "100%", marginTop: 8 }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button className="btn btn-secondary" onClick={test}>Test Connection</button>
        <button className="btn btn-primary" onClick={() => update({ backendUrl: url })}>Save</button>
      </div>
      {status && <p style={{ marginTop: 12, color: "var(--text-dim)" }}>{status}</p>}
    </div>
  );
}
