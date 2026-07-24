import React from "react";
import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { path: "general", label: "General" },
  { path: "playback", label: "Playback" },
  { path: "appearance", label: "Appearance" },
  { path: "account", label: "Account" },
  { path: "backend", label: "Backend / Sync" },
  { path: "discord", label: "Discord" },
  { path: "subtitles", label: "Subtitles" },
  { path: "audio", label: "Audio" },
  { path: "parental", label: "Parental Controls" },
  { path: "notifications", label: "Notifications" },
  { path: "shortcuts", label: "Keyboard Shortcuts" },
  { path: "about", label: "About" }
];

export default function Settings() {
  return (
    <div className="settings-shell">
      <div className="settings-nav">
        {TABS.map((t) => (
          <NavLink key={t.path} to={`/settings/${t.path}`} className={({ isActive }) => (isActive ? "active" : "")}>
            {t.label}
          </NavLink>
        ))}
      </div>
      <div className="settings-body">
        <Outlet />
      </div>
    </div>
  );
}
