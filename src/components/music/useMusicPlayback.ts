import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { stopMusicMiniForMainClaim } from "@/lib/mainPlaybackClaim";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  peekAnalyserGraph,
  reconnectAnalyserPlaybackRoute,
  releaseAnalyserGraph,
} from "@/audioAnalyserGraph";
import { applyMediaOutputState } from "@/applyMediaOutputState";
import {
  chapterAtTime,
  nextChapterIndex,
  normalizeChapters,
  prevChapterIndex,
} from "@/chapters";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { noteIslandSkipDir } from "@/lib/islandSkipDirection";
import { isAudioOnlyPath } from "@/mediaKind";
import { readPlaybackSpeed, writePlaybackSpeed } from "@/playbackSpeedStorage";
import { useRuforgeStore } from "@/store/ruforgeStore";
import {
  hasMusicNextTrack,
  hasMusicPrevTrack,
  musicAdvanceLoopOpts,
  resolveMusicNextTrack,
  resolveMusicPrevTrack,
} from "./musicAdvanceQueue";
import {
  beginListenSession,
  endListenSession,
  flushListenSessionAccum,
  onListenTimeUpdateTick,
  pauseListenAccumulator,
  setPendingListenEndReason,
  takePendingListenEndReason,
  tickListenAccumulator,
} from "@/lib/musicListenSession";
import { primaryArtist } from "./musicArtist";
import { musicTrackIdentityKey } from "./musicShelfDedup";
import {
  ensureMusicEndlessLookahead,
  MUSIC_ENDLESS_LOOKAHEAD,
  remainingQueueCount,
  resolveMusicEndlessNext,
} from "./musicEndlessNext";

const DUCK_OUT_SEC = 0.008;
const DUCK_IN_SEC = 0.012;

type PlaybackState = {
  paused: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  skipBySeconds: (delta: number) => void;
  beginScrub: () => void;
  releaseScrub: (seconds: number) => void;
  skipPrev: () => void;
  skipNext: () => void;
  jumpPrevChapter: () => void;
  jumpNextChapter: () => void;
  hasPrevInQueue: boolean;
  hasNextInQueue: boolean;
  hasChapters: boolean;
  isDraggingRef: React.MutableRefObject<boolean>;
  effectivePlaylist: import("@/types").MediaFile[];
  playlistIndex: number;
  manualQueue: string[];
  playingFromManualQueue: boolean;
};

export function useMusicPlayback(
  audioRef: React.RefObject<HTMLAudioElement | null>,
): PlaybackState {
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const folderAudioPlaylist = useRuforgeStore((s) => s.folderAudioPlaylist);
  const entries = useRuforgeStore((s) => s.entries);
  const volume = useRuforgeStore((s) => s.volume);
  const isMuted = useRuforgeStore((s) => s.isMuted);
  const loopMode = useRuforgeStore((s) => s.loopMode);
  const handlePlayFolderNeighbor = useRuforgeStore((s) => s.handlePlayFolderNeighbor);
  const manualQueue = useRuforgeStore((s) => s.manualQueue);
  const playingFromManualQueue = useRuforgeStore((s) => s.playingFromManualQueue);
  const manualQueueContextIndex = useRuforgeStore((s) => s.manualQueueContextIndex);
  const applyManualQueueAdvance = useRuforgeStore((s) => s.applyManualQueueAdvance);
  const clearManualQueuePlayingState = useRuforgeStore((s) => s.clearManualQueuePlayingState);
  const musicPlayerResume = useRuforgeStore((s) => s.musicPlayerResume);
  const clearMusicPlayerResume = useRuforgeStore((s) => s.clearMusicPlayerResume);
  const activityOwner = useRuforgeStore((s) => s.activityOwner);
  const navMode = useRuforgeStore((s) => s.navMode);
  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);
  const musicEndlessExtended = useRuforgeStore((s) => s.musicEndlessExtended);
  const musicEndlessFromIndex = useRuforgeStore((s) => s.musicEndlessFromIndex);
  const applyMusicEndlessAdvance = useRuforgeStore((s) => s.applyMusicEndlessAdvance);

  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeedState] = useState(() => readPlaybackSpeed());

  const isDraggingRef = useRef(false);
  const scrubGenerationRef = useRef(0);
  const loadedPathRef = useRef<string | null>(null);
  const sessionRecentKeysRef = useRef<string[]>([]);

  const pushSessionRecent = useCallback((file: import("@/types").MediaFile) => {
    const key = musicTrackIdentityKey(file, primaryArtist);
    const next = [...sessionRecentKeysRef.current.filter((k) => k !== key), key];
    sessionRecentKeysRef.current = next.slice(-12);
  }, []);

  const libraryAudio = useMemo(
    () => flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path)),
    [entries],
  );

  const effectivePlaylist = useMemo(() => {
    if (!playingFile) return [];
    if (folderAudioPlaylist.some((f) => f.path === playingFile.path)) {
      return folderAudioPlaylist;
    }
    if (libraryAudio.some((f) => f.path === playingFile.path)) {
      return libraryAudio;
    }
    return [playingFile];
  }, [playingFile, folderAudioPlaylist, libraryAudio]);

  const playlistIndex = playingFile
    ? effectivePlaylist.findIndex((f) => f.path === playingFile.path)
    : -1;

  const chapters = useMemo(() => {
    if (!playingFile?.chapters) return null;
    const dur = duration > 0 ? duration : playingFile.duration;
    return normalizeChapters(playingFile.chapters, dur);
  }, [playingFile, duration]);

  const setPlaybackSpeed = useCallback((speed: number) => {
    writePlaybackSpeed(speed);
    setPlaybackSpeedState(speed);
  }, []);

  useEffect(() => {
    try {
      if (getCurrentWindow().label === "main") {
        stopMusicMiniForMainClaim();
      }
    } catch {}
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const isAudioEngineFile = !!playingFile && isAudioOnlyPath(playingFile.path);
    const engineActive = isAudioEngineFile && !activityOwner;

    if (!engineActive) {
      const explicitStop = !playingFile && !activityOwner;
      const switchedToVideo = !!playingFile && !isAudioOnlyPath(playingFile.path);

      el.pause();
      releaseAnalyserGraph(el, true);

      if (explicitStop || switchedToVideo) {
        loadedPathRef.current = null;
        void endListenSession("abandoned_paused").catch(() => null);
        el.removeAttribute("src");
        el.load();
        setCurrentTime(0);
        setDuration(0);
      }

      setPaused(true);
      return;
    }

    const path = playingFile.path;
    const src = convertFileSrc(path);
    const needsLoad = loadedPathRef.current !== path;

    if (needsLoad) {
      void (async () => {
        if (loadedPathRef.current) {
          await endListenSession(takePendingListenEndReason());
        }
        pushSessionRecent(playingFile);
        const key = musicTrackIdentityKey(playingFile, primaryArtist);
        await beginListenSession(playingFile, "main", {
          wasLiked: musicLikedKeys.includes(key),
        });
      })();
    }

    if (needsLoad) {
      el.pause();
      releaseAnalyserGraph(el, true);
      el.src = src;
      el.load();
      loadedPathRef.current = path;
      setCurrentTime(0);
      setDuration(0);
    }

    applyMediaOutputState(el, volume, isMuted);
    el.loop = loopMode === "one";
    el.playbackRate = playbackSpeed;

    const resume = musicPlayerResume;
    if (needsLoad) {
      if (resume) {
        clearMusicPlayerResume();
        el.currentTime = Math.max(0, resume.currentTime);
        el.playbackRate = resume.playbackSpeed;
        if (!resume.paused) {
          void el.play()
            .then(() => setPaused(false))
            .catch(() => setPaused(true));
        } else {
          setPaused(true);
        }
      } else {
        void el.play()
          .then(() => setPaused(false))
          .catch(() => setPaused(true));
      }
    }
  }, [
    playingFile?.path,
    audioRef,
    musicPlayerResume,
    clearMusicPlayerResume,
    volume,
    isMuted,
    loopMode,
    playbackSpeed,
    folderAudioPlaylist,
    libraryAudio,
    pushSessionRecent,
    playingFile,
    musicLikedKeys,
    activityOwner,
  ]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    applyMediaOutputState(el, volume, isMuted);
  }, [volume, isMuted, audioRef]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.loop = loopMode === "one";
  }, [loopMode, audioRef]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = playbackSpeed;
  }, [playbackSpeed, audioRef]);

  const togglePlay = useCallback(() => {
    scrubGenerationRef.current += 1;
    isDraggingRef.current = false;
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      reconnectAnalyserPlaybackRoute(el);
      void el.play().then(() => setPaused(false)).catch(() => setPaused(true));
    } else {
      el.pause();
      setPaused(true);
    }
  }, [audioRef]);

  const seek = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    setCurrentTime(seconds);
  }, [audioRef]);

  const skipBySeconds = useCallback((delta: number) => {
    const el = audioRef.current;
    if (!el) return;
    const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
    const next = Math.max(0, Math.min(max || 0, el.currentTime + delta));
    el.currentTime = next;
    setCurrentTime(next);
  }, [duration, audioRef]);

  const beginScrub = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const releaseScrub = useCallback((seconds: number) => {
    const el = audioRef.current;
    const finishDrag = () => {
      isDraggingRef.current = false;
    };
    if (!el) {
      finishDrag();
      return;
    }

    const max =
      Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
    const clamped = Math.max(0, Math.min(max || 0, seconds));
    const capturedGen = scrubGenerationRef.current;

    const rampGainBackIn = () => {
      if (scrubGenerationRef.current !== capturedGen) return;
      const graph = peekAnalyserGraph(el);
      if (!graph) return;
      const { gain, ctx } = graph;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(1, ctx.currentTime + DUCK_IN_SEC);
    };

    const performSeek = () => {
      if (scrubGenerationRef.current !== capturedGen) {
        finishDrag();
        return;
      }
      el.currentTime = clamped;
      setCurrentTime(clamped);

      const onSeeked = () => {
        el.removeEventListener("seeked", onSeeked);
        if (scrubGenerationRef.current !== capturedGen) {
          finishDrag();
          return;
        }
        rampGainBackIn();
        finishDrag();
      };

      if (el.seeking) {
        el.addEventListener("seeked", onSeeked);
        return;
      }

      requestAnimationFrame(() => {
        if (scrubGenerationRef.current !== capturedGen) {
          finishDrag();
          return;
        }
        if (el.seeking) {
          el.addEventListener("seeked", onSeeked);
        } else {
          rampGainBackIn();
          finishDrag();
        }
      });
    };

    const graph = peekAnalyserGraph(el);
    if (graph) {
      const { gain, ctx } = graph;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + DUCK_OUT_SEC);
      window.setTimeout(performSeek, DUCK_OUT_SEC * 1000);
    } else {
      performSeek();
    }
  }, [audioRef, duration]);

  useEffect(() => {
    const clearStuckDrag = () => {
      scrubGenerationRef.current += 1;
      isDraggingRef.current = false;
      // Scrub interrupted mid-ramp can leave analyser gain at 0 and playback silent.
      const el = audioRef.current;
      const graph = el ? peekAnalyserGraph(el) : null;
      if (graph) {
        const { gain, ctx } = graph;
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(1, ctx.currentTime);
      }
    };
    window.addEventListener("blur", clearStuckDrag);
    window.addEventListener("pointercancel", clearStuckDrag);
    document.addEventListener("visibilitychange", clearStuckDrag);
    return () => {
      window.removeEventListener("blur", clearStuckDrag);
      window.removeEventListener("pointercancel", clearStuckDrag);
      document.removeEventListener("visibilitychange", clearStuckDrag);
    };
  }, []);

  const advanceLoopOpts = useMemo(
    () => musicAdvanceLoopOpts(loopMode, effectivePlaylist.length, musicEndlessFromIndex),
    [loopMode, effectivePlaylist.length, musicEndlessFromIndex],
  );

  const skipPrev = useCallback(() => {
    if (!playingFile) return;
    const el = audioRef.current;
    if (el && el.currentTime > 3) {
      el.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    const prev = resolveMusicPrevTrack(
      {
        manualQueue,
        effectivePlaylist,
        playlistIndex,
        playingFromManualQueue,
        manualQueueContextIndex,
      },
      advanceLoopOpts,
    );

    if (prev) {
      noteIslandSkipDir(-1);
      if (playingFromManualQueue) {
        clearManualQueuePlayingState();
      }
      setPendingListenEndReason("skipped");
      handlePlayFolderNeighbor(prev);
    }
  }, [playingFile, playlistIndex, effectivePlaylist, manualQueue, playingFromManualQueue, manualQueueContextIndex, advanceLoopOpts, handlePlayFolderNeighbor, clearManualQueuePlayingState, audioRef]);

  const skipNext = useCallback(() => {
    if (!playingFile) return;
    const advanceState = {
      manualQueue,
      effectivePlaylist,
      playlistIndex,
      playingFromManualQueue,
      manualQueueContextIndex,
    };

    const resolveFromLibrary = (path: string): import("@/types").MediaFile | null => {
      return effectivePlaylist.find((f) => f.path === path) ?? null;
    };

    const result = resolveMusicNextTrack(advanceState, resolveFromLibrary, advanceLoopOpts);
    if (!result) return;

    noteIslandSkipDir(1);
    if (result.playingFromManualQueue) {
      applyManualQueueAdvance(result.manualQueueContextIndex);
    } else {
      clearManualQueuePlayingState();
    }

    setPendingListenEndReason("skipped");
    handlePlayFolderNeighbor(result.file);
  }, [playingFile, playlistIndex, effectivePlaylist, manualQueue, playingFromManualQueue, manualQueueContextIndex, advanceLoopOpts, handlePlayFolderNeighbor, applyManualQueueAdvance, clearManualQueuePlayingState]);

  const jumpPrevChapter = useCallback(() => {
    if (!chapters) return;
    const active = chapterAtTime(chapters, currentTime);
    const idx = active?.index ?? 0;
    const prev = prevChapterIndex(chapters, idx);
    if (prev !== null) seek(chapters[prev].start_time);
  }, [chapters, currentTime, seek]);

  const jumpNextChapter = useCallback(() => {
    if (!chapters) return;
    const active = chapterAtTime(chapters, currentTime);
    const idx = active?.index ?? 0;
    const next = nextChapterIndex(chapters, idx);
    if (next !== null) seek(chapters[next].start_time);
  }, [chapters, currentTime, seek]);

  useEffect(() => {
    if (navMode !== "music" || !playingFile) return;
    if (loopMode === "all") return;
    const remaining = remainingQueueCount(
      playlistIndex,
      effectivePlaylist.length,
      manualQueue.length,
    );
    if (remaining >= MUSIC_ENDLESS_LOOKAHEAD) return;

    const result = ensureMusicEndlessLookahead({
      libraryAudio,
      folderAudioPlaylist,
      current: playingFile,
      endlessExtended: musicEndlessExtended,
      endlessFromIndex: musicEndlessFromIndex,
      effectivePlaylist,
      playlistIndex,
      manualQueueLength: manualQueue.length,
      likedKeys: musicLikedKeys,
      sessionRecentKeys: sessionRecentKeysRef.current,
      lookahead: MUSIC_ENDLESS_LOOKAHEAD,
    });
    if (!result) return;
    applyMusicEndlessAdvance(result.folderAudioPlaylistAfter, result.endlessFromIndex);
  }, [
    navMode,
    playingFile,
    playingFile?.path,
    playlistIndex,
    effectivePlaylist.length,
    manualQueue.length,
    libraryAudio,
    folderAudioPlaylist,
    musicEndlessExtended,
    musicEndlessFromIndex,
    effectivePlaylist,
    musicLikedKeys,
    loopMode,
    applyMusicEndlessAdvance,
  ]);

  const trySmartEndlessNext = useCallback((): boolean => {
    if (navMode !== "music" || !playingFile) return false;
    if (loopMode === "all") return false;

    const result = resolveMusicEndlessNext({
      libraryAudio,
      folderAudioPlaylist,
      current: playingFile,
      endlessExtended: musicEndlessExtended,
      endlessFromIndex: musicEndlessFromIndex,
      effectivePlaylist,
      likedKeys: musicLikedKeys,
      sessionRecentKeys: sessionRecentKeysRef.current,
    });
    if (!result) return false;

    applyMusicEndlessAdvance(result.folderAudioPlaylistAfter, result.endlessFromIndex);
    setPendingListenEndReason("manual_switch");
    handlePlayFolderNeighbor(result.next);
    return true;
  }, [
    navMode,
    playingFile,
    libraryAudio,
    folderAudioPlaylist,
    musicEndlessExtended,
    musicEndlessFromIndex,
    musicLikedKeys,
    effectivePlaylist,
    loopMode,
    applyMusicEndlessAdvance,
    handlePlayFolderNeighbor,
  ]);

  const handleEnded = useCallback(async () => {
    isDraggingRef.current = false;
    if (loopMode === "one" || !playingFile) return;
    await flushListenSessionAccum(true);
    const advanceState = {
      manualQueue,
      effectivePlaylist,
      playlistIndex,
      playingFromManualQueue,
      manualQueueContextIndex,
    };

    const resolveFromPlaylist = (path: string): import("@/types").MediaFile | null =>
      effectivePlaylist.find((f) => f.path === path) ?? null;
    const result = resolveMusicNextTrack(advanceState, resolveFromPlaylist, advanceLoopOpts);

    if (result) {
      await endListenSession("completed");
      if (result.playingFromManualQueue) {
        applyManualQueueAdvance(result.manualQueueContextIndex);
      } else {
        clearManualQueuePlayingState();
      }
      setPendingListenEndReason("manual_switch");
      handlePlayFolderNeighbor(result.file);
      return;
    }

    if (loopMode === "all") {
      clearManualQueuePlayingState();
      setPaused(true);
      return;
    }

    await endListenSession("wall_endless_pick");
    if (!trySmartEndlessNext()) {
      clearManualQueuePlayingState();
      setPaused(true);
    }
  }, [
    loopMode,
    playingFile,
    playlistIndex,
    effectivePlaylist,
    manualQueue,
    playingFromManualQueue,
    manualQueueContextIndex,
    advanceLoopOpts,
    handlePlayFolderNeighbor,
    applyManualQueueAdvance,
    clearManualQueuePlayingState,
    trySmartEndlessNext,
  ]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTimeUpdate = () => {
      if (!isDraggingRef.current) setCurrentTime(el.currentTime);
      if (!el.paused && playingFile) {
        tickListenAccumulator();
        void onListenTimeUpdateTick();
      } else {
        pauseListenAccumulator();
      }
    };

    const onLoadedMetadata = () => setDuration(el.duration);
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onEnded = () => handleEnded();

    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [audioRef, playingFile?.path, handleEnded, playingFile]);

  return {
    paused,
    currentTime,
    duration,
    playbackSpeed,
    setPlaybackSpeed,
    togglePlay,
    seek,
    skipBySeconds,
    beginScrub,
    releaseScrub,
    skipPrev,
    skipNext,
    jumpPrevChapter,
    jumpNextChapter,
    hasPrevInQueue: hasMusicPrevTrack(
      { manualQueue, effectivePlaylist, playlistIndex, playingFromManualQueue, manualQueueContextIndex },
      currentTime,
      advanceLoopOpts,
    ),
    hasNextInQueue: hasMusicNextTrack(
      { manualQueue, effectivePlaylist, playlistIndex, playingFromManualQueue, manualQueueContextIndex },
      advanceLoopOpts,
    ),
    hasChapters: !!(chapters && chapters.length >= 2),
    isDraggingRef,
    effectivePlaylist,
    playlistIndex,
    manualQueue,
    playingFromManualQueue,
  };
}
