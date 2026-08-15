export const OVERLAY_EASE = [0.16, 1, 0.3, 1] as const;

export const overlayFadeTransition = {
  duration: 0.2,
  ease: OVERLAY_EASE,
} as const;

export const overlayPanelTransition = {
  duration: 0.22,
  ease: OVERLAY_EASE,
} as const;

export const pageTransition = {
  duration: 0.22,
  ease: OVERLAY_EASE,
} as const;

export const pageFadeTransition = {
  duration: 0.18,
  ease: OVERLAY_EASE,
} as const;

export function motionDuration(reduce: boolean | null, ms: { duration: number; ease: typeof OVERLAY_EASE }) {
  return reduce ? { duration: 0 } : ms;
}
