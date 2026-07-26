import React, { useEffect, useState, useRef } from "react";
import { artworkManager } from "../lib/artworkQueue";

interface WcoCardProps {
  title: string;
  url: string;
  kind?: "tv" | "movie";
  onClick: () => void;
}

/**
 * A card for WCO content (anime, cartoons, movies) that lazy-loads
 * artwork using the persistent ArtworkManager with anti-crash error handling.
 */
export default function WcoCard({ title, url, kind = "tv", onClick }: WcoCardProps) {
  const [poster, setPoster] = useState<string | null>(null);
  const [overview, setOverview] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const effectiveKind =
      kind === "movie" ||
      title.toLowerCase().includes("movie") ||
      title.toLowerCase().includes("film")
        ? "movie"
        : "tv";

    // Immediate check from memory/disk cache
    const cached = artworkManager.getCached(title, effectiveKind);
    if (cached) {
      if (cached.poster) setPoster(cached.poster);
      if (cached.overview) setOverview(cached.overview);
      setLoaded(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !fetchedRef.current) {
          fetchedRef.current = true;
          observer.disconnect();

          artworkManager
            .getArtwork(title, effectiveKind)
            .then((art) => {
              if (art?.poster) setPoster(art.poster);
              if (art?.overview) setOverview(art.overview);
              setLoaded(true);
            })
            .catch(() => {
              setLoaded(true);
            });
        }
      },
      { rootMargin: "250px" } // Pre-fetch slightly before scroll position
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [title, kind]);

  const hasValidPoster = poster && !imgError;

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
        backgroundColor: "#161622",
        backgroundImage: hasValidPoster ? `url(${poster})` : "none",
        backgroundPosition: "center",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        border: hovered ? "2px solid var(--accent, #6366f1)" : "2px solid rgba(255,255,255,0.06)",
        transition: "border-color 0.15s, transform 0.15s, box-shadow 0.15s",
        transform: hovered ? "scale(1.04) translateY(-2px)" : "scale(1)",
        boxShadow: hovered ? "0 12px 32px rgba(99,102,241,0.3)" : "0 2px 8px rgba(0,0,0,0.4)",
      }}
    >
      {/* Fallback image tag with error trapping to prevent broken image crashes */}
      {poster && (
        <img
          src={poster}
          alt=""
          onError={() => setImgError(true)}
          style={{ display: "none" }}
        />
      )}

      {/* Glossy gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: hasValidPoster
            ? "linear-gradient(to top, rgba(10,10,15,0.92) 25%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.05) 100%)"
            : "linear-gradient(to top, rgba(10,10,20,0.95) 0%, rgba(25,25,40,0.9) 100%)",
        }}
      />

      {/* Decorative glass shine */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "45%",
          background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Title & metadata footer */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 10px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          zIndex: 2,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            lineHeight: "1.25em",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
          }}
        >
          {title}
        </div>

        {overview && (
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.6)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: "1.2em",
            }}
          >
            {overview}
          </div>
        )}
      </div>

      {/* Placeholder icon when no poster available */}
      {!hasValidPoster && (
        <div
          style={{
            position: "absolute",
            top: "40%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: 36,
            opacity: 0.35,
            pointerEvents: "none",
          }}
        >
          🎬
        </div>
      )}
    </div>
  );
}
