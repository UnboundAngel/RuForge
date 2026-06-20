import { invoke } from "@tauri-apps/api/core";
import { clearPlaybackStateForDeletedPaths } from "./cleanupCandidates";
import type { GalleryEntry, MediaFile } from "./types";
import { extractYouTubeVideoId, youtubeUrlsMatch } from "./youtubeUrl";
import { releasePlaybackBeforeDelete } from "./releasePlaybackBeforeDelete";
import { useRuforgeStore } from "./store/ruforgeStore";
import type { LastDownloadBatchRecord } from "./lib/devLastDownloadBatch";

function iterMediaFiles(entries: GalleryEntry[]): MediaFile[] {
  const out: MediaFile[] = [];
  for (const entry of entries) {
    if (entry.kind === "media") {
      out.push(entry);
    } else {
      for (const item of entry.items) out.push(item);
    }
  }
  return out;
}

function fileMatchesUrl(file: MediaFile, targetUrl: string, targetId: string | null): boolean {
  const source = file.sourceUrl?.trim();
  const storedId = file.sourceId?.trim();

  if (targetId) {
    if (storedId && storedId === targetId) return true;
    if (source) {
      const sourceIdFromUrl = extractYouTubeVideoId(source);
      if (sourceIdFromUrl && sourceIdFromUrl === targetId) return true;
    }
  }

  if (source && youtubeUrlsMatch(targetUrl, source)) return true;
  return false;
}

/** Gallery reverse-match fallback: exactly one candidate or skip. */
export function resolveGalleryFallbackPath(
  targetUrl: string,
  entries: GalleryEntry[],
): string | null {
  const targetId = extractYouTubeVideoId(targetUrl);
  const matches: MediaFile[] = [];
  for (const file of iterMediaFiles(entries)) {
    if (fileMatchesUrl(file, targetUrl, targetId)) {
      matches.push(file);
    }
  }
  if (matches.length === 1) return matches[0]!.path;
  return null;
}

export type DevReplayCleanupResult = {
  deletedPaths: string[];
  unresolvedUrls: string[];
};

export async function devReplayCleanupForBatch(
  record: LastDownloadBatchRecord,
  replayOutputPaths: Record<string, string>,
): Promise<DevReplayCleanupResult> {
  const deletedPaths: string[] = [];
  const unresolvedUrls: string[] = [];
  const entries = useRuforgeStore.getState().entries;

  for (const item of record.items) {
    const resolved =
      replayOutputPaths[item.url]?.trim() ||
      record.outputPathsByUrl?.[item.url]?.trim() ||
      null;

    if (resolved) {
      deletedPaths.push(resolved);
      continue;
    }

    const fallback = resolveGalleryFallbackPath(item.url, entries);
    if (fallback) {
      deletedPaths.push(fallback);
    } else {
      unresolvedUrls.push(item.url);
    }
  }

  const uniquePaths = [...new Set(deletedPaths.filter(Boolean))];
  if (uniquePaths.length > 0) {
    await releasePlaybackBeforeDelete(uniquePaths);
    await invoke<number>("delete_media_batch", { paths: uniquePaths });
    clearPlaybackStateForDeletedPaths(uniquePaths);
    void useRuforgeStore.getState().invalidateEntries({ silent: true });
  }

  return { deletedPaths: uniquePaths, unresolvedUrls };
}
