import React from "react";
import { useSettings } from "../../lib/SettingsContext";
import Toggle from "../../components/Toggle";

export default function Notifications() {
  const { settings, update } = useSettings();
  return (
    <div>
      <h2>Notifications</h2>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Channel catalog updates</div>
          <div className="setting-row-desc">Notify when new channels are added to your synced playlists.</div>
        </div>
        <Toggle on={settings.notifyChannelUpdates} onChange={(v) => update({ notifyChannelUpdates: v })} />
      </div>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Friend activity</div>
          <div className="setting-row-desc">Not wired to anything yet — no friends/social graph exists in the backend.</div>
        </div>
        <Toggle on={settings.notifyFriendActivity} onChange={(v) => update({ notifyFriendActivity: v })} />
      </div>
    </div>
  );
}
