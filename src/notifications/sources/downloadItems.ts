import type { DownloadJob } from "@/downloadQueue";
import { STORAGE_FULL_NOTIFY } from "@/lib/storageBlocks";
import { recordNotification } from "../recordNotification";
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
    return info.jobIds?.length
      ? `download:storage-block:${info.jobIds.join(",")}`
      : STORAGE_FULL_NOTIFICATION_ID;
  }
  return `download:${info.jobId ?? info.url ?? "unknown"}`;
}

function baseActions(kind: DownloadNotificationKind, info: DownloadNotificationInfo): NotificationActionId[] {
  switch (kind) {
    case "download-finished":
      return info.outputPath ? ["play", "show-in-folder"] : [];
    case "download-failed":
    case "download-timed-out":
      return info.jobId ? ["retry"] : [];
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
  const line = info.error?.split("\n")[0]?.trim();
  return line || null;
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
    },
  };
}

/** Retry only makes sense while the failed row is still in the queue to re-run. */
export function withLiveDownloadActions(items: NotificationItem[], jobs: DownloadJob[]): NotificationItem[] {
  return items.map((item) => {
    if (!item.actions.includes("retry")) return item;
    const job = item.ref.jobId ? jobs.find((j) => j.id === item.ref.jobId) : undefined;
    const retryable = job?.status === "failed" || job?.status === "timed_out";
    return retryable ? item : { ...item, actions: item.actions.filter((a) => a !== "retry") };
  });
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

export function recordStorageFullRefusal(): void {
  recordDownloadNotification("download-blocked", { error: STORAGE_FULL_NOTIFY });
}
