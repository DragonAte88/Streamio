import React, { useEffect, useState, useRef } from "react";
import { fetchArtwork } from "../lib/api";

interface WcoCardProps {
  title: string;
  url: string;
  kind?: "tv" | "movie";
  onClick: () => void;
}

/**
 * A card for WCO content (anime, cartoons, movies) that lazy-loads
 * artwork from the backend /artwork/search API using IntersectionObserver
 * so we only fetch what's visible on screen.
 */
export default function WcoCard({ title, url, kind = "tv", onClick }: WcoCardProps) {
  const [poster, setPoster] = useState<string | null>(null);
  const [overview, setOverview] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !fetchedRef.current) {
          fetchedRef.current = true;
          observer.disconnect();
          // Determine kind from title hints if not set
          const effectiveKind =
            kind === "movie" ||
            title.toLowerCase().includes("movie") ||
            title.toLowerCase().includes("film")
              ? "movie"
              : "tv";

          fetchArtwork(title, effectiveKind).then((art) => {
            if (art?.poster) setPoster(art.poster);
            if (art?.overview) setOverview(art.overview);
            setLoaded(true);
          });
        }
      },
      { rootMargin: "200px" } // Start loading slightly before visible
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [title, kind]);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: 160,
        height: 240,
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        flexShrink: 0,
        background: poster ? `url(${poster}) center/cover no-repeat` : "var(--bg-card)",
        border: hovered ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "border-color 0.15s, transform 0.15s",
        transform: hovered ? "scale(1.04)" : "scale(1)",
        boxShadow: hovered ? "0 8px 32px rgba(0,0,0,0.5)" : "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      {/* Gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: poster
            ? "linear-gradient(to top, rgba(0,0,0,0.9) 40%, rgba(0,0,0,0.1) 100%)"
            : "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(20,20,30,0.95) 100%)",
        }}
      />

      {/* Placeholder icon if no poster loaded yet */}
      {!poster && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -60%)",
            fontSize: 40,
            opacity: 0.25,
          }}
        >
          🎬
        </div>
      )}

      {/* Title and badge */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "10px 10px 12px",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--accent)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 4,
          }}
        >
          On Demand
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#fff",
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {title}
        </div>
      </div>

      {/* Hover overlay with overview */}
      {hovered && overview && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(10,10,18,0.92)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 6, textTransform: "uppercase" }}>
            {title}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.75)",
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 6,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {overview}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              fontWeight: 700,
              color: "var(--accent)",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            ▶ View Episodes
          </div>
        </div>
      )}
    </div>
  );
}
