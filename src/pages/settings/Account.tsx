import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { updateProfile, suspendMyAccount, wipeMyAccount } from "../../lib/api";
import Toggle from "../../components/Toggle";
import ProfileCard from "../../components/ProfileCard";

export default function Account() {
  const { user, token, logout, setUser } = useAuth();
  const nav = useNavigate();
  const [bio, setBio] = useState(user?.bio || "");
  const [bannerUrl, setBannerUrl] = useState(user?.banner_url || "");
  const [accentColor, setAccentColor] = useState(user?.accent_color || "#e6392f");
  const [saving, setSaving] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user || !token) {
    return (
      <div>
        <h2>Account</h2>
        <p style={{ color: "var(--text-dim)" }}>You're not signed in.</p>
        <button className="btn btn-primary" onClick={() => nav("/login")}>Sign In</button>
      </div>
    );
  }

  const saveProfile = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile(token, { bio, bannerUrl, accentColor });
      setUser(updated);
    } finally {
      setSaving(false);
    }
  };

  const doSuspend = async () => {
    await suspendMyAccount(token, "Suspended by user request");
    logout();
    nav("/login");
  };

  const doWipe = async () => {
    if (wipeConfirm !== user.username) return;
    setBusy(true);
    try {
      await wipeMyAccount(token);
      logout();
      nav("/login");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2>Account</h2>
      <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
        <ProfileCard user={{ ...user, bio }} />
        <div style={{ flex: 1 }}>
          <div className="field">
            <label>Bio</label>
            <input type="text" value={bio} onChange={(e) => setBio(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div className="field">
            <label>Banner image URL</label>
            <input type="text" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://…" style={{ width: "100%" }} />
          </div>
          <div className="field">
            <label>Accent color</label>
            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-row-label">{user.display_name || user.username}</div>
          <div className="setting-row-desc">
            {user.email} · {user.username}#{user.discriminator}
          </div>
        </div>
      </div>

      <h3 style={{ fontSize: 14, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 28 }}>Privacy</h3>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Show my watching activity</div>
        </div>
        <Toggle
          on={user.privacy_show_activity ?? true}
          onChange={async (v) => setUser(await updateProfile(token, { privacyShowActivity: v }))}
        />
      </div>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Allow friend requests</div>
        </div>
        <Toggle
          on={user.privacy_allow_friend_requests ?? true}
          onChange={async (v) => setUser(await updateProfile(token, { privacyAllowFriendRequests: v }))}
        />
      </div>

      <button className="btn btn-secondary" style={{ marginTop: 24 }} onClick={() => { logout(); nav("/login"); }}>
        Sign Out
      </button>

      <h3 style={{ fontSize: 14, color: "#e6392f", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 32 }}>Danger Zone</h3>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">Temporarily suspend my account</div>
          <div className="setting-row-desc">Signs you out. Log back in any time to be offered reactivation.</div>
        </div>
        <button className="btn btn-secondary" onClick={doSuspend}>Suspend</button>
      </div>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #e6392f44", borderRadius: 10 }}>
        <div className="setting-row-label">Permanently delete my account</div>
        <div className="setting-row-desc" style={{ marginBottom: 10 }}>
          Irreversible. Deletes all your data — friends, rooms, messages, watchlist. Your handle{" "}
          <strong>{user.username}#{user.discriminator}</strong> becomes available for anyone to take again immediately.
          Type your username (<strong>{user.username}</strong>) to confirm.
        </div>
        <input type="text" value={wipeConfirm} onChange={(e) => setWipeConfirm(e.target.value)} style={{ marginRight: 10 }} />
        <button className="btn btn-primary" style={{ background: "#e6392f" }} disabled={wipeConfirm !== user.username || busy} onClick={doWipe}>
          {busy ? "Deleting…" : "Delete My Account Forever"}
        </button>
      </div>
    </div>
  );
}
