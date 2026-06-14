import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { useMusicPlayback } from "@/components/music/useMusicPlayback";
import { MainPlaybackProvider } from "@/context/MainPlaybackContext";
import { registerPlaybackMediaElement } from "@/lib/playbackMediaElement";
import { useRuforgeStore } from "@/store/ruforgeStore";

import { shouldHostOwnBridge } from "./bridgeArbitration";
import { MainAudioPlaybackContext } from "./mainAudioPlaybackContext";

export function MainPlaybackHost({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const playback = useMusicPlayback(audioRef);

  const playingFile = useRuforgeStore((s) => s.playingFile);
  const activityOwner = useRuforgeStore((s) => s.activityOwner);

  const bridgeActive = shouldHostOwnBridge(playingFile, activityOwner);

  const bridgeValue = useMemo(
    () => ({
      paused: playback.paused,
      currentTime: playback.currentTime,
      duration: playback.duration,
      togglePlay: playback.togglePlay,
      seek: playback.seek,
      beginScrub: playback.beginScrub,
      releaseScrub: playback.releaseScrub,
      skipPrev: playback.skipPrev,
      skipNext: playback.skipNext,
      hasPrevInQueue: playback.hasPrevInQueue,
      hasNextInQueue: playback.hasNextInQueue,
    }),
    [
      playback.paused,
      playback.currentTime,
      playback.duration,
      playback.togglePlay,
      playback.seek,
      playback.beginScrub,
      playback.releaseScrub,
      playback.skipPrev,
      playback.skipNext,
      playback.hasPrevInQueue,
      playback.hasNextInQueue,
    ],
  );

  const audioPlaybackValue = useMemo(
    () => ({
      ...playback,
      audioEl,
    }),
    [playback, audioEl],
  );

  useLayoutEffect(() => {
    if (!bridgeActive) {
      registerPlaybackMediaElement("host-audio", null);
      return;
    }
    registerPlaybackMediaElement("host-audio", audioRef.current);
    return () => registerPlaybackMediaElement("host-audio", null);
  }, [bridgeActive, audioEl, playingFile?.path]);

  return (
    <MainAudioPlaybackContext.Provider value={audioPlaybackValue}>
      <audio
        ref={(node) => {
          audioRef.current = node;
          setAudioEl(node);
          if (bridgeActive && node) {
            registerPlaybackMediaElement("host-audio", node);
          }
        }}
        crossOrigin="anonymous"
        className="hidden"
        preload="auto"
      />
      <MainPlaybackProvider bridgeOwner="host-audio" active={bridgeActive} value={bridgeValue}>
        {children}
      </MainPlaybackProvider>
    </MainAudioPlaybackContext.Provider>
  );
}
