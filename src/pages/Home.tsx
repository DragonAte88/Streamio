import React, { useState } from "react";
import HeroBanner from "../components/HeroBanner";
import ContentRow from "../components/ContentRow";
import SectionTabs from "../components/SectionTabs";
import FilterBar, { applyFilters, FilterState } from "../components/FilterBar";
import { useCatalog } from "../lib/CatalogContext";
import { usePlayback } from "../lib/PlaybackContext";
import { BROWSE_TABS } from "../lib/navConfig";

export default function Home() {
  const { channels, groups, loading } = useCatalog();
  const { play } = usePlayback();
  const featured = channels[0];
  const [filters, setFilters] = useState<FilterState>({ genre: "all", sort: "none" });

  const filtered = applyFilters(channels, groups.map((g) => g.name), filters);

  return (
    <>
      <SectionTabs tabs={BROWSE_TABS} end />
      <FilterBar groupNames={groups.map((g) => g.name)} filters={filters} onChange={setFilters} />
      {loading ? (
        <div className="empty-state">Loading catalog…</div>
      ) : filtered ? (
        <div className="row-section">
          <div className="row-title">{filtered.length} result{filtered.length === 1 ? "" : "s"}</div>
          <div className="row-scroll" style={{ flexWrap: "wrap" }}>
            {filtered.map((ch) => (
              <div key={ch.id} className="card" style={ch.logo ? { backgroundImage: `url(${ch.logo})` } : undefined} onClick={() => play(ch)}>
                <div className="card-group">{ch.group}</div>
                <div className="card-label">{ch.name}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <HeroBanner channel={featured} onPlay={play} />
          {groups.map((g) => (
            <ContentRow key={g.name} title={g.name} channels={g.channels} onSelect={play} />
          ))}
        </>
      )}
    </>
  );
}
