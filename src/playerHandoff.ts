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
