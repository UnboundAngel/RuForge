/** Auto-save for Music Explore: queue only after sustained listen time on one track. */

const AUTO_SAVE_LISTEN_THRESHOLD_MS = 15_000;

let activeEntry: {
  videoId: string;
  timer: ReturnType<typeof setTimeout>;
  cancelled: boolean;
} | null = null;

export type MusicExploreAutoSavePayload = {
  videoId: string;
  title?: string | null;
};

/**
 * Starts a listen timer for `videoId`. Fires `onSave` only if the same track is
 * still active after {@link AUTO_SAVE_LISTEN_THRESHOLD_MS}. Cancels any pending
 * timer for a previous track (skip away before threshold).
 */
export function scheduleMusicExploreAutoSave(
  payload: MusicExploreAutoSavePayload,
  onSave: (p: MusicExploreAutoSavePayload) => void,
): () => void {
  const videoId = payload.videoId.trim();
  if (!videoId) return () => {};

  if (activeEntry) {
    activeEntry.cancelled = true;
    clearTimeout(activeEntry.timer);
    activeEntry = null;
  }

  const entry = {
    videoId,
    timer: undefined as unknown as ReturnType<typeof setTimeout>,
    cancelled: false,
  };
  entry.timer = setTimeout(() => {
    if (activeEntry === entry) activeEntry = null;
    if (entry.cancelled) return;
    onSave(payload);
  }, AUTO_SAVE_LISTEN_THRESHOLD_MS);
  activeEntry = entry;

  return () => {
    if (activeEntry !== entry) return;
    entry.cancelled = true;
    clearTimeout(entry.timer);
    activeEntry = null;
  };
}

export function cancelAllMusicExploreAutoSave(): void {
  if (!activeEntry) return;
  activeEntry.cancelled = true;
  clearTimeout(activeEntry.timer);
  activeEntry = null;
}
