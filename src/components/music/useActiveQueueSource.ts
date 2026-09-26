import { useRuforgeStore } from "@/store/ruforgeStore";
import { isPlayingFromQueueSource, type MusicQueueSource } from "./musicQueueSource";

/** The queue source the current song actually belongs to, or null once autoplay has moved past it. */
export function useActiveQueueSource(): MusicQueueSource | null {
  return useRuforgeStore((s) =>
    isPlayingFromQueueSource({
      playingFile: s.playingFile,
      folderAudioPlaylist: s.folderAudioPlaylist,
      endlessFromIndex: s.musicEndlessFromIndex,
      manualQueueContextIndex: s.playingFromManualQueue ? s.manualQueueContextIndex : null,
    })
      ? s.musicQueueSource
      : null,
  );
}
