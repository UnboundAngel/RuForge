import { isAudioOnlyPath } from "../../mediaKind";
import type { GalleryEntry, MediaFile } from "../../types";
import {
  collectMediaIndex,
  loadVirtualPlaylistRecords,
  saveVirtualPlaylistRecords,
  type VirtualPlaylistRecord,
} from "../../virtualPlaylists";
import { videoItemKey, videoKeyCanRelocate } from "./itemKey";

const pathKey = (path: string) => path.replace(/\//g, "\\").toLowerCase();

/** Video playlists only: stamps each item whose file is in the library with its identity key. */
export function stampVideoIdentities(
  records: VirtualPlaylistRecord[],
  library: MediaFile[],
): { records: VirtualPlaylistRecord[]; changed: boolean } {
  if (library.length === 0) return { records, changed: false };
  const byPath = new Map(library.map((f) => [pathKey(f.path), f]));
  let changed = false;
  const next = records.map((record) => {
    if (record.kind === "music") return record;
    let touched = false;
    const items = record.items.map((item) => {
      const hit = item.identityKey ? null : byPath.get(pathKey(item.path));
      if (!hit) return item;
      touched = true;
      return { ...item, identityKey: videoItemKey(hit) };
    });
    if (!touched) return record;
    changed = true;
    return { ...record, items };
  });
  return { records: changed ? next : records, changed };
}

/** Stamps and saves when something changed; returns the records to use. */
export function stampSavedVideoIdentities(
  disk: GalleryEntry[],
  records: VirtualPlaylistRecord[],
): VirtualPlaylistRecord[] {
  const library = [...collectMediaIndex(disk).values()].filter((f) => !isAudioOnlyPath(f.path));
  const result = stampVideoIdentities(records, library);
  if (!result.changed) return records;
  saveVirtualPlaylistRecords(result.records);
  return loadVirtualPlaylistRecords();
}

/** A library video that a missing playlist item's identity key points at (a moved or renamed download). */
export function findMovedVideo(
  identityKey: string | undefined,
  library: readonly MediaFile[],
  takenPaths: ReadonlySet<string>,
): MediaFile | null {
  if (!identityKey || !videoKeyCanRelocate(identityKey)) return null;
  return library.find((f) => !takenPaths.has(pathKey(f.path)) && videoItemKey(f) === identityKey) ?? null;
}
