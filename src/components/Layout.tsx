import React, { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { usePlayback } from "../lib/PlaybackContext";
import PlayerView from "./PlayerView";

const NAV = [
  { path: "/home", label: "Home", icon: "🏠" },
  { path: "/search", label: "Search", icon: "🔍" },
  { path: "/library", label: "Your Library", icon: "📚" },
  { path: "/social", label: "Social", icon: "💬" },
  { path: "/settings/general", label: "Settings", icon: "⚙️" }
];

export default function Layout() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { playing, close } = usePlayback();

  useEffect(() => {
    if (user && !user.onboarded) nav("/setup");
  }, [user]);

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
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-account" onClick={() => nav(user ? "/settings/account" : "/login")}>
          <div className="nav-item-icon avatar">
            {user ? user.avatar_url || (user.display_name || user.email)[0].toUpperCase() : "👤"}
          </div>
          <span className="nav-item-label">{user ? user.display_name || user.username || user.email : "Sign In"}</span>
        </div>
      </div>

      <div className="main-content">
        <Outlet />
        {playing && <PlayerView channel={playing} onClose={close} />}
      </div>
    </div>
  );
}
