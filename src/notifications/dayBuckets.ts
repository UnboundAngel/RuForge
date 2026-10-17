import type { NotificationItem } from "./types";

export type DayBucket = { label: string; items: NotificationItem[] };

const DAY_MS = 86_400_000;

function bucketLabel(createdAt: number, todayStart: number): string {
  if (createdAt >= todayStart) return "Today";
  if (createdAt >= todayStart - DAY_MS) return "Yesterday";
  if (createdAt >= todayStart - 6 * DAY_MS) return "This week";
  if (createdAt >= todayStart - 29 * DAY_MS) return "This month";
  return "Older";
}

/** Splits a newest-first list into calendar buckets, keeping the order inside each. */
export function bucketByDay(items: NotificationItem[], now = Date.now()): DayBucket[] {
  const d = new Date(now);
  const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const buckets: DayBucket[] = [];
  for (const item of items) {
    const label = bucketLabel(item.createdAt, todayStart);
    const last = buckets[buckets.length - 1];
    const found = last?.label === label ? last : buckets.find((b) => b.label === label);
    if (found) found.items.push(item);
    else buckets.push({ label, items: [item] });
  }
  return buckets;
}
