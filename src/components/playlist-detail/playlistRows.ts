import type { MediaFile, PlaylistCollection } from "@/types";
import { fileNameOf } from "@/lib/diskPlaylistMeta";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { videoItemKey } from "@/lib/playlistSession/itemKey";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";

export type FileRow = {
  type: "file";
  /** Session identity of the video (`videoItemKey`). */
  key: string;
  file: MediaFile;
  /** Place in the playlist's own order, 1-based. Stays put when the view is sorted. */
  position: number;
  addedAt: number;
};

/** A playlist item whose file is gone. Only video playlists can hold these. */
export type MissingRow = {
  type: "missing";
  key: string;
  path: string;
  name: string;
  identityKey?: string;
  position: number;
  addedAt: number;
};

export type PlaylistRowModel = FileRow | MissingRow;

export type PlaylistSortMode = "order" | "uploaded" | "duration" | "title" | "added";

export const PLAYLIST_SORT_OPTIONS: ReadonlyArray<readonly [PlaylistSortMode, string]> = [
  ["order", "Playlist order"],
  ["uploaded", "Upload date"],
  ["duration", "Duration"],
  ["title", "Title"],
  ["added", "Date added"],
];

/** Hours and minutes only, e.g. "1h 19m"; under an hour "23m". */
export function formatHoursMinutes(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${Math.max(m, 1)}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function rowTitle(name: string): string {
  return name.replace(/_/g, " ").replace(/\.[^/.]+$/, "");
}

/**
 * Rows in the playlist's own order. A video playlist walks its record so files that went missing
 * still show; a folder playlist is just its scanned files.
 */
export function buildRows(
  playlist: Pick<PlaylistCollection, "items">,
  record: Pick<VirtualPlaylistRecord, "items"> | undefined,
): PlaylistRowModel[] {
  if (!record) {
    return playlist.items.map((file, i) => ({
      type: "file",
      key: videoItemKey(file),
      file,
      position: i + 1,
      addedAt: file.created * 1000,
    }));
  }
  const byKey = new Map<string, MediaFile>();
  for (const file of playlist.items) byKey.set(videoItemKey(file), file);
  const used = new Set<MediaFile>();
  const rows: PlaylistRowModel[] = [];
  record.items.forEach((item, i) => {
    const file =
      playlist.items.find((f) => !used.has(f) && mediaPathsMatch(f.path, item.path)) ??
      (item.identityKey ? byKey.get(item.identityKey) : undefined);
    if (file && !used.has(file)) {
      used.add(file);
      rows.push({ type: "file", key: videoItemKey(file), file, position: i + 1, addedAt: item.addedAt });
      return;
    }
    rows.push({
      type: "missing",
      key: `missing:${item.path}`,
      path: item.path,
      name: rowTitle(fileNameOf(item.path)),
      identityKey: item.identityKey,
      position: i + 1,
      addedAt: item.addedAt,
    });
  });
  return rows;
}

function rowName(row: PlaylistRowModel): string {
  return row.type === "file" ? rowTitle(row.file.name) : row.name;
}

/** A view only: never changes the playlist. Missing rows sink to the end of every sorted view. */
export function sortRows(rows: PlaylistRowModel[], mode: PlaylistSortMode): PlaylistRowModel[] {
  if (mode === "order") return rows;
  const files = rows.filter((r): r is FileRow => r.type === "file");
  const missing = rows.filter((r) => r.type === "missing");
  const sorted = [...files];
  switch (mode) {
    case "uploaded": {
      // Newest first; videos with no known upload date go last.
      const at = (r: FileRow) => r.file.youtube?.publishedAt ?? -1;
      sorted.sort((a, b) => at(b) - at(a));
      break;
    }
    case "duration":
      sorted.sort((a, b) => b.file.duration - a.file.duration);
      break;
    case "title":
      sorted.sort((a, b) => rowName(a).localeCompare(rowName(b), undefined, { numeric: true, sensitivity: "base" }));
      break;
    case "added":
      sorted.sort((a, b) => b.addedAt - a.addedAt);
      break;
  }
  return [...sorted, ...missing];
}

/** Moves one entry; out-of-range targets clamp. Returns the same array when nothing moves. */
export function moveInList<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}
