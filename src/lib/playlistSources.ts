export interface PlaylistSource {
  id: string;
  name: string;
  url: string;
  channelCount: number;
  addedAt: number;
}

const KEY = "streamio.playlistSources";

export function listSources(): PlaylistSource[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function addSource(source: PlaylistSource) {
  const sources = listSources();
  sources.push(source);
  localStorage.setItem(KEY, JSON.stringify(sources));
}

export function removeSource(id: string) {
  localStorage.setItem(KEY, JSON.stringify(listSources().filter((s) => s.id !== id)));
}
