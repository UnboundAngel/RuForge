import type { RowHandlers } from "./PlaylistVideoRow";

export const DEMO_NOTICE = "Demo playlist: nothing was changed";

/** The onboarding demo only lets rows be dragged; every other action says so instead of running. */
export function demoRowHandlers(onGrip: RowHandlers["onGrip"], blocked: () => void): RowHandlers {
  return {
    onPlay: blocked,
    onPlayNext: blocked,
    onAddToQueue: blocked,
    onSetStart: blocked,
    onToggleWatched: blocked,
    onRemove: blocked,
    onGrip,
  };
}
