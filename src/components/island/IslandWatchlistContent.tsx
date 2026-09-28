import { motion } from "motion/react";
import type { CSSProperties, MouseEvent } from "react";

import {
  IslandWatchlistFaces,
  IslandWatchlistRow,
  type IslandWatchlistFace,
  type IslandWatchlistRowData,
} from "./IslandWatchlistRow";

export type IslandWatchlist = {
  /** Changes when the batch changes so the pill re-enters instead of silently swapping. */
  key: string;
  count: number;
  faces: IslandWatchlistFace[];
  rows: IslandWatchlistRowData[];
  /** Fresh batch: beats the music pill for a few seconds. */
  takeover: boolean;
};

export const ISLAND_WATCHLIST_MAX_FACES = 3;
export const ISLAND_WATCHLIST_MAX_ROWS = 6;
const VISIBLE_ROWS = 3;

export const ISLAND_WATCHLIST_EXPANDED_DIMENSIONS = {
  width: 350,
  height: 248,
  borderRadius: 24,
} as const;

export function islandWatchlistCollapsedWidth(count: number): number {
  return count >= 10 ? 252 : 240;
}

export function islandWatchlistCountLabel(count: number): string {
  return count === 1 ? "1 new upload" : `${count} new uploads`;
}

export function IslandWatchlistCompactContent({ watchlist }: { watchlist: IslandWatchlist }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.2, delay: 0.1 } }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
      className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2.5 px-3.5"
      role="status"
    >
      <IslandWatchlistFaces faces={watchlist.faces} />
      <span className="truncate text-[12px] font-medium text-stone-100">
        {islandWatchlistCountLabel(watchlist.count)}
      </span>
    </motion.div>
  );
}

export function IslandWatchlistExpandedContent({
  watchlist,
  accentColor,
  onQueue,
  onOpen,
  onMarkAllSeen,
  onShowMore,
}: {
  watchlist: IslandWatchlist;
  accentColor: string;
  onQueue: (videoId: string) => void;
  onOpen: (videoId: string) => void;
  onMarkAllSeen: () => void;
  onShowMore: () => void;
}) {
  const more = watchlist.count - Math.min(VISIBLE_ROWS, watchlist.rows.length);
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.2, delay: 0.1 } }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      className="pointer-events-auto absolute inset-0 flex min-h-0 flex-col p-3.5"
      style={{ "--accent": accentColor } as CSSProperties}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="flex shrink-0 items-center gap-2.5">
        <IslandWatchlistFaces faces={watchlist.faces} />
        <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-stone-100">
          {islandWatchlistCountLabel(watchlist.count)}
        </p>
        <button
          type="button"
          onClick={stop(onMarkAllSeen)}
          className="shrink-0 text-[11px] font-semibold text-stone-400 transition-colors duration-150 hover:text-[color:var(--accent)]"
        >
          Mark all seen
        </button>
      </header>
      <ul className="mt-2.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto scrollbar-none">
        {watchlist.rows.slice(0, VISIBLE_ROWS).map((row) => (
          <IslandWatchlistRow key={row.videoId} row={row} onQueue={onQueue} onOpen={onOpen} />
        ))}
      </ul>
      {more > 0 ? (
        <button
          type="button"
          onClick={stop(onShowMore)}
          className="mt-1.5 shrink-0 self-start text-[11px] font-medium text-stone-500 transition-colors duration-150 hover:text-stone-200"
        >
          +{more} more in RuForge
        </button>
      ) : null}
    </motion.div>
  );
}
