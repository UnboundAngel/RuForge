import type { DownloadJob } from "@/downloadQueue";
import { STORAGE_FULL_NOTIFY } from "@/lib/storageBlocks";
import { useWatchlistStore } from "@/watchlist/watchlistStore";
import { extractYouTubeVideoId, normalizeYouTubeUrlForCompare } from "@/youtubeUrl";
import { markStorageHeld, useNotificationCenterStore } from "../notificationCenterStore";
import { recordNotification } from "../recordNotification";
import { notificationVideoId } from "../storageHolds";
import type { NotificationActionId, NotificationItem, NotificationKind } from "../types";

export type DownloadNotificationKind = Extract<
  NotificationKind,
  "download-finished" | "download-failed" | "download-timed-out" | "download-blocked"
>;

export type DownloadNotificationInfo = {
  jobId?: string;
  /** Storage holds cover a batch; the id is built from every held job. */
  jobIds?: string[];
  url?: string;
  title?: string | null;
  thumbnail?: string | null;
  outputPath?: string | null;
  error?: string | null;
};

/** Every refused add shares one row so repeats bump it instead of stacking. */
export const STORAGE_FULL_NOTIFICATION_ID = "download:storage-full";

function fileName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function notificationId(kind: DownloadNotificationKind, info: DownloadNotificationInfo): string {
  if (kind === "download-blocked") {
    if (info.jobIds?.length) return `download:storage-block:${info.jobIds.join(",")}`;
    return info.url ? `${STORAGE_FULL_NOTIFICATION_ID}:${normalizeYouTubeUrlForCompare(info.url)}` : STORAGE_FULL_NOTIFICATION_ID;
  }
  return `download:${info.jobId ?? info.url ?? "unknown"}`;
}

function baseActions(kind: DownloadNotificationKind, info: DownloadNotificationInfo): NotificationActionId[] {
  switch (kind) {
    case "download-finished":
      return info.outputPath ? ["play", "show-in-folder"] : [];
    case "download-failed":
    case "download-timed-out":
      return info.jobId || info.url ? ["retry"] : [];
    case "download-blocked":
      return ["open-storage-settings"];
  }
}

function fallbackTitle(kind: DownloadNotificationKind): string {
  switch (kind) {
    case "download-finished":
      return "Download finished";
    case "download-failed":
      return "Download failed";
    case "download-timed-out":
      return "Download timed out";
    case "download-blocked":
      return "Storage limit reached";
  }
}

function subtitleFor(kind: DownloadNotificationKind, info: DownloadNotificationInfo): string | null {
  if (kind === "download-finished") return info.outputPath ? fileName(info.outputPath) : "Your file is ready.";
  const line = info.error
    ?.replace(/^JS_RUNTIME_MISSING:\s*/, "")
    .split("\n")[0]
    ?.trim();
  return line || null;
}

/** yt-dlp logs can run long; the feed is persisted to localStorage. */
const ERROR_COPY_MAX = 8000;

function errorForCopy(error: string | null | undefined): string | undefined {
  const text = error?.trim();
  if (!text) return undefined;
  return text.length > ERROR_COPY_MAX ? `${text.slice(0, ERROR_COPY_MAX)}\n…` : text;
}

export function buildDownloadNotification(
  kind: DownloadNotificationKind,
  info: DownloadNotificationInfo,
  now = Date.now(),
): NotificationItem {
  const title = info.title?.trim() || (info.outputPath ? fileName(info.outputPath) : "") || fallbackTitle(kind);
  return {
    id: notificationId(kind, info),
    source: "download",
    kind,
    title,
    subtitle: subtitleFor(kind, info),
    thumbnail: info.thumbnail?.trim() || null,
    channelId: null,
    createdAt: now,
    read: false,
    actions: baseActions(kind, info),
    ref: {
      jobId: info.jobId,
      url: info.url,
      outputPath: info.outputPath ?? undefined,
      error: kind === "download-finished" ? undefined : errorForCopy(info.error),
    },
  };
}

const IN_FLIGHT: ReadonlySet<DownloadJob["status"]> = new Set(["queued", "downloading", "paused"]);

/**
 * Retry hides only while the video is already queued or running again. A failed job that left
 * the queue is retried from its URL instead.
 */
export function withLiveDownloadActions(items: NotificationItem[], jobs: DownloadJob[]): NotificationItem[] {
  return items.map((item) => {
    if (!item.actions.includes("retry")) return item;
    const videoKey = item.ref.url ? normalizeYouTubeUrlForCompare(item.ref.url) : null;
    const inFlight = jobs.some(
      (j) =>
        IN_FLIGHT.has(j.status) &&
        (j.id === item.ref.jobId || (videoKey != null && normalizeYouTubeUrlForCompare(j.url) === videoKey)),
    );
    const job = item.ref.jobId ? jobs.find((j) => j.id === item.ref.jobId) : undefined;
    const retryable = !inFlight && (job != null || Boolean(item.ref.url));
    return retryable ? item : { ...item, actions: item.actions.filter((a) => a !== "retry") };
  });
}

const OUTCOME_KINDS: ReadonlySet<NotificationKind> = new Set([
  "download-finished",
  "download-failed",
  "download-timed-out",
]);

/**
 * A retry gets a new job id, so its rows are matched by video: only the newest outcome per video stays,
 * carrying a count of the failed tries it replaced.
 */
export function collapseDownloadAttempts(items: NotificationItem[]): NotificationItem[] {
  const keptAt = new Map<string, number>();
  const out: NotificationItem[] = [];
  for (const item of [...items].sort((a, b) => b.createdAt - a.createdAt)) {
    if (!OUTCOME_KINDS.has(item.kind) || !item.ref.url) {
      out.push(item);
      continue;
    }
    const key = normalizeYouTubeUrlForCompare(item.ref.url);
    const at = keptAt.get(key);
    if (at === undefined) {
      keptAt.set(key, out.length);
      out.push(item);
      continue;
    }
    if (item.kind !== "download-finished") {
      const kept = out[at];
      const failedAttempts = (kept.ref.failedAttempts ?? 0) + 1;
      const error = kept.ref.error ?? item.ref.error ?? item.subtitle ?? undefined;
      out[at] = { ...kept, ref: { ...kept.ref, failedAttempts, error } };
    }
  }
  return out.length === items.length ? items : out;
}

export function finishedJobNotificationInfo(job: DownloadJob, url: string | undefined): DownloadNotificationInfo {
  return {
    jobId: job.id,
    url: url ?? job.url,
    title: job.metadata?.title || job.title,
    thumbnail: job.metadata?.thumbnail,
  };
}

export function recordDownloadNotification(kind: DownloadNotificationKind, info: DownloadNotificationInfo): void {
  recordNotification(buildDownloadNotification(kind, info));
}

export type StorageRefusedVideo = { url: string; title?: string | null; thumbnail?: string | null };

function feedHasVideo(videoId: string): boolean {
  if (useWatchlistStore.getState().snapshot?.uploads.some((u) => u.videoId === videoId)) return true;
  return useNotificationCenterStore
    .getState()
    .local.some((i) => i.source === "download" && i.kind !== "download-blocked" && notificationVideoId(i) === videoId);
}

/** A refused video that already has a feed row gets badged in place; only unknown videos get a row of their own. */
export function recordStorageFullRefusal(video?: StorageRefusedVideo): void {
  const videoId = video ? extractYouTubeVideoId(video.url) : null;
  if (!video || !videoId) {
    recordDownloadNotification("download-blocked", { error: STORAGE_FULL_NOTIFY });
    return;
  }
  markStorageHeld(videoId);
  if (feedHasVideo(videoId)) return;
  recordDownloadNotification("download-blocked", {
    url: video.url,
    title: video.title,
    thumbnail: video.thumbnail,
    error: STORAGE_FULL_NOTIFY,
  });
}
