import React, { useState } from "react";
import { useSettings } from "../../lib/SettingsContext";
import Toggle from "../../components/Toggle";

export default function Parental() {
  const { settings, update } = useSettings();
  const [pin, setPin] = useState(settings.parentalPin);

  return (
    <div>
      <h2>Parental Controls</h2>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Require PIN to change channel category</div>
          <div className="setting-row-desc">Category-level restriction only; per-channel ratings aren't modeled yet.</div>
        </div>
        <Toggle on={settings.parentalPinEnabled} onChange={(v) => update({ parentalPinEnabled: v })} />
      </div>
      {settings.parentalPinEnabled && (
        <div className="setting-row">
          <div>
            <div className="setting-row-label">PIN</div>
          </div>
          <input
            type="password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onBlur={() => update({ parentalPin: pin })}
          />
        </div>
      )}
    </div>
  );
}
