import type { NotificationItem } from "./types";

export type FeedEntry =
  | { type: "item"; item: NotificationItem }
  | { type: "group"; channelId: string; items: NotificationItem[] };

/** A creator with fewer unread rows than this keeps them as plain rows. */
export const MIN_GROUP_SIZE = 2;

/**
 * Collapses a creator's watchlist rows into one entry. The group sits where the creator's newest row
 * was, so the feed order is unchanged.
 */
export function groupByCreator(items: NotificationItem[]): FeedEntry[] {
  const byChannel = new Map<string, NotificationItem[]>();
  for (const item of items) {
    if (item.source !== "watchlist" || !item.channelId) continue;
    const list = byChannel.get(item.channelId);
    if (list) list.push(item);
    else byChannel.set(item.channelId, [item]);
  }
  const entries: FeedEntry[] = [];
  const placed = new Set<string>();
  for (const item of items) {
    const channelId = item.source === "watchlist" ? item.channelId : null;
    const members = channelId ? byChannel.get(channelId) : undefined;
    if (!channelId || !members || members.length < MIN_GROUP_SIZE) {
      entries.push({ type: "item", item });
    } else if (!placed.has(channelId)) {
      placed.add(channelId);
      entries.push({ type: "group", channelId, items: members });
    }
  }
  return entries;
}
