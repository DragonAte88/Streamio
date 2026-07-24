import React from "react";
import { useSettings } from "../../lib/SettingsContext";

export default function Appearance() {
  const { settings, update } = useSettings();
  return (
    <div>
      <h2>Appearance</h2>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Theme</div>
          <div className="setting-row-desc">Light theme is scaffolded but not fully styled yet.</div>
        </div>
        <select value={settings.theme} onChange={(e) => update({ theme: e.target.value as any })}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">Match system</option>
        </select>
      </div>
    </div>
  );
}
