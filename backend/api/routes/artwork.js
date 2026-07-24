const express = require("express");
const router = express.Router();

const TMDB_KEY = process.env.TMDB_API_KEY;
const OMDB_KEY = process.env.OMDB_API_KEY;
const FANART_KEY = process.env.FANART_API_KEY;

const cache = new Map();

async function tmdbSearchTv(query) {
  const url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0] || null;
}

async function tmdbSearchMovie(query) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0] || null;
}

// Progressive truncation search, per FULL_PROJECT_DOCUMENTATION.md's resolver design:
// keep dropping trailing words until a match is found.
async function resolveTitle(rawTitle, kind) {
  const words = rawTitle.trim().split(/\s+/);
  const search = kind === "movie" ? tmdbSearchMovie : tmdbSearchTv;
  for (let n = words.length; n > 0; n--) {
    const attempt = words.slice(0, n).join(" ");
    const hit = await search(attempt);
    if (hit) return hit;
  }
  return null;
}

async function omdbFallback(title) {
  if (!OMDB_KEY) return null;
  const res = await fetch(`https://www.omdbapi.com/?apikey=${OMDB_KEY}&t=${encodeURIComponent(title)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.Poster && data.Poster !== "N/A" ? data.Poster : null;
}

router.get("/search", async (req, res) => {
  const { title, kind } = req.query;
  if (!title) return res.status(400).json({ error: "title required" });
  if (!TMDB_KEY) return res.status(503).json({ error: "artwork provider not configured" });

  const cacheKey = `${kind || "tv"}:${title.toLowerCase()}`;
  if (cache.has(cacheKey)) return res.json(cache.get(cacheKey));

  try {
    const hit = await resolveTitle(String(title), kind === "movie" ? "movie" : "tv");
    let poster = hit?.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : null;

    if (!poster) {
      poster = await omdbFallback(String(title));
    }

    const result = {
      title,
      resolvedName: hit?.name || hit?.title || null,
      tmdbId: hit?.id || null,
      overview: hit?.overview || null,
      poster,
      source: hit?.poster_path ? "tmdb" : poster ? "omdb" : null
    };
    cache.set(cacheKey, result);
    res.json(result);
  } catch (e) {
    console.error("[artwork] resolve failed", e);
    res.status(502).json({ error: "artwork lookup failed" });
  }
});

module.exports = router;
