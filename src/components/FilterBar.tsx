import React from "react";
import { Channel } from "../lib/playlist";

export type SortMode = "none" | "az" | "za" | "rating";

export interface FilterState {
  genre: string;
  sort: SortMode;
}

export function applyFilters(channels: Channel[], groupNames: string[], filters: FilterState): Channel[] | null {
  const active = filters.genre !== "all" || filters.sort !== "none";
  if (!active) return null;

  let result = filters.genre === "all" ? [...channels] : channels.filter((c) => c.group === filters.genre);

  if (filters.sort === "az") result.sort((a, b) => a.name.localeCompare(b.name));
  else if (filters.sort === "za") result.sort((a, b) => b.name.localeCompare(a.name));
  else if (filters.sort === "rating") {
    // No rating data exists in the catalog yet - falls back to A-Z so the
    // control is never silently a no-op, but this isn't a real rating sort.
    result.sort((a, b) => a.name.localeCompare(b.name));
  }

  return result;
}

export default function FilterBar({
  groupNames,
  filters,
  onChange
}: {
  groupNames: string[];
  filters: FilterState;
  onChange: (f: FilterState) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "16px 48px 0", alignItems: "center" }}>
      <select
        value={filters.genre}
        onChange={(e) => onChange({ ...filters, genre: e.target.value })}
        style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #2a2a35", background: "#16161d", color: "#f4f4f6" }}
      >
        <option value="all">All Genres</option>
        {groupNames.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>

      <select
        value={filters.sort}
        onChange={(e) => onChange({ ...filters, sort: e.target.value as SortMode })}
        style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #2a2a35", background: "#16161d", color: "#f4f4f6" }}
      >
        <option value="none">Default order</option>
        <option value="az">A → Z</option>
        <option value="za">Z → A</option>
        <option value="rating">Rating (no data yet — falls back to A→Z)</option>
      </select>

      {(filters.genre !== "all" || filters.sort !== "none") && (
        <button className="btn btn-secondary" onClick={() => onChange({ genre: "all", sort: "none" })}>
          Clear filters
        </button>
      )}
    </div>
  );
}
