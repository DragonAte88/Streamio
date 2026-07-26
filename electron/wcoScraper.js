const { BrowserWindow, session } = require("electron");

let scraperWin = null;
const BASE_URL = "https://www.wcostream.tv";

function init() {
  if (scraperWin) return;
  scraperWin = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: true
    }
  });

  // Load the base URL once to clear any initial Cloudflare checks
  scraperWin.loadURL(BASE_URL).catch(() => {});
}

async function ensureReady() {
  if (!scraperWin) init();
  
  // If we're not on wcostream.tv, load it
  const url = scraperWin.webContents.getURL();
  if (!url.startsWith(BASE_URL)) {
    await scraperWin.loadURL(BASE_URL);
  }
}

async function search(query, filterType = 'all') {
  await ensureReady();

  // Inject a fetch request into the trusted context to bypass CF
  const code = `
    (async () => {
      const fd = new URLSearchParams();
      fd.append('catara', ${JSON.stringify(query)});
      fd.append('konuara', 'series');
      
      const res = await fetch('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: fd
      });
      const html = await res.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const results = [];
      doc.querySelectorAll('div.cerceve').forEach(item => {
        const a = item.querySelector('.aramacerceve a');
        if (a) {
          results.push({ title: a.textContent.trim(), url: a.href });
        }
      });
      return { results, html: results.length === 0 ? html.substring(0, 1000) : null };
    })();
  `;

  try {
    let { results, html } = await scraperWin.webContents.executeJavaScript(code);
    if (html) console.log("[wcoScraper debug] HTML:", html);
    
    // Apply filters matching the user's intent
    if (filterType === 'dub') {
      // Exclude subbed
      results = results.filter(r => !r.title.toLowerCase().includes('subbed'));
    } else if (filterType === 'sub') {
      // Exclude dubbed
      results = results.filter(r => !r.title.toLowerCase().includes('dubbed'));
    } else if (filterType === 'cartoon') {
      // Cartoons typically don't have (Subbed) or (Dubbed) in the title on WCO
      results = results.filter(r => {
        const t = r.title.toLowerCase();
        return !t.includes('subbed') && !t.includes('dubbed');
      });
    }
    
    return results;
  } catch (err) {
    console.error("[wcoScraper] search error:", err);
    return [];
  }
}

async function getEpisodes(showUrl) {
  await ensureReady();
  
  const code = `
    (async () => {
      const res = await fetch(${JSON.stringify(showUrl)});
      const html = await res.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const eps = [];
      doc.querySelectorAll('div.cat-eps a').forEach(a => {
        eps.push({ title: a.textContent.trim(), url: a.href });
      });
      return eps;
    })();
  `;
  
  try {
    const eps = await scraperWin.webContents.executeJavaScript(code);
    return eps.reverse(); // Chronological order
  } catch (err) {
    console.error("[wcoScraper] getEpisodes error:", err);
    return [];
  }
}

async function extractVideo(episodeUrl) {
  // To avoid dealing with ever-changing obfuscation (getVid, base64), we load the page,
  // let the iframe load, and capture the media URL using webRequest interceptor.
  return new Promise(async (resolve, reject) => {
    if (!scraperWin) init();

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, 15000); // 15 sec timeout

    const requestFilter = {
      urls: ["*://*/*.m3u8*", "*://*/*.mp4*"]
    };

    const handler = (details) => {
      // Ignore tiny unrelated videos or tracking m3u8s if any
      const url = details.url;
      if (url.includes('.m3u8') || url.includes('.mp4')) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          // Remove listener once found
          scraperWin.webContents.session.webRequest.onBeforeRequest(requestFilter, null);
          
          // Stop loading the page further
          scraperWin.webContents.stop(); 
          resolve(url);
        }
      }
    };

    // Attach interceptor
    scraperWin.webContents.session.webRequest.onBeforeRequest(requestFilter, handler);

    try {
      await scraperWin.loadURL(episodeUrl);
    } catch (err) {
      // Ignored - loadURL throws if we call stop() while it's loading, which is expected!
    }
  });
}

const cache = {
  cartoon: null,
  dub: null,
  sub: null,
  movie: null
};

async function getList(type) {
  if (cache[type]) return cache[type];
  await ensureReady();

  let listPath = "";
  if (type === 'cartoon') listPath = "/cartoon-list";
  else if (type === 'dub') listPath = "/dubbed-anime-list";
  else if (type === 'sub') listPath = "/subbed-anime-list";
  else if (type === 'movie') listPath = "/movie-list";
  else throw new Error("Invalid type: " + type);

  const code = `
    (async () => {
      const res = await fetch(${JSON.stringify(listPath)});
      const html = await res.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const results = [];
      doc.querySelectorAll('div.ddmcc ul li a').forEach(a => {
        results.push({ title: a.textContent.trim(), url: a.href });
      });
      return results;
    })();
  `;

  try {
    const results = await scraperWin.webContents.executeJavaScript(code);
    cache[type] = results;
    return results;
  } catch (err) {
    console.error("[wcoScraper] getList error:", err);
    return [];
  }
}

// This module's hidden window is still a real BrowserWindow. An open window -
// even one that is never shown - prevents Electron's "window-all-closed" event
// from firing, so without this the app process survives after the user closes
// the visible window. Must be called during shutdown.
function destroy() {
  if (!scraperWin) return;
  try {
    if (!scraperWin.isDestroyed()) scraperWin.destroy();
  } catch {}
  scraperWin = null;
}

module.exports = {
  init,
  search,
  getEpisodes,
  extractVideo,
  getList,
  destroy
};
