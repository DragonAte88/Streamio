import React from "react";
import ContentRow from "../components/ContentRow";
import { useCatalog } from "../lib/CatalogContext";
import { usePlayback } from "../lib/PlaybackContext";

export default function LiveTV() {
  const { groups, loading } = useCatalog();
  const { play } = usePlayback();

  if (loading) return <div className="empty-state">Loading catalog…</div>;

  return (
    <div style={{ paddingTop: 40 }}>
      {groups.map((g) => (
        <ContentRow key={g.name} title={g.name} channels={g.channels} onSelect={play} />
      ))}
    </div>
  );
}
