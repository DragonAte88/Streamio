import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";

export default function Account() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  if (!user) {
    return (
      <div>
        <h2>Account</h2>
        <p style={{ color: "var(--text-dim)" }}>You're not signed in.</p>
        <button className="btn btn-primary" onClick={() => nav("/login")}>Sign In</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Account</h2>
      <div className="setting-row">
        <div>
          <div className="setting-row-label">{user.display_name || user.email}</div>
          <div className="setting-row-desc">{user.email}</div>
        </div>
      </div>
      <button
        className="btn btn-secondary"
        style={{ marginTop: 16 }}
        onClick={() => {
          logout();
          nav("/login");
        }}
      >
        Sign Out
      </button>
    </div>
  );
}
