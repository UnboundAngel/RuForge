import { motion, useReducedMotion } from "motion/react";
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

/*
 * Expanded panel: 350 wide, height from row count. Max three rows keeps it under the 280px island cap.
 * Thumb 80x45 is 16:9; the row padding around it makes the row 57px.
 */
const EXPANDED_W = 350;
const EXPANDED_PAD_Y = 12;
const EXPANDED_HEADER_H = 24;
const EXPANDED_HEADER_GAP = 10;
const EXPANDED_ROW_H = 57;
const EXPANDED_ROW_GAP = 2;
const EXPANDED_FOOTER_GAP = 8;
const EXPANDED_FOOTER_H = 16;

export function islandWatchlistExpandedDims(rowCount: number) {
  const n = Math.max(1, rowCount);
  return {
    width: EXPANDED_W,
    height:
      EXPANDED_PAD_Y * 2 +
      EXPANDED_HEADER_H +
      EXPANDED_HEADER_GAP +
      n * EXPANDED_ROW_H +
      (n - 1) * EXPANDED_ROW_GAP +
      EXPANDED_FOOTER_GAP +
      EXPANDED_FOOTER_H,
    borderRadius: 24,
  };
}

/** Faces: pl-2 (8) plus each 24px face overlapping the previous by 8px. */
const PILL_FACES_LEAD = 8;
const PILL_FACE_STEP = 16;
/** px-3.5 on both sides, gap-2.5 between the faces and the label. */
const PILL_PAD_X = 14;
const PILL_GAP = 10;
const PILL_MIN_W = 120;
const PILL_MAX_W = 240;
const PILL_LABEL_MAX_CHARS = 18;

export function islandWatchlistCountLabel(count: number): string {
  return count === 1 ? "1 new upload" : `${count} new uploads`;
}

/**
 * "3 new" reads clearly beside the channel faces and keeps the pill short. A single upload shows
 * its channel name instead, since that is the more useful word for one video.
 */
export function islandWatchlistPillLabel(w: IslandWatchlist): string {
  if (w.count !== 1) return `${w.count} new`;
  const channel = w.rows[0]?.channel.trim() ?? "";
  if (!channel) return "1 new";
  return channel.length > PILL_LABEL_MAX_CHARS
    ? `${channel.slice(0, PILL_LABEL_MAX_CHARS - 1)}\u2026`
    : channel;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function pillTextWidth(text: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 6.4;
  measureCtx.font = `500 12px ${getComputedStyle(document.body).fontFamily || "Inter, sans-serif"}`;
  return measureCtx.measureText(text).width;
}

export function islandWatchlistCollapsedWidth(w: IslandWatchlist): number {
  const faces = w.faces.length === 0 ? 0 : PILL_FACES_LEAD + PILL_FACE_STEP * w.faces.length;
  const natural = PILL_PAD_X * 2 + faces + PILL_GAP + Math.ceil(pillTextWidth(islandWatchlistPillLabel(w)));
  return Math.min(PILL_MAX_W, Math.max(PILL_MIN_W, natural));
}

/** Reduced motion: no scale, no delay, instant opacity. */
function contentMotion(reduceMotion: boolean | null, restScale: number) {
  if (reduceMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0 } },
      exit: { opacity: 0, transition: { duration: 0 } },
    };
  }
  return {
    initial: { opacity: 0, scale: restScale },
    animate: { opacity: 1, scale: 1, transition: { duration: 0.2, delay: 0.1 } },
    exit: { opacity: 0, scale: restScale, transition: { duration: 0.15 } },
  };
}

export function IslandWatchlistCompactContent({ watchlist }: { watchlist: IslandWatchlist }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      {...contentMotion(reduceMotion, 0.8)}
      className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2.5 px-3.5"
      role="status"
    >
      <IslandWatchlistFaces faces={watchlist.faces} />
      <span className="whitespace-nowrap text-[12px] font-medium text-stone-100">
        {islandWatchlistPillLabel(watchlist)}
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
  const reduceMotion = useReducedMotion();
  const shown = watchlist.rows.slice(0, VISIBLE_ROWS);
  const more = watchlist.count - shown.length;
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <motion.div
      {...contentMotion(reduceMotion, 0.95)}
      className="pointer-events-auto absolute inset-0 flex min-h-0 flex-col px-3 py-3"
      style={{ "--accent": accentColor } as CSSProperties}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="flex h-6 shrink-0 items-center gap-2.5">
        <IslandWatchlistFaces faces={watchlist.faces} />
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-100">
          {islandWatchlistCountLabel(watchlist.count)}
        </p>
      </header>
      <ul className="mt-2.5 flex min-h-0 flex-col gap-0.5">
        {shown.map((row) => (
          <IslandWatchlistRow key={row.videoId} row={row} onQueue={onQueue} onOpen={onOpen} />
        ))}
      </ul>
      <footer className="mt-2 flex h-4 shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={stop(onMarkAllSeen)}
          className="text-[11px] font-medium text-stone-400 transition-colors duration-150 hover:text-[color:var(--accent)] motion-reduce:transition-none"
        >
          Mark all seen
        </button>
        {more > 0 ? (
          <button
            type="button"
            onClick={stop(onShowMore)}
            className="text-[11px] font-medium text-stone-400 transition-colors duration-150 hover:text-stone-100 motion-reduce:transition-none"
          >
            +{more} more in RuForge
          </button>
        ) : null}
      </footer>
    </motion.div>
  );
}
