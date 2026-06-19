import { MAIN_WINDOW_OUTER_RADIUS_PX } from "@/lib/mainWindowFrame";

/** Logical pixel bounds for the embedded explorer cutout (main-window coordinates). */
export type ExplorerBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function readExplorerHostBounds(host: HTMLElement): ExplorerBounds | null {
  const rect = host.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width,
    height,
  };
}

export function explorerBoundsEqual(
  a: ExplorerBounds | null,
  b: ExplorerBounds | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}

/** Child explorer webviews ignore DOM clip-path; shrink the right edge when the shell is rounded. */
export function insetExplorerBoundsForRoundedWindow(
  bounds: ExplorerBounds,
  host: HTMLElement,
  rounded: boolean,
): ExplorerBounds {
  if (!rounded) return bounds;

  const rect = host.getBoundingClientRect();
  const inset = MAIN_WINDOW_OUTER_RADIUS_PX;
  let { x, y, width, height } = bounds;

  if (rect.right >= window.innerWidth - 0.5) {
    width = Math.max(0, width - inset);
  }

  return { x, y, width, height };
}

/** Matches explorer host `transition-[left] duration-500` in App.tsx. */
export const EXPLORER_SIDEBAR_TRANSITION_MS = 520;

/** At most one sync per animation frame; no trailing debounce delay. */
export function createExplorerBoundsRafScheduler(run: () => void) {
  let rafId: number | undefined;

  const schedule = () => {
    if (rafId !== undefined) return;
    rafId = requestAnimationFrame(() => {
      rafId = undefined;
      run();
    });
  };

  const cancel = () => {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
      rafId = undefined;
    }
  };

  return { schedule, cancel };
}

/**
 * While the sidebar animates width/left, ResizeObserver can miss frames on some
 * hosts. Schedule one rAF sync per frame for the transition window only.
 */
export function runExplorerLayoutTransitionFollowUp(
  schedule: () => void,
  durationMs = EXPLORER_SIDEBAR_TRANSITION_MS,
) {
  const endAt = performance.now() + durationMs;
  const tick = () => {
    schedule();
    if (performance.now() < endAt) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}
