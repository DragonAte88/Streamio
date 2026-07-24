// @ts-ignore - no types published for iptv-playlist-parser
import parser from "iptv-playlist-parser";

export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group: string;
  tvgId?: string;
}

export interface ChannelGroup {
  name: string;
  channels: Channel[];
}

export function parseM3U(text: string): Channel[] {
  const result = parser.parse(text);
  return result.items.map((item: any, i: number): Channel => ({
    id: item.tvg?.id || `${i}-${item.name}`,
    name: item.name || item.tvg?.name || `Channel ${i + 1}`,
    url: item.url,
    logo: item.tvg?.logo || undefined,
    group: item.group?.title || "Uncategorized",
    tvgId: item.tvg?.id
  }));
}

export function groupChannels(channels: Channel[]): ChannelGroup[] {
  const map = new Map<string, Channel[]>();
  for (const ch of channels) {
    if (!map.has(ch.group)) map.set(ch.group, []);
    map.get(ch.group)!.push(ch);
  }
  return Array.from(map.entries()).map(([name, chs]) => ({ name, channels: chs }));
}

export async function loadPlaylistFromUrl(url: string): Promise<Channel[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch playlist: ${res.status}`);
  const text = await res.text();
  return parseM3U(text);
}
