import type { DownloadJob } from "@/downloadQueue";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { GalleryEntry } from "@/types";
import type { WatchlistSnapshot } from "@/watchlist/types";
import { markAllSeen, markSeen, openUploadInExplorer, queueUpload } from "@/watchlist/watchlistActions";
import { useWatchlistStore } from "@/watchlist/watchlistStore";
import { extractYouTubeVideoId } from "@/youtubeUrl";
import { useNotificationCenterStore } from "../notificationCenterStore";
import { activeStorageHolds, storageInputsChanged, withStorageHolds } from "../storageHolds";
import type { NotificationItem, NotificationSource } from "../types";
import { videoIdsFromItemIds, watchlistItems } from "./watchlistItems";

const DEAD_JOB = new Set<DownloadJob["status"]>(["failed", "timed_out", "skipped"]);

function addId(out: Set<string>, url: string | null | undefined, sourceId?: string | null): void {
  const id = sourceId?.trim() || (url ? extractYouTubeVideoId(url) : null);
  if (id) out.add(id);
}

/** Video ids already in the library or a live download job. */
function heldVideoIds(entries: GalleryEntry[], jobs: DownloadJob[]): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    if (entry.kind === "media") addId(out, entry.sourceUrl, entry.sourceId);
    else for (const f of entry.items) addId(out, f.sourceUrl, f.sourceId);
  }
  for (const job of jobs) if (!DEAD_JOB.has(job.status)) addId(out, job.url);
  return out;
}

let memo: {
  snapshot: WatchlistSnapshot | null;
  entries: GalleryEntry[];
  jobs: DownloadJob[];
  holds: ReadonlySet<string>;
  items: NotificationItem[];
} | null = null;

function items(): NotificationItem[] {
  const snapshot = useWatchlistStore.getState().snapshot;
  const s = useRuforgeStore.getState();
  const { entries, downloadJobs: jobs } = s;
  const holds = activeStorageHolds(useNotificationCenterStore.getState().storageHeldVideoIds, s);
  if (memo && memo.snapshot === snapshot && memo.entries === entries && memo.jobs === jobs && memo.holds === holds) {
    return memo.items;
  }
  const held = snapshot && snapshot.uploads.length > 0 ? heldVideoIds(entries, jobs) : undefined;
  memo = { snapshot, entries, jobs, holds, items: withStorageHolds(watchlistItems(snapshot, held), holds) };
  return memo.items;
}

export const watchlistSource: NotificationSource = {
  id: "watchlist",
  items,
  markRead: async (ids) => {
    const videoIds = videoIdsFromItemIds(ids);
    if (videoIds.length > 0) await markSeen(videoIds);
  },
  markAllRead: async () => {
    if ((useWatchlistStore.getState().snapshot?.unseenCount ?? 0) > 0) await markAllSeen();
  },
  runAction: async (item, action) => {
    const upload = useWatchlistStore
      .getState()
      .snapshot?.uploads.find((u) => u.videoId === item.ref.videoId);
    if (!upload) return false;
    if (action === "queue") return queueUpload(upload);
    if (action === "open-explorer") await openUploadInExplorer(upload);
  },
  subscribe: (onChange) => {
    const offWatchlist = useWatchlistStore.subscribe((s, prev) => {
      if (s.snapshot !== prev.snapshot) onChange();
    });
    const offMain = useRuforgeStore.subscribe((s, prev) => {
      if (s.entries !== prev.entries || s.downloadJobs !== prev.downloadJobs || storageInputsChanged(s, prev)) {
        onChange();
      }
    });
    const offHolds = useNotificationCenterStore.subscribe((s, prev) => {
      if (s.storageHeldVideoIds !== prev.storageHeldVideoIds) onChange();
    });
    return () => {
      offWatchlist();
      offMain();
      offHolds();
    };
  },
};
