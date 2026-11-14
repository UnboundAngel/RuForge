import { mediaPathsMatch } from "./mediaPathMatch";
import type { VirtualPlaylistItem, VirtualPlaylistRecord } from "../virtualPlaylists";

export const DEFAULT_VIDEO_PLAYLIST_PREFIX = "Playlist";

/**
 * "Playlist N" with the lowest N no record uses. A bare "Playlist" counts as number 1, since
 * older saves named every new list that.
 */
export function nextVideoPlaylistTitle(records: Pick<VirtualPlaylistRecord, "title">[]): string {
  const taken = new Set<number>();
  const pattern = new RegExp(`^${DEFAULT_VIDEO_PLAYLIST_PREFIX}(?: (\\d+))?$`, "i");
  for (const r of records) {
    const hit = pattern.exec(r.title.trim());
    if (hit) taken.add(hit[1] ? Number(hit[1]) : 1);
  }
  let n = 1;
  while (taken.has(n)) n++;
  return `${DEFAULT_VIDEO_PLAYLIST_PREFIX} ${n}`;
}

/** Puts an item back at its old slot (undo of a remove). Does nothing if the path is already in. */
export function insertRecordItem(
  record: VirtualPlaylistRecord,
  item: VirtualPlaylistItem,
  index: number,
  now = Date.now(),
): VirtualPlaylistRecord {
  if (record.items.some((i) => mediaPathsMatch(i.path, item.path))) return record;
  const items = [...record.items];
  items.splice(Math.max(0, Math.min(index, items.length)), 0, item);
  return { ...record, items, updatedAt: now };
}

/** Points an item at a new file in place, keeping its slot and added date. */
export function relocateRecordItem(
  record: VirtualPlaylistRecord,
  oldPath: string,
  newPath: string,
  now = Date.now(),
): VirtualPlaylistRecord {
  const index = record.items.findIndex((i) => mediaPathsMatch(i.path, oldPath));
  if (index < 0) return record;
  if (mediaPathsMatch(oldPath, newPath)) return record;
  const items = [...record.items];
  const clash = items.findIndex((i, n) => n !== index && mediaPathsMatch(i.path, newPath));
  if (clash >= 0) {
    items.splice(index, 1);
  } else {
    const { identityKey: _stale, ...rest } = items[index];
    items[index] = { ...rest, path: newPath };
  }
  return { ...record, items, updatedAt: now };
}

export type DuplicateScan = {
  /** Paths the playlist already holds exactly. */
  samePath: string[];
  /** Paths whose video is in the playlist as a different file (a second download of it). */
  sameVideo: string[];
};

/**
 * Which of `paths` the playlist has already. `videoKeyOf` names the video behind a file (its
 * YouTube id), so two downloads of one video count as the same.
 */
export function scanPlaylistDuplicates(
  record: Pick<VirtualPlaylistRecord, "items">,
  paths: string[],
  videoKeyOf: (path: string) => string | null,
): DuplicateScan {
  const held = new Set<string>();
  for (const item of record.items) {
    const key = videoKeyOf(item.path);
    if (key) held.add(key);
  }
  const samePath: string[] = [];
  const sameVideo: string[] = [];
  for (const path of paths) {
    if (record.items.some((i) => mediaPathsMatch(i.path, path))) {
      samePath.push(path);
      continue;
    }
    const key = videoKeyOf(path);
    if (key && held.has(key)) sameVideo.push(path);
  }
  return { samePath, sameVideo };
}
