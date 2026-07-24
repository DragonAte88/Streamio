import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { updateProfile } from "../lib/api";

const AVATAR_PRESETS = ["🦊", "🐼", "🐧", "🦉", "🐙", "🦁", "🐺", "🐸"];

export default function Setup() {
  const { user, token, setUser } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [username, setUsername] = useState(user?.username || "");
  const [avatar, setAvatar] = useState(AVATAR_PRESETS[0]);
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user || !token) {
    nav("/login");
    return null;
  }

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateProfile(token, {
        displayName: displayName || undefined,
        username: username || undefined,
        avatarUrl: avatar,
        bio: bio || undefined,
        onboarded: true
      });
      setUser(updated);
      nav("/home");
    } catch (err: any) {
      setError(err.message || "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ width: 460 }}>
        <div className="auth-logo">S</div>
        <div className="auth-title">Welcome to Streamio</div>
        <div className="auth-sub">Let's set up your profile — {step + 1} of 3</div>
        {error && <div className="form-error">{error}</div>}

        {step === 0 && (
          <>
            <div className="field">
              <label>Display name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} placeholder="unique, no spaces" />
            </div>
          </>
        )}

        {step === 1 && (
          <div className="field">
            <label>Profile picture</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              {AVATAR_PRESETS.map((a) => (
                <button
                  type="button"
                  key={a}
                  onClick={() => setAvatar(a)}
                  style={{
                    width: 48,
                    height: 48,
                    fontSize: 22,
                    borderRadius: 12,
                    border: avatar === a ? "2px solid var(--accent)" : "1px solid #2a2a35",
                    background: "#16161d",
                    cursor: "pointer"
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="field">
            <label>Short bio (optional)</label>
            <input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What do you watch?" />
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {step > 0 && (
            <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < 2 ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)} style={{ flex: 1, justifyContent: "center" }}>
              Next
            </button>
          ) : (
            <button className="btn btn-primary" onClick={finish} disabled={busy} style={{ flex: 1, justifyContent: "center" }}>
              {busy ? "Saving…" : "Finish"}
            </button>
          )}
        </div>
        {step === 0 && (
          <div className="auth-switch">
            <a onClick={finish}>Skip for now</a>
          </div>
        )}
      </div>
    </div>
  );
}
