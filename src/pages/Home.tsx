import React from "react";
import HeroBanner from "../components/HeroBanner";
import ContentRow from "../components/ContentRow";
import SectionTabs from "../components/SectionTabs";
import { useCatalog } from "../lib/CatalogContext";
import { usePlayback } from "../lib/PlaybackContext";
import { BROWSE_TABS } from "../lib/navConfig";

export default function Home() {
  const { channels, groups, loading } = useCatalog();
  const { play } = usePlayback();
  const featured = channels[0];

  return (
    <>
      <SectionTabs tabs={BROWSE_TABS} end />
      {loading ? (
        <div className="empty-state">Loading catalog…</div>
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
