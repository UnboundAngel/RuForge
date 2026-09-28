import type { DownloadJob } from "@/downloadQueue";
import { findLibraryDuplicate } from "@/duplicateDownload";
import type { GalleryEntry } from "@/types";
import { extractYouTubeVideoId } from "@/youtubeUrl";
import type { WatchlistSnapshot, WatchlistUpload } from "./types";

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function watchlistAlertCopy(uploads: WatchlistUpload[], autoQueued: number): string {
  const n = uploads.length;
  let copy: string;
  if (n === 1) {
    const u = uploads[0];
    if (u.liveStatus === "upcoming") copy = `${u.channelTitle} scheduled a premiere: ${u.title}`;
    else if (u.liveStatus === "live") copy = `${u.channelTitle} is live: ${u.title}`;
    else copy = `New from ${u.channelTitle}: ${u.title}`;
  } else if (uploads.every((u) => u.channelId === uploads[0].channelId)) {
    copy = `${n} new uploads from ${uploads[0].channelTitle}`;
  } else {
    copy = `${n} new uploads from channels you follow`;
  }
  return autoQueued > 0 ? `${copy} Downloading now.` : copy;
}

export function watchlistStorageBlockedCopy(n: number): string {
  return `Storage limit reached. ${n} new ${plural(n, "upload", "uploads")} from channels you follow ${plural(n, "was", "were")} not downloaded.`;
}

const ACTIVE_JOB_STATUSES = new Set<DownloadJob["status"]>(["queued", "downloading", "paused"]);

/**
 * Uploads to auto-queue: opted-in channel, a normal video by now, not queued before, not already
 * in the library or the download queue. `handled` covers repeats within one session.
 */
export function pickAutoDownloads(
  uploads: WatchlistUpload[],
  snapshot: WatchlistSnapshot | null,
  entries: GalleryEntry[],
  jobs: DownloadJob[],
  handled: ReadonlySet<string>,
): WatchlistUpload[] {
  if (!snapshot) return [];
  const autoChannels = new Set(snapshot.channels.filter((c) => c.autoDownload).map((c) => c.channelId));
  const alreadyQueued = new Set(snapshot.uploads.filter((u) => u.autoQueued).map((u) => u.videoId));
  const inQueue = new Set(
    jobs
      .filter((j) => ACTIVE_JOB_STATUSES.has(j.status))
      .map((j) => extractYouTubeVideoId(j.url))
      .filter((id): id is string => !!id),
  );
  const seen = new Set<string>();
  return uploads.filter((u) => {
    if (seen.has(u.videoId)) return false;
    seen.add(u.videoId);
    return (
      autoChannels.has(u.channelId) &&
      u.liveStatus === "none" &&
      !u.autoQueued &&
      !alreadyQueued.has(u.videoId) &&
      !handled.has(u.videoId) &&
      !inQueue.has(u.videoId) &&
      !findLibraryDuplicate(u.url, entries)
    );
  });
}
