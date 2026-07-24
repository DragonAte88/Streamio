import React from "react";
import { useSettings } from "../../lib/SettingsContext";
import Toggle from "../../components/Toggle";

export default function General() {
  const { settings, update } = useSettings();
  return (
    <div>
      <h2>General</h2>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Autoplay next channel</div>
          <div className="setting-row-desc">When enabled, moving to the next item in a row starts playback automatically.</div>
        </div>
        <Toggle on={settings.autoplayNext} onChange={(v) => update({ autoplayNext: v })} />
      </div>
    </div>
  );
}
