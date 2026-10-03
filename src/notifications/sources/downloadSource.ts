import { buildDownloadJobOptions, resolveDownloadOutputDir, type DownloadJob } from "@/downloadQueue";
import { STORAGE_FULL_NOTIFY, storageBlocksNewDownloads } from "@/lib/storageBlocks";
import { openInFileManager } from "@/openInFileManager";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { GalleryEntry, MediaFile } from "@/types";
import {
  markAllLocalRead,
  markLocalRead,
  useNotificationCenterStore,
} from "../notificationCenterStore";
import type { NotificationItem, NotificationSource } from "../types";
import { activeStorageHolds, storageInputsChanged, withStorageHolds } from "../storageHolds";
import { collapseDownloadAttempts, recordStorageFullRefusal, withLiveDownloadActions } from "./downloadItems";

function findLibraryFile(entries: GalleryEntry[], path: string): MediaFile | null {
  for (const entry of entries) {
    if (entry.kind === "media") {
      if (mediaPathsMatch(entry.path, path)) return entry;
      continue;
    }
    const hit = entry.items.find((item) => mediaPathsMatch(item.path, path));
    if (hit) return hit;
  }
  return null;
}

/** False when storage refused the retry, so the row stays unread. */
function retryFromNotification(item: NotificationItem): boolean {
  const s = useRuforgeStore.getState();
  const job = item.ref.jobId ? s.downloadJobs.find((j) => j.id === item.ref.jobId) : undefined;
  if (job && (job.status === "failed" || job.status === "timed_out")) {
    s.retryDownloadJob(job.id);
    return true;
  }
  const url = job?.url ?? item.ref.url;
  if (!url) return true;
  if (storageBlocksNewDownloads(s)) {
    s.notify(STORAGE_FULL_NOTIFY, "warning");
    recordStorageFullRefusal({ url, title: item.title, thumbnail: item.thumbnail });
    return false;
  }
  const dir = resolveDownloadOutputDir(s.saveToInternal, s.outputDir, s.internalVault);
  s.enqueueDownload(url, job?.options ?? buildDownloadJobOptions(s.settings, dir), {
    title: item.title,
    snapshot: {
      title: item.title,
      thumbnail: item.thumbnail ?? "",
      duration: 0,
      isPlaylist: false,
    },
    enqueueSource: "notificationRetry",
  });
  s.pumpDownloadQueue();
  return true;
}

let memo: {
  local: NotificationItem[];
  jobs: DownloadJob[];
  holds: ReadonlySet<string>;
  items: NotificationItem[];
} | null = null;

function items(): NotificationItem[] {
  const { local, storageHeldVideoIds } = useNotificationCenterStore.getState();
  const s = useRuforgeStore.getState();
  const jobs = s.downloadJobs;
  const holds = activeStorageHolds(storageHeldVideoIds, s);
  if (memo && memo.local === local && memo.jobs === jobs && memo.holds === holds) return memo.items;
  const projected = withStorageHolds(
    withLiveDownloadActions(collapseDownloadAttempts(local.filter((i) => i.source === "download")), jobs),
    holds,
  );
  memo = { local, jobs, holds, items: projected };
  return projected;
}

export const downloadSource: NotificationSource = {
  id: "download",
  items,
  markRead: (ids) => markLocalRead(ids),
  markAllRead: () => markAllLocalRead(),
  runAction: async (item, action) => {
    const s = useRuforgeStore.getState();
    const path = item.ref.outputPath;
    switch (action) {
      case "play": {
        if (!path) return;
        const file = findLibraryFile(s.entries, path);
        if (file) await s.handlePlayFile(file, undefined, null);
        else await openInFileManager(path);
        return;
      }
      case "show-in-folder":
        if (path) await openInFileManager(path);
        return;
      case "retry":
        return retryFromNotification(item);
      case "open-storage-settings":
        // Storage is the first section of General, and Settings opens scrolled to the top.
        s.setSettingsTab("general");
        s.openSettings();
        return;
      default:
        return;
    }
  },
  subscribe: (onChange) => {
    const offLocal = useNotificationCenterStore.subscribe((st, prev) => {
      if (st.local !== prev.local || st.storageHeldVideoIds !== prev.storageHeldVideoIds) onChange();
    });
    const offJobs = useRuforgeStore.subscribe((st, prev) => {
      if (st.downloadJobs !== prev.downloadJobs || storageInputsChanged(st, prev)) onChange();
    });
    return () => {
      offLocal();
      offJobs();
    };
  },
};
