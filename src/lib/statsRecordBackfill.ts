import { useNotificationCenterStore } from "@/notifications/notificationCenterStore";
import type { NotificationItem } from "@/notifications/types";
import { statsBests, type StatsBests } from "./activityStats";

function recordFor(item: NotificationItem, bests: StatsBests): NotificationItem["record"] {
  if (item.id.includes("best:fastest")) {
    const f = bests.fastestDownload.value;
    return f && f.peakBps > 0 ? { value: f.peakBps, titles: f.title ? [f.title] : [] } : undefined;
  }
  if (item.id.includes("best:binge")) {
    const b = bests.longestBinge.value;
    return b && b.seconds > 0 ? { value: b.seconds, titles: b.titles } : undefined;
  }
  return undefined;
}

/** Records saved before notes carried values would otherwise show no number; fill them from the current bests. */
export async function backfillRecordValues(): Promise<void> {
  const missing = useNotificationCenterStore
    .getState()
    .local.some((i) => i.kind === "stats-milestone" && !i.record && /best:(fastest|binge)/.test(i.id));
  if (!missing) return;
  try {
    const bests = await statsBests();
    useNotificationCenterStore.setState((s) => ({
      local: s.local.map((i) => {
        if (i.kind !== "stats-milestone" || i.record) return i;
        const record = recordFor(i, bests);
        return record ? { ...i, record } : i;
      }),
    }));
  } catch (e) {
    console.warn("[statsMilestones] record backfill failed", e);
  }
}
