import type { DownloadJob } from "@/downloadQueue";
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
import { collapseDownloadAttempts, withLiveDownloadActions } from "./downloadItems";

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

let memo: { local: NotificationItem[]; jobs: DownloadJob[]; items: NotificationItem[] } | null = null;

function items(): NotificationItem[] {
  const local = useNotificationCenterStore.getState().local;
  const jobs = useRuforgeStore.getState().downloadJobs;
  if (memo && memo.local === local && memo.jobs === jobs) return memo.items;
  const projected = withLiveDownloadActions(
    collapseDownloadAttempts(local.filter((i) => i.source === "download")),
    jobs,
  );
  memo = { local, jobs, items: projected };
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
        if (item.ref.jobId) s.retryDownloadJob(item.ref.jobId);
        return;
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
      if (st.local !== prev.local) onChange();
    });
    const offJobs = useRuforgeStore.subscribe((st, prev) => {
      if (st.downloadJobs !== prev.downloadJobs) onChange();
    });
    return () => {
      offLocal();
      offJobs();
    };
  },
};
