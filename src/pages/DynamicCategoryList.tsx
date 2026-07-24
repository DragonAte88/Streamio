import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionTabs from "../components/SectionTabs";
import { BROWSE_TABS } from "../lib/navConfig";
import { Channel } from "../lib/playlist";
import { fetchRemoteM3u } from "../lib/m3uFetcher";
import { usePlayback } from "../lib/PlaybackContext";
import ArtworkCard from "../components/ArtworkCard";

interface DynamicCategoryListProps {
  title: string;
  urls: { url: string; group: string }[];
  wcoTypes?: string[];
}

export default function DynamicCategoryList({ title, urls, wcoTypes }: DynamicCategoryListProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [wcoItems, setWcoItems] = useState<{title: string, url: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const { play } = usePlayback();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setLoading(true);

    async function loadData() {
      const allResults = await Promise.all(
        urls.map(u => fetchRemoteM3u(u.url, u.group))
      );
      
      let fetchedWco: {title: string, url: string}[] = [];
      if (wcoTypes && wcoTypes.length > 0) {
          const wcoResults = await Promise.all(wcoTypes.map(t => window.wco.getList(t)));
          fetchedWco = wcoResults.flat().sort((a,b) => a.title.localeCompare(b.title));
      }

      if (active) {
        // Flatten and sort alphabetically
        const flat = allResults.flat().sort((a, b) => a.name.localeCompare(b.name));
        setChannels(flat);
        setWcoItems(fetchedWco);
        setLoading(false);
      }
    }
    loadData();

    return () => { active = false; };
  }, [title, urls, wcoTypes]);

  return (
    <>
      <SectionTabs tabs={BROWSE_TABS} end />
      <div className="row-section">
        <div className="row-title">{title} Channels</div>
        
        {loading && <p style={{ color: "var(--text-dim)", padding: "0 40px" }}>Fetching latest content...</p>}
        
        {!loading && (
          <>
          {wcoItems.length > 0 && (
             <div style={{ padding: "0 40px" }}>
                <h3 style={{ marginBottom: 16 }}>On Demand (WCO)</h3>
                <div className="row-scroll" style={{ flexWrap: "wrap", padding: "0", marginBottom: 32 }}>
                  {wcoItems.map((ch, i) => (
                    <ArtworkCard 
                      key={`wco-${i}`} 
                      name={ch.title} 
                      group="VOD" 
                      onClick={() => navigate("/kids/show", { state: { title: ch.title, url: ch.url } })} 
                      kind={title === "Movies" ? "movie" : "tv"} 
                    />
                  ))}
                </div>
             </div>
          )}

          {channels.length > 0 && (
              <div style={{ padding: "0 40px" }}>
                  <h3 style={{ marginBottom: 16 }}>Live TV</h3>
                  <div className="row-scroll" style={{ flexWrap: "wrap", padding: "0" }}>
                    {channels.map((ch) => (
                      <ArtworkCard 
                        key={ch.id} 
                        name={ch.name} 
                        group={ch.group} 
                        defaultLogo={ch.logo} 
                        onClick={() => play(ch)} 
                        kind={title === "Movies" ? "movie" : "tv"} 
                      />
                    ))}
                  </div>
              </div>
          )}
          </>
        )}
      </div>
    </>
  );
}
