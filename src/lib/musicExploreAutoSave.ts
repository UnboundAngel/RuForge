/** Auto-save for Music Explore: queue only after sustained listen time on one track. */
import type { DownloadJob } from "@/downloadQueue";
import { extractYouTubeVideoId } from "@/youtubeUrl";

const AUTO_SAVE_LISTEN_THRESHOLD_MS = 15_000;

/**
 * Video ids auto-save has queued, seen finish, or seen cancelled this session. Module scope so
 * Music remounts and webview navigation (which re-announces the same song) cannot reset it.
 */
const handledVideoIds = new Set<string>();

export function markMusicExploreAutoSaveHandled(videoId: string): void {
  handledVideoIds.add(videoId);
}

/** Only a failed attempt is forgotten, so replaying the song retries it. */
export function noteMusicExploreJobRemoved(job: Pick<DownloadJob, "url" | "status">): void {
  if (job.status !== "failed" && job.status !== "timed_out") return;
  const videoId = extractYouTubeVideoId(job.url);
  if (videoId) handledVideoIds.delete(videoId);
}

export function musicExploreWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export type MusicExploreAutoSaveQueue = {
  jobs: () => Pick<DownloadJob, "url" | "status">[];
  inLibrary: (url: string) => boolean;
  /** Queues one new job for `url`; must not release or touch other jobs. */
  enqueue: (url: string) => void;
};

export function runMusicExploreAutoSave(videoId: string, queue: MusicExploreAutoSaveQueue): boolean {
  const url = musicExploreWatchUrl(videoId);
  if (!shouldMusicExploreAutoSave(videoId, queue.jobs(), queue.inLibrary(url))) return false;
  handledVideoIds.add(videoId);
  queue.enqueue(url);
  return true;
}

export function resetMusicExploreAutoSaveMemory(): void {
  handledVideoIds.clear();
}

/**
 * Whether the auto-save timer for `videoId` should queue a new job. A track already in the
 * library, already handled, or already live in the queue from anywhere else is left alone.
 */
export function shouldMusicExploreAutoSave(
  videoId: string,
  jobs: Pick<DownloadJob, "url" | "status">[],
  inLibrary: boolean,
): boolean {
  if (handledVideoIds.has(videoId)) return false;
  const live = jobs.some(
    (j) =>
      extractYouTubeVideoId(j.url) === videoId &&
      (j.status === "queued" || j.status === "paused" || j.status === "downloading"),
  );
  if (inLibrary || live) {
    handledVideoIds.add(videoId);
    return false;
  }
  return true;
}

let activeEntry: {
  videoId: string;
  timer: ReturnType<typeof setTimeout>;
  cancelled: boolean;
} | null = null;

export type MusicExploreAutoSavePayload = {
  videoId: string;
  title?: string | null;
};

/**
 * Starts a listen timer for `videoId`. Fires `onSave` only if the same track is
 * still active after {@link AUTO_SAVE_LISTEN_THRESHOLD_MS}. Cancels any pending
 * timer for a previous track (skip away before threshold).
 */
export function scheduleMusicExploreAutoSave(
  payload: MusicExploreAutoSavePayload,
  onSave: (p: MusicExploreAutoSavePayload) => void,
): () => void {
  const videoId = payload.videoId.trim();
  if (!videoId) return () => {};

  if (activeEntry) {
    activeEntry.cancelled = true;
    clearTimeout(activeEntry.timer);
    activeEntry = null;
  }

  const entry = {
    videoId,
    timer: undefined as unknown as ReturnType<typeof setTimeout>,
    cancelled: false,
  };
  entry.timer = setTimeout(() => {
    if (activeEntry === entry) activeEntry = null;
    if (entry.cancelled) return;
    onSave(payload);
  }, AUTO_SAVE_LISTEN_THRESHOLD_MS);
  activeEntry = entry;

  return () => {
    if (activeEntry !== entry) return;
    entry.cancelled = true;
    clearTimeout(entry.timer);
    activeEntry = null;
  };
}

export function cancelAllMusicExploreAutoSave(): void {
  if (!activeEntry) return;
  activeEntry.cancelled = true;
  clearTimeout(activeEntry.timer);
  activeEntry = null;
}
