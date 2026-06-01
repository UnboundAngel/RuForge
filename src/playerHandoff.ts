import type { MediaFile } from "./types";

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
  isLooping?: boolean;
  manualQueue?: string[];
  playingFromManualQueue?: boolean;
  manualQueueContextIndex?: number | null;
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
  isLooping?: boolean;
};
