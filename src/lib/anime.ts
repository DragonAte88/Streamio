// WCO-sourced item type (dub, sub, cartoon, movie)
export type WcoType = "dub" | "sub" | "cartoon" | "movie";

export interface WcoItem {
  id: string; // `${type}-${index}`
  title: string;
  url: string;
  type: WcoType;
  /** Category label shown in UI */
  category: string;
}

export const WCO_TYPE_LABELS: Record<WcoType, string> = {
  dub: "Dubbed Anime",
  sub: "Subbed Anime",
  cartoon: "Cartoons",
  movie: "Anime Movies",
};

export type AnimeSort =
  | "recommended"
  | "az"
  | "za"
  | "category"
  | "type-dub"
  | "type-sub"
  | "type-cartoon"
  | "type-movie"
  | "shuffle"
  | "my-list";

export interface AnimeSortOption {
  value: AnimeSort;
  label: string;
  note?: string;
}

export const ANIME_SORTS: AnimeSortOption[] = [
  { value: "recommended", label: "✦ Recommended", note: "Catalog order from WCO" },
  { value: "az", label: "Title A → Z" },
  { value: "za", label: "Title Z → A" },
  { value: "category", label: "By Category" },
  { value: "type-dub", label: "Dubbed Anime first" },
  { value: "type-sub", label: "Subbed Anime first" },
  { value: "type-cartoon", label: "Cartoons first" },
  { value: "type-movie", label: "Movies first" },
  { value: "shuffle", label: "🔀 Shuffle", note: "Reshuffles each time you pick it" },
  { value: "my-list", label: "★ My List first" },
];

export type ArtworkFilter = "any" | "has" | "missing";
export type ViewMode = "grid" | "list";

export interface AnimeFilters {
  query: string;
  category: WcoType | "all";
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
  sort: "recommended",
};

export const LETTERS = ["#", ...("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""))];

function firstLetter(name: string): string {
  const c = (name.trim()[0] || "").toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

export function applyAnimeFilters(
  items: WcoItem[],
  filters: AnimeFilters,
  myListIds: Set<string>,
  shuffleSeed: number,
  artworkMap: Map<string, string | null>
): WcoItem[] {
  let out = [...items];

  const q = filters.query.trim().toLowerCase();
  if (q) out = out.filter((c) => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));

  if (filters.category !== "all") out = out.filter((c) => c.type === filters.category);
  if (filters.letter !== "all") out = out.filter((c) => firstLetter(c.title) === filters.letter);

  if (filters.artwork === "has") out = out.filter((c) => !!artworkMap.get(c.id));
  if (filters.artwork === "missing") out = out.filter((c) => !artworkMap.get(c.id));
  if (filters.onlyMyList) out = out.filter((c) => myListIds.has(c.id));

  const byName = (a: WcoItem, b: WcoItem) => a.title.localeCompare(b.title);

  const typeOrder: Record<WcoType, number> = { dub: 0, sub: 1, cartoon: 2, movie: 3 };

  switch (filters.sort) {
    case "az":
      out.sort(byName);
      break;
    case "za":
      out.sort((a, b) => b.title.localeCompare(a.title));
      break;
    case "category":
      out.sort((a, b) => a.category.localeCompare(b.category) || byName(a, b));
      break;
    case "type-dub":
      out.sort((a, b) => (a.type === "dub" ? -1 : b.type === "dub" ? 1 : 0) || byName(a, b));
      break;
    case "type-sub":
      out.sort((a, b) => (a.type === "sub" ? -1 : b.type === "sub" ? 1 : 0) || byName(a, b));
      break;
    case "type-cartoon":
      out.sort((a, b) => (a.type === "cartoon" ? -1 : b.type === "cartoon" ? 1 : 0) || byName(a, b));
      break;
    case "type-movie":
      out.sort((a, b) => (a.type === "movie" ? -1 : b.type === "movie" ? 1 : 0) || byName(a, b));
      break;
    case "shuffle":
      out = seededShuffle(out, shuffleSeed);
      break;
    case "my-list":
      out.sort((a, b) => Number(myListIds.has(b.id)) - Number(myListIds.has(a.id)) || byName(a, b));
      break;
    case "recommended":
    default:
      // Interleave: alternate dub → sub → cartoon → movie so each type appears throughout
      out.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
      break;
  }

  return out;
}

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
