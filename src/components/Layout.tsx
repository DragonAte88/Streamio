import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { NAV_GROUPS } from "../lib/navConfig";
import { useAuth } from "../lib/auth";
import { usePlayback } from "../lib/PlaybackContext";
import PlayerView from "./PlayerView";

export default function Layout() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { playing, close } = usePlayback();

  return (
    <div className="top-shell">
      <div className="sidebar">
        <div className="logo" onClick={() => nav("/home")} style={{ cursor: "pointer" }}>S</div>
        <nav>
          <div className="nav-item" title="Home" onClick={() => nav("/home")}>⌂</div>
          <div className="nav-item" title="Search" onClick={() => nav("/search")}>⌕</div>
          <div className="nav-item" title="Account" onClick={() => nav(user ? "/settings/account" : "/login")}>
            {user ? (user.display_name || user.email)[0].toUpperCase() : "◯"}
          </div>
        </nav>
      </div>

      <div className="side-panel">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="nav-group-label">{group.label}</div>
            {group.items.map((item) => (
              <NavLink key={item.path} to={item.path} className={({ isActive }) => (isActive ? "active" : "")}>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="main-content">
        <Outlet />
        {playing && <PlayerView channel={playing} onClose={close} />}
      </div>
    </div>
  );
}
