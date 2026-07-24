import React from "react";
import { useSettings } from "../../lib/SettingsContext";

export default function Playback() {
  const { settings, update } = useSettings();
  return (
    <div>
      <h2>Playback</h2>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Hardware decode</div>
          <div className="setting-row-desc">Passed to mpv as --hwdec. "auto" uses GPU decode when available.</div>
        </div>
        <select value={settings.hwdec} onChange={(e) => update({ hwdec: e.target.value as any })}>
          <option value="auto">Auto (recommended)</option>
          <option value="no">Software only</option>
        </select>
      </div>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Buffer target: {settings.bufferSecs}s</div>
          <div className="setting-row-desc">How many seconds of video mpv caches ahead of playback.</div>
        </div>
        <input
          type="range"
          min={2}
          max={30}
          value={settings.bufferSecs}
          onChange={(e) => update({ bufferSecs: Number(e.target.value) })}
        />
      </div>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Default volume: {settings.defaultVolume}%</div>
        </div>
        <input
          type="range"
          min={0}
          max={130}
          value={settings.defaultVolume}
          onChange={(e) => update({ defaultVolume: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}
