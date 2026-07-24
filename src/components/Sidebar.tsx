import React from "react";

export type NavKey = "home" | "live" | "search" | "settings";

const ITEMS: { key: NavKey; icon: string; label: string }[] = [
  { key: "home", icon: "⌂", label: "Home" },
  { key: "live", icon: "▶", label: "Live TV" },
  { key: "search", icon: "⌕", label: "Search" },
  { key: "settings", icon: "⚙", label: "Settings" }
];

export default function Sidebar({ active, onSelect }: { active: NavKey; onSelect: (k: NavKey) => void }) {
  return (
    <div className="sidebar">
      <div className="logo">S</div>
      <nav>
        {ITEMS.map((item) => (
          <div
            key={item.key}
            className={"nav-item" + (active === item.key ? " active" : "")}
            title={item.label}
            onClick={() => onSelect(item.key)}
          >
            {item.icon}
          </div>
        ))}
      </nav>
    </div>
  );
}
