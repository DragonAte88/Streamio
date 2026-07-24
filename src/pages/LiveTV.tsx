import React from "react";
import ContentRow from "../components/ContentRow";
import SectionTabs from "../components/SectionTabs";
import { useCatalog } from "../lib/CatalogContext";
import { usePlayback } from "../lib/PlaybackContext";
import { BROWSE_TABS } from "../lib/navConfig";

export default function LiveTV() {
  const { groups, loading } = useCatalog();
  const { play } = usePlayback();

  return (
    <>
      <SectionTabs tabs={BROWSE_TABS} end />
      <div style={{ paddingTop: 16 }}>
        {loading ? (
          <div className="empty-state">Loading catalog…</div>
        ) : (
          groups.map((g) => <ContentRow key={g.name} title={g.name} channels={g.channels} onSelect={play} />)
        )}
      </div>
    </>
  );
}
