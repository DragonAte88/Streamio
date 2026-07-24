const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

const TMDB_KEY = process.env.TMDB_API_KEY;
const OMDB_KEY = process.env.OMDB_API_KEY;
const FANART_KEY = process.env.FANART_API_KEY;

// 1. Title Noise Cleaner
function cleanTitleNoise(rawName) {
  let cleaned = String(rawName || "");
  
  // Remove [bracketed] tags
  cleaned = cleaned.replace(/\[.*?\]/g, "");
  
  // Remove (parenthetical) tags (years, dub studios, etc.)
  cleaned = cleaned.replace(/\(.*?\)/g, "");
  
  // Strip common release quality / scene tags
  const tags = [
    "1080p", "720p", "480p", "4k", "bluray", "brrip", "web-dl", 
    "webrip", "hdtv", "dvdrip", "hdrip", "x264", "x265", "hevc", "aac"
  ];
  const tagRegex = new RegExp(`\\b(?:${tags.join("|")})\\b`, "gi");
  cleaned = cleaned.replace(tagRegex, "");
  
  // Replace dots and underscores with spaces
  cleaned = cleaned.replace(/[._]/g, " ");
  
  // Condense spaces
  return cleaned.replace(/\s+/g, " ").trim();
}

// 2. HTTP HEAD image verification
async function verifyImage(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "HEAD", timeout: 3000 });
    return res.ok && res.headers.get("content-type")?.startsWith("image/");
  } catch (err) {
    return false;
  }
}

// 3. API Lookups
async function tmdbSearchTv(query) {
  if (!TMDB_KEY) return null;
  const url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0] || null;
}

async function tmdbSearchMovie(query) {
  if (!TMDB_KEY) return null;
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0] || null;
}

async function tmdbGetExternalIds(tmdbId, kind) {
  if (!TMDB_KEY) return null;
  // kind: "tv" or "movie"
  const url = `https://api.themoviedb.org/3/${kind}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

async function fanartTvLookup(tvdbId, kind) {
  if (!FANART_KEY || !tvdbId) return null;
  const url = `https://webservice.fanart.tv/v3/${kind}/${tvdbId}?api_key=${FANART_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    
    // Grab the most liked poster
    let poster = null;
    let bg = null;

    if (kind === "tv") {
      const posters = [...(data.tvposter || []), ...(data.seasonposter || [])].sort((a, b) => b.likes - a.likes);
      if (posters.length > 0) poster = posters[0].url;
      const bgs = [...(data.showbackground || [])].sort((a, b) => b.likes - a.likes);
      if (bgs.length > 0) bg = bgs[0].url;
    } else {
      const posters = [...(data.movieposter || [])].sort((a, b) => b.likes - a.likes);
      if (posters.length > 0) poster = posters[0].url;
      const bgs = [...(data.moviebackground || [])].sort((a, b) => b.likes - a.likes);
      if (bgs.length > 0) bg = bgs[0].url;
    }
    
    return { poster, bg };
  } catch (err) {
    return null;
  }
}

async function tvmazeLookup(query) {
  const url = `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.image?.original || data.image?.medium || null;
  } catch (err) {
    return null;
  }
}

async function omdbFallback(title) {
  if (!OMDB_KEY) return null;
  const res = await fetch(`https://www.omdbapi.com/?apikey=${OMDB_KEY}&t=${encodeURIComponent(title)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.Poster && data.Poster !== "N/A" ? data.Poster : null;
}

// Progressive truncation search
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

router.get("/search", async (req, res) => {
  const { title: rawTitle, kind } = req.query;
  if (!rawTitle) return res.status(400).json({ error: "title required" });

  const searchKind = kind === "movie" ? "movie" : "tv";
  const cleanedTitle = cleanTitleNoise(String(rawTitle));
  const cacheKey = `${searchKind}:${cleanedTitle.toLowerCase()}`;

  try {
    // 1. Check DB Cache
    const cached = await pool.query("SELECT * FROM artwork_cache WHERE query_key = $1", [cacheKey]);
    if (cached.rows.length > 0) {
      return res.json({
        title: rawTitle,
        resolvedName: cached.rows[0].resolved_name,
        tmdbId: cached.rows[0].tmdb_id,
        overview: cached.rows[0].overview,
        poster: cached.rows[0].poster_url,
        background: cached.rows[0].background_url,
        source: cached.rows[0].source
      });
    }

    // 2. Resolve via TMDB with truncation
    let tmdbHit = await resolveTitle(cleanedTitle, searchKind);
    let posterUrl = null;
    let bgUrl = null;
    let source = null;

    if (tmdbHit) {
      posterUrl = tmdbHit.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbHit.poster_path}` : null;
      bgUrl = tmdbHit.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tmdbHit.backdrop_path}` : null;
      source = "tmdb";

      // 3. Upgrade to FanartTV if possible
      const extIds = await tmdbGetExternalIds(tmdbHit.id, searchKind);
      const extId = searchKind === "tv" ? extIds?.tvdb_id : tmdbHit.id; // Fanart uses TMDB id for movies
      
      if (extId) {
        const fanart = await fanartTvLookup(extId, searchKind === "tv" ? "tv" : "movies");
        if (fanart) {
          if (fanart.poster && await verifyImage(fanart.poster)) {
            posterUrl = fanart.poster;
            source = "fanart";
          }
          if (fanart.bg && await verifyImage(fanart.bg)) {
            bgUrl = fanart.bg;
          }
        }
      }
    }

    // 4. TVmaze fallback (for TV only)
    if (!posterUrl && searchKind === "tv") {
      const tvmazePoster = await tvmazeLookup(cleanedTitle);
      if (tvmazePoster && await verifyImage(tvmazePoster)) {
        posterUrl = tvmazePoster;
        source = "tvmaze";
      }
    }

    // 5. OMDb Fallback
    if (!posterUrl) {
      const omdbPoster = await omdbFallback(cleanedTitle);
      if (omdbPoster && await verifyImage(omdbPoster)) {
        posterUrl = omdbPoster;
        source = "omdb";
      }
    }

    // Verify TMDB poster if we settled on it
    if (source === "tmdb" && posterUrl && !(await verifyImage(posterUrl))) {
      posterUrl = null;
      source = null;
    }

    const result = {
      title: rawTitle,
      resolvedName: tmdbHit?.name || tmdbHit?.title || null,
      tmdbId: tmdbHit?.id || null,
      overview: tmdbHit?.overview || null,
      poster: posterUrl,
      background: bgUrl,
      source
    };

    // 6. Save to DB Cache
    await pool.query(
      `INSERT INTO artwork_cache 
       (query_key, title, resolved_name, tmdb_id, overview, poster_url, background_url, source) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (query_key) DO UPDATE SET
       resolved_name = EXCLUDED.resolved_name, poster_url = EXCLUDED.poster_url`,
      [cacheKey, rawTitle, result.resolvedName, result.tmdbId, result.overview, result.poster, result.background, result.source]
    );

    res.json(result);
  } catch (e) {
    console.error("[artwork] resolve failed", e);
    res.status(502).json({ error: "artwork lookup failed" });
  }
});

module.exports = router;
