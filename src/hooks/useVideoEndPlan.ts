import { useCallback, useMemo, useRef } from "react";
import { getVideoQueueState, useVideoQueue, videoEndPlan } from "../lib/videoQueue";
import type { MediaFile } from "../types";
import { pickVideoEndScreenSuggestions } from "../videoEndScreenSuggestions";

/**
 * End screen cards for a video: hand-queued videos first, then the playlist or Next up order,
 * else library suggestions. `autoplay` is null when neither a queue nor a playlist is involved,
 * so the audio "Auto-advance local audio" setting decides.
 */
export function useVideoEndPlan(
  file: MediaFile,
  order: readonly MediaFile[],
  inVideoPlaylist: boolean,
  library: readonly MediaFile[],
) {
  const queued = useVideoQueue();
  const plan = useMemo(
    () => videoEndPlan(file, order, inVideoPlaylist, getVideoQueueState()),
    // `queued` only signals that the queue changed.
    [file, order, inVideoPlaylist, queued],
  );
  const cacheRef = useRef<{ path: string; plan: unknown; suggestions: MediaFile[] } | null>(null);
  const ensureEndSuggestions = useCallback((): MediaFile[] => {
    const cached = cacheRef.current;
    if (cached?.path === file.path && cached.plan === plan) return cached.suggestions;
    const suggestions = plan?.suggestions ?? pickVideoEndScreenSuggestions(file.path, [...library]);
    cacheRef.current = { path: file.path, plan, suggestions };
    return suggestions;
  }, [file, plan, library]);
  const resetEndSuggestions = useCallback(() => {
    cacheRef.current = null;
  }, []);
  return {
    hasPlan: plan != null,
    ensureEndSuggestions,
    resetEndSuggestions,
    playlistAutoplay: plan ? plan.autoplay : null,
    atPlaylistEnd: inVideoPlaylist && plan != null && !plan.autoplay,
  };
}
