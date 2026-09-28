import type { WatchlistSnapshot } from "@/watchlist/types";
import { markAllSeen, markSeen, openUploadInExplorer, queueUpload } from "@/watchlist/watchlistActions";
import { useWatchlistStore } from "@/watchlist/watchlistStore";
import type { NotificationItem, NotificationSource } from "../types";
import { videoIdsFromItemIds, watchlistItems } from "./watchlistItems";

let memo: { snapshot: WatchlistSnapshot | null; items: NotificationItem[] } | null = null;

function items(): NotificationItem[] {
  const snapshot = useWatchlistStore.getState().snapshot;
  if (memo && memo.snapshot === snapshot) return memo.items;
  memo = { snapshot, items: watchlistItems(snapshot) };
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
    if (!upload) return;
    if (action === "queue") await queueUpload(upload);
    else if (action === "open-explorer") await openUploadInExplorer(upload);
  },
  subscribe: (onChange) =>
    useWatchlistStore.subscribe((s, prev) => {
      if (s.snapshot !== prev.snapshot) onChange();
    }),
};
