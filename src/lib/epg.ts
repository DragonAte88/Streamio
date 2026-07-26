// Live TV metadata + EPG layer.
//
// Data comes from the iptv-org open dataset (the same project that publishes the
// M3U playlist this app already reads):
//   channels.json - rich per-channel metadata (network, owners, city, launch date, ...)
//   streams.json  - per-stream technical info (quality/resolution, referrer, user agent)
//   guides.json   - which XMLTV guide files carry programme data for a channel
//
// Everything is fetched once and cached in localStorage with a TTL, because the
// channel dataset is a few MB and does not change minute to minute. EPG guide
// files are fetched lazily per channel, since they are large and most users only
// ever look at a handful of channels.

const API = "https://iptv-org.github.io/api";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h - dataset changes daily at most

export interface IptvChannelMeta {
  id: string;
  name: string;
  alt_names?: string[];
  network?: string | null;
  owners?: string[];
  country?: string;
  subdivision?: string | null;
  city?: string | null;
  categories?: string[];
  languages?: string[];
  is_nsfw?: boolean;
  launched?: string | null;
  closed?: string | null;
  replaced_by?: string | null;
  website?: string | null;
  logo?: string | null;
}

export interface IptvStreamMeta {
  channel: string | null;
  url: string;
  /** e.g. "1080p", "720p" - source-declared, not measured */
  quality?: string | null;
  user_agent?: string | null;
  referrer?: string | null;
}

export interface IptvGuideMeta {
  channel: string | null;
  site: string;
  site_id: string;
  site_name: string;
  lang: string;
  url: string;
}

/** One EPG programme entry parsed out of an XMLTV guide. */
export interface Programme {
  channelId: string;
  title: string;
  description?: string;
  category?: string;
  start: Date;
  stop: Date;
  episodeNum?: string;
  rating?: string;
  icon?: string;
}

interface Cached<T> {
  at: number;
  data: T;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: Cached<T> = JSON.parse(raw);
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data } as Cached<T>));
  } catch {
    // Quota exceeded is expected once the datasets get large - the app still
    // works, it just refetches next time rather than serving from cache.
  }
}

async function fetchJsonCached<T>(path: string, cacheKey: string): Promise<T[]> {
  const cached = readCache<T[]>(cacheKey);
  if (cached) return cached;
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  const data = (await res.json()) as T[];
  writeCache(cacheKey, data);
  return data;
}

export const fetchChannelMeta = () => fetchJsonCached<IptvChannelMeta>("channels.json", "epg_channels_v1");
export const fetchStreamMeta = () => fetchJsonCached<IptvStreamMeta>("streams.json", "epg_streams_v1");
export const fetchGuideMeta = () => fetchJsonCached<IptvGuideMeta>("guides.json", "epg_guides_v1");

/**
 * XMLTV timestamps look like "20260726013000 +0000". Date can't parse that
 * directly, so pull the fields out and build it explicitly. Returns null rather
 * than an Invalid Date so callers can distinguish "no time" from "bad time".
 */
export function parseXmltvDate(value: string): Date | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, tz] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s || "00"}${
    tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : "Z"
  }`;
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

/** Parse an XMLTV document into programme entries. */
export function parseXmltv(xml: string): Programme[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const out: Programme[] = [];

  doc.querySelectorAll("programme").forEach((el) => {
    const start = parseXmltvDate(el.getAttribute("start") || "");
    const stop = parseXmltvDate(el.getAttribute("stop") || "");
    if (!start || !stop) return; // an entry with no usable time can't be placed on a grid

    const text = (sel: string) => el.querySelector(sel)?.textContent?.trim() || undefined;

    out.push({
      channelId: el.getAttribute("channel") || "",
      title: text("title") || "Untitled",
      description: text("desc"),
      category: text("category"),
      start,
      stop,
      episodeNum: text("episode-num"),
      rating: el.querySelector("rating value")?.textContent?.trim() || undefined,
      icon: el.querySelector("icon")?.getAttribute("src") || undefined
    });
  });

  return out;
}

/** The programme covering `at`, plus what follows it. */
export function nowAndNext(programmes: Programme[], at = new Date()) {
  const sorted = [...programmes].sort((a, b) => a.start.getTime() - b.start.getTime());
  const nowIdx = sorted.findIndex((p) => p.start <= at && p.stop > at);
  return {
    now: nowIdx >= 0 ? sorted[nowIdx] : null,
    next: nowIdx >= 0 ? sorted[nowIdx + 1] || null : sorted.find((p) => p.start > at) || null
  };
}

/** How far through a programme we currently are, 0-100. */
export function programmeProgress(p: Programme, at = new Date()): number {
  const total = p.stop.getTime() - p.start.getTime();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, ((at.getTime() - p.start.getTime()) / total) * 100));
}

/**
 * Live TV channel: the catalog entry joined with everything we know about it.
 * Fields are optional because the open dataset genuinely does not have complete
 * coverage - the UI shows "—" rather than inventing values.
 */
export interface LiveChannel {
  // From the user's own catalog
  id: string;
  name: string;
  url: string;
  group: string;
  logo?: string;
  tvgId?: string;

  /** Sequential channel number assigned on load (the datasets carry no LCN). */
  number: number;

  // From channels.json
  meta?: IptvChannelMeta;
  // From streams.json
  stream?: IptvStreamMeta;
  // From guides.json - which XMLTV files might carry programme data
  guides?: IptvGuideMeta[];

  // Populated lazily once a guide has been fetched
  now?: Programme | null;
  next?: Programme | null;
}

export interface CatalogChannelLike {
  id: string;
  name: string;
  url: string;
  group: string;
  logo?: string;
  tvgId?: string;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Join catalog channels to the open dataset. Matching is by tvg-id first (exact
 * and authoritative when present), then by normalized name, then by stream URL.
 * Channel numbers are assigned after matching so they stay stable for a given
 * catalog ordering.
 */
export function buildLiveChannels(
  catalog: CatalogChannelLike[],
  channelMeta: IptvChannelMeta[],
  streamMeta: IptvStreamMeta[],
  guideMeta: IptvGuideMeta[]
): LiveChannel[] {
  const byId = new Map(channelMeta.map((c) => [c.id, c]));
  const byName = new Map<string, IptvChannelMeta>();
  for (const c of channelMeta) {
    const key = normalize(c.name);
    if (!byName.has(key)) byName.set(key, c);
  }

  const streamByUrl = new Map(streamMeta.map((s) => [s.url, s]));
  const streamByChannel = new Map<string, IptvStreamMeta>();
  for (const s of streamMeta) {
    if (s.channel && !streamByChannel.has(s.channel)) streamByChannel.set(s.channel, s);
  }

  const guidesByChannel = new Map<string, IptvGuideMeta[]>();
  for (const g of guideMeta) {
    if (!g.channel) continue;
    const list = guidesByChannel.get(g.channel) || [];
    list.push(g);
    guidesByChannel.set(g.channel, list);
  }

  return catalog.map((ch, i) => {
    const meta =
      (ch.tvgId && byId.get(ch.tvgId)) ||
      byName.get(normalize(ch.name)) ||
      undefined;

    const stream = streamByUrl.get(ch.url) || (meta ? streamByChannel.get(meta.id) : undefined);
    const guides = meta ? guidesByChannel.get(meta.id) : undefined;

    return {
      ...ch,
      number: i + 1,
      meta,
      stream,
      guides,
      now: undefined,
      next: undefined
    };
  });
}

/** Every detail the UI can show for a channel, in display order. */
export function channelDetailRows(ch: LiveChannel): { label: string; value: string }[] {
  const m = ch.meta;
  const dash = (v: unknown) =>
    v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) ? "—" : String(v);
  const list = (v?: string[]) => (v && v.length ? v.join(", ") : "—");

  return [
    { label: "Channel number", value: String(ch.number) },
    { label: "Name", value: ch.name },
    { label: "Alternate names", value: list(m?.alt_names) },
    { label: "Catalog group", value: dash(ch.group) },
    { label: "Categories", value: list(m?.categories) },
    { label: "Network", value: dash(m?.network) },
    { label: "Owners", value: list(m?.owners) },
    { label: "Country", value: dash(m?.country) },
    { label: "Subdivision", value: dash(m?.subdivision) },
    { label: "City", value: dash(m?.city) },
    { label: "Languages", value: list(m?.languages) },
    { label: "Launched", value: dash(m?.launched) },
    { label: "Closed", value: dash(m?.closed) },
    { label: "Replaced by", value: dash(m?.replaced_by) },
    { label: "Adult content", value: m?.is_nsfw === undefined ? "—" : m.is_nsfw ? "Yes" : "No" },
    { label: "Website", value: dash(m?.website) },
    { label: "Stream quality", value: dash(ch.stream?.quality) },
    { label: "Custom user agent", value: dash(ch.stream?.user_agent) },
    { label: "Referrer required", value: ch.stream?.referrer ? "Yes" : "—" },
    { label: "EPG guides available", value: ch.guides?.length ? String(ch.guides.length) : "—" },
    { label: "EPG source", value: dash(ch.guides?.[0]?.site_name) },
    { label: "EPG language", value: dash(ch.guides?.[0]?.lang) },
    { label: "tvg-id", value: dash(ch.tvgId) },
    { label: "Dataset id", value: dash(m?.id) },
    { label: "Logo", value: ch.logo || m?.logo ? "Available" : "—" },
    { label: "Now playing", value: ch.now ? ch.now.title : "—" },
    { label: "Programme category", value: dash(ch.now?.category) },
    { label: "Episode", value: dash(ch.now?.episodeNum) },
    { label: "Rating", value: dash(ch.now?.rating) },
    { label: "Up next", value: ch.next ? ch.next.title : "—" },
    { label: "Stream URL", value: ch.url }
  ];
}
