import type { PlaylistCollection } from "@/types";
import { WATCH_LATER_ID, isVirtualPlaylistPath, virtualPlaylistPath } from "@/virtualPlaylists";

export type PlaylistsSortMode = "recent" | "played" | "name" | "size";

export const PLAYLISTS_SORT_OPTIONS: Array<{ mode: PlaylistsSortMode; label: string }> = [
  { mode: "recent", label: "Recently added" },
  { mode: "played", label: "Recently played" },
  { mode: "name", label: "A to Z" },
  { mode: "size", label: "Most videos" },
];

const WATCH_LATER_PATH = virtualPlaylistPath(WATCH_LATER_ID);

const newestCreated = (p: PlaylistCollection) => p.items[0]?.created || 0;

/** Watch later stays first in every mode. `lastPlayed` is ms, or null when never played. */
export function sortPlaylists(
  playlists: readonly PlaylistCollection[],
  mode: PlaylistsSortMode,
  lastPlayed: (path: string) => number | null,
): PlaylistCollection[] {
  const cmp = (a: PlaylistCollection, b: PlaylistCollection): number => {
    const aw = a.path === WATCH_LATER_PATH;
    const bw = b.path === WATCH_LATER_PATH;
    if (aw !== bw) return aw ? -1 : 1;
    switch (mode) {
      case "name":
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
      case "size":
        return b.itemCount - a.itemCount || newestCreated(b) - newestCreated(a);
      case "played": {
        const pa = lastPlayed(a.path) ?? -1;
        const pb = lastPlayed(b.path) ?? -1;
        return pb - pa || newestCreated(b) - newestCreated(a);
      }
      default: {
        const av = isVirtualPlaylistPath(a.path);
        const bv = isVirtualPlaylistPath(b.path);
        if (av !== bv) return av ? -1 : 1;
        return newestCreated(b) - newestCreated(a);
      }
    }
  };
  return [...playlists].sort(cmp);
}
