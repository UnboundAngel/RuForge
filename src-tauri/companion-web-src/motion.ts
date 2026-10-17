export {
  OVERLAY_EASE,
  overlayFadeTransition,
  overlayPanelTransition,
  pageFadeTransition,
  pageTransition,
} from "../../src/lib/overlayMotion";

// Same press spring as the desktop player (like button) so taps feel alike.
export const PRESS_SPRING = { type: "spring", stiffness: 300, damping: 15 } as const;

// Full-screen layers must never overshoot: any bounce past rest uncovers the page edge behind them.
export const PUSH_TRANSITION = { type: "tween", duration: 0.26, ease: [0.32, 0.72, 0, 1] } as const;
export const SHEET_DURATION = 0.3;
export const SHEET_TRANSITION = { type: "spring", bounce: 0, duration: SHEET_DURATION } as const;

export const MORPH_TRANSITION = { type: "spring", bounce: 0.1, duration: 0.28 } as const;

export const SHEET_CLOSE_PX = 110;
export const SHEET_CLOSE_FRACTION = 0.3;
export const SHEET_CLOSE_VELOCITY = 600;

/** Desktop header filter morph (`MusicHomeView`). */
export const FILTER_MORPH_MS = 260;
export const FILTER_MORPH_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

export const enterUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
} as const;

/** Rows past the first screen enter together; a longer stagger reads as lag on big lists. */
export function staggerDelay(index: number): number {
  return Math.min(index, 10) * 0.025;
}
