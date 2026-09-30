import { useEffect, useMemo, useRef } from "react";
import type { FeedVideo } from "@/components/library/youtubeFeed";
import { markSeen } from "@/watchlist/watchlistActions";
import { shelfUploads, toFeedVideo, unseenUploads } from "@/watchlist/watchlistSelectors";
import { useWatchlistStore } from "@/watchlist/watchlistStore";

/**
 * One row of unseen uploads for Library home. Uploads that are already in the library get marked
 * seen here, because a shelf card downloads through the plain feed path and never tells the watchlist.
 */
export function useWatchlistShelf(enabled: boolean, libraryIds: ReadonlySet<string>, limit: number): FeedVideo[] {
  const snapshot = useWatchlistStore((s) => s.snapshot);
  const requested = useRef(new Set<string>());

  useEffect(() => {
    const downloaded = unseenUploads(snapshot)
      .map((u) => u.videoId)
      .filter((id) => libraryIds.has(id) && !requested.current.has(id));
    if (downloaded.length === 0) return;
    for (const id of downloaded) requested.current.add(id);
    void markSeen(downloaded).catch((e) => {
      for (const id of downloaded) requested.current.delete(id);
      console.error("mark_watchlist_seen failed", e);
    });
  }, [snapshot, libraryIds]);

  return useMemo(
    () => (enabled ? shelfUploads(snapshot, libraryIds, limit).map(toFeedVideo) : []),
    [enabled, snapshot, libraryIds, limit],
  );
}
