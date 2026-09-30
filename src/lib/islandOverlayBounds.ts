import type { IslandState } from "@/components/island/DynamicIsland";

export type IslandOverlayBounds = { width: number; height: number };

/**
 * Width never changes: Rust resizes and re-centers in two steps and the webview repaints a frame
 * late, so a width change slides the centered pill sideways. Click-through covers the side margins.
 * Fits the widest surface (the 350px expanded panels and capped notices) plus 8px each side.
 */
const OVERLAY_WIDTH = 366;
/** Matches the overlay's `pt-[6px]` inset, the 32px compact pill and an 8px bottom margin. */
const PILL_HEIGHT = 46;
/** Expanded panels keep slack for the shadow and the audio output menu, which overflow the panel. */
const EXPANDED_HEIGHT = 220;
/** Rust clamps island bounds to 420x280; the 248px panel plus the 8px top inset fits. */
const WATCHLIST_EXPANDED_HEIGHT = 272;

export function islandOverlayBounds(state: IslandState): IslandOverlayBounds {
  switch (state) {
    case "watchlist-expanded":
      return { width: OVERLAY_WIDTH, height: WATCHLIST_EXPANDED_HEIGHT };
    case "expanded":
    case "download-expanded":
      return { width: OVERLAY_WIDTH, height: EXPANDED_HEIGHT };
    default:
      return { width: OVERLAY_WIDTH, height: PILL_HEIGHT };
  }
}

/**
 * The pill springs between sizes, so the window grows to cover both the old and new size first
 * and only shrinks to the new one once the spring has settled.
 */
export function islandOverlayTransitionBounds(
  applied: IslandOverlayBounds | null,
  target: IslandOverlayBounds,
): { now: IslandOverlayBounds; settle: IslandOverlayBounds | null } {
  if (!applied || (target.width >= applied.width && target.height >= applied.height)) {
    return { now: target, settle: null };
  }
  return {
    now: {
      width: Math.max(applied.width, target.width),
      height: Math.max(applied.height, target.height),
    },
    settle: target,
  };
}
