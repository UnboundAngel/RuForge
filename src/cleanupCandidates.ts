import type { GalleryEntry, MediaFile } from "./types";
import { RUFORGE_INTERNAL_DIR } from "./store/types";
import {
  getWatchProgress,
  isVideoWatched,
  clearPlaybackPos,
} from "./playbackStorage";
import { clearLoopForPath } from "./playbackLoopStorage";

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
  for (const entry of entries) {
    if (entry.kind === "media") {
      if (entry.path.toLowerCase().startsWith(prefix)) out.push(entry);
    } else {
      for (const item of entry.items) {
        if (item.path.toLowerCase().startsWith(prefix)) out.push(item);
      }
    }
  }
  return out;
}

export function buildCleanupCandidates(
  entries: GalleryEntry[],
  mode: CleanupFilterMode,
): CleanupCandidate[] {
  const media = iterInternalMedia(entries);
  const mapped = media.map((file) => ({
    file,
    watchProgressPct: Math.round(getWatchProgress(file.path, file.duration)),
    sizeBytes: file.size > 0 ? file.size : 0,
    created: file.created,
  }));

  if (mode === "oldest_unwatched") {
    return mapped
      .filter((c) => !isVideoWatched(c.file.path, c.file.duration))
      .sort((a, b) => a.created - b.created);
  }
  if (mode === "oldest_watched") {
    return mapped
      .filter((c) => isVideoWatched(c.file.path, c.file.duration))
      .sort((a, b) => a.created - b.created);
  }
  return mapped.sort((a, b) => {
    const diff = a.watchProgressPct - b.watchProgressPct;
    if (diff !== 0) return diff;
    return a.created - b.created;
  });
}

/** Bytes to delete so internal usage drops to ~75% of the configured cap. */
export function bytesToFreeForHeadroom(totalBytes: number, limitGB: number): number {
  const capBytes = limitGB * 1024 ** 3;
  const targetBytes = capBytes * 0.75;
  return Math.max(0, Math.ceil(totalBytes - targetBytes));
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
