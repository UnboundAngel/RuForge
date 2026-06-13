import { isAudioOnlyPath } from "@/mediaKind";
import type { ActivityOwner } from "@/lib/activityTypes";
import type { ActiveTab } from "@/store/types";
import type { MediaFile } from "@/types";

export type MainPlaybackBridgeOwner = "host-audio" | "player-video";

export function shouldHostOwnBridge(
  playingFile: MediaFile | null,
  activityOwner: ActivityOwner | null,
): boolean {
  if (!playingFile || activityOwner) return false;
  return isAudioOnlyPath(playingFile.path);
}

export function shouldPlayerOwnBridge(
  playingFile: MediaFile | null,
  activeTab: ActiveTab,
): boolean {
  if (!playingFile) return false;
  if (isAudioOnlyPath(playingFile.path)) return false;
  return activeTab === "player";
}
