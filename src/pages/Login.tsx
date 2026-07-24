import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { SuspendedAccountError, reactivateAccount } from "../lib/api";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suspended, setSuspended] = useState<{ token: string; email: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(email, password);
      nav(user.onboarded ? "/home" : "/setup");
    } catch (err: any) {
      if (err instanceof SuspendedAccountError) {
        setSuspended({ token: err.reactivateToken, email });
      } else {
        setError(err.message || "Login failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async () => {
    if (!suspended) return;
    setBusy(true);
    try {
      const res = await reactivateAccount(suspended.token);
      localStorage.setItem("streamio.auth.token", res.token);
      localStorage.setItem("streamio.auth.user", JSON.stringify(res.user));
      window.location.reload();
    } catch (err: any) {
      setError(err.message || "Reactivation failed");
    } finally {
      setBusy(false);
    }
  };

  if (suspended) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-logo">S</div>
          <div className="auth-title">Account Suspended</div>
          <div className="auth-sub">
            The account for {suspended.email} is temporarily suspended. You can reactivate it now, or leave it as is.
          </div>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary" onClick={reactivate} disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
            {busy ? "Reactivating…" : "Reactivate My Account"}
          </button>
          <div className="auth-switch">
            <a onClick={() => setSuspended(null)}>Back to sign in</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">S</div>
        <div className="auth-title">Sign in</div>
        <div className="auth-sub">Sync your watchlist, playlists, and history across devices.</div>
        {error && <div className="form-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <div className="auth-switch">
          No account? <Link to="/register">Create one</Link>
        </div>
        <div className="auth-switch">
          <Link to="/home">Continue without an account</Link>
        </div>
      </div>
    </div>
  );
}
