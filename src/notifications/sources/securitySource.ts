import { markAllLocalRead, markLocalRead, useNotificationCenterStore } from "../notificationCenterStore";
import type { NotificationItem, NotificationSource } from "../types";

/** All trips fold into this one row; its id stands for every underlying record. */
export const SECURITY_GROUP_ID = "security:group";

const SHOWN_TARGETS = 3;

let memo: { local: NotificationItem[]; items: NotificationItem[] } | null = null;

function tripTarget(item: NotificationItem): string {
  const s = item.subtitle?.trim() ?? "";
  return s.startsWith("Tripwire:") || !s ? "RuForge internals" : s;
}

/** One probe usually fires several trips at once; separate rows read as five alarms for one event. */
export function groupSecurityTrips(trips: NotificationItem[]): NotificationItem | null {
  if (trips.length === 0) return null;
  const sorted = [...trips].sort((a, b) => b.createdAt - a.createdAt);
  const targets = [...new Set(sorted.map(tripTarget))];
  const shown = targets.slice(0, SHOWN_TARGETS).join(", ");
  const more = targets.length > SHOWN_TARGETS ? `, +${targets.length - SHOWN_TARGETS} more` : "";
  const n = trips.length;
  return {
    id: SECURITY_GROUP_ID,
    source: "security",
    kind: "security-blocked",
    title: n === 1 ? "Blocked a request from a YouTube page" : `Blocked ${n} requests from YouTube pages`,
    subtitle: `${shown}${more}`,
    thumbnail: null,
    channelId: null,
    createdAt: sorted[0].createdAt,
    read: trips.every((t) => t.read),
    actions: [],
    ref: {},
  };
}

function trips(local: NotificationItem[]): NotificationItem[] {
  return local.filter((i) => i.source === "security");
}

function items(): NotificationItem[] {
  const { local } = useNotificationCenterStore.getState();
  if (memo && memo.local === local) return memo.items;
  const group = groupSecurityTrips(trips(local));
  memo = { local, items: group ? [group] : [] };
  return memo.items;
}

function expandIds(ids: string[]): string[] {
  if (!ids.includes(SECURITY_GROUP_ID)) return ids;
  const all = trips(useNotificationCenterStore.getState().local).map((t) => t.id);
  return [...ids.filter((id) => id !== SECURITY_GROUP_ID), ...all];
}

/** Tripwire alerts: informational rows with no actions. */
export const securitySource: NotificationSource = {
  id: "security",
  items,
  markRead: (ids) => markLocalRead(expandIds(ids)),
  markAllRead: () => markAllLocalRead(),
  runAction: () => undefined,
  subscribe: (onChange) =>
    useNotificationCenterStore.subscribe((st, prev) => {
      if (st.local !== prev.local) onChange();
    }),
};
