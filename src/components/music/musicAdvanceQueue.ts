import type { MediaFile } from "@/types";

export type MusicAdvanceState = {
  manualQueue: string[];
  effectivePlaylist: MediaFile[];
  playlistIndex: number;
  playingFromManualQueue: boolean;
  manualQueueContextIndex: number | null;
};

export type MusicAdvanceNextResult = {
  file: MediaFile;
  manualQueueAfter: string[];
  playingFromManualQueue: boolean;
  manualQueueContextIndex: number | null;
};

/**
 * Resolve next track: drain manual queue first, then advance effectivePlaylist.
 * `resolvePath` turns a stored path string back into a MediaFile (skips nulls).
 */
export function resolveMusicNextTrack(
  state: MusicAdvanceState,
  resolvePath: (path: string) => MediaFile | null,
): MusicAdvanceNextResult | null {
  if (state.manualQueue.length > 0) {
    const [head, ...rest] = state.manualQueue;
    const file = resolvePath(head);
    if (!file) {
      // Skip unresolvable paths (file deleted etc.) and recurse.
      return resolveMusicNextTrack({ ...state, manualQueue: rest }, resolvePath);
    }
    const contextIndex =
      state.playlistIndex >= 0 ? state.playlistIndex : (state.manualQueueContextIndex ?? null);
    return {
      file,
      manualQueueAfter: rest,
      playingFromManualQueue: true,
      manualQueueContextIndex: contextIndex,
    };
  }

  if (
    state.playlistIndex >= 0 &&
    state.playlistIndex < state.effectivePlaylist.length - 1
  ) {
    return {
      file: state.effectivePlaylist[state.playlistIndex + 1]!,
      manualQueueAfter: [],
      playingFromManualQueue: false,
      manualQueueContextIndex: null,
    };
  }

  return null;
}

/**
 * Resolve prev track.
 * While playing a manual-queue item: go to effectivePlaylist[contextIndex - 1]
 * (locked rule: never try to index the manual path on effectivePlaylist).
 * Caller handles in-track restart when currentTime > 3.
 */
export function resolveMusicPrevTrack(state: MusicAdvanceState): MediaFile | null {
  if (state.playingFromManualQueue) {
    const ctx = state.manualQueueContextIndex;
    if (ctx != null && ctx > 0) {
      return state.effectivePlaylist[ctx - 1] ?? null;
    }
    return null;
  }
  if (state.playlistIndex > 0) {
    return state.effectivePlaylist[state.playlistIndex - 1] ?? null;
  }
  return null;
}

export function hasMusicNextTrack(state: MusicAdvanceState): boolean {
  if (state.manualQueue.length > 0) return true;
  return (
    state.playlistIndex >= 0 &&
    state.playlistIndex < state.effectivePlaylist.length - 1
  );
}

export function hasMusicPrevTrack(state: MusicAdvanceState, currentTime: number): boolean {
  if (currentTime > 3) return true;
  if (state.playingFromManualQueue) {
    const ctx = state.manualQueueContextIndex;
    return ctx != null && ctx > 0;
  }
  return state.playlistIndex > 0;
}
