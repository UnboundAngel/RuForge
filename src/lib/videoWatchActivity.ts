import type { MediaFile } from "@/types";
import { isAudioOnlyPath } from "@/mediaKind";
import {
  beginWatchSession,
  endWatchSession,
  noteWatchSponsorSkip,
  pauseWatchTick,
  tickWatchSession,
  transferWatchSession,
  type WatchEndReason,
  type WatchSurface,
} from "./activityLog";

let currentPath: string | null = null;
let currentSurface: WatchSurface = "main";

/** Call when the video playing file changes (not audio). */
export function syncVideoWatchSession(
  file: MediaFile | null,
  surface: WatchSurface,
  endReason: WatchEndReason = "switched",
): void {
  const nextPath = file && !isAudioOnlyPath(file.path) ? file.path : null;
  if (currentPath && currentPath !== nextPath) {
    void endWatchSession(endReason);
    currentPath = null;
  }
  if (nextPath && nextPath !== currentPath) {
    currentPath = nextPath;
    currentSurface = surface;
    void beginWatchSession({
      itemId: file?.sourceId ?? undefined,
      title: file?.name,
      channelName: file?.youtube?.channel,
      mediaDurationSec: file && file.duration > 0 ? file.duration : undefined,
      surface,
    });
  } else if (nextPath && surface !== currentSurface) {
    currentSurface = surface;
    void transferWatchSession(surface);
  }
  if (!nextPath) {
    currentPath = null;
  }
}

export function onVideoWatchTick(speed: number, playing: boolean): void {
  if (!currentPath) return;
  if (!playing) {
    pauseWatchTick();
    return;
  }
  tickWatchSession(speed);
}

export function onVideoWatchSponsorSkip(seconds: number): void {
  noteWatchSponsorSkip(seconds);
}

export function closeVideoWatchSession(reason: WatchEndReason = "closed"): void {
  if (!currentPath) return;
  currentPath = null;
  void endWatchSession(reason);
}
