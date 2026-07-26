const { BrowserWindow, app } = require("electron");
const fs = require("fs");
const path = require("path");

// ─── Config ────────────────────────────────────────────────────────────────────

const BASE_URL   = "https://www.wcostream.tv";
const SEARCH_URL = `${BASE_URL}/?s=`;

const NAV_SETTLE_MS   = 4000;
const POLL_INTERVAL   = 500;
const EPISODE_TIMEOUT = 25000;
const SEARCH_TIMEOUT  = 18000;
const VIDEO_TIMEOUT   = 45000; // 45s — WCO embeds take time to resolve

// ─── Disk Persistence ──────────────────────────────────────────────────────────

let diskCachePath = null;
let diskCacheData = {
  lists: {},       // cartoon, dub, sub, movie
  episodes: {},    // url -> { data, timestamp }
  searches: {},    // query:filter -> { data, timestamp }
};

function getCachePath() {
  if (!diskCachePath) {
    try {
      const userData = app.getPath("userData");
      diskCachePath = path.join(userData, "wco_cache_v2.json");
    } catch {
      diskCachePath = path.join(__dirname, "wco_cache_v2.json");
    }
  }
  return diskCachePath;
}

function loadDiskCache() {
  try {
    const p = getCachePath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      diskCacheData = JSON.parse(raw);
      console.log("[wcoScraper] Loaded disk cache successfully.");
    }
  } catch (err) {
    console.warn("[wcoScraper] Failed to load disk cache:", err.message);
  }
}

function saveDiskCache() {
  try {
    const p = getCachePath();
    fs.writeFileSync(p, JSON.stringify(diskCacheData, null, 2), "utf8");
  } catch (err) {
    console.warn("[wcoScraper] Failed to save disk cache:", err.message);
  }
}

// Initial disk cache load
loadDiskCache();

// ─── Window Management & Crash Recovery ──────────────────────────────────────

let scraperWin   = null;
let extractorWin = null;
let isNavigating = false;
let navLock      = Promise.resolve();

function createScraperWin() {
  if (scraperWin && !scraperWin.isDestroyed()) return scraperWin;

  console.log("[wcoScraper] Initializing resilient scraper window…");
  scraperWin = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      partition: "persist:wco-scraper",
    },
  });

  // Self-Healing Crash Monitors
  scraperWin.webContents.on("render-process-gone", (_event, details) => {
    console.error("[wcoScraper] Scraper renderer process gone:", details.reason);
    rebuildScraperWin();
  });

  scraperWin.webContents.on("unresponsive", () => {
    console.warn("[wcoScraper] Scraper window unresponsive, rebuilding…");
    rebuildScraperWin();
  });

  scraperWin.on("closed", () => {
    scraperWin = null;
  });

  scraperWin.loadURL(BASE_URL).catch(() => {});
  return scraperWin;
}

function rebuildScraperWin() {
  try {
    if (scraperWin && !scraperWin.isDestroyed()) scraperWin.destroy();
  } catch {}
  scraperWin = null;
  createScraperWin();
}

function createExtractorWin() {
  if (extractorWin && !extractorWin.isDestroyed()) return extractorWin;

  console.log("[wcoScraper] Initializing resilient extractor window…");
  extractorWin = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // allow cross-origin iframes
      partition: "persist:wco-extractor",
    },
  });

  // Self-Healing Crash Monitors
  extractorWin.webContents.on("render-process-gone", (_event, details) => {
    console.error("[wcoScraper] Extractor renderer process gone:", details.reason);
    rebuildExtractorWin();
  });

  extractorWin.webContents.on("unresponsive", () => {
    console.warn("[wcoScraper] Extractor window unresponsive, rebuilding…");
    rebuildExtractorWin();
  });

  extractorWin.on("closed", () => {
    extractorWin = null;
  });

  extractorWin.loadURL(BASE_URL).catch(() => {});
  return extractorWin;
}

function rebuildExtractorWin() {
  try {
    if (extractorWin && !extractorWin.isDestroyed()) extractorWin.destroy();
  } catch {}
  extractorWin = null;
  createExtractorWin();
}

function init() {
  createScraperWin();
  createExtractorWin();
  startSelfHealingSync();
}

function destroyExtractor() {
  if (!extractorWin) return;
  try { if (!extractorWin.isDestroyed()) extractorWin.destroy(); } catch {}
  extractorWin = null;
}

function destroy() {
  if (scraperWin) {
    try { if (!scraperWin.isDestroyed()) scraperWin.destroy(); } catch {}
    scraperWin = null;
  }
  destroyExtractor();
}

function ensureWindow() {
  createScraperWin();
  createExtractorWin();
}

// ─── Serialized Navigation Guard ─────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Executes a function with navigation lock to prevent concurrent tab collisions.
 */
async function withNavLock(fn) {
  const currentLock = navLock;
  let release;
  navLock = new Promise(resolve => { release = resolve; });

  try {
    await currentLock;
    return await fn();
  } finally {
    release();
  }
}

/**
 * Resilient navigateTo with auto-retry and Cloudflare detection.
 */
async function navigateTo(url, settleMs = NAV_SETTLE_MS) {
  ensureWindow();
  isNavigating = true;

  let attempts = 0;
  let success = false;

  while (attempts < 3 && !success) {
    attempts++;
    try {
      if (!scraperWin || scraperWin.isDestroyed()) rebuildScraperWin();
      await scraperWin.loadURL(url);
      success = true;
    } catch (err) {
      if (err.message?.includes("ERR_ABORTED")) {
        success = true; // Redirect or main frame cancellation
      } else {
        console.warn(`[wcoScraper] Navigation attempt ${attempts} failed for ${url}:`, err.message);
        if (attempts >= 3) break;
        await sleep(2000);
        rebuildScraperWin();
      }
    }
  }

  await sleep(settleMs);

  // Detect Cloudflare challenge page
  try {
    if (scraperWin && !scraperWin.isDestroyed()) {
      const isCF = await scraperWin.webContents.executeJavaScript(`
        !!(document.querySelector('#challenge-form') ||
           document.title.includes('Just a moment') ||
           document.title.includes('Checking your browser'))
      `).catch(() => false);

      if (isCF) {
        console.warn("[wcoScraper] Cloudflare challenge detected — waiting extra 8s…");
        await sleep(8000);
      }
    }
  } catch {}

  isNavigating = false;
  return success;
}

// ─── DOM Helpers ───────────────────────────────────────────────────────────────

async function pollUntil(jsExpr, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!scraperWin || scraperWin.isDestroyed()) break;
    const val = await scraperWin.webContents.executeJavaScript(jsExpr).catch(() => null);
    if (val) return val;
    await sleep(POLL_INTERVAL);
  }
  return null;
}

function normalizeUrl(href) {
  if (!href) return null;
  if (href.startsWith("//")) href = "https:" + href;
  if (href.startsWith("/")) href = BASE_URL + href;
  href = href.replace(/https?:\/\/(www\.)?(watchnixtoons2|wcoforever|wco|wcostream)\.(com|tv|net|org)/g, BASE_URL);
  if (!href.startsWith("http")) return null;
  return href;
}

// ─── Search ────────────────────────────────────────────────────────────────────

async function search(query, filterType = "all") {
  const cacheKey = `${query.toLowerCase().trim()}:${filterType}`;
  const existing = diskCacheData.searches[cacheKey];

  // If search cache is younger than 24 hours, return instantly
  if (existing && Date.now() - existing.timestamp < 24 * 3600 * 1000) {
    return existing.data;
  }

  return withNavLock(async () => {
    ensureWindow();
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
    console.log("[wcoScraper] Searching:", searchUrl);

    await navigateTo(searchUrl, NAV_SETTLE_MS);

    const results = await pollUntil(`
      (function() {
        const SELECTORS = [
          '.film-poster a', '.film-poster-img + a', '.film-detail h2 a',
          '.flw-item .film-detail .film-name a',
          'article.item a.thumbnail', 'article a[href]',
          '.video-block a', '.video-block-img a',
          '.thumb a', '.thumb-img a',
          'ul.items li a', 'ul.item li a',
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

          if (items.length > 0) return items;
        }
        return null;
      })()
    `, SEARCH_TIMEOUT);

    let finalResults = [];

    if (results && results.length > 0) {
      const normalised = results
        .map(r => ({ title: r.title, url: normalizeUrl(r.url) }))
        .filter(r => r.url);

      const seen = new Set();
      const deduped = normalised.filter(r => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });

      if (filterType === "dub")     finalResults = deduped.filter(r => !r.title.toLowerCase().includes("subbed"));
      else if (filterType === "sub") finalResults = deduped.filter(r =>  r.title.toLowerCase().includes("subbed") || r.title.toLowerCase().includes("sub)"));
      else if (filterType === "cartoon") finalResults = deduped.filter(r => !r.title.toLowerCase().includes("subbed") && !r.title.toLowerCase().includes("dubbed"));
      else finalResults = deduped;
    } else if (existing) {
      // Fallback to disk cache if query failed live
      console.warn("[wcoScraper] Search failed live, returning cached fallback");
      return existing.data;
    }

    diskCacheData.searches[cacheKey] = { data: finalResults, timestamp: Date.now() };
    saveDiskCache();
    return finalResults;
  });
}

// ─── Episodes ──────────────────────────────────────────────────────────────────

async function getEpisodes(showUrl) {
  const url = normalizeUrl(showUrl) || showUrl;
  const existing = diskCacheData.episodes[url];

  // 48 hour cache TTL for show episodes
  if (existing && Date.now() - existing.timestamp < 48 * 3600 * 1000 && existing.data?.length > 0) {
    return existing.data;
  }

  return withNavLock(async () => {
    ensureWindow();
    console.log("[wcoScraper] Fetching episodes for:", url);

    await navigateTo(url, NAV_SETTLE_MS);

    const eps = await pollUntil(`
      (function() {
        const EPISODE_SELECTORS = [
          '#catlist-listview ul li a', '#catlist-listview a',
          '.cat-eps a', '#episode_related a',
          '.episodes-area a', '.eplist a', '.episode-list a',
          'ul.listing.items.lists a', 'ul.listing a', '.list-episode a',
          'div[id*="catlist"] a', 'div[class*="eps"] a', 'div[class*="episode"] a',
          'a[href*="-episode-"]', 'a[href*="/episode/"]',
        ];

        for (const sel of SELECTORS) {
          const els = Array.from(document.querySelectorAll(sel));
          if (els.length === 0) continue;

          const items = els.map(a => ({
            title: (a.textContent || '').trim(),
            url:   a.href || a.getAttribute('href') || ''
          })).filter(x =>
            x.title.length > 0 && x.url &&
            (x.url.includes('wcostream') || x.url.includes('watchnixtoons') ||
             x.url.includes('wcoforever') || x.url.includes('/anime/') ||
             x.url.includes('/cartoon/') || x.url.includes('-episode-') ||
             x.url.includes('/episode/'))
          );

          if (items.length > 0) return items;
        }
        return null;
      })()
    `, EPISODE_TIMEOUT);

    let normalised = [];

    if (eps && eps.length > 0) {
      normalised = eps
        .map(e => ({ title: e.title, url: normalizeUrl(e.url) || e.url }))
        .filter(e => e.url)
        .reverse(); // Chronological
    } else if (existing?.data?.length > 0) {
      console.warn("[wcoScraper] getEpisodes 0 items live, returning disk fallback");
      return existing.data;
    }

    diskCacheData.episodes[url] = { data: normalised, timestamp: Date.now() };
    saveDiskCache();
    return normalised;
  });
}

// ─── Video Extraction ──────────────────────────────────────────────────────────

async function extractVideo(episodeUrl) {
  return new Promise(async (resolve) => {
    createExtractorWin();
    const url = normalizeUrl(episodeUrl) || episodeUrl;
    console.log("[wcoExtractor] Extracting stream from:", url);

    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        console.warn("[wcoExtractor] Timed out (", VIDEO_TIMEOUT / 1000, "s) for:", url);
        resolve(null);
      }
    }, VIDEO_TIMEOUT);

    const AD_DOMAINS = [
      "doubleclick", "googlesyndication", "adnxs", "google-analytics",
      "googletagmanager", "facebook.com", "amazon-adsystem", "googleads",
      "scorecardresearch", "quantserve", "hotjar", "intercom",
    ];

    const reqFilter = { urls: ["*://*/*"] };

    const handler = (details, callback) => {
      if (resolved) { callback({}); return; }
      const u = details.url;

      if (AD_DOMAINS.some(d => u.includes(d))) { callback({}); return; }

      const isM3u8 = u.includes(".m3u8");
      const isMp4  = u.includes(".mp4") && !u.includes("thumbnail") && !u.includes("preview");
      const isHlsPath = /\/hls\/|playlist\.m3u8|index\.m3u8|\/stream\/|\/video\//i.test(u);

      if (isM3u8 || isMp4 || isHlsPath) {
        if (u.includes("1x1") || u.includes("pixel") || u.includes("beacon")) {
          callback({}); return;
        }

        resolved = true;
        clearTimeout(timeout);
        cleanup();
        console.log("[wcoExtractor] Stream intercepted:", u.slice(0, 120));

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

    try {
      extractorWin.webContents.session.webRequest.onBeforeRequest(reqFilter, handler);
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
    } catch (err) {
      console.error("[wcoExtractor] Failed to install interceptor:", err.message);
      clearTimeout(timeout);
      resolve(null);
      return;
    }

    try {
      await extractorWin.loadURL(url, {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        httpReferrer: BASE_URL + "/",
      });
    } catch (err) {
      if (!err.message?.includes("ERR_ABORTED") && !err.message?.includes("ERR_BLOCKED_BY_RESPONSE")) {
        console.error("[wcoExtractor] loadURL error:", err.message);
      }
    }
  });
}

// ─── List Pages ────────────────────────────────────────────────────────────────

const LIST_PATHS = {
  cartoon: "/cartoon-list",
  dub:     "/dubbed-anime-list",
  sub:     "/subbed-anime-list",
  movie:   "/movie-list",
};

async function getList(type) {
  const existing = diskCacheData.lists[type];
  // 24 hour TTL for category lists
  if (existing && Date.now() - existing.timestamp < 24 * 3600 * 1000 && existing.data?.length > 0) {
    return existing.data;
  }

  const pathStr = LIST_PATHS[type];
  if (!pathStr) throw new Error("Invalid list type: " + type);

  return withNavLock(async () => {
    ensureWindow();
    const listUrl = BASE_URL + pathStr;
    console.log("[wcoScraper] Loading list page:", listUrl);

    await navigateTo(listUrl, NAV_SETTLE_MS);

    const results = await pollUntil(`
      (function() {
        const SELECTORS = [
          'div.ddmcc ul li a', '.anime_list_body ul li a',
          '.anime_list_body li a', '.film-list .item a',
          '.video-block a', 'ul.items li a', 'ul.listing a', 'ul.item li a',
          'a[href*="/anime/"]', 'a[href*="/cartoon/"]',
        ];

        for (const sel of SELECTORS) {
          const els = Array.from(document.querySelectorAll(sel));
          if (els.length < 5) continue;

          const items = els.map(a => ({
            title: a.textContent.trim(),
            url:   a.href || a.getAttribute('href') || ''
          })).filter(x => x.title && x.url && x.url.startsWith('http'));

          if (items.length > 0) return items;
        }
        return null;
      })()
    `, 18000);

    let normalised = [];

    if (results && results.length > 0) {
      normalised = results
        .map(r => ({ title: r.title, url: normalizeUrl(r.url) || r.url }))
        .filter(r => r.url);
    } else if (existing?.data?.length > 0) {
      console.warn(`[wcoScraper] getList('${type}') failed live, returning cached fallback`);
      return existing.data;
    }

    diskCacheData.lists[type] = { data: normalised, timestamp: Date.now() };
    saveDiskCache();
    return normalised;
  });
}

// ─── 24/7 Self-Healing Background Data Sync ────────────────────────────────────

function startSelfHealingSync() {
  // Sync category lists periodically in the background
  setInterval(async () => {
    if (isNavigating) return;
    try {
      console.log("[wcoScraper] 24/7 Self-Healing Sync: Refreshing category lists...");
      for (const type of ["dub", "sub", "cartoon", "movie"]) {
        await getList(type);
        await sleep(3000);
      }
    } catch (e) {
      console.warn("[wcoScraper] Self-healing sync iteration warning:", e.message);
    }
  }, 10 * 60 * 1000); // Every 10 minutes
}

function clearCache() {
  diskCacheData.lists = {};
  diskCacheData.episodes = {};
  diskCacheData.searches = {};
  saveDiskCache();
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
