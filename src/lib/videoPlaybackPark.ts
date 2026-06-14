import { isAudioOnlyPath } from "@/mediaKind";
import {
  getMainPlaybackBridge,
  getMainPlaybackBridgeOwner,
  publishMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";
import {
  getPlaybackMediaElement,
  getPlaybackMediaElementOwner,
  teardownPlaybackMediaElement,
} from "@/lib/playbackMediaElement";
import { readFurthestPlaybackSec, writePlaybackPos } from "@/playbackStorage";
import type { MediaFile } from "@/types";

export function snapshotVideoPlaybackSec(videoFile: MediaFile): number {
  const owner = getMainPlaybackBridgeOwner();
  const bridge = getMainPlaybackBridge();
  if (owner === "player-video" && bridge && Number.isFinite(bridge.currentTime)) {
    return Math.max(0, bridge.currentTime);
  }
  const el = getPlaybackMediaElement();
  if (el && getPlaybackMediaElementOwner() === "player-video" && Number.isFinite(el.currentTime)) {
    return Math.max(0, el.currentTime);
  }
  return readFurthestPlaybackSec(videoFile.path);
}

export function parkAndStopVideoPlayback(videoFile: MediaFile): number {
  const owner = getMainPlaybackBridgeOwner();
  const bridge = getMainPlaybackBridge();
  const duration =
    owner === "player-video" && bridge && bridge.duration > 0 ? bridge.duration : undefined;
  const parkedAt = snapshotVideoPlaybackSec(videoFile);
  writePlaybackPos(videoFile.path, parkedAt, duration);

  teardownPlaybackMediaElement("player-video");
  if (getMainPlaybackBridgeOwner() === "player-video") {
    publishMainPlaybackBridge("player-video", null);
  }

  return parkedAt;
}

export function isVideoParkHandoff(prev: MediaFile | null, next: MediaFile | null): prev is MediaFile {
  return !!prev && !!next && !isAudioOnlyPath(prev.path) && isAudioOnlyPath(next.path);
}
