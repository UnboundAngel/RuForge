import type { MediaFile } from "@/types";
import {
  isMusicPlaylistRecord,
  type VirtualPlaylistItem,
  type VirtualPlaylistRecord,
} from "@/virtualPlaylists";

export type IdentityKeyFn = (file: MediaFile) => string;

/** Returns true only when the original path's drive is mounted and the file is really gone. */
export type RelocatableFn = (path: string) => boolean;

function pathKey(path: string): string {
  return path.replace(/\//g, "\\").toLowerCase();
}

/** A bare title (no source id, url, or artist) collides across albums, so it never re-points. */
export function identityKeyCanRelocate(key: string): boolean {
  return !key.startsWith("song:|");
}

function keyIndex(library: MediaFile[], keyFor: IdentityKeyFn): (key: string) => MediaFile[] {
  let byKey: Map<string, MediaFile[]> | null = null;
  return (key) => {
    if (!byKey) {
      byKey = new Map();
      for (const f of library) {
        const k = keyFor(f);
        const list = byKey.get(k);
        if (list) list.push(f);
        else byKey.set(k, [f]);
      }
    }
    return byKey.get(key) ?? [];
  };
}

/** Paths of music items that could follow a moved file, pending an on-disk check. */
export function relocationCandidates(
  records: VirtualPlaylistRecord[],
  library: MediaFile[],
  keyFor: IdentityKeyFn,
): string[] {
  if (library.length === 0) return [];
  const inLibrary = new Set(library.map((f) => pathKey(f.path)));
  const filesForKey = keyIndex(library, keyFor);
  const out = new Map<string, string>();
  for (const record of records) {
    if (!isMusicPlaylistRecord(record)) continue;
    for (const item of record.items) {
      const k = pathKey(item.path);
      if (inLibrary.has(k) || !item.identityKey || !identityKeyCanRelocate(item.identityKey)) continue;
      if (filesForKey(item.identityKey).length > 0) out.set(k, item.path);
    }
  }
  return [...out.values()];
}

/**
 * Music playlists only. Items whose file is in the library get its identity key stamped.
 * Items whose path is gone move to an unused library file with the same key (a moved or
 * renamed download), but only when `relocatable` confirms the original drive is mounted.
 * Unchanged records keep their object identity so callers can skip a save.
 */
export function reconcilePlaylistIdentities(
  records: VirtualPlaylistRecord[],
  library: MediaFile[],
  keyFor: IdentityKeyFn,
  relocatable: RelocatableFn = () => false,
): { records: VirtualPlaylistRecord[]; changed: boolean } {
  if (library.length === 0) return { records, changed: false };
  const byPath = new Map<string, MediaFile>();
  for (const f of library) byPath.set(pathKey(f.path), f);
  const filesForKey = keyIndex(library, keyFor);

  let changed = false;
  const next = records.map((record) => {
    if (!isMusicPlaylistRecord(record)) return record;
    const used = new Set(record.items.map((i) => pathKey(i.path)));
    let thumbnailPath = record.thumbnailPath ?? null;
    let recordChanged = false;
    const items = record.items.map((item): VirtualPlaylistItem => {
      const hit = byPath.get(pathKey(item.path));
      if (hit) {
        if (item.identityKey) return item;
        recordChanged = true;
        return { ...item, identityKey: keyFor(hit) };
      }
      if (!item.identityKey || !identityKeyCanRelocate(item.identityKey)) return item;
      if (!relocatable(item.path)) return item;
      const moved = filesForKey(item.identityKey).find((f) => !used.has(pathKey(f.path)));
      if (!moved) return item;
      used.add(pathKey(moved.path));
      if (thumbnailPath && pathKey(thumbnailPath) === pathKey(item.path)) thumbnailPath = moved.path;
      recordChanged = true;
      return { ...item, path: moved.path };
    });
    if (!recordChanged) return record;
    changed = true;
    return { ...record, items, thumbnailPath };
  });
  return { records: changed ? next : records, changed };
}
