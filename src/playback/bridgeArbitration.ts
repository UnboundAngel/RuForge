import { isAudioOnlyPath } from "@/mediaKind";
import type { ActivityOwner } from "@/lib/activityTypes";
import type { MediaFile } from "@/types";

export type MainPlaybackBridgeOwner = "host-audio" | "player-video";

export function shouldHostOwnBridge(
  playingFile: MediaFile | null,
  activityOwner: ActivityOwner | null,
): boolean {
  if (!playingFile || activityOwner) return false;
  return isAudioOnlyPath(playingFile.path);
}

/** Video bridge stays live while a video file is playing, including off the player tab. */
export function shouldPlayerOwnBridge(playingFile: MediaFile | null): boolean {
  if (!playingFile) return false;
  return !isAudioOnlyPath(playingFile.path);
}
