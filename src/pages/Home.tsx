import React from "react";
import HeroBanner from "../components/HeroBanner";
import ContentRow from "../components/ContentRow";
import { useCatalog } from "../lib/CatalogContext";
import { usePlayback } from "../lib/PlaybackContext";

export default function Home() {
  const { channels, groups, loading } = useCatalog();
  const { play } = usePlayback();
  const featured = channels[0];

  if (loading) return <div className="empty-state">Loading catalog…</div>;

  return (
    <>
      <HeroBanner channel={featured} onPlay={play} />
      {groups.map((g) => (
        <ContentRow key={g.name} title={g.name} channels={g.channels} onSelect={play} />
      ))}
    </>
  );
}
