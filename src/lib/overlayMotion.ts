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

export const NAV_SHELL_EASE = [0.65, 0, 0.35, 1] as const;

/**
 * Mode switches fade the whole window through its background. An ease-out curve empties it
 * within ~50ms and then holds black until the next shell enters, which reads as a flicker.
 */
export const navShellFadeTransition = {
  duration: pageFadeTransition.duration,
  ease: NAV_SHELL_EASE,
} as const;

/** Bell popovers grow out of their anchor; the overlay webview waits `NOTIFY_PANEL_EXIT_MS` before hiding. */
export const notifyPanelMotion = {
  initial: { opacity: 0, y: -8, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: OVERLAY_EASE } },
  exit: { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.14, ease: OVERLAY_EASE } },
} as const;

export const REDUCED_PANEL_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
} as const;

export const NOTIFY_PANEL_EXIT_MS = 160;

export function motionDuration(reduce: boolean | null, ms: { duration: number; ease: typeof OVERLAY_EASE }) {
  return reduce ? { duration: 0 } : ms;
}
