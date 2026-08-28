import { mediaPathsMatch } from "./lib/mediaPathMatch";
import type { GalleryEntry, MediaFile, PlaylistCollection } from "./types";

export const WATCH_LATER_ID = "watch-later";
export const VIRTUAL_PLAYLIST_PATH_PREFIX = "virtual:";
export const VIRTUAL_PLAYLISTS_LS_KEY = "ruforge-virtual-playlists";

export type VirtualPlaylistItem = {
  path: string;
  addedAt: number;
};

export type VirtualPlaylistRecord = {
  id: string;
  title: string;
  items: VirtualPlaylistItem[];
  thumbnailPath?: string | null;
  updatedAt: number;
  system?: boolean;
};

export function virtualPlaylistPath(id: string): string {
  return `${VIRTUAL_PLAYLIST_PATH_PREFIX}${id}`;
}

export function parseVirtualPlaylistId(path: string): string | null {
  if (!path.startsWith(VIRTUAL_PLAYLIST_PATH_PREFIX)) return null;
  const id = path.slice(VIRTUAL_PLAYLIST_PATH_PREFIX.length);
  return id.length > 0 ? id : null;
}

export function isVirtualPlaylistPath(path: string): boolean {
  return parseVirtualPlaylistId(path) !== null;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function watchLaterRecord(): VirtualPlaylistRecord {
  return {
    id: WATCH_LATER_ID,
    title: "Watch later",
    items: [],
    thumbnailPath: null,
    updatedAt: Date.now(),
    system: true,
  };
}

export function loadVirtualPlaylistRecords(): VirtualPlaylistRecord[] {
  try {
    const raw = localStorage.getItem(VIRTUAL_PLAYLISTS_LS_KEY);
    if (!raw) return [watchLaterRecord()];
    const parsed = JSON.parse(raw) as VirtualPlaylistRecord[];
    if (!Array.isArray(parsed)) return [watchLaterRecord()];
    return ensureWatchLaterInRecords(parsed.map(normalizeRecord).filter(Boolean) as VirtualPlaylistRecord[]);
  } catch {
    return [watchLaterRecord()];
  }
}

function normalizeRecord(raw: VirtualPlaylistRecord): VirtualPlaylistRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim()
      : id === WATCH_LATER_ID
        ? "Watch later"
        : "Playlist";
  const items: VirtualPlaylistItem[] = Array.isArray(raw.items)
    ? raw.items
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const path = typeof item.path === "string" ? item.path : "";
          if (!path) return null;
          const addedAt =
            typeof item.addedAt === "number" && Number.isFinite(item.addedAt)
              ? item.addedAt
              : Date.now();
          return { path, addedAt };
        })
        .filter(Boolean) as VirtualPlaylistItem[]
    : [];
  return {
    id,
    title,
    items,
    thumbnailPath:
      typeof raw.thumbnailPath === "string" && raw.thumbnailPath
        ? raw.thumbnailPath
        : null,
    updatedAt:
      typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : Date.now(),
    system: raw.system === true || id === WATCH_LATER_ID,
  };
}

export function saveVirtualPlaylistRecords(records: VirtualPlaylistRecord[]): void {
  try {
    localStorage.setItem(
      VIRTUAL_PLAYLISTS_LS_KEY,
      JSON.stringify(ensureWatchLaterInRecords(records)),
    );
  } catch {
    // storage unavailable
  }
}

export function ensureWatchLaterInRecords(
  records: VirtualPlaylistRecord[],
): VirtualPlaylistRecord[] {
  const has = records.some((r) => r.id === WATCH_LATER_ID);
  if (has) {
    return records.map((r) =>
      r.id === WATCH_LATER_ID ? { ...r, system: true, title: r.title || "Watch later" } : r,
    );
  }
  return [watchLaterRecord(), ...records];
}

export function stripVirtualPlaylists(entries: GalleryEntry[]): GalleryEntry[] {
  return entries.filter(
    (e) => !(e.kind === "playlist" && isVirtualPlaylistPath(e.path)),
  );
}

/** Index every media file under singles and disk playlists (case-insensitive keys). */
export function collectMediaIndex(entries: GalleryEntry[]): Map<string, MediaFile> {
  const map = new Map<string, MediaFile>();
  for (const entry of entries) {
    const files = entry.kind === "media" ? [entry] : entry.items;
    for (const file of files) {
      map.set(file.path.replace(/\//g, "\\").toLowerCase(), file);
    }
  }
  return map;
}

function findMedia(
  index: Map<string, MediaFile>,
  path: string,
): MediaFile | undefined {
  return index.get(path.replace(/\//g, "\\").toLowerCase());
}

export function hydrateVirtualPlaylist(
  record: VirtualPlaylistRecord,
  mediaIndex: Map<string, MediaFile>,
): PlaylistCollection {
  const items: MediaFile[] = [];
  for (const row of record.items) {
    const file = findMedia(mediaIndex, row.path);
    if (file) items.push(file);
  }
  const thumbOverride = record.thumbnailPath
    ? findMedia(mediaIndex, record.thumbnailPath)
    : null;
  const stackThumbnailPath =
    (thumbOverride?.ruforgePosterPath ||
      thumbOverride?.thumbnailPath ||
      record.thumbnailPath) ??
    items[0]?.ruforgePosterPath ??
    items[0]?.thumbnailPath ??
    null;
  const combinedDuration = items.reduce((sum, item) => sum + (item.duration || 0), 0);
  return {
    kind: "playlist",
    title: record.title,
    path: virtualPlaylistPath(record.id),
    itemCount: items.length,
    combinedDuration,
    stackThumbnailPath,
    items,
  };
}

/** Watch later first, then newest updated. */
export function sortVirtualRecords(
  records: VirtualPlaylistRecord[],
): VirtualPlaylistRecord[] {
  return [...records].sort((a, b) => {
    if (a.id === WATCH_LATER_ID) return -1;
    if (b.id === WATCH_LATER_ID) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

export function mergeVirtualPlaylistsIntoEntries(
  entries: GalleryEntry[],
  records: VirtualPlaylistRecord[] = loadVirtualPlaylistRecords(),
): GalleryEntry[] {
  const disk = stripVirtualPlaylists(entries);
  const mediaIndex = collectMediaIndex(disk);
  const virtual = sortVirtualRecords(ensureWatchLaterInRecords(records)).map((r) =>
    hydrateVirtualPlaylist(r, mediaIndex),
  );
  return [...virtual, ...disk];
}

export function pruneStalePathsInRecords(
  records: VirtualPlaylistRecord[],
  mediaIndex: Map<string, MediaFile>,
): { records: VirtualPlaylistRecord[]; changed: boolean } {
  let changed = false;
  const next = records.map((r) => {
    const items = r.items.filter((item) => findMedia(mediaIndex, item.path));
    const thumbOk =
      !r.thumbnailPath || Boolean(findMedia(mediaIndex, r.thumbnailPath));
    if (items.length !== r.items.length || !thumbOk) {
      changed = true;
      return {
        ...r,
        items,
        thumbnailPath: thumbOk ? r.thumbnailPath : null,
        updatedAt: Date.now(),
      };
    }
    return r;
  });
  return { records: next, changed };
}

function updateRecord(
  records: VirtualPlaylistRecord[],
  id: string,
  mut: (r: VirtualPlaylistRecord) => VirtualPlaylistRecord,
): VirtualPlaylistRecord[] {
  return records.map((r) => (r.id === id ? mut(r) : r));
}

export function createVirtualPlaylistRecord(
  title: string,
  seedPaths: string[] = [],
  now = Date.now(),
): VirtualPlaylistRecord {
  const seen = new Set<string>();
  const items: VirtualPlaylistItem[] = [];
  for (const path of seedPaths) {
    const key = path.replace(/\//g, "\\").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ path, addedAt: now });
  }
  return {
    id: newId(),
    title: title.trim() || "Playlist",
    items,
    thumbnailPath: null,
    updatedAt: now,
    system: false,
  };
}

export function addPathsToRecord(
  record: VirtualPlaylistRecord,
  paths: string[],
  now = Date.now(),
): VirtualPlaylistRecord {
  const items = [...record.items];
  let changed = false;
  for (const path of paths) {
    if (items.some((i) => mediaPathsMatch(i.path, path))) continue;
    items.push({ path, addedAt: now });
    changed = true;
  }
  if (!changed) return record;
  return { ...record, items, updatedAt: now };
}

export function removePathFromRecord(
  record: VirtualPlaylistRecord,
  path: string,
  now = Date.now(),
): VirtualPlaylistRecord {
  const items = record.items.filter((i) => !mediaPathsMatch(i.path, path));
  if (items.length === record.items.length) return record;
  const thumbnailPath =
    record.thumbnailPath && mediaPathsMatch(record.thumbnailPath, path)
      ? null
      : record.thumbnailPath;
  return { ...record, items, thumbnailPath, updatedAt: now };
}

export function removePathFromAllRecords(
  records: VirtualPlaylistRecord[],
  path: string,
): VirtualPlaylistRecord[] {
  return records.map((r) => removePathFromRecord(r, path));
}

export function reorderRecordItems(
  record: VirtualPlaylistRecord,
  fromIndex: number,
  toIndex: number,
  now = Date.now(),
): VirtualPlaylistRecord {
  if (fromIndex === toIndex) return record;
  if (fromIndex < 0 || fromIndex >= record.items.length) return record;
  if (toIndex < 0 || toIndex >= record.items.length) return record;
  const items = [...record.items];
  const [row] = items.splice(fromIndex, 1);
  if (!row) return record;
  items.splice(toIndex, 0, row);
  return { ...record, items, updatedAt: now };
}

export function moveRecordItem(
  record: VirtualPlaylistRecord,
  path: string,
  where: "top" | "bottom",
  now = Date.now(),
): VirtualPlaylistRecord {
  const fromIndex = record.items.findIndex((i) => mediaPathsMatch(i.path, path));
  if (fromIndex < 0) return record;
  const toIndex = where === "top" ? 0 : record.items.length - 1;
  return reorderRecordItems(record, fromIndex, toIndex, now);
}

export function setRecordThumbnail(
  record: VirtualPlaylistRecord,
  path: string | null,
  now = Date.now(),
): VirtualPlaylistRecord {
  return { ...record, thumbnailPath: path, updatedAt: now };
}

export function mutateVirtualRecords(
  mutator: (records: VirtualPlaylistRecord[]) => VirtualPlaylistRecord[],
): VirtualPlaylistRecord[] {
  const next = ensureWatchLaterInRecords(mutator(loadVirtualPlaylistRecords()));
  saveVirtualPlaylistRecords(next);
  return next;
}

export function getVirtualRecord(
  id: string,
  records: VirtualPlaylistRecord[] = loadVirtualPlaylistRecords(),
): VirtualPlaylistRecord | undefined {
  return records.find((r) => r.id === id);
}

export function pathInWatchLater(
  path: string,
  records: VirtualPlaylistRecord[] = loadVirtualPlaylistRecords(),
): boolean {
  const wl = records.find((r) => r.id === WATCH_LATER_ID);
  return Boolean(wl?.items.some((i) => mediaPathsMatch(i.path, path)));
}

export { updateRecord };
