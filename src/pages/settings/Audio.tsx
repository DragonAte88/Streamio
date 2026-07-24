import React from "react";
import { useSettings } from "../../lib/SettingsContext";

export default function Audio() {
  const { settings, update } = useSettings();
  return (
    <div>
      <h2>Audio</h2>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Preferred audio track language</div>
          <div className="setting-row-desc">Applied when a stream provides multiple audio tracks.</div>
        </div>
        <select value={settings.audioLanguage} onChange={(e) => update({ audioLanguage: e.target.value })}>
          <option value="default">Source default</option>
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="ja">Japanese</option>
        </select>
      </div>
    </div>
  );
}
