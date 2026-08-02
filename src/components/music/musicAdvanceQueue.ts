import type { MediaFile } from "@/types";
import type { LoopMode } from "@/playbackLoopStorage";
import { musicUserLoopEndIndex } from "@/playbackLoopStorage";

export type MusicAdvanceState = {
  manualQueue: string[];
  effectivePlaylist: MediaFile[];
  playlistIndex: number;
  playingFromManualQueue: boolean;
  manualQueueContextIndex: number | null;
};

export type MusicAdvanceLoopOpts = {
  loopMode?: LoopMode;
  /** Exclusive end of user-chosen span when looping all. */
  loopEndIndex?: number;
};

export type MusicAdvanceNextResult = {
  file: MediaFile;
  manualQueueAfter: string[];
  playingFromManualQueue: boolean;
  manualQueueContextIndex: number | null;
};

function userSpanEnd(state: MusicAdvanceState, opts?: MusicAdvanceLoopOpts): number {
  if (opts?.loopMode === "all") {
    return opts.loopEndIndex ?? state.effectivePlaylist.length;
  }
  return state.effectivePlaylist.length;
}

export function resolveMusicNextTrack(
  state: MusicAdvanceState,
  resolvePath: (path: string) => MediaFile | null,
  opts?: MusicAdvanceLoopOpts,
): MusicAdvanceNextResult | null {
  if (state.manualQueue.length > 0) {
    const [head, ...rest] = state.manualQueue;
    const file = resolvePath(head);
    if (!file) {
      return resolveMusicNextTrack({ ...state, manualQueue: rest }, resolvePath, opts);
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

  const end = userSpanEnd(state, opts);
  if (end <= 0) return null;

  if (state.playlistIndex >= 0 && state.playlistIndex + 1 < end) {
    return {
      file: state.effectivePlaylist[state.playlistIndex + 1]!,
      manualQueueAfter: [],
      playingFromManualQueue: false,
      manualQueueContextIndex: null,
    };
  }

  if (opts?.loopMode === "all") {
    return {
      file: state.effectivePlaylist[0]!,
      manualQueueAfter: [],
      playingFromManualQueue: false,
      manualQueueContextIndex: null,
    };
  }

  return null;
}

export function resolveMusicPrevTrack(
  state: MusicAdvanceState,
  opts?: MusicAdvanceLoopOpts,
): MediaFile | null {
  if (state.playingFromManualQueue) {
    const ctx = state.manualQueueContextIndex;
    if (ctx != null && ctx > 0) {
      return state.effectivePlaylist[ctx - 1] ?? null;
    }
    return null;
  }

  const end = userSpanEnd(state, opts);
  if (opts?.loopMode === "all") {
    if (end <= 0) return null;
    if (state.playlistIndex <= 0 || state.playlistIndex >= end) {
      return state.effectivePlaylist[end - 1] ?? null;
    }
    return state.effectivePlaylist[state.playlistIndex - 1] ?? null;
  }

  if (state.playlistIndex > 0) {
    return state.effectivePlaylist[state.playlistIndex - 1] ?? null;
  }
  return null;
}

export function hasMusicNextTrack(
  state: MusicAdvanceState,
  opts?: MusicAdvanceLoopOpts,
): boolean {
  if (state.manualQueue.length > 0) return true;
  if (opts?.loopMode === "all") {
    return userSpanEnd(state, opts) > 0;
  }
  return (
    state.playlistIndex >= 0 &&
    state.playlistIndex < state.effectivePlaylist.length - 1
  );
}

export function hasMusicPrevTrack(
  state: MusicAdvanceState,
  currentTime: number,
  opts?: MusicAdvanceLoopOpts,
): boolean {
  if (currentTime > 3) return true;
  if (state.playingFromManualQueue) {
    const ctx = state.manualQueueContextIndex;
    return ctx != null && ctx > 0;
  }
  if (opts?.loopMode === "all") {
    return userSpanEnd(state, opts) > 0;
  }
  return state.playlistIndex > 0;
}

export function musicAdvanceLoopOpts(
  loopMode: LoopMode,
  playlistLength: number,
  endlessFromIndex: number | null,
): MusicAdvanceLoopOpts {
  return {
    loopMode,
    loopEndIndex: musicUserLoopEndIndex(playlistLength, endlessFromIndex),
  };
}
