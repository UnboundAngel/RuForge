import { useCallback, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { SendToMusicMainPayload } from "@/playerHandoff";
import { writePlaybackPos } from "@/playbackStorage";
import { cn } from "@/lib/utils";
import { MusicMiniTitleBar } from "./MusicMiniTitleBar";
import { MusicMiniDisc } from "./MusicMiniDisc";
import { MusicMiniScalesMixer } from "./MusicMiniScalesMixer";
import { MusicMiniTrackInfo } from "./MusicMiniTrackInfo";
import { MusicMiniProgressBar } from "./MusicMiniProgressBar";
import { MusicMiniTransport } from "./MusicMiniTransport";
import { useMusicMiniWindowChrome } from "./useMusicMiniWindowChrome";
import { useMusicMiniPlayback } from "./useMusicMiniPlayback";

export default function MusicMiniPlayer() {
  const chrome = useMusicMiniWindowChrome();
  const playback = useMusicMiniPlayback();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleBack = useCallback(async () => {
    if (!playback.playingFile) {
      await getCurrentWindow().close();
      return;
    }
    playback.persistPosition();
    const payload: SendToMusicMainPayload = {
      file: playback.playingFile,
      currentTime: playback.currentTime,
      paused: playback.paused,
      playbackSpeed: 1,
      volume: playback.volume,
      muted: playback.muted,
      manualQueue: playback.manualQueue,
      playingFromManualQueue: playback.playingFromManualQueue,
      manualQueueContextIndex: playback.manualQueueContextIndex,
      isLooping: playback.isLooping,
    };
    if (!playback.paused) {
      writePlaybackPos(playback.playingFile.path, playback.currentTime, playback.duration);
    }
    await emit("send-to-music-main", payload);
    const main = await WebviewWindow.getByLabel("main");
    await main?.setFocus().catch(() => {});
    await getCurrentWindow().close();
  }, [playback]);

  const displayLayers =
    playback.layers.length > 0
      ? playback.layers
      : playback.playingFile
        ? [{ id: 0, file: playback.playingFile, coverSrc: null, dir: null }]
        : [];

  return (
    <div
      className="w-full h-full overflow-hidden select-none relative [clip-path:inset(0_round_1.5rem)]"
      style={{ background: "var(--music-surface)" }}
      data-music-mode="true"
    >
      <MusicMiniTitleBar
        isPinned={chrome.isPinned}
        onTogglePin={chrome.togglePin}
        onBack={() => void handleBack()}
        startDrag={chrome.startDrag}
        isExpanded={isExpanded}
      />

      <audio ref={playback.audioRef} preload="metadata" />

      <div
        className="relative w-full h-full flex flex-col overflow-hidden border border-white/5"
        style={{
          borderRadius: 32,
          background: "var(--music-surface)",
        }}
      >
        <div
          className={cn(
            "absolute z-30 group/disc cursor-pointer transition-all duration-[700ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
            isExpanded
              ? "left-0 top-0 translate-x-0 translate-y-0 w-[400px] h-[515px] rounded-[32px]"
              : "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] rounded-[190px] group-hover/disc:translate-y-[calc(-50%+24px)]",
          )}
          onClick={() => setIsExpanded((v) => !v)}
          role="button"
          aria-label={isExpanded ? "Collapse cover" : "Expand cover"}
          aria-pressed={isExpanded}
        >
          <div className="w-full h-full">
            <MusicMiniDisc
              layers={displayLayers}
              direction={playback.direction}
              isExpanded={isExpanded}
            />
          </div>
        </div>

        <div className="flex-1" />

        <div
          className={cn(
            "relative z-20 flex flex-col items-center w-full pb-8 transition-all duration-[500ms]",
            isExpanded
              ? "opacity-0 blur-md scale-95 pointer-events-none"
              : "opacity-100 blur-0 scale-100",
          )}
        >
          <div className="h-6 flex items-center justify-center mb-2">
            <MusicMiniScalesMixer isPlaying={!playback.paused} />
          </div>
          <MusicMiniTrackInfo layers={displayLayers} />
          <MusicMiniProgressBar
            currentTime={playback.currentTime}
            duration={playback.duration}
            onSeek={playback.seekPct}
          />
          <MusicMiniTransport
            isPlaying={!playback.paused}
            shuffled={playback.shuffled}
            isLooping={playback.isLooping}
            hasPrev={playback.hasPrev}
            hasNext={playback.hasNext}
            onToggle={playback.togglePlay}
            onNext={playback.skipNext}
            onPrev={playback.skipPrev}
            onShuffle={playback.toggleShuffle}
            onLoop={playback.toggleLoop}
          />
        </div>
      </div>
    </div>
  );
}
