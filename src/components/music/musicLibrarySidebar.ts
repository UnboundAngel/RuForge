import { bestCoverPath } from "@/mediaKind";
import type { MediaFile } from "@/types";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import { artistKeyFromFile, primaryArtist, rawArtistFromFile } from "./musicArtist";

export type LibrarySort = "recents" | "alphabetical" | "custom";
export type LibraryFilter = "playlists" | "artists" | null;

export const LIBRARY_SORT_LABELS: Record<LibrarySort, string> = {
  recents: "Recents",
  alphabetical: "Alphabetical",
  custom: "Custom order",
};

const SORT_KEY = "ruforge-music-library-sort";

export function readLibrarySort(): LibrarySort {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    return raw && raw in LIBRARY_SORT_LABELS ? (raw as LibrarySort) : "recents";
  } catch {
    return "recents";
  }
}

export function writeLibrarySort(sort: LibrarySort): void {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    /* sort choice is a convenience */
  }
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function matches(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || name.toLowerCase().includes(q);
}

/** Playlists for the sidebar: filtered by "Search in Your Library", then sorted. Custom keeps store order. */
export function sidebarPlaylists(
  records: VirtualPlaylistRecord[],
  sort: LibrarySort,
  query: string,
): VirtualPlaylistRecord[] {
  const shown = records.filter((r) => matches(r.title, query));
  if (sort === "recents") return [...shown].sort((a, b) => b.updatedAt - a.updatedAt);
  if (sort === "alphabetical") return [...shown].sort((a, b) => collator.compare(a.title, b.title));
  return shown;
}

export type SidebarArtist = {
  key: string;
  name: string;
  cover: string | null;
  trackCount: number;
  /** Newest `created` among the artist's tracks, for Recents. */
  latest: number;
};

/** Library artists grouped by primary artist, for the "Artists" filter chip. */
export function sidebarArtists(tracks: MediaFile[], sort: LibrarySort, query: string): SidebarArtist[] {
  const byKey = new Map<string, SidebarArtist>();
  for (const file of tracks) {
    const key = artistKeyFromFile(file);
    if (!key) continue;
    const entry = byKey.get(key);
    if (entry) {
      entry.trackCount += 1;
      entry.latest = Math.max(entry.latest, file.created || 0);
      entry.cover ??= bestCoverPath(file);
    } else {
      byKey.set(key, {
        key,
        name: primaryArtist(rawArtistFromFile(file)),
        cover: bestCoverPath(file),
        trackCount: 1,
        latest: file.created || 0,
      });
    }
  }
  const shown = [...byKey.values()].filter((a) => matches(a.name, query));
  if (sort === "alphabetical") return shown.sort((a, b) => collator.compare(a.name, b.name));
  if (sort === "recents") return shown.sort((a, b) => b.latest - a.latest);
  return shown.sort((a, b) => b.trackCount - a.trackCount || collator.compare(a.name, b.name));
}
