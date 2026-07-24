import React, { useState, useEffect } from "react";
import HeroBanner from "../components/HeroBanner";
import ContentRow from "../components/ContentRow";
import SectionTabs from "../components/SectionTabs";
import FilterBar, { applyFilters, FilterState } from "../components/FilterBar";
import { useCatalog } from "../lib/CatalogContext";
import { usePlayback } from "../lib/PlaybackContext";
import { BROWSE_TABS } from "../lib/navConfig";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const { channels, groups, loading } = useCatalog();
  const { play } = usePlayback();
  const navigate = useNavigate();
  const featured = channels[0];
  const [filters, setFilters] = useState<FilterState>({ genre: "all", sort: "none" });

  const [wcoCartoons, setWcoCartoons] = useState<{title: string, url: string}[]>([]);
  const [wcoDubs, setWcoDubs] = useState<{title: string, url: string}[]>([]);
  const [wcoSubs, setWcoSubs] = useState<{title: string, url: string}[]>([]);
  const [wcoMovies, setWcoMovies] = useState<{title: string, url: string}[]>([]);

  useEffect(() => {
    window.wco.getList('cartoon').then(list => setWcoCartoons(list.slice(0, 24)));
    window.wco.getList('dub').then(list => setWcoDubs(list.slice(0, 24)));
    window.wco.getList('sub').then(list => setWcoSubs(list.slice(0, 24)));
    window.wco.getList('movie').then(list => setWcoMovies(list.slice(0, 24)));
  }, []);

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
          
          {wcoCartoons.length > 0 && (
            <ContentRow 
              title="Popular Cartoons (On Demand)" 
              channels={wcoCartoons.map((c, i) => ({ id: `wco-c-${i}`, name: c.title, url: c.url, group: "Cartoon" }))} 
              onSelect={(ch) => navigate("/kids/show", { state: { title: ch.name, url: ch.url } })} 
            />
          )}

          {wcoDubs.length > 0 && (
            <ContentRow 
              title="Dubbed Anime (On Demand)" 
              channels={wcoDubs.map((c, i) => ({ id: `wco-d-${i}`, name: c.title, url: c.url, group: "Anime Dub" }))} 
              onSelect={(ch) => navigate("/kids/show", { state: { title: ch.name, url: ch.url } })} 
            />
          )}

          {wcoSubs.length > 0 && (
            <ContentRow 
              title="Subbed Anime (On Demand)" 
              channels={wcoSubs.map((c, i) => ({ id: `wco-s-${i}`, name: c.title, url: c.url, group: "Anime Sub" }))} 
              onSelect={(ch) => navigate("/kids/show", { state: { title: ch.name, url: ch.url } })} 
            />
          )}

          {wcoMovies.length > 0 && (
            <ContentRow 
              title="Movies (On Demand)" 
              channels={wcoMovies.map((c, i) => ({ id: `wco-m-${i}`, name: c.title, url: c.url, group: "Movie" }))} 
              onSelect={(ch) => navigate("/kids/show", { state: { title: ch.name, url: ch.url } })} 
            />
          )}

          {groups.map((g) => (
            <ContentRow key={g.name} title={g.name} channels={g.channels} onSelect={play} />
          ))}
        </>
      )}
    </>
  );
}
