/** Debounced auto-save for Music Explore now-playing events (avoids rate-limit bursts). */

const AUTO_SAVE_DEBOUNCE_MS = 4_500;
const pendingByVideoId = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; cancelled: boolean }
>();

export type MusicExploreAutoSavePayload = {
  videoId: string;
  title?: string | null;
};

/**
 * Schedules `onSave` only if the same `videoId` is still playing after debounce.
 * Returns a cancel function for cleanup on unmount/navigation.
 */
export function scheduleMusicExploreAutoSave(
  payload: MusicExploreAutoSavePayload,
  onSave: (p: MusicExploreAutoSavePayload) => void,
): () => void {
  const videoId = payload.videoId.trim();
  if (!videoId) return () => {};

  const prev = pendingByVideoId.get(videoId);
  if (prev) {
    prev.cancelled = true;
    clearTimeout(prev.timer);
  }

  const entry = { timer: undefined as unknown as ReturnType<typeof setTimeout>, cancelled: false };
  entry.timer = setTimeout(() => {
    pendingByVideoId.delete(videoId);
    if (entry.cancelled) return;
    onSave(payload);
  }, AUTO_SAVE_DEBOUNCE_MS);
  pendingByVideoId.set(videoId, entry);

  return () => {
    entry.cancelled = true;
    clearTimeout(entry.timer);
    pendingByVideoId.delete(videoId);
  };
}

export function cancelAllMusicExploreAutoSave(): void {
  for (const [, entry] of pendingByVideoId) {
    entry.cancelled = true;
    clearTimeout(entry.timer);
  }
  pendingByVideoId.clear();
}
