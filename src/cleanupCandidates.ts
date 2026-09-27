import type { GalleryEntry, MediaFile } from "./types";
import { RUFORGE_INTERNAL_DIR } from "./store/types";
import {
  getWatchProgress,
  isVideoWatched,
  clearPlaybackPos,
  WATCHED_FRACTION,
} from "./playbackStorage";
import { clearLoopForPath } from "./playbackLoopStorage";
import { formatStorageSize } from "./formatStorageSize";
import { isAudioOnlyPath } from "./mediaKind";
import { primaryArtist } from "./components/music/musicArtist";
import { musicTrackIdentityKey } from "./components/music/musicShelfDedup";
import { getListenStat } from "./components/music/musicListenStats";

export type CleanupFilterMode = "oldest_unwatched" | "oldest_watched" | "least_watched";

export type CleanupCandidate = {
  file: MediaFile;
  watchProgressPct: number;
  sizeBytes: number;
  created: number;
};

function iterInternalMedia(entries: GalleryEntry[]): MediaFile[] {
  const prefix = RUFORGE_INTERNAL_DIR.toLowerCase();
  const out: MediaFile[] = [];
  // A file can sit in the library and in one or more playlists; list it once.
  const seen = new Set<string>();
  const take = (file: MediaFile) => {
    const key = file.path.toLowerCase();
    if (!key.startsWith(prefix) || seen.has(key)) return;
    seen.add(key);
    out.push(file);
  };
  for (const entry of entries) {
    if (entry.kind === "media") take(entry);
    else entry.items.forEach(take);
  }
  return out;
}

function audioListenProgressPct(file: MediaFile): number {
  const duration = Number.isFinite(file.duration) && file.duration > 0 ? file.duration : 0;
  if (duration <= 0) return 0;
  const key = musicTrackIdentityKey(file, primaryArtist);
  const stat = getListenStat(key);
  if (!stat || !Number.isFinite(stat.listenTimeSec) || stat.listenTimeSec <= 0) return 0;
  const pct = (stat.listenTimeSec / duration) * 100;
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.min(100, pct);
}

export function cleanupWatchProgressPct(file: MediaFile): number {
  if (isAudioOnlyPath(file.path)) {
    return Math.round(audioListenProgressPct(file));
  }
  return Math.round(getWatchProgress(file.path, file.duration));
}

function isCleanupWatched(file: MediaFile, watchProgressPct: number): boolean {
  if (isAudioOnlyPath(file.path)) {
    return watchProgressPct >= WATCHED_FRACTION * 100;
  }
  return isVideoWatched(file.path, file.duration);
}

export function buildCleanupCandidates(
  entries: GalleryEntry[],
  mode: CleanupFilterMode,
): CleanupCandidate[] {
  const media = iterInternalMedia(entries);
  const mapped = media.map((file) => ({
    file,
    watchProgressPct: cleanupWatchProgressPct(file),
    sizeBytes: file.size > 0 ? file.size : 0,
    created: file.created,
  }));

  if (mode === "oldest_unwatched") {
    return mapped
      .filter((c) => !isCleanupWatched(c.file, c.watchProgressPct))
      .sort((a, b) => a.created - b.created);
  }
  if (mode === "oldest_watched") {
    return mapped
      .filter((c) => isCleanupWatched(c.file, c.watchProgressPct))
      .sort((a, b) => a.created - b.created);
  }
  return mapped.sort((a, b) => {
    const diff = a.watchProgressPct - b.watchProgressPct;
    if (diff !== 0) return diff;
    return a.created - b.created;
  });
}

export type CleanupSortKey = "title" | "added" | "watched" | "size";
export type CleanupSort = { key: CleanupSortKey; desc: boolean };

/** Column sort on top of the filter's own order; `null` keeps the filter's order. */
export function sortCleanupCandidates(list: CleanupCandidate[], sort: CleanupSort | null): CleanupCandidate[] {
  if (!sort) return list;
  const value = (c: CleanupCandidate): number | string => {
    switch (sort.key) {
      case "title":
        return c.file.name.toLowerCase();
      case "added":
        return c.created;
      case "watched":
        return c.watchProgressPct;
      case "size":
        return c.sizeBytes;
    }
  };
  const dir = sort.desc ? -1 : 1;
  return [...list].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
    return cmp * dir;
  });
}

/** Usage ratio (0–1) of internal storage vs configured cap. */
export function storageUsageRatio(totalBytes: number, limitGB: number): number {
  const capBytes = limitGB * 1024 ** 3;
  if (capBytes <= 0) return 0;
  return totalBytes / capBytes;
}

/** Below this usage ratio, cleanup is optional with no byte goal in the modal. */
export const CLEANUP_SUGGEST_USAGE_RATIO = 0.5;

const CLEANUP_TARGET_USAGE_RATIO = 0.75;

/** Bytes to delete so internal usage drops to ~75% of the configured cap. */
export function bytesToFreeForHeadroom(totalBytes: number, limitGB: number): number {
  if (storageUsageRatio(totalBytes, limitGB) < CLEANUP_SUGGEST_USAGE_RATIO) return 0;
  const capBytes = limitGB * 1024 ** 3;
  const targetBytes = capBytes * CLEANUP_TARGET_USAGE_RATIO;
  return Math.max(0, Math.ceil(totalBytes - targetBytes));
}

/** Items auto-selected to reach `bytesNeeded` (0 when no goal). */
export function bytesGoalSelectionCount(
  candidates: CleanupCandidate[],
  bytesNeeded: number,
): number {
  if (bytesNeeded <= 0) return 0;
  let acc = 0;
  let n = 0;
  for (const c of candidates) {
    n += 1;
    acc += c.sizeBytes;
    if (acc >= bytesNeeded) return n;
  }
  return n;
}

/** Like formatBytes but always shows zero (modal tallies must not go blank). */
export function formatCleanupBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  return formatStorageSize(bytes);
}

export function defaultSelectedPaths(
  candidates: CleanupCandidate[],
  bytesNeeded: number,
): Set<string> {
  const selected = new Set<string>();
  if (bytesNeeded <= 0) return selected;
  let acc = 0;
  for (const c of candidates) {
    selected.add(c.file.path);
    acc += c.sizeBytes;
    if (acc >= bytesNeeded) break;
  }
  return selected;
}

export { formatStorageSize as formatBytes } from "./formatStorageSize";

export function clearPlaybackStateForDeletedPaths(paths: string[]): void {
  for (const p of paths) {
    clearPlaybackPos(p);
    clearLoopForPath(p);
  }
}
