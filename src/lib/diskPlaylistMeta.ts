import { invoke } from "@tauri-apps/api/core";
import type { MediaFile, PlaylistCollection } from "@/types";

/** View settings stored in the playlist's own folder (`.ruforge-playlist-user.json`). */
export type DiskPlaylistMeta = {
  /** File names in the chosen order; files not listed sort after these. */
  order: string[];
  title?: string;
  description?: string;
  startFile?: string;
  /** Library videos saved here from elsewhere; their files stay where they are. */
  added?: string[];
};

const cache = new Map<string, DiskPlaylistMeta>();
// Linked videos are copies, so a re-merge of already merged entries can strip them before relinking.
const linkedCopies = new WeakSet<MediaFile>();
const attempted = new Set<string>();

function folderKey(path: string): string {
  return path.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

export function fileNameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(slash + 1);
}

/**
 * Puts files in the saved order. Files the order does not mention (downloaded later, by playlist
 * watch or a re-download) keep their scan order after the ordered ones, so new videos append.
 */
export function applyCustomOrder<T extends { path: string }>(items: T[], order: string[]): T[] {
  if (order.length === 0 || items.length < 2) return items;
  const rank = new Map<string, number>();
  order.forEach((name, i) => {
    const key = name.toLowerCase();
    if (!rank.has(key)) rank.set(key, i);
  });
  const known: Array<{ item: T; rank: number }> = [];
  const fresh: T[] = [];
  for (const item of items) {
    const r = rank.get(fileNameOf(item.path).toLowerCase());
    if (r === undefined) fresh.push(item);
    else known.push({ item, rank: r });
  }
  known.sort((a, b) => a.rank - b.rank);
  return [...known.map((k) => k.item), ...fresh];
}

export function getDiskPlaylistMeta(folderPath: string): DiskPlaylistMeta | undefined {
  return cache.get(folderKey(folderPath));
}

/** Linked videos found in the library and not already in the folder, in the order they were saved. */
function linkedFiles(
  entry: PlaylistCollection,
  added: string[] | undefined,
  findMedia: ((path: string) => MediaFile | undefined) | undefined,
): MediaFile[] {
  if (!added?.length || !findMedia) return [];
  const held = new Set(entry.items.map((f) => folderKey(f.path)));
  const out: MediaFile[] = [];
  for (const path of added) {
    const file = findMedia(path);
    if (!file || held.has(folderKey(file.path))) continue;
    held.add(folderKey(file.path));
    const copy = { ...file };
    linkedCopies.add(copy);
    out.push(copy);
  }
  return out;
}

export function isLinkedToDiskPlaylist(folderPath: string, path: string): boolean {
  const key = folderKey(path);
  return cache.get(folderKey(folderPath))?.added?.some((p) => folderKey(p) === key) ?? false;
}

export function linkToDiskPlaylist(folderPath: string, paths: string[]): Promise<void> {
  return saveDiskPlaylistMeta(folderPath, (prev) => {
    const added = prev.added ?? [];
    const known = new Set(added.map(folderKey));
    return { added: [...added, ...paths.filter((p) => !known.has(folderKey(p)))] };
  });
}

export function unlinkFromDiskPlaylist(folderPath: string, paths: string[]): Promise<void> {
  const drop = new Set(paths.map(folderKey));
  return saveDiskPlaylistMeta(folderPath, (prev) => ({
    added: (prev.added ?? []).filter((p) => !drop.has(folderKey(p))),
  }));
}

/** Applies a folder's saved order, name and linked videos to a scanned disk playlist. */
export function applyDiskPlaylistMeta(
  entry: PlaylistCollection,
  findMedia?: (path: string) => MediaFile | undefined,
): PlaylistCollection {
  const meta = cache.get(folderKey(entry.path));
  if (!meta) return entry;
  const stale = entry.items.filter((f) => linkedCopies.has(f));
  if (stale.length) {
    entry = {
      ...entry,
      items: entry.items.filter((f) => !linkedCopies.has(f)),
      itemCount: entry.itemCount - stale.length,
      combinedDuration: entry.combinedDuration - stale.reduce((sum, f) => sum + (f.duration || 0), 0),
    };
  }
  const linked = linkedFiles(entry, meta.added, findMedia);
  const items = applyCustomOrder(linked.length ? [...entry.items, ...linked] : entry.items, meta.order);
  const title = meta.title || entry.title;
  if (items === entry.items && title === entry.title) return entry;
  const first = items[0];
  const keepsCover = entry.stackThumbnailPath && entry.items[0] === first;
  return {
    ...entry,
    title,
    items,
    itemCount: entry.itemCount + linked.length,
    combinedDuration: entry.combinedDuration + linked.reduce((sum, f) => sum + (f.duration || 0), 0),
    stackThumbnailPath: keepsCover
      ? entry.stackThumbnailPath
      : (entry.stackThumbnailPath ?? first?.thumbnailPath ?? first?.ruforgePosterPath ?? null),
  };
}

/** Reads settings for folders not asked about yet. Resolves true when something new was found. */
export async function loadDiskPlaylistMeta(folders: string[]): Promise<boolean> {
  const wanted = folders.filter((f) => !attempted.has(folderKey(f)));
  if (wanted.length === 0) return false;
  for (const f of wanted) attempted.add(folderKey(f));
  try {
    const found = await invoke<Record<string, DiskPlaylistMeta>>("read_disk_playlist_user_meta", {
      folders: wanted,
    });
    let changed = false;
    for (const [folder, meta] of Object.entries(found)) {
      // A save that landed while this read was in flight is newer than what the read saw.
      if (cache.has(folderKey(folder))) continue;
      cache.set(folderKey(folder), { ...meta, order: meta.order ?? [] });
      changed = true;
    }
    return changed;
  } catch (e) {
    for (const f of wanted) attempted.delete(folderKey(f));
    console.warn("disk playlist settings read failed", e);
    return false;
  }
}

let writeChain: Promise<void> = Promise.resolve();

type MetaPatch = Partial<DiskPlaylistMeta> | ((prev: DiskPlaylistMeta) => Partial<DiskPlaylistMeta>);

function merge(prev: DiskPlaylistMeta, patch: MetaPatch): DiskPlaylistMeta {
  return { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
}

async function readOne(folderPath: string): Promise<DiskPlaylistMeta> {
  const found = await invoke<Record<string, DiskPlaylistMeta>>("read_disk_playlist_user_meta", {
    folders: [folderPath],
  });
  const meta = Object.values(found ?? {})[0];
  return { ...meta, order: meta?.order ?? [] };
}

/**
 * Updates the cache at once and queues the file write, so a fast second edit never reorders saves.
 * A folder not read yet is read inside the queue first, so the patch never replaces the whole file.
 */
export function saveDiskPlaylistMeta(folderPath: string, patch: MetaPatch): Promise<void> {
  const key = folderKey(folderPath);
  const warm = cache.get(key);
  if (warm) cache.set(key, merge(warm, patch));
  writeChain = writeChain
    .then(async () => {
      let next = cache.get(key);
      if (!warm) {
        next = merge(next ?? (await readOne(folderPath)), patch);
        cache.set(key, next);
        attempted.add(key);
      }
      await invoke<void>("write_disk_playlist_user_meta", { folder: folderPath, meta: next });
    })
    .catch((e) => {
      console.warn("disk playlist settings write failed", e);
    });
  return writeChain;
}

export function orderFromFiles(files: MediaFile[]): string[] {
  return files.map((f) => fileNameOf(f.path));
}
