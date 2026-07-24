import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { usePlayback } from "../lib/PlaybackContext";
import PlayerView from "./PlayerView";
import StatusDot, { STATUS_LABELS } from "./StatusDot";
import { setPresence, fetchInvites, PresenceStatus } from "../lib/api";

const NAV = [
  { path: "/home", label: "Home", icon: "🏠" },
  { path: "/search", label: "Search", icon: "🔍" },
  { path: "/library", label: "Your Library", icon: "📚" },
  { path: "/social", label: "Social", icon: "💬" },
  { path: "/settings/general", label: "Settings", icon: "⚙️" }
];

const STATUS_OPTIONS: PresenceStatus[] = ["online", "idle", "dnd", "invisible", "offline"];

export default function Layout() {
  const nav = useNavigate();
  const { user, token, setUser } = useAuth();
  const { playing, close } = usePlayback();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [inviteCount, setInviteCount] = useState(0);

  useEffect(() => {
    if (user && !user.onboarded) nav("/setup");
  }, [user]);

  useEffect(() => {
    if (!token) return;
    const load = () => fetchInvites(token).then((invites) => setInviteCount(invites.length));
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [token]);

  const changeStatus = async (status: PresenceStatus) => {
    if (!token || !user) return;
    await setPresence(token, status);
    setUser({ ...user, status });
    setStatusMenuOpen(false);
  };

  return (
    <div className="top-shell">
      <div className="sidebar">
        <div className="logo" onClick={() => nav("/home")}>S</div>
        <nav>
          {NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-item-label">{item.label}</span>
              {item.path === "/social" && inviteCount > 0 && <span className="nav-badge">{inviteCount}</span>}
            </NavLink>
          ))}
          {user?.role === "admin" && (
            <NavLink to="/admin/users" className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
              <span className="nav-item-icon">🛠️</span>
              <span className="nav-item-label">Admin</span>
            </NavLink>
          )}
        </nav>

        <div style={{ position: "relative" }}>
          {statusMenuOpen && user && (
            <div className="status-menu">
              {STATUS_OPTIONS.map((s) => (
                <div key={s} className="status-menu-item" onClick={() => changeStatus(s)}>
                  <StatusDot status={s} />
                  {STATUS_LABELS[s]}
                </div>
              ))}
            </div>
          )}
          <div className="sidebar-account" onClick={() => (user ? setStatusMenuOpen((v) => !v) : nav("/login"))}>
            <div style={{ position: "relative" }}>
              <div className="nav-item-icon avatar">
                {user ? user.avatar_url || (user.display_name || user.email)[0].toUpperCase() : "👤"}
              </div>
              {user && (
                <div style={{ position: "absolute", right: -2, bottom: -2 }}>
                  <StatusDot status={user.status} size={10} />
                </div>
              )}
            </div>
            <span className="nav-item-label">
              {user ? (
                <>
                  {user.display_name || user.username}
                  {user.username && <span style={{ opacity: 0.5 }}>#{user.discriminator}</span>}
                </>
              ) : (
                "Sign In"
              )}
            </span>
          </div>
        </div>
      </div>

      <div className={"main-content" + (playing ? " player-open" : "")}>
        <Outlet />
        {playing && <PlayerView channel={playing} onClose={close} />}
      </div>
    </div>
  );
}
