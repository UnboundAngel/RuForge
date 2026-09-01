import { useEffect } from "react";
import { useRuforgeStore } from "../store/ruforgeStore";

export const PLAYER_PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function isTypingTarget(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

function stepPlaybackSpeed(current: number, delta: number): number {
  const speeds = PLAYER_PLAYBACK_SPEEDS;
  const idx = speeds.indexOf(current as (typeof speeds)[number]);
  const base = idx >= 0 ? idx : speeds.indexOf(1);
  const next = Math.min(speeds.length - 1, Math.max(0, base + delta));
  return speeds[next] ?? 1;
}

export type PlayerKeyboardShortcutHandlers = {
  enabled?: boolean;
  volume: number;
  playbackSpeed?: number;
  hasChapters?: boolean;
  togglePlay: () => void;
  skip: (seconds: number) => void;
  changeVolume: (v: number) => void;
  /** Preferred for KeyM when mute state is not in the main store. */
  toggleMute?: () => void;
  setMuted: (muted: boolean) => void;
  toggleFullscreen?: () => void;
  cycleLoopMode?: () => void;
  toggleSubtitles?: () => void;
  setPlaybackSpeed?: (speed: number) => void;
  seekToPercent?: (fraction: number) => void;
  jumpPrevChapter?: () => void;
  jumpNextChapter?: () => void;
};

export function usePlayerKeyboardShortcuts(handlers: PlayerKeyboardShortcutHandlers): void {
  const {
    enabled = true,
    volume,
    playbackSpeed = 1,
    hasChapters = false,
    togglePlay,
    skip,
    changeVolume,
    toggleMute,
    setMuted,
    toggleFullscreen,
    cycleLoopMode,
    toggleSubtitles,
    setPlaybackSpeed,
    seekToPercent,
    jumpPrevChapter,
    jumpNextChapter,
  } = handlers;

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTypingTarget()) return;

      switch (e.code) {
        case "Space":
        case "KeyK":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey && hasChapters && jumpNextChapter) {
            jumpNextChapter();
          } else {
            skip(10);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey && hasChapters && jumpPrevChapter) {
            jumpPrevChapter();
          } else {
            skip(-10);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          changeVolume(Math.min(1, volume + 0.1));
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVolume(Math.max(0, volume - 0.1));
          break;
        case "KeyM": {
          e.preventDefault();
          if (toggleMute) {
            toggleMute();
          } else {
            setMuted(!useRuforgeStore.getState().isMuted);
          }
          break;
        }
        case "KeyC":
          if (toggleSubtitles) {
            e.preventDefault();
            toggleSubtitles();
          }
          break;
        case "KeyF":
          if (toggleFullscreen) {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
        case "KeyL":
          if (cycleLoopMode) {
            e.preventDefault();
            cycleLoopMode();
          }
          break;
        case "Comma":
        case "Less":
          if (setPlaybackSpeed) {
            e.preventDefault();
            setPlaybackSpeed(stepPlaybackSpeed(playbackSpeed, -1));
          }
          break;
        case "Period":
        case "Greater":
          if (setPlaybackSpeed) {
            e.preventDefault();
            setPlaybackSpeed(stepPlaybackSpeed(playbackSpeed, 1));
          }
          break;
        case "Digit0":
          if (seekToPercent) {
            e.preventDefault();
            seekToPercent(0);
          }
          break;
        case "Home":
          if (seekToPercent) {
            e.preventDefault();
            seekToPercent(0);
          }
          break;
        case "End":
          if (seekToPercent) {
            e.preventDefault();
            seekToPercent(1);
          }
          break;
        default: {
          const digit = e.code.match(/^Digit([1-9])$/);
          if (digit && seekToPercent) {
            e.preventDefault();
            seekToPercent(Number.parseInt(digit[1]!, 10) * 0.1);
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    enabled,
    volume,
    playbackSpeed,
    hasChapters,
    togglePlay,
    skip,
    changeVolume,
    toggleMute,
    setMuted,
    toggleFullscreen,
    cycleLoopMode,
    toggleSubtitles,
    setPlaybackSpeed,
    seekToPercent,
    jumpPrevChapter,
    jumpNextChapter,
  ]);
}
