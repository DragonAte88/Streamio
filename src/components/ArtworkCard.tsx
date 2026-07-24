import React, { useEffect, useState, useRef } from "react";
import { API_BASE } from "../lib/api";

interface ArtworkCardProps {
  name: string;
  group: string;
  defaultLogo?: string;
  onClick: () => void;
  kind?: "tv" | "movie";
}

export default function ArtworkCard({ name, group, defaultLogo, onClick, kind = "tv" }: ArtworkCardProps) {
  const [bgImage, setBgImage] = useState<string | undefined>(defaultLogo);
  const [loading, setLoading] = useState(!defaultLogo);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (defaultLogo) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          
          fetch(`${API_BASE}/artwork/search?title=${encodeURIComponent(name)}&kind=${kind}`)
            .then(res => res.json())
            .then(data => {
              if (data.poster) setBgImage(data.poster);
              else if (data.background) setBgImage(data.background);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
        }
      },
      { rootMargin: "200px" } // Pre-load slightly before coming into view
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [name, defaultLogo, kind]);

  return (
    <div 
      ref={ref}
      className="card" 
      onClick={onClick}
      style={{
        backgroundImage: bgImage ? `url(${bgImage})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: bgImage ? undefined : "#1e1e28"
      }}
    >
      <div className="card-group" style={{ background: "rgba(0,0,0,0.8)" }}>{group}</div>
      <div className="card-label" style={{ background: "rgba(0,0,0,0.8)", textShadow: "none" }}>{name}</div>
    </div>
  );
}
