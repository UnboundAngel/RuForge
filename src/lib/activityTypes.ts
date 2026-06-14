import type { MediaFile } from "@/types";

export type ActivityOwner = "main" | "video-mini" | "music-mini";

export type ActivityMiniTeardownPayload = {
  surface: "video-mini" | "music-mini";
};

export type ActivityHandoffSyncPayload = {
  surface: "video-mini" | "music-mini";
  file: MediaFile;
  startTime: number;
  paused: boolean;
};

export type ActivityHandoffSnapshot = {
  file: MediaFile;
  startTime: number;
  paused: boolean;
};

export type ActivityRenderState = "idle" | "main-music" | "main-video" | "mini-owned";

export type CurrentActivity = {
  renderState: ActivityRenderState;
  hasSession: boolean;
  awayFromOwningSurface: boolean;
  file: MediaFile | null;
  paused: boolean;
  currentTime: number;
  duration: number;
  coverSrc: string | null;
  isStub: boolean;
  stubLabel: string | null;
  hasLivePlayback: boolean;
};
