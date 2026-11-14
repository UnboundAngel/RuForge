import { persistDownloadJobs, type DownloadEnqueueSource, type DownloadJob } from "@/downloadQueue";
import { hydrateDownloadQueueFromDisk } from "@/downloadQueueDisk";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { upsertLocal, useNotificationCenterStore } from "./notificationCenterStore";
import { recordNotification } from "./recordNotification";
import type { NotificationItem } from "./types";

export const PAUSED_QUEUE_NOTIFICATION_ID = "download:queue-paused";

/** Downloads the user started themselves. Staged URLs (paste, drop, Explorer add) wait for an explicit Download. */
const STARTED_SOURCES: ReadonlySet<DownloadEnqueueSource> = new Set([
  "heroSingleDownload",
  "heroPlaylistDownload",
  "libraryFeedAdd",
  "watchlistAdd",
  "watchlistAuto",
  "notificationRetry",
]);

/** Paused by the last shutdown, or queued and started but demoted to held by the cold restore. */
export function isResumableAfterLaunch(job: DownloadJob): boolean {
  if (job.status === "paused") return true;
  return (
    job.status === "queued" &&
    job.approval === "held" &&
    job.enqueueSource != null &&
    STARTED_SOURCES.has(job.enqueueSource)
  );
}

export function buildPausedQueueNotification(count: number, now = Date.now()): NotificationItem {
  return {
    id: PAUSED_QUEUE_NOTIFICATION_ID,
    source: "download",
    kind: "download-paused",
    title: `${count} ${count === 1 ? "download" : "downloads"} paused`,
    subtitle: "Resume to pick up where they stopped.",
    thumbnail: null,
    channelId: null,
    createdAt: now,
    read: false,
    actions: ["resume-queue"],
    ref: {},
  };
}

/** Starts every resumable job again without opening the downloader. */
export function resumePausedQueue(): number {
  const s = useRuforgeStore.getState();
  const ids = new Set(s.downloadJobs.filter(isResumableAfterLaunch).map((j) => j.id));
  if (ids.size === 0) return 0;
  const downloadJobs = s.downloadJobs.map((j) =>
    ids.has(j.id) && j.status === "queued" ? { ...j, approval: "auto" as const } : j,
  );
  useRuforgeStore.setState({ downloadJobs });
  persistDownloadJobs(downloadJobs);
  for (const j of downloadJobs) {
    if (ids.has(j.id) && j.status === "paused") void s.resumeDownloadJob(j.id);
  }
  s.pumpDownloadQueue();
  return ids.size;
}

/** Main window, once at launch: one bell row for whatever the last session left unfinished. */
export async function announcePausedQueueOnLaunch(): Promise<void> {
  await hydrateDownloadQueueFromDisk();
  const s = useRuforgeStore.getState();
  s.restoreDownloadQueueFromSessionIfEmpty();
  const count = useRuforgeStore.getState().downloadJobs.filter(isResumableAfterLaunch).length;
  if (count > 0) {
    recordNotification(buildPausedQueueNotification(count));
    return;
  }
  // Nothing left to resume, so last launch's row must not keep offering it.
  const stale = useNotificationCenterStore.getState().local.find((i) => i.id === PAUSED_QUEUE_NOTIFICATION_ID);
  if (stale?.actions.length) upsertLocal({ ...stale, actions: [], subtitle: "Resumed", read: true });
}
