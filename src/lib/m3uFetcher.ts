import { Channel } from "./playlist";

/**
 * Basic M3U parser that extracts EXTINF data and URLs.
 * Much lighter than the full iptv-playlist-parser for fast background fetching.
 */
function parseBasicM3u(text: string, defaultGroup: string): Channel[] {
  const lines = text.split("\n");
  const channels: Channel[] = [];
  
  let currentChannel: Partial<Channel> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      currentChannel = {};
      
      // Extract tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if (logoMatch) currentChannel.logo = logoMatch[1];
      
      // Extract group-title
      const groupMatch = line.match(/group-title="([^"]+)"/);
      if (groupMatch) currentChannel.group = groupMatch[1];
      else currentChannel.group = defaultGroup;
      
      // Extract name (everything after the last comma)
      const commaIdx = line.lastIndexOf(",");
      if (commaIdx !== -1) {
        currentChannel.name = line.substring(commaIdx + 1).trim();
      } else {
        currentChannel.name = "Unknown Channel";
      }
    } else if (!line.startsWith("#")) {
      if (currentChannel) {
        currentChannel.url = line;
        currentChannel.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
        channels.push(currentChannel as Channel);
        currentChannel = null;
      }
    }
  }

  return channels;
}

export async function fetchRemoteM3u(url: string, defaultGroup: string): Promise<Channel[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    return parseBasicM3u(text, defaultGroup);
  } catch (err) {
    console.error(`Failed to fetch M3U from ${url}`, err);
    return [];
  }
}

// Popular iptv-org lists and retro lists
export const M3U_SOURCES = {
  news: "https://iptv-org.github.io/iptv/categories/news.m3u",
  sports: "https://iptv-org.github.io/iptv/categories/sports.m3u",
  movies: "https://iptv-org.github.io/iptv/categories/movies.m3u",
  kids: "https://iptv-org.github.io/iptv/categories/kids.m3u",
  animation: "https://iptv-org.github.io/iptv/categories/animation.m3u",
  toonamiPst: "http://api.toonamiaftermath.com:3000/pst/playlist.m3u8",
  toonamiEst: "http://api.toonamiaftermath.com:3000/est/playlist.m3u8"
};
