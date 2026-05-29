import {
  isVideoWatched,
  readFurthestPlaybackSec,
  readStoredPlaybackDuration,
} from "./playbackStorage";

export type ExportPlaybackEntry = {
  sourcePath: string;
  playbackPositionSec: number;
  durationSec: number;
  watched: boolean;
};

export function gatherExportPlaybackEntries(
  mediaPaths: string[],
): ExportPlaybackEntry[] {
  return mediaPaths.map((sourcePath) => {
    const durationSec = readStoredPlaybackDuration(sourcePath);
    const playbackPositionSec = readFurthestPlaybackSec(sourcePath);
    return {
      sourcePath,
      playbackPositionSec,
      durationSec,
      watched: isVideoWatched(sourcePath, durationSec),
    };
  });
}
