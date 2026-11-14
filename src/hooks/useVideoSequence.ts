import { useEffect } from "react";
import { getVideoQueueState, nextVideo, previousVideo } from "../lib/videoQueue";
import { startPlaylistSessionTracking } from "../lib/playlistSession";
import type { MediaFile } from "../types";
import { isHotkeyRecording, isTypingTarget, matchHotkeyEvent } from "./useHotkeys";

const SEQUENCE_ACTIONS = ["player.nextVideo", "player.prevVideo"] as const;

/**
 * Shift+N / Shift+P: step through the playlist (or Next up) and the hand-queued videos.
 * `order` is the list playback follows right now, shuffled order included.
 */
export function useVideoSequenceHotkeys(
  file: MediaFile,
  order: readonly MediaFile[],
  enabled: boolean,
  play: (file: MediaFile) => void,
): void {
  useEffect(() => {
    startPlaylistSessionTracking();
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget() || isHotkeyRecording()) return;
      const action = matchHotkeyEvent(e, SEQUENCE_ACTIONS);
      if (!action) return;
      const state = getVideoQueueState();
      const target =
        action === "player.nextVideo" ? nextVideo(file, order, state) : previousVideo(file, order, state);
      if (!target) return;
      e.preventDefault();
      play(target);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, order, enabled, play]);
}
