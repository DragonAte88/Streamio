import React from "react";
import { useSettings } from "../../lib/SettingsContext";

export default function Subtitles() {
  const { settings, update } = useSettings();
  return (
    <div>
      <h2>Subtitles</h2>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Default subtitle language</div>
          <div className="setting-row-desc">Applied when a stream provides subtitle tracks.</div>
        </div>
        <select value={settings.subtitleLanguage} onChange={(e) => update({ subtitleLanguage: e.target.value })}>
          <option value="off">Off</option>
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="ja">Japanese</option>
        </select>
      </div>
    </div>
  );
}
