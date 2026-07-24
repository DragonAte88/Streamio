import React, { useState } from "react";
import { useSettings } from "../../lib/SettingsContext";
import { useAuth } from "../../lib/auth";
import { updateProfile, exchangeDiscordCode, unlinkDiscord } from "../../lib/api";
import Toggle from "../../components/Toggle";

export default function Discord() {
  const { settings, update } = useSettings();
  const { user, token, setUser } = useAuth();
  const [discordId, setDiscordId] = useState(user?.discord_user_id || "");
  const [saving, setSaving] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const saveDiscordId = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const updated = await updateProfile(token, { discordUserId: discordId || undefined });
      setUser(updated);
    } finally {
      setSaving(false);
    }
  };

  const connectDiscord = async () => {
    if (!token) return;
    setOauthBusy(true);
    setOauthError(null);
    try {
      const code = await window.discord.startOAuth();
      const updated = await exchangeDiscordCode(token, code);
      setUser({ ...user!, ...updated });
    } catch (e: any) {
      setOauthError(e.message || "Discord connection failed");
    } finally {
      setOauthBusy(false);
    }
  };

  const disconnectDiscord = async () => {
    if (!token) return;
    await unlinkDiscord(token);
    setUser({ ...user!, discord_user_id: null, discord_username: null, discord_avatar_url: null });
  };

  return (
    <div>
      <h2>Discord</h2>

      <h3 style={{ fontSize: 14, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 24 }}>
        Rich Presence (your profile)
      </h3>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Show "Watching: &lt;channel&gt;" on your Discord profile</div>
          <div className="setting-row-desc">
            Connects directly to your local Discord client over IPC. <strong>Requires Discord to be open</strong> —
            if you close Discord, this presence disappears immediately, the same as every other RPC app (Spotify,
            games, etc). There is no way around this; it's not a Streamio limitation, it's how Discord's RPC
            protocol works.
          </div>
        </div>
        <Toggle on={settings.discordRpcEnabled} onChange={(v) => update({ discordRpcEnabled: v })} />
      </div>

      <h3 style={{ fontSize: 14, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 28 }}>
        Bot status (persists when your client is closed)
      </h3>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Let the Streamio bot reflect your activity</div>
          <div className="setting-row-desc">
            This is a genuinely different mechanism: a separate bot account (deployed, not yet activated — see
            Flex-2) can hold its own "status" independent of whether your personal Discord client is open. Important:
            this shows on <strong>the bot's</strong> profile/status, not yours — Discord doesn't let a bot edit your
            personal account's presence when you're offline. Useful for a server-wide "now playing" channel/embed,
            not a substitute for your own profile card.
          </div>
        </div>
        <Toggle on={settings.discordBotStatusEnabled} onChange={(v) => update({ discordBotStatusEnabled: v })} />
      </div>

      <h3 style={{ fontSize: 14, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 28 }}>
        Link your Discord account
      </h3>
      {oauthError && <div className="form-error">{oauthError}</div>}
      {user?.discord_user_id ? (
        <div className="setting-row">
          <div>
            <div className="setting-row-label">Connected as {user.discord_username}</div>
            <div className="setting-row-desc">Discord ID {user.discord_user_id}</div>
          </div>
          <button className="btn btn-secondary" onClick={disconnectDiscord}>Disconnect</button>
        </div>
      ) : (
        <div className="setting-row">
          <div>
            <div className="setting-row-label">Connect with Discord (OAuth2)</div>
            <div className="setting-row-desc">
              Opens Discord in your browser to authorize, then hands control back to Streamio automatically via a
              local connection — the same flow real desktop apps use. Your Discord password is never seen by
              Streamio.
            </div>
          </div>
          <button className="btn btn-primary" onClick={connectDiscord} disabled={oauthBusy}>
            {oauthBusy ? "Waiting for Discord…" : "Connect with Discord"}
          </button>
        </div>
      )}

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-dim)" }}>Or link manually by ID</summary>
        <div style={{ marginTop: 10 }}>
          <input
            type="text"
            value={discordId}
            onChange={(e) => setDiscordId(e.target.value)}
            placeholder="e.g. 673973436967550976"
            style={{ width: "100%", marginBottom: 8 }}
          />
          <button className="btn btn-secondary" onClick={saveDiscordId} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </details>

      <h3 style={{ fontSize: 14, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 28 }}>
        Voice — what's actually possible
      </h3>
      <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6 }}>
        Discord's API does not allow any bot or app to join or relay audio into your <strong>private DM calls</strong>{" "}
        or <strong>Group DM calls</strong> — that's a hard platform restriction, not a missing feature here. What IS
        real: the bot can join a <strong>server (guild) voice channel</strong> you're both in and play a room's
        synced audio there. See Settings → Cast &amp; Remote and the Social → Rooms page for that.
      </p>
    </div>
  );
}
