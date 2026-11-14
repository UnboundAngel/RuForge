import { isAudioOnlyPath } from "../mediaKind";
import type { GalleryEntry, MediaFile } from "../types";
import { stampSavedVideoIdentities } from "./playlistSession/videoIdentities";
import {
  collectMediaIndex,
  createVirtualPlaylistRecord,
  loadVirtualPlaylistRecords,
  saveVirtualPlaylistRecords,
  type VirtualPlaylistRecord,
} from "../virtualPlaylists";

const FOLDER_RE = /\/Playlists\/([^/]+)\//i;

export function playlistFolderKey(path: string): string | null {
  const match = path.replace(/\\/g, "/").match(FOLDER_RE);
  return match ? match[1]!.toLowerCase() : null;
}

export function playlistDisplayTitle(folderKey: string, samplePath: string): string {
  const match = samplePath.replace(/\\/g, "/").match(FOLDER_RE);
  const title = (match ? match[1]! : folderKey).replace(/_/g, " ").trim();
  return title || folderKey;
}

export function sortTracksForPlaylist(tracks: MediaFile[]): MediaFile[] {
  return [...tracks].sort((a, b) => {
    const ia = a.playlistIndex ?? 9999;
    const ib = b.playlistIndex ?? 9999;
    if (ia !== ib) return ia - ib;
    return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" });
  });
}

/** Audio tracks grouped by their `Playlists/<folder>` download, in playlist order. */
export function groupAudioByPlaylistFolder(tracks: MediaFile[]): Map<string, MediaFile[]> {
  const map = new Map<string, MediaFile[]>();
  for (const t of tracks) {
    const key = playlistFolderKey(t.path);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }
  for (const [key, list] of map) map.set(key, sortTracksForPlaylist(list));
  return map;
}

const pathKey = (path: string) => path.replace(/\//g, "\\").toLowerCase();

/**
 * Each downloaded YouTube playlist of songs gets a Music playlist, created once and topped up as
 * new tracks land. Never removes items: an offline drive or partial scan must not empty it.
 * A deleted one stays a tombstone (`dismissed`) so the next scan does not bring it back.
 */
export function syncDownloadedMusicPlaylists(
  records: VirtualPlaylistRecord[],
  library: MediaFile[],
  now = Date.now(),
): { records: VirtualPlaylistRecord[]; changed: boolean } {
  const groups = groupAudioByPlaylistFolder(library);
  if (groups.size === 0) return { records, changed: false };
  const byFolder = new Map<string, VirtualPlaylistRecord>();
  for (const r of records) if (r.kind === "music" && r.sourceFolder) byFolder.set(r.sourceFolder, r);

  let changed = false;
  const added: VirtualPlaylistRecord[] = [];
  const updated = new Map<string, VirtualPlaylistRecord>();
  for (const [folder, tracks] of groups) {
    if (tracks.length < 2) continue;
    const existing = byFolder.get(folder);
    if (!existing) {
      const record = createVirtualPlaylistRecord(
        playlistDisplayTitle(folder, tracks[0]!.path),
        tracks.map((t) => t.path),
        Math.max(...tracks.map((t) => t.created)) * 1000 || now,
        "music",
      );
      added.push({ ...record, sourceFolder: folder });
      changed = true;
      continue;
    }
    if (existing.dismissed) continue;
    const have = new Set(existing.items.map((i) => pathKey(i.path)));
    const fresh = tracks.filter((t) => !have.has(pathKey(t.path)));
    if (fresh.length === 0) continue;
    updated.set(existing.id, {
      ...existing,
      items: [...existing.items, ...fresh.map((t) => ({ path: t.path, addedAt: now }))],
      updatedAt: now,
    });
    changed = true;
  }
  if (!changed) return { records, changed: false };
  return { records: [...records.map((r) => updated.get(r.id) ?? r), ...added], changed: true };
}

/** Stamps video identities and syncs downloaded playlists, saving when something changed. */
export function stampAndSyncSavedPlaylists(
  disk: GalleryEntry[],
  stale: VirtualPlaylistRecord[],
): VirtualPlaylistRecord[] {
  const records = stampSavedVideoIdentities(disk, stale);
  const library = [...collectMediaIndex(disk).values()].filter((f) => isAudioOnlyPath(f.path));
  const result = syncDownloadedMusicPlaylists(records, library);
  if (!result.changed) return records;
  saveVirtualPlaylistRecords(result.records);
  return loadVirtualPlaylistRecords();
}

/** Delete: a downloaded playlist leaves a tombstone, any other record is removed. */
export function removeRecordForDelete(
  records: VirtualPlaylistRecord[],
  id: string,
): VirtualPlaylistRecord[] {
  return records.flatMap((r) => {
    if (r.id !== id) return [r];
    if (!r.sourceFolder) return [];
    return [{ ...r, items: [], dismissed: true, updatedAt: Date.now() }];
  });
}
