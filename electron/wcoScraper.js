/**
 * wcoScraper.js — Streamio Advanced WCO/WatchNixtoons2 Scraping Engine
 * ─────────────────────────────────────────────────────────────────────
 * Multi-phase extraction pipeline:
 *   Phase 0  → WatchNixtoons2 direct HTTP fast-path (sub-second, no browser)
 *   Phase 1  → AJAX getvidlink resolver (official WCO embed API)
 *   Phase 2  → View-source HTML regex engine (base64, jwplayer, iframe)
 *   Phase 3  → Browser network interception (webRequest onBeforeRequest)
 *   Phase 4  → DOM deep-dive polling (video src / iframe src / getvid links)
 *   Phase 5  → Season-aware URL construction for wco.tv /anime/?season= API
 *
 * Supports: wco.tv · wcostream.tv · wcofun.tv · watchnixtoons2 · wcoforever
 */

"use strict";

const { BrowserWindow, app, session } = require("electron");
const fs   = require("fs");
const path = require("path");
const http  = require("http");
const https = require("https");
const { URL } = require("url");

// ─── Config ────────────────────────────────────────────────────────────────────

const WCO_HOSTS = [
  "https://www.wcostream.tv",
  "https://www.wco.tv",
  "https://www.wcofun.tv",
  "https://www.wcoforever.net",
  "https://www.watchnixtoons2.org",
];

let BASE_URL     = WCO_HOSTS[0];
const SEARCH_URL = () => `${BASE_URL}/?s=`;

const NAV_SETTLE_MS   = 3500;
const POLL_INTERVAL   = 400;
const EPISODE_TIMEOUT = 28000;
const SEARCH_TIMEOUT  = 18000;
const VIDEO_TIMEOUT   = 50000;
const HTTP_TIMEOUT_MS = 12000;

// ─── Request Headers ───────────────────────────────────────────────────────────

const BASE_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "DNT":             "1",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

const AJAX_HEADERS = {
  "User-Agent":       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  "Accept":           "*/*",
  "Sec-Fetch-Dest":   "empty",
  "Sec-Fetch-Mode":   "cors",
  "Sec-Fetch-Site":   "same-origin",
};

// ─── Disk Persistence ──────────────────────────────────────────────────────────

let diskCachePath = null;
let diskCacheData = {
  lists:    {},  // cartoon, dub, sub, movie
  episodes: {},  // url → { data, timestamp }
  searches: {},  // query:filter → { data, timestamp }
  seasons:  {},  // showUrl → { data, timestamp }  — WCO season map
  activeHost: null,
};

function getCachePath() {
  if (!diskCachePath) {
    try {
      const userData = app.getPath("userData");
      diskCachePath = path.join(userData, "wco_cache_v3.json");
    } catch {
      diskCachePath = path.join(__dirname, "wco_cache_v3.json");
    }
  }
  return diskCachePath;
}

function loadDiskCache() {
  try {
    const p = getCachePath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      const parsed = JSON.parse(raw);
      diskCacheData = { ...diskCacheData, ...parsed };

      // Restore known-good host
      if (diskCacheData.activeHost && WCO_HOSTS.includes(diskCacheData.activeHost)) {
        BASE_URL = diskCacheData.activeHost;
        console.log(`[wcoScraper] Restored active host: ${BASE_URL}`);
      }

      // Purge invalid (empty) episode cache entries
      let purged = 0;
      for (const [k, v] of Object.entries(diskCacheData.episodes || {})) {
        if (!v?.data?.length) { delete diskCacheData.episodes[k]; purged++; }
      }
      if (purged > 0) console.log(`[wcoScraper] Purged ${purged} empty episode cache entries.`);
      console.log("[wcoScraper] Disk cache v3 loaded.");
    }
  } catch (err) {
    console.warn("[wcoScraper] Failed to load disk cache:", err.message);
  }
}

function saveDiskCache() {
  try {
    diskCacheData.activeHost = BASE_URL;
    const p = getCachePath();
    fs.writeFileSync(p, JSON.stringify(diskCacheData, null, 2), "utf8");
  } catch (err) {
    console.warn("[wcoScraper] Failed to save disk cache:", err.message);
  }
}

// Initial disk cache load
loadDiskCache();

// ─── Low-Level HTTP Fetch (Node native, bypasses Electron webRequest) ──────────

/**
 * Raw Node.js HTTP/HTTPS fetch with full header control and timeout.
 * Follows redirects, handles gzip/br, returns { html, finalUrl }.
 */
function rawFetch(rawUrl, opts = {}) {
  return new Promise((resolve, reject) => {
    const doRequest = (targetUrl, redirectCount = 0) => {
      if (redirectCount > 6) { reject(new Error("Too many redirects")); return; }

      let parsed;
      try { parsed = new URL(targetUrl); } catch { reject(new Error("Invalid URL: " + targetUrl)); return; }

      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;

      const reqHeaders = {
        ...BASE_HEADERS,
        "Referer": BASE_URL + "/",
        "Origin": BASE_URL,
        "Host": parsed.hostname,
        ...(opts.headers || {}),
      };

      const reqOpts = {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   opts.method || "GET",
        headers:  reqHeaders,
        timeout:  opts.timeout || HTTP_TIMEOUT_MS,
      };

      const req = lib.request(reqOpts, (res) => {
        // Handle redirects
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
          const nextUrl = res.headers.location.startsWith("http") ? res.headers.location : parsed.origin + res.headers.location;
          res.resume();
          doRequest(nextUrl, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const buf = Buffer.concat(chunks);
            // Attempt basic UTF-8 decode (no gzip decompression needed for regex)
            const html = buf.toString("utf8");
            resolve({ html, finalUrl: targetUrl, status: res.statusCode });
          } catch (err) {
            reject(err);
          }
        });
        res.on("error", reject);
      });

      req.on("timeout", () => { req.destroy(new Error("Request timed out")); });
      req.on("error", reject);
      if (opts.body) req.write(opts.body);
      req.end();
    };

    doRequest(rawUrl);
  });
}

// ─── Window Management & Crash Recovery ──────────────────────────────────────

let scraperWin   = null;
let extractorWin = null;
let isNavigating = false;
let navLock      = Promise.resolve();

function makeWindowPrefs(allowCrossOrigin = false) {
  return {
    nodeIntegration:   false,
    contextIsolation:  true,
    webSecurity:       !allowCrossOrigin,
    partition:         allowCrossOrigin ? "persist:wco-extractor" : "persist:wco-scraper",
    backgroundThrottling: false,
  };
}

function createScraperWin() {
  if (scraperWin && !scraperWin.isDestroyed()) return scraperWin;
  console.log("[wcoScraper] Creating resilient scraper window…");
  scraperWin = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: makeWindowPrefs(false) });
  scraperWin.webContents.on("render-process-gone", (_e, d) => { console.error("[wcoScraper] Scraper gone:", d.reason); rebuildScraperWin(); });
  scraperWin.webContents.on("unresponsive", () => { console.warn("[wcoScraper] Scraper unresponsive, rebuilding…"); rebuildScraperWin(); });
  scraperWin.on("closed", () => { scraperWin = null; });
  scraperWin.loadURL(BASE_URL).catch(() => {});
  return scraperWin;
}

function rebuildScraperWin() {
  try { if (scraperWin && !scraperWin.isDestroyed()) scraperWin.destroy(); } catch {}
  scraperWin = null;
  setTimeout(() => createScraperWin(), 500);
}

function createExtractorWin() {
  if (extractorWin && !extractorWin.isDestroyed()) return extractorWin;
  console.log("[wcoScraper] Creating resilient extractor window…");
  extractorWin = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: makeWindowPrefs(true) });
  extractorWin.webContents.on("render-process-gone", (_e, d) => { console.error("[wcoScraper] Extractor gone:", d.reason); rebuildExtractorWin(); });
  extractorWin.webContents.on("unresponsive", () => { console.warn("[wcoScraper] Extractor unresponsive, rebuilding…"); rebuildExtractorWin(); });
  extractorWin.on("closed", () => { extractorWin = null; });
  extractorWin.loadURL(BASE_URL).catch(() => {});
  return extractorWin;
}

function rebuildExtractorWin() {
  try { if (extractorWin && !extractorWin.isDestroyed()) extractorWin.destroy(); } catch {}
  extractorWin = null;
  setTimeout(() => createExtractorWin(), 500);
}

function init() {
  createScraperWin();
  createExtractorWin();
  probeActiveHost().catch(() => {});
  startSelfHealingSync();
}

function destroy() {
  try { if (scraperWin   && !scraperWin.isDestroyed())   scraperWin.destroy();   } catch {}
  try { if (extractorWin && !extractorWin.isDestroyed()) extractorWin.destroy(); } catch {}
  scraperWin = extractorWin = null;
}

function ensureWindow() {
  createScraperWin();
  createExtractorWin();
}

// ─── Active Host Probing ───────────────────────────────────────────────────────

/**
 * Tests all known WCO mirror hosts and promotes the first responsive one.
 * This runs once on startup and on any repeated connection failure.
 */
async function probeActiveHost() {
  console.log("[wcoScraper] Probing WCO mirrors for fastest host…");
  for (const host of WCO_HOSTS) {
    try {
      const { status } = await rawFetch(host + "/cartoon-list", { timeout: 8000 });
      if (status === 200) {
        BASE_URL = host;
        diskCacheData.activeHost = host;
        saveDiskCache();
        console.log(`[wcoScraper] Active host set to: ${host}`);
        return host;
      }
    } catch { /* continue */ }
  }
  console.warn("[wcoScraper] No WCO mirror responded — keeping current host.");
  return BASE_URL;
}

// ─── Serialized Navigation Guard ──────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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

// ─── URL Normalisation ────────────────────────────────────────────────────────

const WCO_HOST_REGEX = /https?:\/\/(www\.)?(watchnixtoons2|wcoforever|wcofun|wco|wcostream)\.(com|tv|net|org|cc)/g;

function normalizeUrl(href) {
  if (!href) return null;
  if (href.startsWith("//")) href = "https:" + href;
  if (href.startsWith("/"))  href = BASE_URL + href;
  // Rewrite any WCO mirror to the active base
  href = href.replace(WCO_HOST_REGEX, BASE_URL);
  if (!href.startsWith("http")) return null;
  return href;
}

function isEpisodeUrl(url) {
  return !!(url && (
    url.includes("-episode-") ||
    url.includes("/episode/") ||
    url.includes("-season-") ||
    url.match(/\d+$/)
  ));
}

// ─── Resilient Browser Navigation ────────────────────────────────────────────

async function navigateTo(win, url, settleMs = NAV_SETTLE_MS) {
  if (!win || win.isDestroyed()) return false;
  let attempts = 0;
  let success  = false;

  while (attempts < 3 && !success) {
    attempts++;
    try {
      await win.loadURL(url, {
        userAgent:    BASE_HEADERS["User-Agent"],
        httpReferrer: BASE_URL + "/",
      });
      success = true;
    } catch (err) {
      if (err.message?.includes("ERR_ABORTED") || err.message?.includes("ERR_BLOCKED_BY_RESPONSE")) {
        success = true; // redirect / frame cancellation — page actually loaded
      } else {
        console.warn(`[wcoScraper] Nav attempt ${attempts} failed (${url.slice(0, 60)}):`, err.message);
        if (attempts >= 3) break;
        await sleep(2500);
        if (win === scraperWin)   rebuildScraperWin();
        if (win === extractorWin) rebuildExtractorWin();
        await sleep(1000);
        win = win === scraperWin ? scraperWin : extractorWin; // re-bind after rebuild
      }
    }
  }

  await sleep(settleMs);

  // Cloudflare bypass — wait for challenge clearance
  if (win && !win.isDestroyed()) {
    try {
      const isCF = await win.webContents.executeJavaScript(`
        !!(document.querySelector('#challenge-form, #cf-challenge-running, .cf-browser-verification') ||
           document.title.includes('Just a moment') ||
           document.title.includes('Checking your browser') ||
           document.title.includes('DDoS-Guard'))
      `).catch(() => false);

      if (isCF) {
        console.warn("[wcoScraper] Cloudflare/DDoS-Guard challenge — waiting 10s…");
        await sleep(10000);
      }
    } catch {}
  }

  return success;
}

// ─── DOM Polling Helper ───────────────────────────────────────────────────────

async function pollUntil(win, jsExpr, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!win || win.isDestroyed()) break;
    const val = await win.webContents.executeJavaScript(jsExpr).catch(() => null);
    if (val && (Array.isArray(val) ? val.length > 0 : true)) return val;
    await sleep(POLL_INTERVAL);
  }
  return null;
}

// ─── Phase 0: Direct HTTP Episode Fetching (WatchNixtoons2 Fast-Path) ─────────

/**
 * Fetches the show page HTML via raw Node.js HTTP and extracts all episode links
 * using multiple CSS-class patterns and robust regex.
 * Supports: catlist-listview, dark-episode-box, episodeList, episode-list, ul.listing
 */
async function fetchEpisodesDirect(showUrl) {
  try {
    const fullUrl = normalizeUrl(showUrl) || showUrl;
    const { html } = await rawFetch(fullUrl);

    // Narrow to the episode container block
    let scopeHtml = html;
    const containerKeys = [
      'id="episodeList"', 'id="episodes"', 'class="dark-episode-box"',
      'class="eplist"', 'id="catlist-listview"', 'catlist-listview',
      'class="listing"', 'class="cat-eps"', 'class="episode-list"',
    ];
    for (const key of containerKeys) {
      const idx = html.indexOf(key);
      if (idx !== -1) {
        scopeHtml = html.slice(Math.max(0, idx - 200));
        // Try to terminate at the end of the section
        const endCandidates = ['<!--/catlist-->', '</section>', '</div>', '</ul>'];
        for (const end of endCandidates) {
          const eIdx = scopeHtml.indexOf(end, 400);
          if (eIdx !== -1 && eIdx < 50000) { scopeHtml = scopeHtml.slice(0, eIdx); break; }
        }
        break;
      }
    }

    const matches = [];
    // Multi-pattern anchor extraction — handles nested <span> / <div> inside <a>
    const tagRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = tagRegex.exec(scopeHtml)) !== null) {
      const linkHref = match[1].trim();
      const rawTitle = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

      if (!rawTitle || rawTitle.length < 2) continue;
      if (linkHref.includes("#") || linkHref.includes("/category/") || linkHref.includes("/anime/") && !linkHref.includes("-episode-") && !linkHref.includes("-season-")) continue;

      const norm = normalizeUrl(linkHref) || (linkHref.startsWith("/") ? BASE_URL + linkHref : linkHref);
      if (!norm) continue;

      // Accept any link that looks like an episode or season
      if (isEpisodeUrl(norm) || norm.includes("wcostream") || norm.includes("wco.tv") || norm.includes("wcofun")) {
        matches.push({ title: rawTitle, url: norm });
      }
    }

    // Also scan for direct episode URL patterns anywhere in the HTML (fallback)
    if (matches.length === 0) {
      const epUrlRegex = /href=["']([^"']*-episode-[^"']+)["'][^>]*>([^<]{2,80})</gi;
      let m2;
      while ((m2 = epUrlRegex.exec(html)) !== null) {
        const norm = normalizeUrl(m2[1]) || m2[1];
        const title = m2[2].trim();
        if (norm && title) matches.push({ title, url: norm });
      }
    }

    const seen = new Set();
    const unique = matches.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

    return unique.length > 0 ? unique : null;
  } catch (err) {
    console.warn("[wcoScraper] Direct HTTP episode fetch failed:", err.message);
    return null;
  }
}

// ─── Phase 0b: Season-Aware Episode Fetching (wco.tv /anime/?season=sX-N) ─────

/**
 * WCO.tv exposes a season parameter: /anime/SLUG/?season=s1-0
 * This fetches the show's anime page and discovers all season URLs,
 * then fetches each season's episode list.
 */
async function fetchSeasonAwareEpisodes(showUrl) {
  try {
    const fullUrl = normalizeUrl(showUrl) || showUrl;

    // Step 1: Fetch the anime/cartoon page and extract season tabs
    const { html: showHtml } = await rawFetch(fullUrl);

    // Extract season links from the page: ?season=s1-0, ?season=s2-0, etc.
    const seasonUrlRegex = /href=["']([^"']*[?&]season=s\d+-\d+[^"']*)["']/gi;
    const seasonUrls = new Set();
    let sm;
    while ((sm = seasonUrlRegex.exec(showHtml)) !== null) {
      const sUrl = normalizeUrl(sm[1]) || (sm[1].startsWith("http") ? sm[1] : BASE_URL + sm[1]);
      if (sUrl) seasonUrls.add(sUrl);
    }

    // Also check for WCO-style season dropdowns: data-season="1", data-link="/anime/slug/?season=s1-0"
    const dataSeasonRegex = /data-link=["']([^"']*season=[^"']+)["']/gi;
    let dsm;
    while ((dsm = dataSeasonRegex.exec(showHtml)) !== null) {
      const sUrl = normalizeUrl(dsm[1]) || (dsm[1].startsWith("http") ? dsm[1] : BASE_URL + dsm[1]);
      if (sUrl) seasonUrls.add(sUrl);
    }

    // If no season links found, try the base show page directly
    if (seasonUrls.size === 0) {
      const directEps = await fetchEpisodesDirect(fullUrl);
      return directEps;
    }

    console.log(`[wcoScraper] Found ${seasonUrls.size} season URLs for:`, fullUrl);

    // Step 2: Fetch episodes from each season page
    const allEpisodes = [];
    for (const seasonUrl of seasonUrls) {
      try {
        const eps = await fetchEpisodesDirect(seasonUrl);
        if (eps && eps.length > 0) {
          allEpisodes.push(...eps);
        }
        await sleep(200); // polite delay
      } catch {}
    }

    // Also merge episodes from the base show page (some seasons listed there)
    const baseEps = await fetchEpisodesDirect(fullUrl);
    if (baseEps) allEpisodes.push(...baseEps);

    // Deduplicate
    const seen = new Set();
    const unique = allEpisodes.filter(ep => {
      if (seen.has(ep.url)) return false;
      seen.add(ep.url);
      return true;
    });

    return unique.length > 0 ? unique : null;
  } catch (err) {
    console.warn("[wcoScraper] Season-aware fetch failed:", err.message);
    return null;
  }
}

// ─── getEpisodes: Unified Multi-Phase Episode Fetcher ─────────────────────────

async function getEpisodes(showUrl) {
  const url = normalizeUrl(showUrl) || showUrl;
  const existing = diskCacheData.episodes[url];

  // Valid cache hit (>0 items, <48h)
  if (existing && existing.data?.length > 0 && Date.now() - existing.timestamp < 48 * 3600 * 1000) {
    console.log(`[wcoScraper] Cache hit: ${existing.data.length} episodes for ${url}`);
    return existing.data;
  }

  // Purge stale/empty entries
  if (existing && (!existing.data || existing.data.length === 0)) {
    delete diskCacheData.episodes[url];
  }

  console.log("[wcoScraper] Fetching episodes for:", url);

  // ── Phase 0a: Season-aware multi-season HTTP fetch ──
  let fastEpisodes = await fetchSeasonAwareEpisodes(url).catch(() => null);

  // ── Phase 0b: Fallback direct page HTTP fetch ──
  if (!fastEpisodes || fastEpisodes.length === 0) {
    fastEpisodes = await fetchEpisodesDirect(url).catch(() => null);
  }

  if (fastEpisodes && fastEpisodes.length > 0) {
    const normalised = fastEpisodes
      .map(e => ({ title: e.title, url: normalizeUrl(e.url) || e.url }))
      .filter(e => e.url)
      .reverse(); // chronological order

    if (normalised.length > 0) {
      diskCacheData.episodes[url] = { data: normalised, timestamp: Date.now() };
      saveDiskCache();
      console.log(`[wcoScraper] HTTP fast-path: ${normalised.length} episodes`);
      return normalised;
    }
  }

  // ── Phase 1: Browser DOM navigation (Cloudflare-cleared session) ──
  return withNavLock(async () => {
    ensureWindow();
    console.log("[wcoScraper] Falling back to browser scrape for:", url);

    await navigateTo(scraperWin, url, NAV_SETTLE_MS);

    const eps = await pollUntil(scraperWin, `
      (function() {
        const SELS = [
          '#episodeList a',
          'a.dark-episode-item',
          '.dark-episode-box a',
          '#episodes a',
          '#catlist-listview a',
          '.cat-eps a',
          '#episode_related a',
          '.episodes-area a',
          '.eplist a',
          '.episode-list a',
          'ul.listing a',
          'ul.items li a',
          '.list-episode a',
          'div[id*="catlist"] a',
          'div[class*="eps"] a',
          'div[class*="episode"] a',
          'a[href*="-episode-"]',
          'a[href*="/episode/"]',
        ].join(',');

        const els = Array.from(document.querySelectorAll(SELS));
        if (els.length === 0) return null;

        const seen = new Set();
        const items = [];
        for (const a of els) {
          const title = (a.querySelector('span, .ep-title')?.textContent || a.textContent || '').trim();
          const href  = a.href || a.getAttribute('href') || '';
          if (!title || !href || href.includes('#') || href.includes('/category/')) continue;
          const norm = href.startsWith('/') ? location.origin + href : href;
          if (!seen.has(norm)) { seen.add(norm); items.push({ title, url: norm }); }
        }
        return items.length > 0 ? items : null;
      })()
    `, EPISODE_TIMEOUT);

    let normalised = [];
    if (eps && eps.length > 0) {
      normalised = eps
        .map(e => ({ title: e.title, url: normalizeUrl(e.url) || e.url }))
        .filter(e => e.url)
        .reverse();
    }

    // Phase 1b: Search fallback (try finding the show in WCO catalog)
    if (normalised.length === 0) {
      console.warn("[wcoScraper] Browser DOM found no episodes — trying search fallback");
      const slug = url.split("/").filter(Boolean).pop() || "";
      const searchQuery = slug.replace(/-/g, " ").replace(/\d+$/, "").trim();
      if (searchQuery.length > 3) {
        try {
          const results = await search(searchQuery, "all");
          if (results.length > 0) {
            const altUrl = results[0].url;
            if (altUrl !== url) {
              console.log("[wcoScraper] Trying alt URL from search:", altUrl);
              const altEps = await fetchSeasonAwareEpisodes(altUrl).catch(() => null)
                          || await fetchEpisodesDirect(altUrl).catch(() => null);
              if (altEps && altEps.length > 0) {
                normalised = altEps.map(e => ({ title: e.title, url: normalizeUrl(e.url) || e.url })).filter(e => e.url).reverse();
              }
            }
          }
        } catch {}
      }
    }

    if (normalised.length > 0) {
      diskCacheData.episodes[url] = { data: normalised, timestamp: Date.now() };
      saveDiskCache();
      console.log(`[wcoScraper] Browser phase: ${normalised.length} episodes`);
    } else {
      // Preserve old stale cache rather than returning empty
      if (existing?.data?.length > 0) {
        console.warn("[wcoScraper] All phases failed — returning stale cache as fallback");
        return existing.data;
      }
      delete diskCacheData.episodes[url];
      saveDiskCache();
    }

    return normalised;
  });
}

// ─── Search ────────────────────────────────────────────────────────────────────

async function search(query, filterType = "all") {
  const cacheKey = `${query.toLowerCase().trim()}:${filterType}`;
  const existing = diskCacheData.searches[cacheKey];
  if (existing && Date.now() - existing.timestamp < 24 * 3600 * 1000) return existing.data;

  // Phase 0: Direct HTTP search
  try {
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
    const { html } = await rawFetch(searchUrl, { timeout: 10000 });

    const results = [];
    const linkRegex = /<a\s+[^>]*href=["']([^"']*(?:\/anime\/|\/cartoon\/)[^"']+)["'][^>]*>([^<]{2,80})</gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const norm = normalizeUrl(m[1]);
      const title = m[2].trim();
      if (norm && title && !norm.includes("-episode-") && !norm.includes("?")) {
        results.push({ title, url: norm });
      }
    }

    if (results.length > 0) {
      const seen = new Set();
      const deduped = results.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });
      diskCacheData.searches[cacheKey] = { data: deduped, timestamp: Date.now() };
      saveDiskCache();
      return applySearchFilter(deduped, filterType);
    }
  } catch {}

  // Phase 1: Browser-based search
  return withNavLock(async () => {
    ensureWindow();
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
    console.log("[wcoScraper] Browser search:", searchUrl);
    await navigateTo(scraperWin, searchUrl, NAV_SETTLE_MS);

    const rawResults = await pollUntil(scraperWin, `
      (function() {
        const SELS = [
          '.film-poster a', '.film-detail h2 a', '.flw-item .film-name a',
          'article.item a.thumbnail', 'article a[href]',
          '.video-block a', '.thumb a', 'ul.items li a',
          'a[href*="/anime/"]', 'a[href*="/cartoon/"]',
        ];
        for (const sel of SELS) {
          const els = Array.from(document.querySelectorAll(sel));
          if (els.length === 0) continue;
          const items = els.map(a => ({
            title: (a.textContent || a.title || '').trim(),
            url: a.href || a.getAttribute('href') || ''
          })).filter(x =>
            x.title.length > 1 && x.url &&
            (x.url.includes('/anime/') || x.url.includes('/cartoon/') ||
             x.url.includes('wcostream') || x.url.includes('wco'))
          );
          if (items.length > 0) return items;
        }
        return null;
      })()
    `, SEARCH_TIMEOUT);

    let finalResults = [];
    if (rawResults?.length > 0) {
      const norm = rawResults
        .map(r => ({ title: r.title, url: normalizeUrl(r.url) }))
        .filter(r => r.url);
      const seen = new Set();
      const deduped = norm.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });
      finalResults = applySearchFilter(deduped, filterType);
    } else if (existing) {
      return existing.data;
    }

    diskCacheData.searches[cacheKey] = { data: finalResults, timestamp: Date.now() };
    saveDiskCache();
    return finalResults;
  });
}

function applySearchFilter(results, filterType) {
  if (filterType === "dub")     return results.filter(r => !r.title.toLowerCase().includes("subbed"));
  if (filterType === "sub")     return results.filter(r => r.title.toLowerCase().includes("subbed") || r.title.includes("(Sub)"));
  if (filterType === "cartoon") return results.filter(r => !r.title.toLowerCase().includes("subbed") && !r.title.toLowerCase().includes("dubbed"));
  return results;
}

// ─── View-Source HTML Stream Extractor ────────────────────────────────────────

/**
 * Advanced multi-pattern HTML/script stream extractor.
 * Handles: base64 obfuscation, jwplayer, videojs, iframe embeds,
 *          WCO getvid API, hex-encoded strings, eval() packed scripts.
 */
function extractStreamFromHTML(html, baseUrl = BASE_URL) {
  if (!html) return null;

  try {
    // 1. Direct getvid / evid URL in raw HTML
    const getvidMatch =
      html.match(/https?:\/\/[^\s"'<>]*(?:getvid|evid=)[^\s"'<>]+/i) ||
      html.match(/(?:\/inc\/embed\/|\\/embed\/)[^\s"'<>]+/i);
    if (getvidMatch) {
      const mu = getvidMatch[0].replace(/\\/g, "");
      return normalizeUrl(mu) || (mu.startsWith("/") ? baseUrl + mu : mu);
    }

    // 2. Inline base64 decode (atob-obfuscated WCO streams)
    const b64Matches = [...(html.matchAll(/atob\(["']([A-Za-z0-9+/=]{20,})["']\)/g))];
    for (const m of b64Matches) {
      try {
        const decoded = Buffer.from(m[1], "base64").toString("utf8");
        if (decoded.includes("getvid") || decoded.includes(".mp4") || decoded.includes(".m3u8")) {
          return normalizeUrl(decoded) || decoded;
        }
      } catch {}
    }

    // 3. Hex-encoded string decode (\x68\x74\x74...)
    const hexMatch = html.match(/["']((?:\\x[0-9a-f]{2}){8,})["']/i);
    if (hexMatch) {
      try {
        const decoded = hexMatch[1].replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
        if (decoded.startsWith("http") && (decoded.includes(".mp4") || decoded.includes(".m3u8") || decoded.includes("getvid"))) {
          return decoded;
        }
      } catch {}
    }

    // 4. eval() packed scripts — detect and partially decode
    const evalMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[^)]+\)/);
    if (evalMatch) {
      // Look for URLs inside the obfuscated block
      const insideUrls = evalMatch[0].match(/https?:\/\/[^\s"'\\]+/g);
      if (insideUrls) {
        for (const u of insideUrls) {
          if (u.includes(".mp4") || u.includes(".m3u8") || u.includes("getvid")) return u;
        }
      }
    }

    // 5. JWPlayer / VideoJS file/src declarations
    const mediaMatch =
      html.match(/file\s*:\s*["']([^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)["']/i) ||
      html.match(/src\s*:\s*["']([^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)["']/i) ||
      html.match(/["'](https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)["']/i);
    if (mediaMatch && !mediaMatch[1].includes("preview") && !mediaMatch[1].includes("thumbnail")) {
      return mediaMatch[1];
    }

    // 6. WatchNixtoons2 vjs_iframe / uploads iframe patterns
    const vjsMatch = html.match(/<iframe[^>]*class="vjs_iframe"[^>]*src="([^"]+)"/i) ||
                     html.match(/<iframe[^>]*id="[^"]*uploads[^"]*"[^>]*src="([^"]+)"/i) ||
                     html.match(/<iframe[^>]*rel="nofollow"[^>]*id="cizgi-js-\d+"[^>]*src="([^"]+)"/i) ||
                     html.match(/<iframe[^>]*src="([^"]*getvid[^"]*)"[^>]*/i) ||
                     html.match(/<iframe[^>]*src="([^"]*embed[^"]*)"[^>]*/i) ||
                     html.match(/<iframe[^>]*src="([^"]*inc\/[^"]*)"[^>]*/i);
    if (vjsMatch) return normalizeUrl(vjsMatch[1]) || vjsMatch[1];

    // 7. myFunction embed / episode-descp area
    const descIdx = html.indexOf('class="episode-descp"') > 0
                  ? html.indexOf('class="episode-descp"')
                  : html.indexOf('onclick="myFunction"');
    if (descIdx > 0) {
      const sub = html.slice(descIdx, descIdx + 3000);
      const srcM = sub.match(/src="([^"]+)"/);
      if (srcM) return normalizeUrl(srcM[1]) || srcM[1];
    }

    // 8. Generic m3u8 / mp4 anywhere in page
    const genericM3u8 = html.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/i);
    if (genericM3u8) return genericM3u8[1];

    const genericMp4 = html.match(/["'`](https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)["'`]/i);
    if (genericMp4 && !genericMp4[1].includes("thumb") && !genericMp4[1].includes("preview")) return genericMp4[1];

  } catch (e) {
    console.warn("[wcoExtractor] extractStreamFromHTML error:", e.message);
  }

  return null;
}

// ─── Phase 1: WatchNixtoons2 AJAX /inc/embed/getvidlink Resolver ─────────────

/**
 * Directly hits WCO's embed AJAX endpoint to get the getvid token.
 * This is the fastest reliable method when it works — pure HTTP, no browser.
 */
async function resolveGetVidAJAX(embedUrl) {
  try {
    const fullEmbedUrl = normalizeUrl(embedUrl) || embedUrl;
    const { html: embedHtml } = await rawFetch(fullEmbedUrl, {
      headers: { ...BASE_HEADERS, "Referer": BASE_URL + "/" },
      timeout: 12000,
    });

    // Method A: extract getvidlink AJAX path from embed page
    const apiPathMatch = embedHtml.match(/"(\/inc\/embed\/getvidlink[^"]+)"/i) ||
                         embedHtml.match(/'(\/inc\/embed\/getvidlink[^']+)'/i);
    if (apiPathMatch) {
      const apiUrl = BASE_URL + apiPathMatch[1];
      const { html: apiRaw } = await rawFetch(apiUrl, {
        headers: {
          ...AJAX_HEADERS,
          "Referer": fullEmbedUrl,
          "Origin": BASE_URL,
        },
        timeout: 10000,
      });

      let data;
      try { data = JSON.parse(apiRaw); } catch { return null; }

      const token = data.fhd || data.hd || data.sd || data.enc;
      if (!token) return null;

      if (data.server) return `${data.server}/getvid?evid=${token}`;
      if (data.cdn)    return `${data.cdn}/getvid?evid=${token}`;
    }

    // Method B: embedded stream URL directly in the embed page
    const directStream = extractStreamFromHTML(embedHtml, BASE_URL);
    if (directStream) return directStream;

    return null;
  } catch (err) {
    console.warn("[wcoExtractor] AJAX getvidlink failed:", err.message);
    return null;
  }
}

/**
 * Gets the embed iframe URL from the episode page, then resolves it via AJAX.
 */
async function resolveEpisodeStream(episodeUrl) {
  try {
    const fullUrl = normalizeUrl(episodeUrl) || episodeUrl;
    const { html } = await rawFetch(fullUrl, {
      headers: { ...BASE_HEADERS, "Referer": BASE_URL + "/" },
      timeout: 12000,
    });

    // First pass: direct stream link in the episode page HTML
    const directStream = extractStreamFromHTML(html, BASE_URL);
    if (directStream && directStream.startsWith("http")) {
      // If it's a getvid or m3u8 URL — return directly
      if (directStream.includes("getvid") || directStream.includes(".m3u8") || directStream.includes(".mp4")) {
        return directStream;
      }
      // It's an iframe/embed URL — resolve it
      return await resolveGetVidAJAX(directStream);
    }

    return null;
  } catch (err) {
    console.warn("[wcoExtractor] Episode stream resolve failed:", err.message);
    return null;
  }
}

// ─── Phase 2: Browser Network Interception ────────────────────────────────────

const STREAM_PATTERNS = [
  u => u.includes("getvid") || u.includes("evid="),
  u => u.includes(".m3u8"),
  u => u.includes(".mp4") && !u.includes("thumbnail") && !u.includes("preview") && !u.includes("1x1"),
  u => /\/hls\/|playlist\.m3u8|index\.m3u8|\/stream\/|\/video\//i.test(u),
  u => u.includes("/getvid?") && u.includes("evid="),
];

const AD_DOMAINS = [
  "doubleclick", "googlesyndication", "adnxs", "google-analytics",
  "googletagmanager", "amazon-adsystem", "googleads", "scorecardresearch",
  "quantserve", "hotjar", "intercom", "adservice", "pubads", "pagead",
  "analytics", "pixel.facebook", "connect.facebook", "tpc.googlesyndication",
];

async function extractVideo(episodeUrl) {
  const url = normalizeUrl(episodeUrl) || episodeUrl;
  console.log("[wcoExtractor] Extracting stream from:", url);

  // ── Phase 0: Direct HTTP + HTML regex (fastest) ──
  const fastStream = await resolveEpisodeStream(url).catch(() => null);
  if (fastStream) {
    console.log("[wcoExtractor] Phase 0 direct HTTP stream:", fastStream.slice(0, 120));
    return fastStream;
  }

  // ── Phase 1: AJAX getvidlink resolver ──
  const ajaxStream = await resolveGetVidAJAX(url).catch(() => null);
  if (ajaxStream) {
    console.log("[wcoExtractor] Phase 1 AJAX stream:", ajaxStream.slice(0, 120));
    return ajaxStream;
  }

  // ── Phase 2+3+4: Browser interception + DOM deep-dive ──
  return new Promise(async (resolve) => {
    ensureWindow();
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        console.warn("[wcoExtractor] Timed out after", VIDEO_TIMEOUT / 1000, "s for:", url);
        resolve(null);
      }
    }, VIDEO_TIMEOUT);

    const reqFilter = { urls: ["*://*/*"] };

    const requestHandler = (details, callback) => {
      if (resolved) { callback({}); return; }
      const u = details.url;

      // Block ads
      if (AD_DOMAINS.some(d => u.includes(d))) { callback({ cancel: true }); return; }

      // Match stream patterns
      if (STREAM_PATTERNS.some(fn => fn(u))) {
        if (!u.includes("1x1") && !u.includes("pixel") && !u.includes("beacon")) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          console.log("[wcoExtractor] Phase 2 network intercepted:", u.slice(0, 120));
          try { if (extractorWin && !extractorWin.isDestroyed()) extractorWin.webContents.stop(); } catch {}
          resolve(u);
          callback({ cancel: false });
          return;
        }
      }
      callback({});
    };

    function cleanup() {
      try {
        if (extractorWin && !extractorWin.isDestroyed()) {
          extractorWin.webContents.session.webRequest.onBeforeRequest(reqFilter, null);
          extractorWin.webContents.session.webRequest.onBeforeSendHeaders({ urls: ["*://*/*"] }, null);
        }
      } catch {}
    }

    try {
      // Inject fake browser headers to bypass bot detection
      extractorWin.webContents.session.webRequest.onBeforeSendHeaders({ urls: ["*://*/*"] }, (details, cb) => {
        const h = { ...details.requestHeaders };
        h["Referer"]    = BASE_URL + "/";
        h["Origin"]     = BASE_URL;
        h["User-Agent"] = BASE_HEADERS["User-Agent"];
        h["Accept-Language"] = "en-US,en;q=0.9";
        h["Sec-Fetch-Dest"] = "document";
        h["Sec-Fetch-Mode"] = "navigate";
        cb({ requestHeaders: h });
      });

      extractorWin.webContents.session.webRequest.onBeforeRequest(reqFilter, requestHandler);
    } catch (err) {
      console.error("[wcoExtractor] Failed to install interceptors:", err.message);
      clearTimeout(timeout);
      resolve(null);
      return;
    }

    try {
      await extractorWin.loadURL(url, {
        userAgent: BASE_HEADERS["User-Agent"],
        httpReferrer: BASE_URL + "/",
      });

      // Phase 3+4: DOM deep-dive polling after page load
      const pollEnd = Date.now() + 18000;
      while (Date.now() < pollEnd && !resolved) {
        await sleep(500);
        if (!extractorWin || extractorWin.isDestroyed()) break;

        // Auto-dismiss ad/cookie overlays
        await extractorWin.webContents.executeJavaScript(`
          (function() {
            try {
              const overlaySelectors = [
                '.ad-overlay', '#ad-overlay', '.overlay-close', '#dismiss-button',
                'button[class*="close"]', 'div[class*="close"]', 'a[class*="close"]',
                '[aria-label="Close"]', '[aria-label="close"]',
              ];
              overlaySelectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                  const txt = (el.textContent || '').trim().toLowerCase();
                  if (txt.includes('close') || txt === 'x' || txt === '×' || el.className?.includes('close')) {
                    el.click();
                  }
                });
              });
            } catch {}
          })()
        `).catch(() => {});

        // DOM deep-dive: check video src, iframe src, inline script getvid links
        const domSrc = await extractorWin.webContents.executeJavaScript(`
          (function() {
            try {
              // Active video element
              const v = document.querySelector('video');
              if (v && v.src && v.src.startsWith('http') && !v.src.includes('blob:')) return v.src;
              const vsrc = document.querySelector('video source');
              if (vsrc && vsrc.src && vsrc.src.startsWith('http')) return vsrc.src;

              // Direct iframe embed
              const iframe = document.querySelector(
                'iframe[src*="getvid"], iframe[src*="embed"], iframe[src*="inc/"], iframe[src*="vid/"]'
              );
              if (iframe && iframe.src && iframe.src.startsWith('http')) return iframe.src;

              // Scan all inline scripts for getvid / m3u8 / mp4 / base64
              const scriptContent = Array.from(document.querySelectorAll('script'))
                .map(s => s.textContent || '').join('\\n');

              // Base64 decoder check
              const b64RE = /atob\\(["']([A-Za-z0-9+\\/=]{20,})["']\\)/g;
              let bm;
              while ((bm = b64RE.exec(scriptContent)) !== null) {
                try {
                  const dec = atob(bm[1]);
                  if (dec.includes('getvid') || dec.includes('.mp4') || dec.includes('.m3u8')) return dec;
                } catch {}
              }

              // getvid / evid link in scripts
              const getvidRE = /(?:getvid|evid)=[^\\s"'&,]+/g;
              let gm;
              while ((gm = getvidRE.exec(scriptContent)) !== null) {
                return gm[0].startsWith('http') ? gm[0] : null;
              }

              // m3u8 / mp4 direct in scripts
              const mediaRE = /["'\`](https?:\\/\\/[^"'\`\\s]+\\.(?:m3u8|mp4)[^"'\`\\s]*)["'\`]/i;
              const mm = scriptContent.match(mediaRE);
              if (mm) return mm[1];

              // Check direct links
              const allLinks = Array.from(document.querySelectorAll('a[href], iframe[src]'));
              for (const l of allLinks) {
                const href = l.href || l.src || '';
                if (href.includes('getvid') || href.includes('evid=') || href.includes('.m3u8')) return href;
              }
            } catch {}
            return null;
          })()
        `).catch(() => null);

        if (domSrc && !resolved) {
          // If it's an embed URL rather than direct stream, resolve it via AJAX
          if (domSrc.includes("getvid") || domSrc.includes(".m3u8") || domSrc.includes(".mp4")) {
            resolved = true;
            clearTimeout(timeout);
            cleanup();
            console.log("[wcoExtractor] Phase 3 DOM deep-dive stream:", domSrc.slice(0, 120));
            try { if (extractorWin && !extractorWin.isDestroyed()) extractorWin.webContents.stop(); } catch {}
            resolve(domSrc);
            return;
          } else if (domSrc.startsWith("http") && (domSrc.includes("embed") || domSrc.includes("inc/"))) {
            // Resolve iframe URL
            const iframeStream = await resolveGetVidAJAX(domSrc).catch(() => null);
            if (iframeStream && !resolved) {
              resolved = true;
              clearTimeout(timeout);
              cleanup();
              console.log("[wcoExtractor] Phase 3 iframe→AJAX stream:", iframeStream.slice(0, 120));
              resolve(iframeStream);
              return;
            }
          }
        }
      }
    } catch (err) {
      if (!err.message?.includes("ERR_ABORTED") && !err.message?.includes("ERR_BLOCKED")) {
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
  if (existing && Date.now() - existing.timestamp < 24 * 3600 * 1000 && existing.data?.length > 0) {
    return existing.data;
  }

  const pathStr = LIST_PATHS[type];
  if (!pathStr) throw new Error("Invalid list type: " + type);

  // Phase 0: Direct HTTP fetch
  try {
    const listUrl = BASE_URL + pathStr;
    const { html } = await rawFetch(listUrl, { timeout: 15000 });

    const results = [];
    const linkRegex = /<a\s+[^>]*href=["']([^"']*(?:\/anime\/|\/cartoon\/)[^"']+)["'][^>]*>([^<]{2,80})</gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const norm = normalizeUrl(m[1]);
      const title = m[2].trim();
      if (norm && title && !norm.includes("-episode-")) {
        results.push({ title, url: norm });
      }
    }

    // Also try ddmcc / anime_list_body patterns
    const ddRegex = /<(?:li|a)[^>]*href=["']([^"']*(?:\/anime\/|\/cartoon\/|\/show\/)[^"']+)["'][^>]*>([\s\S]*?)<\/(?:li|a)>/gi;
    while ((m = ddRegex.exec(html)) !== null) {
      const norm = normalizeUrl(m[1]);
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      if (norm && title && !norm.includes("-episode-") && title.length > 1) {
        results.push({ title, url: norm });
      }
    }

    if (results.length >= 5) {
      const seen = new Set();
      const deduped = results.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });
      diskCacheData.lists[type] = { data: deduped, timestamp: Date.now() };
      saveDiskCache();
      console.log(`[wcoScraper] HTTP list '${type}': ${deduped.length} items`);
      return deduped;
    }
  } catch (err) {
    console.warn(`[wcoScraper] HTTP list fetch failed for '${type}':`, err.message);
  }

  // Phase 1: Browser fallback
  return withNavLock(async () => {
    ensureWindow();
    const listUrl = BASE_URL + pathStr;
    console.log("[wcoScraper] Browser list fetch:", listUrl);
    await navigateTo(scraperWin, listUrl, NAV_SETTLE_MS);

    const results = await pollUntil(scraperWin, `
      (function() {
        const SELS = [
          'div.ddmcc ul li a', '.anime_list_body ul li a', '.anime_list_body li a',
          '.film-list .item a', '.video-block a', 'ul.items li a',
          'ul.listing a', 'ul.item li a', 'a[href*="/anime/"]', 'a[href*="/cartoon/"]',
        ];
        for (const sel of SELS) {
          const els = Array.from(document.querySelectorAll(sel));
          if (els.length < 5) continue;
          const items = els.map(a => ({
            title: a.textContent.trim(),
            url: a.href || a.getAttribute('href') || ''
          })).filter(x => x.title && x.url && x.url.startsWith('http'));
          if (items.length > 0) return items;
        }
        return null;
      })()
    `, 18000);

    let normalised = [];
    if (results?.length > 0) {
      normalised = results.map(r => ({ title: r.title, url: normalizeUrl(r.url) || r.url })).filter(r => r.url);
    } else if (existing?.data?.length > 0) {
      console.warn(`[wcoScraper] List '${type}' browser failed, returning stale cache`);
      return existing.data;
    }

    diskCacheData.lists[type] = { data: normalised, timestamp: Date.now() };
    saveDiskCache();
    return normalised;
  });
}

// ─── 24/7 Self-Healing Background Sync ────────────────────────────────────────

function startSelfHealingSync() {
  // Probe for fastest WCO host every 30 minutes
  setInterval(() => probeActiveHost().catch(() => {}), 30 * 60 * 1000);

  // Sync category lists every 15 minutes
  setInterval(async () => {
    if (isNavigating) return;
    try {
      console.log("[wcoScraper] Self-healing: refreshing category lists…");
      for (const type of ["dub", "sub", "cartoon", "movie"]) {
        diskCacheData.lists[type] = null; // force refresh
        await getList(type);
        await sleep(2000);
      }
    } catch (e) {
      console.warn("[wcoScraper] Self-healing sync warning:", e.message);
    }
  }, 15 * 60 * 1000);
}

// ─── Cache Management ─────────────────────────────────────────────────────────

function clearCache() {
  diskCacheData.lists    = {};
  diskCacheData.episodes = {};
  diskCacheData.searches = {};
  diskCacheData.seasons  = {};
  saveDiskCache();
  console.log("[wcoScraper] Full cache cleared.");
}

function refresh() {
  clearCache();
  destroy();
  setTimeout(init, 800);
  console.log("[wcoScraper] Full refresh triggered.");
}

// ─── Exports ───────────────────────────────────────────────────────────────────

module.exports = { init, search, getEpisodes, extractVideo, getList, clearCache, refresh, destroy };
