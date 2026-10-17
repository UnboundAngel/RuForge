import { useEffect } from "react";
import { useRuforgeStore } from "../store/ruforgeStore";
import type { HotkeyActionId } from "../lib/hotkeys";
import { isHotkeyRecording, isTypingTarget, matchHotkeyEvent } from "./useHotkeys";

export const PLAYER_PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** Matches the rewind / forward 15 buttons and their icons. */
export const PLAYER_SKIP_SECONDS = 15;

function stepPlaybackSpeed(current: number, delta: number): number {
  const speeds = PLAYER_PLAYBACK_SPEEDS;
  const idx = speeds.indexOf(current as (typeof speeds)[number]);
  const base = idx >= 0 ? idx : speeds.indexOf(1);
  const next = Math.min(speeds.length - 1, Math.max(0, base + delta));
  return speeds[next] ?? 1;
}

const PLAYER_ACTIONS: readonly HotkeyActionId[] = [
  "player.playPause",
  "player.prevChapter",
  "player.nextChapter",
  "player.seekBack",
  "player.seekForward",
  "player.volumeUp",
  "player.volumeDown",
  "player.mute",
  "player.subtitles",
  "player.fullscreen",
  "player.loop",
  "player.speedDown",
  "player.speedUp",
  "player.jumpStart",
  "player.jumpEnd",
];

export type PlayerKeyboardShortcutHandlers = {
  enabled?: boolean;
  volume: number;
  playbackSpeed?: number;
  hasChapters?: boolean;
  togglePlay: () => void;
  skip: (seconds: number) => void;
  changeVolume: (v: number) => void;
  /** Preferred for mute when mute state is not in the main store. */
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

/**
 * Runs one player action. Returns false when the player cannot do it (no subtitles, no fullscreen),
 * so the key can fall through. Shared by the in-window keys and the system-wide ghost mode keys.
 */
export function runPlayerHotkeyAction(
  action: HotkeyActionId,
  handlers: PlayerKeyboardShortcutHandlers,
): boolean {
  const {
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
  switch (action) {
    case "player.playPause":
      togglePlay();
      return true;
    case "player.prevChapter":
    case "player.nextChapter": {
      const next = action === "player.nextChapter";
      const jump = next ? jumpNextChapter : jumpPrevChapter;
      // A chapter chord on a video without chapters falls through to the plain seek.
      if (hasChapters && jump) jump();
      else skip(next ? PLAYER_SKIP_SECONDS : -PLAYER_SKIP_SECONDS);
      return true;
    }
    case "player.seekBack":
      skip(-PLAYER_SKIP_SECONDS);
      return true;
    case "player.seekForward":
      skip(PLAYER_SKIP_SECONDS);
      return true;
    case "player.volumeUp":
      changeVolume(Math.min(1, volume + 0.1));
      return true;
    case "player.volumeDown":
      changeVolume(Math.max(0, volume - 0.1));
      return true;
    case "player.mute":
      if (toggleMute) toggleMute();
      else setMuted(!useRuforgeStore.getState().isMuted);
      return true;
    case "player.subtitles":
      if (!toggleSubtitles) return false;
      toggleSubtitles();
      return true;
    case "player.fullscreen":
      if (!toggleFullscreen) return false;
      toggleFullscreen();
      return true;
    case "player.loop":
      if (!cycleLoopMode) return false;
      cycleLoopMode();
      return true;
    case "player.speedDown":
      if (!setPlaybackSpeed) return false;
      setPlaybackSpeed(stepPlaybackSpeed(playbackSpeed, -1));
      return true;
    case "player.speedUp":
      if (!setPlaybackSpeed) return false;
      setPlaybackSpeed(stepPlaybackSpeed(playbackSpeed, 1));
      return true;
    case "player.jumpStart":
      if (!seekToPercent) return false;
      seekToPercent(0);
      return true;
    case "player.jumpEnd":
      if (!seekToPercent) return false;
      seekToPercent(1);
      return true;
    default:
      return false;
  }
}

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

    const current: PlayerKeyboardShortcutHandlers = {
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
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget() || isHotkeyRecording()) return;

      const action = matchHotkeyEvent(e, PLAYER_ACTIONS);
      if (action) {
        if (runPlayerHotkeyAction(action, current)) e.preventDefault();
        return;
      }

      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const digit = e.code.match(/^Digit([1-9])$/);
      if (digit && seekToPercent) {
        e.preventDefault();
        seekToPercent(Number.parseInt(digit[1]!, 10) * 0.1);
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
