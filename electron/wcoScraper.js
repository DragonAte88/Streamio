const { BrowserWindow, session } = require("electron");

// ─── Config ────────────────────────────────────────────────────────────────────

const BASE_URL   = "https://www.wcostream.tv";
const SEARCH_URL = `${BASE_URL}/?s=`;

const NAV_SETTLE_MS   = 5000;
const POLL_INTERVAL   = 600;
const EPISODE_TIMEOUT = 20000;
const SEARCH_TIMEOUT  = 15000;
const VIDEO_TIMEOUT   = 45000; // 45s — WCO embeds take a long time to resolve

// ─── Window management ─────────────────────────────────────────────────────────

let scraperWin   = null;  // Used for list fetching, search, episode scraping
let extractorWin = null;  // Dedicated window for stream URL interception
let navigating   = false;

function init() {
  if (scraperWin && !scraperWin.isDestroyed()) return;

  scraperWin = new BrowserWindow({
    show: false, width: 1280, height: 800,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, webSecurity: true,
      partition: "persist:wco-scraper",
    },
  });
  scraperWin.on("closed", () => { scraperWin = null; });
  console.log("[wcoScraper] Warming up scraper window…");
  scraperWin.loadURL(BASE_URL).catch(() => {});

  // Dedicated extractor window (separate session = separate CF cookies)
  if (!extractorWin || extractorWin.isDestroyed()) {
    extractorWin = new BrowserWindow({
      show: false, width: 1280, height: 800,
      webPreferences: {
        nodeIntegration: false, contextIsolation: true, webSecurity: false, // allow cross-origin iframes
        partition: "persist:wco-extractor",
      },
    });
    extractorWin.on("closed", () => { extractorWin = null; });
    // Warm up so Cloudflare clearance cookie is acquired early
    console.log("[wcoScraper] Warming up extractor window…");
    extractorWin.loadURL(BASE_URL).catch(() => {});
  }
}

function destroyExtractor() {
  if (!extractorWin) return;
  try { if (!extractorWin.isDestroyed()) extractorWin.destroy(); } catch {}
  extractorWin = null;
}


function destroy() {
  if (!scraperWin) return;
  try { if (!scraperWin.isDestroyed()) scraperWin.destroy(); } catch {}
  scraperWin = null;
  destroyExtractor();
}

function ensureWindow() {
  if (!scraperWin || scraperWin.isDestroyed()) init();
  if (!extractorWin || extractorWin.isDestroyed()) {
    extractorWin = new BrowserWindow({
      show: false, width: 1280, height: 800,
      webPreferences: {
        nodeIntegration: false, contextIsolation: true, webSecurity: false,
        partition: "persist:wco-extractor",
      },
    });
    extractorWin.on("closed", () => { extractorWin = null; });
  }
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
 * Extract the direct stream URL from a WCO episode page.
 *
 * Strategy:
 *  1. Use a DEDICATED extractorWin (separate from scraperWin) so episode
 *     listing and stream extraction never race each other.
 *  2. Set up onBeforeRequest on the extractor session BEFORE navigating.
 *  3. WCO embeds its player in an <iframe> pointing to a third-party host
 *     (gogoanime, filemoon, vidhide, streamtape, mp4upload, etc.).
 *     The session-level webRequest interceptor captures ALL requests from
 *     the window AND its iframes, so we catch the HLS manifest or MP4
 *     regardless of where it is hosted.
 *  4. Broaden the URL patterns — WCO CDN URLs often look like:
 *       https://cdn*.com/hls/HASH/index.m3u8
 *       https://storage*.com/VIDEO_ID.mp4?token=...
 *       wss://...  (not useful, skip)
 *  5. Ignore known ad/tracker domains.
 *  6. 45-second timeout (WCO embeds are slow to load).
 */
async function extractVideo(episodeUrl) {
  return new Promise(async (resolve) => {
    ensureWindow();

    const url = normalizeUrl(episodeUrl) || episodeUrl;
    console.log("[wcoExtractor] Extracting stream from:", url);

    let resolved = false;

    const TIMEOUT_MS = VIDEO_TIMEOUT;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        console.warn("[wcoExtractor] Timed out (", TIMEOUT_MS / 1000, "s) for:", url);
        resolve(null);
      }
    }, TIMEOUT_MS);

    // Ad/tracker blocklist
    const AD_DOMAINS = [
      "doubleclick", "googlesyndication", "adnxs", "google-analytics",
      "googletagmanager", "facebook.com", "amazon-adsystem", "googleads",
      "scorecardresearch", "quantserve", "hotjar", "intercom",
    ];

    // Intercept ANY network request that looks like a media stream.
    // We use wildcard "*://*/*" and filter in JS — Electron's URL filter
    // patterns don't support the full range of CDN paths WCO uses.
    const reqFilter = { urls: ["*://*/*"] };

    const handler = (details, callback) => {
      if (resolved) { callback({}); return; }

      const u = details.url;

      // Skip ads/trackers
      if (AD_DOMAINS.some(d => u.includes(d))) { callback({}); return; }

      // Detect HLS manifest or MP4 stream
      const isM3u8 = u.includes(".m3u8");
      const isMp4  = u.includes(".mp4") && !u.includes("thumbnail") && !u.includes("preview");
      const isHlsPath = /\/hls\/|playlist\.m3u8|index\.m3u8|\/stream\/|\/video\//i.test(u);

      if (isM3u8 || isMp4 || isHlsPath) {
        // Skip tiny files that are likely ad tracking pixels
        if (u.includes("1x1") || u.includes("pixel") || u.includes("beacon")) {
          callback({}); return;
        }

        resolved = true;
        clearTimeout(timeout);
        cleanup();

        console.log("[wcoExtractor] Stream intercepted:", u.slice(0, 120));

        // Stop loading further resources once we have the URL
        try { extractorWin.webContents.stop(); } catch {}

        resolve(u);
        callback({ cancel: false });
        return;
      }

      callback({});
    };

    function cleanup() {
      try {
        if (extractorWin && !extractorWin.isDestroyed()) {
          extractorWin.webContents.session.webRequest.onBeforeRequest(reqFilter, null);
        }
      } catch {}
    }

    // Install interceptor BEFORE navigating
    try {
      extractorWin.webContents.session.webRequest.onBeforeRequest(reqFilter, handler);
    } catch (err) {
      console.error("[wcoExtractor] Failed to install interceptor:", err.message);
      clearTimeout(timeout);
      resolve(null);
      return;
    }

    // Set headers the WCO player expects
    try {
      extractorWin.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ["*://*/*"] },
        (details, callback) => {
          const headers = { ...details.requestHeaders };
          headers["Referer"]    = BASE_URL + "/";
          headers["Origin"]     = BASE_URL;
          headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
          callback({ requestHeaders: headers });
        }
      );
    } catch {}

    try {
      await extractorWin.loadURL(url, {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        httpReferrer: BASE_URL + "/",
      });
    } catch (err) {
      if (!err.message?.includes("ERR_ABORTED") && !err.message?.includes("ERR_BLOCKED_BY_RESPONSE")) {
        console.error("[wcoExtractor] loadURL error:", err.message);
      }
      // Don't resolve yet — the interceptor may still fire even after ERR_ABORTED
      // (this is normal for pages that redirect or cancel the main frame)
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
