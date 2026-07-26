const { BrowserWindow } = require("electron");

let scraperWin = null;
const BASE_URL = "https://www.wcostream.tv";

// How long to wait (ms) for DOM elements to appear after navigation
const PAGE_WAIT_MS = 8000;
const ELEM_POLL_INTERVAL = 300;

function init() {
  if (scraperWin) return;
  scraperWin = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: true,
      // Grant same-origin fetch access to wcostream.tv pages
    }
  });

  scraperWin.on("closed", () => {
    scraperWin = null;
  });

  // Warm up - load base URL to pass any initial CF gate
  scraperWin.loadURL(BASE_URL).catch(() => {});
}

/**
 * Wait for a CSS selector to appear in the page DOM (polling).
 * Returns the list of matching elements as serialized objects, or [] on timeout.
 */
async function waitForSelector(selector, timeoutMs = PAGE_WAIT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await scraperWin.webContents.executeJavaScript(`
      (function() {
        const els = document.querySelectorAll(${JSON.stringify(selector)});
        return els.length;
      })();
    `).catch(() => 0);
    if (found > 0) return true;
    await new Promise(r => setTimeout(r, ELEM_POLL_INTERVAL));
  }
  return false;
}

/**
 * Extract items from the current page using multiple selector fallbacks.
 * selectorGroups: array of { container, link } pairs to try in order.
 * Returns array of { title, url }.
 */
async function extractLinks(selectorGroups) {
  const code = `
    (function() {
      const groups = ${JSON.stringify(selectorGroups)};
      for (const { container, link } of groups) {
        const els = document.querySelectorAll(container + ' ' + link);
        if (els.length > 0) {
          return Array.from(els).map(a => ({
            title: a.textContent.trim(),
            url: a.href
          })).filter(x => x.title && x.url && x.url.startsWith('http'));
        }
      }
      // Last resort: any link that looks like a show/episode URL
      const fallback = document.querySelectorAll('a[href*="/anime/"], a[href*="/cartoon/"], a[href*="-episode-"]');
      if (fallback.length > 0) {
        return Array.from(fallback).map(a => ({
          title: a.textContent.trim(),
          url: a.href
        })).filter(x => x.title && x.url);
      }
      return [];
    })();
  `;
  return await scraperWin.webContents.executeJavaScript(code).catch(() => []);
}

async function ensureOnSite() {
  if (!scraperWin || scraperWin.isDestroyed()) init();
  const url = scraperWin.webContents.getURL();
  if (!url.startsWith(BASE_URL)) {
    await scraperWin.loadURL(BASE_URL).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
  }
}

/**
 * Search for a show. Navigates the scraper window to the search results page
 * so WCO's own JS can render results, then extracts them.
 */
async function search(query, filterType = 'all') {
  await ensureOnSite();

  // POST-based search: inject a form submit into the current wcostream.tv context
  const searchCode = `
    (async function() {
      const fd = new URLSearchParams();
      fd.append('catara', ${JSON.stringify(query)});
      fd.append('konuara', 'series');
      const res = await fetch('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        body: fd.toString()
      });
      return await res.text();
    })();
  `;

  let html = '';
  try {
    html = await scraperWin.webContents.executeJavaScript(searchCode);
  } catch (err) {
    console.error("[wcoScraper] search fetch error:", err.message);
    return [];
  }

  // Parse results from returned HTML
  const parseCode = `
    (function(html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const results = [];

      // Try multiple selector patterns for robustness
      const selectors = [
        '.cerceve .aramacerceve a',
        '.film-poster a',
        '.search-result a',
        '.video-block a',
        'div[class*="result"] a',
        'div[class*="search"] a[href*="wcostream"]',
        'ul.items li a',
        '.thumb a',
        'a[href*="/anime/"]',
        'a[href*="/cartoon/"]',
      ];

      for (const sel of selectors) {
        const els = doc.querySelectorAll(sel);
        if (els.length > 0) {
          els.forEach(a => {
            const title = a.textContent.trim() || a.title || a.getAttribute('data-title');
            const href = a.href || a.getAttribute('href');
            if (title && href && href.includes('wcostream')) {
              results.push({ title, url: href });
            }
          });
          if (results.length > 0) break;
        }
      }
      return results;
    })(${JSON.stringify(html)});
  `;

  let results = [];
  try {
    results = await scraperWin.webContents.executeJavaScript(parseCode);
  } catch (err) {
    console.error("[wcoScraper] search parse error:", err.message);
  }

  if (results.length === 0) {
    // Debug: log first 500 chars of response
    console.log("[wcoScraper] search returned 0 results. HTML preview:", html.substring(0, 500));
  }

  // Apply type filter
  if (filterType === 'dub') {
    results = results.filter(r => !r.title.toLowerCase().includes('subbed'));
  } else if (filterType === 'sub') {
    results = results.filter(r => !r.title.toLowerCase().includes('dubbed'));
  } else if (filterType === 'cartoon') {
    results = results.filter(r => {
      const t = r.title.toLowerCase();
      return !t.includes('subbed') && !t.includes('dubbed');
    });
  }

  return results;
}

/**
 * Get episodes for a show. Navigates the scraper window to the show page so
 * WCO's own JavaScript can load the episode list dynamically, then extracts it.
 */
async function getEpisodes(showUrl) {
  if (!scraperWin || scraperWin.isDestroyed()) init();

  console.log("[wcoScraper] Loading show page:", showUrl);

  try {
    await scraperWin.loadURL(showUrl);
  } catch (err) {
    // Ignore navigation errors (e.g., net::ERR_ABORTED from stop())
    if (!err.message?.includes('ERR_ABORTED')) {
      console.error("[wcoScraper] loadURL error:", err.message);
    }
  }

  // Wait for the page to settle
  await new Promise(r => setTimeout(r, 3000));

  // Try multiple episode list selectors, polling for up to 8 seconds
  const episodeSelectors = [
    '#catlist-listview a',         // Most common WCO selector
    '.cat-eps a',                  // Legacy
    '#episode_related a',          // Alternative
    '.episodes-area a',            // Alternative  
    'ul.listing.items.lists a',    // Some templates
    '.list-episode a',
    'div[class*="eps"] a',
    'div[class*="episode"] a',
    '.video-info-left ul a',
    'ul.eplist a',
  ];

  // Poll for any episode selector to return results
  let eps = [];
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    const code = `
      (function() {
        const selectors = ${JSON.stringify(episodeSelectors)};
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            return {
              selector: sel,
              items: Array.from(els).map(a => ({
                title: a.textContent.trim(),
                url: a.href
              })).filter(x => x.title && x.url && x.url.includes('wcostream'))
            };
          }
        }
        return { selector: null, items: [] };
      })();
    `;

    const result = await scraperWin.webContents.executeJavaScript(code).catch(() => ({ selector: null, items: [] }));

    if (result.items.length > 0) {
      console.log(`[wcoScraper] Found ${result.items.length} episodes using selector: ${result.selector}`);
      eps = result.items;
      break;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  if (eps.length === 0) {
    // Debug: dump page title and first selectors available
    const debug = await scraperWin.webContents.executeJavaScript(`
      ({ title: document.title, url: location.href, bodySnippet: document.body.innerHTML.substring(0, 800) })
    `).catch(() => ({}));
    console.log("[wcoScraper] No episodes found. Page debug:", JSON.stringify(debug).substring(0, 500));
  }

  return eps.reverse(); // Chronological order
}

/**
 * Extract video stream URL from an episode page.
 * Loads the page in the scraper window and intercepts the first m3u8/mp4 request.
 */
async function extractVideo(episodeUrl) {
  return new Promise(async (resolve) => {
    if (!scraperWin || scraperWin.isDestroyed()) init();

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(null);
      }
    }, 20000);

    const requestFilter = { urls: ["*://*/*.m3u8*", "*://*/*.mp4*"] };

    const handler = (details) => {
      const url = details.url;
      // Skip ad/tracker URLs and tiny segments
      if ((url.includes('.m3u8') || url.includes('.mp4')) && !resolved) {
        // Filter out obvious ad/analytics URLs
        if (url.includes('doubleclick') || url.includes('googlesyndication') || url.includes('adnxs')) return;
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        scraperWin.webContents.stop();
        resolve(url);
      }
    };

    function cleanup() {
      try {
        scraperWin.webContents.session.webRequest.onBeforeRequest(requestFilter, null);
      } catch {}
    }

    scraperWin.webContents.session.webRequest.onBeforeRequest(requestFilter, handler);

    try {
      await scraperWin.loadURL(episodeUrl);
    } catch (err) {
      if (!err.message?.includes('ERR_ABORTED')) {
        console.error("[wcoScraper] extractVideo loadURL error:", err.message);
      }
    }
  });
}

// In-memory cache for list pages
const cache = {
  cartoon: null,
  dub: null,
  sub: null,
  movie: null
};

/**
 * Get the full list of shows for a given category.
 * Uses fetch() inside the WCO context to avoid a full page navigation.
 */
async function getList(type) {
  if (cache[type]) return cache[type];
  await ensureOnSite();

  let listPath = "";
  if (type === 'cartoon') listPath = "/cartoon-list";
  else if (type === 'dub') listPath = "/dubbed-anime-list";
  else if (type === 'sub') listPath = "/subbed-anime-list";
  else if (type === 'movie') listPath = "/movie-list";
  else throw new Error("Invalid type: " + type);

  const code = `
    (async function() {
      const res = await fetch(${JSON.stringify(listPath)});
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const results = [];
      // Multiple selector fallbacks for the list pages
      const selectors = [
        'div.ddmcc ul li a',
        '.film-list .item a',
        '.video-block a',
        'ul.items li a',
        '.anime_list_body li a',
        'ul.listing a',
        'a[href*="wcostream"][href*="/anime/"]',
        'a[href*="wcostream"][href*="/cartoon/"]',
      ];

      for (const sel of selectors) {
        const els = doc.querySelectorAll(sel);
        if (els.length > 0) {
          els.forEach(a => {
            const title = a.textContent.trim();
            const url = a.href || a.getAttribute('href');
            if (title && url) results.push({ title, url });
          });
          if (results.length > 0) break;
        }
      }
      return results;
    })();
  `;

  try {
    const results = await scraperWin.webContents.executeJavaScript(code);
    if (results.length > 0) {
      cache[type] = results;
    } else {
      console.log(`[wcoScraper] getList('${type}') returned 0 items`);
    }
    return results;
  } catch (err) {
    console.error("[wcoScraper] getList error:", err);
    return [];
  }
}

function destroy() {
  if (!scraperWin) return;
  try {
    if (!scraperWin.isDestroyed()) scraperWin.destroy();
  } catch {}
  scraperWin = null;
}

function clearCache() {
  cache.cartoon = null;
  cache.dub = null;
  cache.sub = null;
  cache.movie = null;
  console.log("[wcoScraper] Cache cleared.");
}

/**
 * Full refresh: destroy the hidden window (clearing Cloudflare cookies + session)
 * and wipe the list cache so everything re-fetches fresh.
 */
function refresh() {
  clearCache();
  destroy();
  init();
  console.log("[wcoScraper] Full refresh — window restarted, cache cleared.");
}

module.exports = {
  init,
  search,
  getEpisodes,
  extractVideo,
  getList,
  clearCache,
  refresh,
  destroy
};
