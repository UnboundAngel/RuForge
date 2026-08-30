import type { MediaFile } from "./types";
import type { LoopMode } from "./playbackLoopStorage";
import { parseLoopMode } from "./playbackLoopStorage";

export type PlayInMiniPayload = {
  file: MediaFile;
  startTime: number;
  paused?: boolean;
  playbackSpeed?: number;
  volume?: number;
  muted?: boolean;
  navMode?: string;
};

export type SendToMainPayload = {
  file: MediaFile;
  currentTime: number;
  paused: boolean;
  playbackSpeed?: number;
  volume?: number;
  muted?: boolean;
};

export type PlayInMusicMiniPayload = {
  file: MediaFile;
  startTime: number;
  paused?: boolean;
  playbackSpeed?: number;
  volume?: number;
  muted?: boolean;
  queueSnapshot?: MediaFile[];
  queueIndex?: number;
  loopMode?: LoopMode;
  isLooping?: boolean;
  manualQueue?: string[];
  playingFromManualQueue?: boolean;
  manualQueueContextIndex?: number | null;
  listenEventId?: string | null;
  libraryAudio?: MediaFile[];
  musicEndlessExtended?: boolean;
  musicEndlessFromIndex?: number | null;
  musicLikedKeys?: string[];
  musicShuffleOn?: boolean;
  musicShuffleBasePlaylist?: MediaFile[];
};

export type SendToMusicMainPayload = {
  file: MediaFile;
  currentTime: number;
  paused: boolean;
  playbackSpeed?: number;
  volume?: number;
  muted?: boolean;
  manualQueue?: string[];
  playingFromManualQueue?: boolean;
  manualQueueContextIndex?: number | null;
  loopMode?: LoopMode;
  isLooping?: boolean;
  listenEventId?: string | null;
};

export function loopModeFromHandoff(payload: {
  loopMode?: LoopMode;
  isLooping?: boolean;
}): LoopMode {
  if (payload.loopMode) return payload.loopMode;
  if (typeof payload.isLooping === "boolean") {
    return parseLoopMode(payload.isLooping ? "true" : "false");
  }
  return "off";
}
