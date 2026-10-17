import { markAllLocalRead, markLocalRead, useNotificationCenterStore } from "../notificationCenterStore";
import type { NotificationItem, NotificationSource } from "../types";

let memo: { local: NotificationItem[]; items: NotificationItem[] } | null = null;

function items(): NotificationItem[] {
  const { local } = useNotificationCenterStore.getState();
  if (memo && memo.local === local) return memo.items;
  const next = local
    .filter((i) => i.source === "stats")
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  memo = { local, items: next };
  return next;
}

/** Milestone notes: informational rows with no actions and no popup. */
export const statsSource: NotificationSource = {
  id: "stats",
  items,
  markRead: (ids) => markLocalRead(ids),
  markAllRead: () => markAllLocalRead(),
  runAction: () => undefined,
  subscribe: (onChange) =>
    useNotificationCenterStore.subscribe((st, prev) => {
      if (st.local !== prev.local) onChange();
    }),
};
