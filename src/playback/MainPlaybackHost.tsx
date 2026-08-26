import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ensureAudioOutputSinkBinding } from "@/audioOutputDevices";
import { useMusicPlayback } from "@/components/music/useMusicPlayback";
import { MainPlaybackProvider } from "@/context/MainPlaybackContext";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { registerPlaybackMediaElement } from "@/lib/playbackMediaElement";
import { readMusicPlaybackSession } from "@/lib/musicPlaybackSessionStorage";
import { isAudioOnlyPath } from "@/mediaKind";
import { useRuforgeStore } from "@/store/ruforgeStore";

import { shouldHostOwnBridge } from "./bridgeArbitration";
import { MainAudioPlaybackContext } from "./mainAudioPlaybackContext";

ensureAudioOutputSinkBinding();

export function MainPlaybackHost({ children }: { children: React.ReactNode }) {
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const [pairReady, setPairReady] = useState(0);
  const playback = useMusicPlayback(audioARef, audioBRef, pairReady);
  const restoredMusicSessionRef = useRef(false);

  const playingFile = useRuforgeStore((s) => s.playingFile);
  const activityOwner = useRuforgeStore((s) => s.activityOwner);
  const entries = useRuforgeStore((s) => s.entries);

  const bridgeActive = shouldHostOwnBridge(playingFile, activityOwner);

  useLayoutEffect(() => {
    if (!audioARef.current || !audioBRef.current) return;
    setPairReady((n) => (n > 0 ? n : 1));
  }, []);

  useEffect(() => {
    if (restoredMusicSessionRef.current) return;
    if (playingFile || activityOwner) return;

    const session = readMusicPlaybackSession();
    if (!session?.path) return;

    const file = flattenGalleryScanToMediaFiles(entries)
      .filter((f) => isAudioOnlyPath(f.path))
      .find((f) => f.path === session.path);
    if (!file) return;

    restoredMusicSessionRef.current = true;
    useRuforgeStore.setState({
      musicPlayerResume: {
        currentTime: session.currentTime,
        paused: true,
        playbackSpeed: session.playbackSpeed,
      },
    });
    useRuforgeStore.getState().setPlayingFile(file);
  }, [entries, playingFile, activityOwner]);

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

  useLayoutEffect(() => {
    if (!bridgeActive) {
      registerPlaybackMediaElement("host-audio", null);
      return;
    }
    registerPlaybackMediaElement("host-audio", playback.audioEl);
    return () => registerPlaybackMediaElement("host-audio", null);
  }, [bridgeActive, playback.audioEl, playingFile?.path, pairReady]);

  return (
    <MainAudioPlaybackContext.Provider value={playback}>
      <audio
        ref={audioARef}
        crossOrigin="anonymous"
        className="hidden"
        preload="auto"
      />
      <audio
        ref={audioBRef}
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
