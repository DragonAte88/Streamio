const { BrowserWindow, session } = require("electron");

// ─── Config ────────────────────────────────────────────────────────────────────

const BASE_URL   = "https://www.wcostream.tv";
const SEARCH_URL = `${BASE_URL}/?s=`; // GET-based search - more reliable than POST

// Longer waits - WCO is behind Cloudflare and loads slowly
const NAV_SETTLE_MS   = 5000;  // Wait after navigation before polling
const POLL_INTERVAL   = 600;   // Between DOM polls
const EPISODE_TIMEOUT = 20000; // Max time to find episodes
const SEARCH_TIMEOUT  = 15000; // Max time to find search results
const VIDEO_TIMEOUT   = 25000; // Max time to intercept stream URL

// ─── Window management ─────────────────────────────────────────────────────────

let scraperWin = null;
let navigating = false;

function init() {
  if (scraperWin && !scraperWin.isDestroyed()) return;

  scraperWin = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      // Use a persistent session so Cloudflare cookies persist between calls
      partition: "persist:wco-scraper",
    },
  });

  scraperWin.on("closed", () => { scraperWin = null; });

  // Warm-up: load the base page to acquire Cloudflare clearance cookie
  console.log("[wcoScraper] Warming up scraper window…");
  scraperWin.loadURL(BASE_URL).catch(() => {});
}

function destroy() {
  if (!scraperWin) return;
  try { if (!scraperWin.isDestroyed()) scraperWin.destroy(); } catch {}
  scraperWin = null;
}

function ensureWindow() {
  if (!scraperWin || scraperWin.isDestroyed()) init();
}

// ─── Navigation helper ─────────────────────────────────────────────────────────

/**
 * Navigate to a URL and wait for the page to stop loading + settle.
 * Returns false if Cloudflare blocked us (challenge page detected).
 */
async function navigateTo(url, settleMs = NAV_SETTLE_MS) {
  ensureWindow();
  navigating = true;

  try {
    await scraperWin.loadURL(url);
  } catch (err) {
    if (!err.message?.includes("ERR_ABORTED")) {
      console.warn("[wcoScraper] loadURL warning:", err.message);
    }
  }

  // Always wait for settle regardless of loadURL success/failure
  await sleep(settleMs);
  navigating = false;

  // Detect Cloudflare challenge page
  const isCF = await scraperWin.webContents.executeJavaScript(`
    !!(document.querySelector('#challenge-form') ||
       document.title.includes('Just a moment') ||
       document.title.includes('Checking your browser'))
  `).catch(() => false);

  if (isCF) {
    console.warn("[wcoScraper] Cloudflare challenge detected — waiting extra 8s…");
    await sleep(8000);
  }

  return true;
}

// ─── DOM helpers ───────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Poll until the JS expression returns a truthy value or timeout.
 */
async function pollUntil(jsExpr, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await scraperWin.webContents.executeJavaScript(jsExpr).catch(() => null);
    if (val) return val;
    await sleep(POLL_INTERVAL);
  }
  return null;
}

/**
 * Normalise a URL: handles relative paths, protocol-relative URLs, and
 * alternate domain variants (wco.tv, watchnixtoons2, wcoforever, etc.)
 * → always returns an absolute wcostream.tv URL.
 */
function normalizeUrl(href) {
  if (!href) return null;
  // Protocol-relative
  if (href.startsWith("//")) href = "https:" + href;
  // Relative path
  if (href.startsWith("/")) href = BASE_URL + href;
  // Rewrite alternate domains to wcostream.tv
  href = href
    .replace(/https?:\/\/(www\.)?(watchnixtoons2|wcoforever|wco|wcostream)\.(com|tv|net|org)/g,
             BASE_URL);
  // Must be an absolute http URL
  if (!href.startsWith("http")) return null;
  return href;
}

// ─── Cache ─────────────────────────────────────────────────────────────────────

const cache = { cartoon: null, dub: null, sub: null, movie: null };

// ─── Search ────────────────────────────────────────────────────────────────────

/**
 * Search for shows by navigating to WCO's search results page (GET-based).
 * More reliable than the POST endpoint which often returns HTML fragments
 * with relative URLs that break URL parsing.
 */
async function search(query, filterType = "all") {
  ensureWindow();

  const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
  console.log("[wcoScraper] Searching:", searchUrl);

  await navigateTo(searchUrl, NAV_SETTLE_MS);

  // Extract search results — try many selectors
  const results = await pollUntil(`
    (function() {
      const SELECTORS = [
        // WCO search results page
        '.film-poster a', '.film-poster-img + a', '.film-detail h2 a',
        '.flw-item .film-detail .film-name a',
        'article.item a.thumbnail', 'article a[href]',
        // Listing grid
        '.video-block a', '.video-block-img a',
        '.thumb a', '.thumb-img a',
        // Generic list
        'ul.items li a', 'ul.item li a',
        // Fallback: any link to an anime/cartoon/episode page
        'a[href*="/anime/"]', 'a[href*="/cartoon/"]',
      ];

      for (const sel of SELECTORS) {
        const els = Array.from(document.querySelectorAll(sel));
        if (els.length === 0) continue;

        const items = els.map(a => ({
          title: (a.textContent || a.title || a.getAttribute('data-title') || '').trim(),
          url:   a.href || a.getAttribute('href') || ''
        })).filter(x =>
          x.title.length > 1 &&
          x.url &&
          (x.url.includes('/anime/') || x.url.includes('/cartoon/') ||
           x.url.includes('wcostream') || x.url.includes('wco') || x.url.includes('watchnixtoons'))
        );

        if (items.length > 0) {
          console.log('[wco] search selector hit:', sel, '→', items.length);
          return items;
        }
      }
      return null; // still loading
    })()
  `, SEARCH_TIMEOUT);

  if (!results || results.length === 0) {
    // Debug dump
    const dbg = await scraperWin.webContents.executeJavaScript(
      `({ title: document.title, url: location.href, body: document.body.innerHTML.slice(0, 600) })`
    ).catch(() => ({}));
    console.log("[wcoScraper] search — 0 results. Debug:", JSON.stringify(dbg).slice(0, 400));
    return [];
  }

  // Normalise URLs
  const normalised = results
    .map(r => ({ title: r.title, url: normalizeUrl(r.url) }))
    .filter(r => r.url);

  // Deduplicate by URL
  const seen = new Set();
  const deduped = normalised.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  // Apply type filter
  if (filterType === "dub")     return deduped.filter(r => !r.title.toLowerCase().includes("subbed"));
  if (filterType === "sub")     return deduped.filter(r =>  r.title.toLowerCase().includes("subbed") || r.title.toLowerCase().includes("sub)"));
  if (filterType === "cartoon") return deduped.filter(r => !r.title.toLowerCase().includes("subbed") && !r.title.toLowerCase().includes("dubbed"));

  return deduped;
}

// ─── Episodes ──────────────────────────────────────────────────────────────────

/**
 * Get all episodes for a show URL.
 * Navigates the scraper window to the show page and polls for the episode list.
 */
async function getEpisodes(showUrl) {
  ensureWindow();

  // Normalise the URL first
  const url = normalizeUrl(showUrl) || showUrl;
  console.log("[wcoScraper] Loading show page for episodes:", url);

  await navigateTo(url, NAV_SETTLE_MS);

  // Aggressively poll for episode links
  const eps = await pollUntil(`
    (function() {
      const EPISODE_SELECTORS = [
        // Primary WCO episode list containers
        '#catlist-listview ul li a',
        '#catlist-listview a',
        '.cat-eps a',
        '#episode_related a',
        // Season/episode list variations
        '.episodes-area a',
        '.eplist a',
        '.episode-list a',
        'ul.listing.items.lists a',
        'ul.listing a',
        '.list-episode a',
        // Generic containers
        'div[id*="catlist"] a',
        'div[class*="eps"] a',
        'div[class*="episode"] a',
        // Last resort
        'a[href*="-episode-"]',
        'a[href*="/episode/"]',
      ];

      for (const sel of EPISODE_SELECTORS) {
        const els = Array.from(document.querySelectorAll(sel));
        if (els.length === 0) continue;

        const items = els
          .map(a => ({
            title: (a.textContent || '').trim(),
            url:   a.href || a.getAttribute('href') || ''
          }))
          .filter(x =>
            x.title.length > 0 &&
            x.url &&
            // Accept any wco-related domain, not just wcostream.tv
            (x.url.includes('wcostream') ||
             x.url.includes('watchnixtoons') ||
             x.url.includes('wcoforever') ||
             x.url.includes('/anime/') ||
             x.url.includes('/cartoon/') ||
             x.url.includes('-episode-') ||
             x.url.includes('/episode/'))
          );

        if (items.length > 0) {
          console.log('[wco] episodes selector hit:', sel, '→', items.length);
          return items;
        }
      }

      return null; // keep polling
    })()
  `, EPISODE_TIMEOUT);

  if (!eps || eps.length === 0) {
    const dbg = await scraperWin.webContents.executeJavaScript(
      `({ title: document.title, url: location.href, links: Array.from(document.querySelectorAll('a[href]')).slice(0,20).map(a=>a.href) })`
    ).catch(() => ({}));
    console.log("[wcoScraper] No episodes found. Debug:", JSON.stringify(dbg).slice(0, 600));
    return [];
  }

  // Normalise URLs
  const normalised = eps
    .map(e => ({ title: e.title, url: normalizeUrl(e.url) || e.url }))
    .filter(e => e.url);

  console.log(`[wcoScraper] getEpisodes returning ${normalised.length} episodes`);

  // WCO lists newest-first; reverse for chronological playback order
  return normalised.reverse();
}

// ─── Video extraction ──────────────────────────────────────────────────────────

/**
 * Extract the stream URL from an episode page.
 * Intercepts the first HLS (.m3u8) or MP4 network request.
 */
async function extractVideo(episodeUrl) {
  return new Promise(async (resolve) => {
    ensureWindow();

    const url = normalizeUrl(episodeUrl) || episodeUrl;
    console.log("[wcoScraper] Extracting video from:", url);

    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        console.warn("[wcoScraper] extractVideo timed out for:", url);
        resolve(null);
      }
    }, VIDEO_TIMEOUT);

    const AD_DOMAINS = ["doubleclick", "googlesyndication", "adnxs", "google-analytics",
                        "googletagmanager", "facebook.com", "amazon-adsystem"];

    const reqFilter = { urls: ["*://*/*.m3u8*", "*://*/*.mp4*", "*://*/hls/*", "*://*/stream/*"] };

    const handler = (details) => {
      const u = details.url;
      if (resolved) return;
      if (AD_DOMAINS.some(d => u.includes(d))) return;
      // Must look like a real stream, not a tiny image/ad segment
      if (u.includes(".m3u8") || (u.includes(".mp4") && !u.includes("thumbnail"))) {
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        try { scraperWin.webContents.stop(); } catch {}
        console.log("[wcoScraper] Stream URL intercepted:", u.slice(0, 80));
        resolve(u);
      }
    };

    function cleanup() {
      try {
        scraperWin.webContents.session.webRequest.onBeforeRequest(reqFilter, null);
      } catch {}
    }

    scraperWin.webContents.session.webRequest.onBeforeRequest(reqFilter, handler);

    try {
      await scraperWin.loadURL(url);
    } catch (err) {
      if (!err.message?.includes("ERR_ABORTED")) {
        console.error("[wcoScraper] extractVideo loadURL error:", err.message);
      }
    }
  });
}

// ─── List pages ────────────────────────────────────────────────────────────────

const LIST_PATHS = {
  cartoon: "/cartoon-list",
  dub:     "/dubbed-anime-list",
  sub:     "/subbed-anime-list",
  movie:   "/movie-list",
};

/**
 * Fetch the full A-Z list for a category. Uses navigation (not fetch()) because
 * WCO's list pages also require Cloudflare clearance to serve their full HTML.
 */
async function getList(type) {
  if (cache[type]) return cache[type];

  const path = LIST_PATHS[type];
  if (!path) throw new Error("Invalid list type: " + type);

  ensureWindow();
  const listUrl = BASE_URL + path;
  console.log("[wcoScraper] Loading list page:", listUrl);

  await navigateTo(listUrl, NAV_SETTLE_MS);

  const results = await pollUntil(`
    (function() {
      const SELECTORS = [
        'div.ddmcc ul li a',
        '.anime_list_body ul li a',
        '.anime_list_body li a',
        '.film-list .item a',
        '.video-block a',
        'ul.items li a',
        'ul.listing a',
        'ul.item li a',
        'a[href*="/anime/"]',
        'a[href*="/cartoon/"]',
      ];

      for (const sel of SELECTORS) {
        const els = Array.from(document.querySelectorAll(sel));
        if (els.length < 5) continue; // skip noise

        const items = els.map(a => ({
          title: a.textContent.trim(),
          url:   a.href || a.getAttribute('href') || ''
        })).filter(x => x.title && x.url && x.url.startsWith('http'));

        if (items.length > 0) {
          console.log('[wco] list selector hit:', sel, '→', items.length);
          return items;
        }
      }
      return null;
    })()
  `, 15000);

  if (!results || results.length === 0) {
    const dbg = await scraperWin.webContents.executeJavaScript(
      `({ title: document.title, url: location.href, count: document.querySelectorAll('a[href]').length })`
    ).catch(() => ({}));
    console.log(`[wcoScraper] getList('${type}') — 0 items. Debug:`, JSON.stringify(dbg));
    return [];
  }

  const normalised = results
    .map(r => ({ title: r.title, url: normalizeUrl(r.url) || r.url }))
    .filter(r => r.url);

  cache[type] = normalised;
  console.log(`[wcoScraper] getList('${type}') → ${normalised.length} items cached`);
  return normalised;
}

// ─── Cache / refresh ───────────────────────────────────────────────────────────

function clearCache() {
  cache.cartoon = null;
  cache.dub = null;
  cache.sub = null;
  cache.movie = null;
  console.log("[wcoScraper] Cache cleared.");
}

function refresh() {
  clearCache();
  destroy();
  init();
  console.log("[wcoScraper] Full refresh complete.");
}

// ─── Exports ───────────────────────────────────────────────────────────────────

module.exports = { init, search, getEpisodes, extractVideo, getList, clearCache, refresh, destroy };
