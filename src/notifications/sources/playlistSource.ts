import { queuePlaylistVideos } from "@/playlistWatch/queueNewVideos";
import { markAllLocalRead, markLocalRead, upsertLocal, useNotificationCenterStore } from "../notificationCenterStore";
import type { NotificationItem, NotificationSource } from "../types";

let memo: { local: NotificationItem[]; items: NotificationItem[] } | null = null;

function items(): NotificationItem[] {
  const { local } = useNotificationCenterStore.getState();
  if (memo && memo.local === local) return memo.items;
  const next = local
    .filter((i) => i.source === "playlist")
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  memo = { local, items: next };
  return next;
}

export const playlistSource: NotificationSource = {
  id: "playlist",
  items,
  markRead: (ids) => markLocalRead(ids),
  markAllRead: () => markAllLocalRead(),
  runAction: (item, action) => {
    if (action !== "queue") return;
    if (!queuePlaylistVideos(item)) return false;
    upsertLocal({ ...item, actions: [], subtitle: "Queued", read: true });
  },
  subscribe: (onChange) =>
    useNotificationCenterStore.subscribe((st, prev) => {
      if (st.local !== prev.local) onChange();
    }),
};
