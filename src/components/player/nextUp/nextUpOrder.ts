import type { MediaFile } from "../../../types";

export type NextUpSort = "folder" | "newest" | "oldest" | "shortest" | "longest" | "channel";

export const NEXT_UP_SORT_OPTIONS: ReadonlyArray<{ id: NextUpSort; label: string }> = [
  { id: "folder", label: "Folder order" },
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "shortest", label: "Shortest" },
  { id: "longest", label: "Longest" },
  { id: "channel", label: "Channel A to Z" },
];

export function isNextUpSort(value: unknown): value is NextUpSort {
  return NEXT_UP_SORT_OPTIONS.some((o) => o.id === value);
}

/** Unix seconds the video went public when known, else when the file landed on disk. */
export function nextUpDate(item: MediaFile): number {
  return item.youtube?.publishedAt || item.created || 0;
}

const channelOf = (item: MediaFile) => item.youtube?.channel?.trim() ?? "";

/** True when at least two items carry a channel, so "Channel A to Z" would actually reorder something. */
export function hasChannelData(items: readonly MediaFile[]): boolean {
  return items.filter((i) => channelOf(i) !== "").length > 1;
}

/**
 * Folder order is the input order (natural path sort). Every other sort is stable, so ties keep
 * folder order. Channel sort puts items without a channel last.
 */
export function sortNextUpItems(items: readonly MediaFile[], sort: NextUpSort): MediaFile[] {
  const list = [...items];
  switch (sort) {
    case "newest":
      return list.sort((a, b) => nextUpDate(b) - nextUpDate(a));
    case "oldest":
      return list.sort((a, b) => nextUpDate(a) - nextUpDate(b));
    case "shortest":
      return list.sort((a, b) => a.duration - b.duration);
    case "longest":
      return list.sort((a, b) => b.duration - a.duration);
    case "channel":
      return list.sort((a, b) => {
        const ca = channelOf(a);
        const cb = channelOf(b);
        if (ca === "" || cb === "") return ca === cb ? 0 : ca === "" ? 1 : -1;
        return ca.localeCompare(cb, undefined, { sensitivity: "base" });
      });
    default:
      return list;
  }
}

export type NextUpOrder = {
  current: MediaFile | null;
  /** Plays after the current item, in playback order. */
  upNext: MediaFile[];
  /** Plays only when loop-all wraps past the end; empty when playback stops at the last item. */
  earlier: MediaFile[];
};

/**
 * `playlist` is already in playback order (PlayerView advances by index + 1). Mirrors that: items after
 * the current one, then the ones before it only when playback wraps.
 */
export function buildNextUpOrder(
  playlist: readonly MediaFile[],
  currentPath: string,
  wraps: boolean,
): NextUpOrder {
  const idx = playlist.findIndex((f) => f.path === currentPath);
  if (idx < 0) return { current: null, upNext: [...playlist], earlier: [] };
  return {
    current: playlist[idx]!,
    upNext: playlist.slice(idx + 1),
    earlier: wraps ? playlist.slice(0, idx) : [],
  };
}
