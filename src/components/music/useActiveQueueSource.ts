import { useOptionalMainAudioPlayback } from "@/playback/mainAudioPlaybackContext";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";
import { isPlayingFromQueueSource, type MusicQueueSource } from "./musicQueueSource";
import { buildSmartShuffleOrder } from "./musicSmartShuffle";

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

type PlayFile = (
  file: MediaFile,
  playlist: MediaFile[],
  source: MusicQueueSource,
  opts?: { shuffle?: boolean },
) => void;

/**
 * Play and shuffle buttons for a page that plays one source (playlist, album, artist), Spotify style:
 * Play pauses or resumes when the current song came from this source, otherwise starts it, shuffled
 * when the sticky shuffle toggle is on.
 */
export function useQueueSourcePlayback(
  source: MusicQueueSource | null,
  tracks: MediaFile[],
  onPlayFile: PlayFile,
) {
  const active = useActiveQueueSource();
  const playback = useOptionalMainAudioPlayback();
  const shuffleOn = useRuforgeStore((s) => s.musicShuffleOn);
  const toggleShuffle = useRuforgeStore((s) => s.toggleMusicShuffle);
  const likedKeys = useRuforgeStore((s) => s.musicLikedKeys);
  const isActive =
    source != null && active != null && active.kind === source.kind && active.label === source.label;

  const play = () => {
    if (isActive) {
      playback?.togglePlay();
      return;
    }
    if (!source || tracks.length === 0) return;
    if (!shuffleOn) {
      onPlayFile(tracks[0]!, tracks, source);
      return;
    }
    const shuffled = buildSmartShuffleOrder({ pool: tracks, likedKeys, seed: Date.now() & 0xffffffff });
    onPlayFile(shuffled[0]!, tracks, source, { shuffle: true });
  };

  return {
    playing: isActive && playback != null && !playback.paused,
    play,
    shuffleOn,
    toggleShuffle,
  };
}
