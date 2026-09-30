import type { WatchlistSnapshot, WatchlistUpload } from "@/watchlist/types";
import type { NotificationItem, NotificationKind } from "../types";

export const WATCHLIST_ID_PREFIX = "watchlist:";

const premiereFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

function kindFor(u: WatchlistUpload): NotificationKind {
  if (u.liveStatus === "upcoming") return "premiere";
  if (u.liveStatus === "live") return "live";
  return "upload";
}

function subtitleFor(u: WatchlistUpload, kind: NotificationKind): string {
  if (kind === "live") return "Live now";
  if (kind === "premiere") {
    return u.scheduledAt != null ? `Premieres ${premiereFormat.format(u.scheduledAt * 1000)}` : "Premieres soon";
  }
  return u.channelTitle;
}

/** `held`: already in the library or the download queue, so offering another download is wrong. */
export function watchlistUploadToItem(u: WatchlistUpload, held = false): NotificationItem {
  const kind = kindFor(u);
  return {
    id: `${WATCHLIST_ID_PREFIX}${u.videoId}`,
    source: "watchlist",
    kind,
    title: u.title,
    subtitle: subtitleFor(u, kind),
    thumbnail: u.thumbnail,
    channelId: u.channelId,
    createdAt: u.discoveredAt * 1000,
    read: u.seen,
    // Nothing to download until a premiere or stream becomes a normal video.
    actions: kind === "upload" && !held ? ["queue", "open-explorer"] : ["open-explorer"],
    ref: { videoId: u.videoId, url: u.url, scheduledAt: u.scheduledAt },
  };
}

export function watchlistItems(
  snapshot: WatchlistSnapshot | null,
  heldVideoIds: ReadonlySet<string> = new Set(),
): NotificationItem[] {
  return snapshot ? snapshot.uploads.map((u) => watchlistUploadToItem(u, heldVideoIds.has(u.videoId))) : [];
}

export function videoIdsFromItemIds(ids: string[]): string[] {
  return ids.filter((id) => id.startsWith(WATCHLIST_ID_PREFIX)).map((id) => id.slice(WATCHLIST_ID_PREFIX.length));
}
