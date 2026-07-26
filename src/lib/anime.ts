import { Channel } from "./playlist";

// Which catalog groups count as anime/animation. Matched case-insensitively as
// substrings, because playlist group names vary a lot between sources
// ("Animation", "Anime & Cartoons", "Kids/Toons", ...).
const ANIME_GROUP_KEYWORDS = ["anime", "animation", "cartoon", "toon", "manga"];

export function isAnimeChannel(ch: Channel): boolean {
  const group = (ch.group || "").toLowerCase();
  return ANIME_GROUP_KEYWORDS.some((k) => group.includes(k));
}

export function selectAnime(channels: Channel[]): Channel[] {
  return channels.filter(isAnimeChannel);
}

export type AnimeSort =
  | "recommended"
  | "az"
  | "za"
  | "category"
  | "newest"
  | "oldest"
  | "shuffle"
  | "artwork"
  | "needs-artwork"
  | "my-list";

export interface AnimeSortOption {
  value: AnimeSort;
  label: string;
  /** Shown as a hint under the control so a sort is never a silent no-op. */
  note?: string;
}

export const ANIME_SORTS: AnimeSortOption[] = [
  { value: "recommended", label: "Recommended", note: "Catalog order as provided by the source" },
  { value: "az", label: "Title A → Z" },
  { value: "za", label: "Title Z → A" },
  { value: "category", label: "Category, then title" },
  { value: "newest", label: "Newest added first", note: "Backend catalog order; demo playlists have no add-date" },
  { value: "oldest", label: "Oldest added first", note: "Backend catalog order; demo playlists have no add-date" },
  { value: "shuffle", label: "Shuffle", note: "Reshuffles each time you pick it" },
  { value: "artwork", label: "With artwork first" },
  { value: "needs-artwork", label: "Missing artwork first", note: "Useful for spotting gaps to fill" },
  { value: "my-list", label: "In My List first" }
];

export type ArtworkFilter = "any" | "has" | "missing";
export type ViewMode = "grid" | "list";

export interface AnimeFilters {
  query: string;
  category: string;
  letter: string;
  artwork: ArtworkFilter;
  onlyMyList: boolean;
  sort: AnimeSort;
}

export const DEFAULT_ANIME_FILTERS: AnimeFilters = {
  query: "",
  category: "all",
  letter: "all",
  artwork: "any",
  onlyMyList: false,
  sort: "recommended"
};

export const LETTERS = ["#", ...("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""))];

function firstLetter(name: string): string {
  const c = (name.trim()[0] || "").toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

/**
 * `myListIds` drives both the "In My List" filter and its matching sort. It is
 * passed in rather than read here so this stays a pure function and remains
 * trivially testable.
 * `shuffleSeed` changes only when the user re-picks Shuffle, so re-renders do
 * not reorder the grid underneath them mid-scroll.
 */
export function applyAnimeFilters(
  channels: Channel[],
  filters: AnimeFilters,
  myListIds: Set<string>,
  shuffleSeed: number
): Channel[] {
  let out = [...channels];

  const q = filters.query.trim().toLowerCase();
  if (q) out = out.filter((c) => c.name.toLowerCase().includes(q) || (c.group || "").toLowerCase().includes(q));

  if (filters.category !== "all") out = out.filter((c) => c.group === filters.category);
  if (filters.letter !== "all") out = out.filter((c) => firstLetter(c.name) === filters.letter);
  if (filters.artwork === "has") out = out.filter((c) => !!c.logo);
  if (filters.artwork === "missing") out = out.filter((c) => !c.logo);
  if (filters.onlyMyList) out = out.filter((c) => myListIds.has(c.id));

  const byName = (a: Channel, b: Channel) => a.name.localeCompare(b.name);

  switch (filters.sort) {
    case "az":
      out.sort(byName);
      break;
    case "za":
      out.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "category":
      out.sort((a, b) => (a.group || "").localeCompare(b.group || "") || byName(a, b));
      break;
    case "newest":
      // Backend ids are SERIAL, so a larger numeric id really is a later row.
      // Non-numeric ids (demo playlist) fall back to name so the order is at
      // least stable and meaningful rather than arbitrary.
      out.sort((a, b) => numericId(b) - numericId(a) || byName(a, b));
      break;
    case "oldest":
      out.sort((a, b) => numericId(a) - numericId(b) || byName(a, b));
      break;
    case "artwork":
      out.sort((a, b) => Number(!!b.logo) - Number(!!a.logo) || byName(a, b));
      break;
    case "needs-artwork":
      out.sort((a, b) => Number(!!a.logo) - Number(!!b.logo) || byName(a, b));
      break;
    case "my-list":
      out.sort((a, b) => Number(myListIds.has(b.id)) - Number(myListIds.has(a.id)) || byName(a, b));
      break;
    case "shuffle":
      out = seededShuffle(out, shuffleSeed);
      break;
    case "recommended":
    default:
      break;
  }

  return out;
}

function numericId(c: Channel): number {
  const n = Number(c.id);
  return Number.isFinite(n) ? n : -1;
}

// Deterministic for a given seed, so the order stays put across re-renders.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
