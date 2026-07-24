import React from "react";
import { NavLink } from "react-router-dom";
import { TabItem } from "../lib/navConfig";

export default function SectionTabs({ tabs, end }: { tabs: TabItem[]; end?: boolean }) {
  return (
    <div className="section-tabs">
      {tabs.map((t) => (
        <NavLink key={t.path} to={t.path} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
