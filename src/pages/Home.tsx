import React, { useState, useEffect } from "react";
import HeroBanner from "../components/HeroBanner";
import ContentRow from "../components/ContentRow";
import RecommendedRows from "../components/RecommendedRows";
import WcoCard from "../components/WcoCard";
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

          {/* Personalised + social rows: Continue Watching, For You, Friends
              are watching, taste-based categories, Recently Watched. Renders
              nothing when there is no real signal to build them from. */}
          <RecommendedRows />

          {wcoCartoons.length > 0 && (
            <div className="row-section">
              <div className="row-title">Popular Cartoons (On Demand)</div>
              <div className="row-scroll" style={{ gap: 12 }}>
                {wcoCartoons.map((c, i) => (
                  <WcoCard key={`wco-c-${i}`} title={c.title} url={c.url} kind="tv"
                    onClick={() => navigate("/kids/show", { state: { title: c.title, url: c.url } })} />
                ))}
              </div>
            </div>
          )}

          {wcoDubs.length > 0 && (
            <div className="row-section">
              <div className="row-title">Dubbed Anime (On Demand)</div>
              <div className="row-scroll" style={{ gap: 12 }}>
                {wcoDubs.map((c, i) => (
                  <WcoCard key={`wco-d-${i}`} title={c.title} url={c.url} kind="tv"
                    onClick={() => navigate("/kids/show", { state: { title: c.title, url: c.url } })} />
                ))}
              </div>
            </div>
          )}

          {wcoSubs.length > 0 && (
            <div className="row-section">
              <div className="row-title">Subbed Anime (On Demand)</div>
              <div className="row-scroll" style={{ gap: 12 }}>
                {wcoSubs.map((c, i) => (
                  <WcoCard key={`wco-s-${i}`} title={c.title} url={c.url} kind="tv"
                    onClick={() => navigate("/kids/show", { state: { title: c.title, url: c.url } })} />
                ))}
              </div>
            </div>
          )}

          {wcoMovies.length > 0 && (
            <div className="row-section">
              <div className="row-title">Movies (On Demand)</div>
              <div className="row-scroll" style={{ gap: 12 }}>
                {wcoMovies.map((c, i) => (
                  <WcoCard key={`wco-m-${i}`} title={c.title} url={c.url} kind="movie"
                    onClick={() => navigate("/kids/show", { state: { title: c.title, url: c.url } })} />
                ))}
              </div>
            </div>
          )}

          {groups.map((g) => (
            <ContentRow key={g.name} title={g.name} channels={g.channels} onSelect={play} />
          ))}
        </>
      )}
    </>
  );
}
