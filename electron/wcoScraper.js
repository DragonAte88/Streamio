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

/**
 * Direct WatchNixtoons2 HTTP episode parser.
 * Supports both legacy catlist-listview and new WCO dark-episode-box/episodeList HTML layouts.
 */
async function fetchEpisodesDirect(showUrl) {
  try {
    const fullUrl = normalizeUrl(showUrl) || showUrl;
    const res = await fetch(fullUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": BASE_URL + "/",
      }
    });

    if (!res.ok) return null;
    const html = await res.text();

    let scopeHtml = html;
    let startIdx = -1;
    for (const key of ['id="episodeList"', 'class="dark-episode-box"', 'id="episodes"', 'id="catlist-listview"', 'catlist-listview']) {
      const idx = html.indexOf(key);
      if (idx !== -1) { startIdx = idx; break; }
    }

    if (startIdx !== -1) {
      scopeHtml = html.slice(startIdx);
      const endIdx = scopeHtml.indexOf('<!--/catlist-->') !== -1 ? scopeHtml.indexOf('<!--/catlist-->') : scopeHtml.indexOf('</section>');
      if (endIdx !== -1) scopeHtml = scopeHtml.slice(0, endIdx);
    }

    const matches = [];

    // Robust Regex: Handles nested <span>/<div> tags inside <a ... href="...">...</a>
    const tagRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = tagRegex.exec(scopeHtml)) !== null) {
      const linkHref = match[1];
      const innerHtml = match[2];

      // Strip inner tags to get raw title text (e.g. <span>Title</span> -> Title)
      const rawTitle = innerHtml.replace(/<[^>]+>/g, '').trim();

      if (rawTitle.length > 0 && linkHref && !linkHref.includes('#') && !linkHref.includes('/category/')) {
        const norm = normalizeUrl(linkHref) || (linkHref.startsWith('/') ? BASE_URL + linkHref : linkHref);
        if (norm && (norm.includes('-episode-') || norm.includes('/episode/') || norm.includes('-season-') || norm.includes('wcostream') || norm.includes('wco.tv') || norm.includes('watchnixtoons'))) {
          matches.push({ title: rawTitle, url: norm });
        }
      }
    }

    const seen = new Set();
    const unique = [];
    for (const item of matches) {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        unique.push(item);
      }
    }

    return unique.length > 0 ? unique : null;
  } catch (err) {
    console.warn("[wcoScraper] Direct HTTP episode fetch error:", err.message);
    return null;
  }
}

async function getEpisodes(showUrl) {
  const url = normalizeUrl(showUrl) || showUrl;
  const existing = diskCacheData.episodes[url];

  // 48 hour cache TTL for show episodes (must have > 0 items)
  if (existing && existing.data?.length > 0 && Date.now() - existing.timestamp < 48 * 3600 * 1000) {
    return existing.data;
  }
  if (existing && (!existing.data || existing.data.length === 0)) {
    delete diskCacheData.episodes[url];
  }

  // Phase 0: WatchNixtoons2 Fast-Path Direct HTTP Parsing (Sub-second execution)
  const fastEpisodes = await fetchEpisodesDirect(url).catch(() => null);
  if (fastEpisodes && fastEpisodes.length > 0) {
    const normalised = fastEpisodes
      .map(e => ({ title: e.title, url: normalizeUrl(e.url) || e.url }))
      .filter(e => e.url)
      .reverse();

    if (normalised.length > 0) {
      diskCacheData.episodes[url] = { data: normalised, timestamp: Date.now() };
      saveDiskCache();
      console.log(`[wcoScraper] WatchNixtoons2 Fast-Path fetched ${normalised.length} episodes for:`, url);
      return normalised;
    }
  }

  return withNavLock(async () => {
    ensureWindow();
    console.log("[wcoScraper] Fetching episodes via browser window for:", url);

    await navigateTo(url, NAV_SETTLE_MS);

    const eps = await pollUntil(`
      (function() {
        const SELECTOR_COMBO = '#episodeList a, a.dark-episode-item, .dark-episode-box a, #episodes a, #catlist-listview a, .cat-eps a, #episode_related a, .episodes-area a, .eplist a, .episode-list a, ul.listing a, .list-episode a, div[id*="catlist"] a, div[class*="eps"] a, div[class*="episode"] a, a[href*="-episode-"], a[href*="/episode/"]';

        const els = Array.from(document.querySelectorAll(SELECTOR_COMBO));
        if (els.length === 0) return null;

        const seen = new Set();
        const items = [];

        for (const a of els) {
          const title = (a.querySelector('span')?.textContent || a.textContent || '').trim();
          const href = a.href || a.getAttribute('href') || '';
          if (!title || !href || href.includes('#') || href.includes('/category/')) continue;

          const norm = href.startsWith('/') ? 'https://www.wco.tv' + href : href;
          if (norm && !seen.has(norm)) {
            seen.add(norm);
            items.push({ title, url: norm });
          }
        }

        return items.length > 0 ? items : null;
      })()
    `, EPISODE_TIMEOUT);

    let normalised = [];

    if (eps && eps.length > 0) {
      normalised = eps
        .map(e => ({ title: e.title, url: normalizeUrl(e.url) || e.url }))
        .filter(e => e.url)
        .reverse(); // Chronological
    }

    if (normalised.length === 0 && existing) {
      delete diskCacheData.episodes[url];
      saveDiskCache();
    }

    if (normalised.length > 0) {
      diskCacheData.episodes[url] = { data: normalised, timestamp: Date.now() };
      saveDiskCache();
    }
    return normalised;
  });
}

// ─── Video Extraction & View-Source Bypass ──────────────────────────────────────

/**
 * Advanced view-source / HTML regex stream extractor that parses inline scripts,
 * base64 encoded player parameters, jwplayer configurations, and hidden iframes.
 */
function extractStreamFromHTML(html, baseUrl = BASE_URL) {
  if (!html) return null;

  try {
    // 1. Direct getvid / evid regex matching in HTML/scripts
    const getvidMatch = html.match(/https?:\/\/[^\s"'<>]*(?:getvid|evid=)[^\s"'<>]+/i) ||
                        html.match(/(?:\/inc\/embed\/|\/embed\/)[^\s"'<>]+/i);
    if (getvidMatch) {
      const matchUrl = getvidMatch[0].replace(/\\/g, '');
      return normalizeUrl(matchUrl) || (matchUrl.startsWith('/') ? baseUrl + matchUrl : matchUrl);
    }

    // 2. Inline base64 decoding (WCO obfuscated stream links)
    const b64Matches = html.match(/atob\(["']([A-Za-z0-9+/=]+)["']\)/g);
    if (b64Matches) {
      for (const m of b64Matches) {
        const rawB64 = m.match(/atob\(["']([A-Za-z0-9+/=]+)["']\)/)?.[1];
        if (rawB64) {
          try {
            const decoded = Buffer.from(rawB64, 'base64').toString('utf8');
            if (decoded.includes('getvid') || decoded.includes('.mp4') || decoded.includes('.m3u8')) {
              return normalizeUrl(decoded) || decoded;
            }
          } catch {}
        }
      }
    }

    // 3. JWPlayer / VideoJS source configuration regex
    const mediaMatch = html.match(/file\s*:\s*["']([^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)["']/i) ||
                       html.match(/src\s*:\s*["']([^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)["']/i) ||
                       html.match(/["'](https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)["']/i);
    if (mediaMatch && !mediaMatch[1].includes('preview') && !mediaMatch[1].includes('thumbnail')) {
      return mediaMatch[1];
    }

    // 4. WatchNixtoons2 exact iframe regex patterns
    const vjsMatch = html.match(/<iframe id="[^"]+" class="vjs_iframe" rel="nofollow" src="([^"]+)"/i);
    if (vjsMatch) return normalizeUrl(vjsMatch[1]) || vjsMatch[1];

    const uploadsMatch = html.match(/<iframe id="[^"]*uploads[^"]*" src="([^"]+)"/i);
    if (uploadsMatch) return normalizeUrl(uploadsMatch[1]) || uploadsMatch[1];

    const cizgiMatch = html.match(/<iframe\s*rel="nofollow"\s*id="cizgi-js-[0-9]+" src="([^"]+)"/i);
    if (cizgiMatch) return normalizeUrl(cizgiMatch[1]) || cizgiMatch[1];

    // 5. WatchNixtoons2 episode description / myFunction embed decoder
    const descIdx = html.indexOf('class="episode-descp"') !== -1 ? html.indexOf('class="episode-descp"') : html.indexOf('onclick="myFunction"');
    if (descIdx > 0) {
      const subContent = html.slice(descIdx);
      const srcMatch = subContent.match(/src="([^"]+)"/);
      if (srcMatch) return normalizeUrl(srcMatch[1]) || srcMatch[1];
    }

    // 6. Generic hidden iframe src matching
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch && (iframeMatch[1].includes('getvid') || iframeMatch[1].includes('embed') || iframeMatch[1].includes('inc/'))) {
      const frameUrl = iframeMatch[1];
      return normalizeUrl(frameUrl) || (frameUrl.startsWith('/') ? baseUrl + frameUrl : frameUrl);
    }
  } catch (e) {
    console.warn("[wcoExtractor] extractStreamFromHTML parsing error:", e.message);
  }

  return null;
}

/**
 * Direct WatchNixtoons2 AJAX /inc/embed/getvidlink stream resolver.
 * Fetches JSON payload directly from WCO backend for ultra-fast response.
 */
async function resolveWatchNixtoons2GetVid(embedUrl) {
  try {
    const fullEmbedUrl = normalizeUrl(embedUrl) || embedUrl;
    const res = await fetch(fullEmbedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": BASE_URL + "/",
      }
    });

    if (!res.ok) return null;
    const html = await res.text();

    const match = html.match(/"(\/inc\/embed\/getvidlink[^"]+)"/i);
    if (!match) return null;

    const apiPath = match[1];
    const apiUrl = BASE_URL + apiPath;

    const apiRes = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": fullEmbedUrl,
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "*/*",
      }
    });

    if (!apiRes.ok) return null;
    const data = await apiRes.json();

    const token = data.fhd || data.hd || data.enc;
    if (!token) return null;

    const serverUrl = data.server ? `${data.server}/getvid?evid=${token}` : null;
    const cdnUrl = data.cdn ? `${data.cdn}/getvid?evid=${token}` : null;

    return serverUrl || cdnUrl;
  } catch (err) {
    console.warn("[wcoExtractor] WatchNixtoons2 getvidlink AJAX failed:", err.message);
    return null;
  }
}

async function extractVideo(episodeUrl) {
  const url = normalizeUrl(episodeUrl) || episodeUrl;
  console.log("[wcoExtractor] Extracting stream from:", url);

  // Phase 0: WatchNixtoons2 Fast-Path Direct AJAX Resolution (Sub-second execution)
  const fastStream = await resolveWatchNixtoons2GetVid(url).catch(() => null);
  if (fastStream) {
    console.log("[wcoExtractor] WatchNixtoons2 Fast-Path resolved stream instantly:", fastStream.slice(0, 150));
    return fastStream;
  }

  return new Promise(async (resolve) => {
    createExtractorWin();

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

      // Enhanced WCO direct stream matching: includes getvid?evid=, .m3u8, .mp4, /hls/
      const isGetVid = u.includes("getvid") || u.includes("evid=");
      const isM3u8   = u.includes(".m3u8");
      const isMp4    = u.includes(".mp4") && !u.includes("thumbnail") && !u.includes("preview");
      const isHlsPath = /\/hls\/|playlist\.m3u8|index\.m3u8|\/stream\/|\/video\//i.test(u);

      if (isGetVid || isM3u8 || isMp4 || isHlsPath) {
        if (u.includes("1x1") || u.includes("pixel") || u.includes("beacon")) {
          callback({}); return;
        }

        resolved = true;
        clearTimeout(timeout);
        cleanup();
        console.log("[wcoExtractor] Deep-dive stream intercepted:", u.slice(0, 150));

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

      // Active DOM Deep-Dive & Auto-Dismiss Ad Overlay
      const pollDeadline = Date.now() + 15000;
      while (Date.now() < pollDeadline && !resolved) {
        await sleep(600);
        if (!extractorWin || extractorWin.isDestroyed()) break;

        // Auto-click "Close" ad overlay button
        await extractorWin.webContents.executeJavaScript(`
          (function() {
            try {
              const closeBtns = Array.from(document.querySelectorAll('button, div, a, input, span')).filter(el => {
                const txt = (el.textContent || el.value || '').trim().toLowerCase();
                return txt.includes('close') || txt === 'x' || el.className?.includes('close');
              });
              closeBtns.forEach(btn => btn.click());
            } catch (e) {}
          })()
        `).catch(() => {});

        // DOM deep-dive & View-Source script extraction for video src / iframe src / getvid link
        const domSrc = await extractorWin.webContents.executeJavaScript(`
          (function() {
            try {
              // Check active video element
              const v = document.querySelector('video');
              if (v && v.src && v.src.startsWith('http')) return v.src;

              const source = document.querySelector('video source');
              if (source && source.src && source.src.startsWith('http')) return source.src;

              // Check direct iframe embed
              const iframe = document.querySelector('iframe[src*="getvid"], iframe[src*="embed"], iframe[src*="inc/"]');
              if (iframe && iframe.src) return iframe.src;

              // View-source algorithm: Scan all page scripts for base64 / getvid / .mp4 / .m3u8
              const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '').join('\\n');
              
              // Base64 decoder check in scripts
              const b64Matches = scripts.match(/atob\\(["']([A-Za-z0-9+/=]+)["']\\)/g);
              if (b64Matches) {
                for (const m of b64Matches) {
                  const b64 = m.match(/atob\\(["']([A-Za-z0-9+/=]+)["']\\)/)?.[1];
                  if (b64) {
                    try {
                      const dec = atob(b64);
                      if (dec.includes('getvid') || dec.includes('.mp4') || dec.includes('.m3u8')) return dec;
                    } catch (e) {}
                  }
                }
              }

              // Direct link scan
              const allLinks = Array.from(document.querySelectorAll('a[href], iframe[src]'));
              for (const l of allLinks) {
                const href = l.href || l.src || '';
                if (href.includes('getvid') || href.includes('evid=')) return href;
              }
            } catch (e) {}
            return null;
          })()
        `).catch(() => null);

        if (domSrc && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          console.log("[wcoExtractor] View-source DOM deep-dive found stream:", domSrc.slice(0, 150));
          try { extractorWin.webContents.stop(); } catch {}
          resolve(domSrc);
          return;
        }
      }
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
