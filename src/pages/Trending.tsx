import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionTabs from "../components/SectionTabs";
import { BROWSE_TABS } from "../lib/navConfig";

interface Anime {
  mal_id: number;
  title: string;
  images: {
    jpg: { image_url: string; large_image_url: string };
  };
  score: number;
  year: number;
}

export default function Trending() {
  const [trending, setTrending] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetch("https://api.jikan.moe/v4/top/anime?filter=bypopularity&limit=24")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch trending anime");
        return res.json();
      })
      .then((data) => {
        setTrending(data.data || []);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <>
      <SectionTabs tabs={BROWSE_TABS} end />
      
      <div className="row-section">
        <div className="row-title">Global Trending (Powered by MyAnimeList)</div>
        
        {loading && <p style={{ color: "var(--text-dim)", padding: "0 40px" }}>Loading trending algorithm...</p>}
        {error && <p style={{ color: "var(--danger)", padding: "0 40px" }}>{error}</p>}
        
        {!loading && !error && (
          <div className="row-scroll" style={{ flexWrap: "wrap", padding: "0 40px" }}>
            {trending.map((anime) => (
              <div 
                key={anime.mal_id} 
                className="card" 
                style={{ 
                  backgroundImage: `url(${anime.images.jpg.large_image_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center"
                }} 
                onClick={() => {
                  // Route to KidsShow (which is our WCO browser) using the anime's English/Romaji title
                  navigate("/kids/show", { state: { title: anime.title, url: "" } });
                }}
              >
                <div className="card-group" style={{ background: "rgba(0,0,0,0.8)" }}>
                  ★ {anime.score || "N/A"} {anime.year ? `• ${anime.year}` : ""}
                </div>
                <div className="card-label" style={{ background: "rgba(0,0,0,0.8)", textShadow: "none" }}>
                  {anime.title}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
