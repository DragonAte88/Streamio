import React from "react";
import { useSettings } from "../../lib/SettingsContext";
import Toggle from "../../components/Toggle";

export default function Discord() {
  const { settings, update } = useSettings();
  return (
    <div>
      <h2>Discord</h2>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Rich Presence</div>
          <div className="setting-row-desc">
            Shows "Watching: &lt;channel&gt;" on your Discord profile while a stream is playing. Connects
            directly to your local Discord client — no bot, no data leaves your machine.
          </div>
        </div>
        <Toggle on={settings.discordRpcEnabled} onChange={(v) => update({ discordRpcEnabled: v })} />
      </div>
    </div>
  );
}
