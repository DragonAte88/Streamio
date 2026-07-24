import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { SETTINGS_TABS } from "../lib/navConfig";

export default function Settings() {
  return (
    <div className="settings-shell">
      <div className="settings-nav">
        {SETTINGS_TABS.map((t) => (
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
