import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { stopMusicMiniForMainClaim } from "@/lib/mainPlaybackClaim";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  peekAnalyserGraph,
  reconnectAnalyserPlaybackRoute,
  releaseAnalyserGraph,
} from "@/audioAnalyserGraph";
import { applyAudioOutputSink } from "@/audioOutputDevices";
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
import {
  writeMusicPlaybackSession,
} from "@/lib/musicPlaybackSessionStorage";
import { readPlaybackSpeed, writePlaybackSpeed } from "@/playbackSpeedStorage";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";
import {
  hasMusicNextTrack,
  hasMusicPrevTrack,
  musicAdvanceLoopOpts,
  resolveMusicNextTrack,
  resolveMusicPrevTrack,
  type MusicAdvanceNextResult,
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
import {
  equalPowerInGain,
  equalPowerOutGain,
  musicCrossfadeArmWindowBlown,
  musicCrossfadeEffectiveSec,
  musicCrossfadeEligible,
} from "./musicCrossfade";
import {
  MUSIC_CROSSFADE_PRELOAD_LEAD_SEC,
  readMusicCrossfadeSec,
  writeMusicCrossfadeSec,
} from "./musicCrossfadeStorage";

const DUCK_OUT_SEC = 0.008;
const DUCK_IN_SEC = 0.012;

type CrossfadePhase = "idle" | "preloading" | "overlapping";

type CrossfadeAbortReason =
  | "user-skip"
  | "user-seek"
  | "stop"
  | "handoff"
  | "loop-one"
  | "crossfade-off"
  | "preload-cancel";

const OVERLAP_ABORTABLE: ReadonlySet<CrossfadeAbortReason> = new Set([
  "user-skip",
  "user-seek",
  "stop",
  "handoff",
  "loop-one",
  "crossfade-off",
]);

type PendingCrossfade = {
  generation: number;
  file: MediaFile;
  fadeSec: number;
  fromResolve: MusicAdvanceNextResult | null;
  fromEndless: {
    folderAudioPlaylistAfter: MediaFile[];
    endlessFromIndex: number;
  } | null;
};

type PendingMusicResume = {
  currentTime: number;
  paused: boolean;
  playbackSpeed: number;
};

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
  effectivePlaylist: MediaFile[];
  playlistIndex: number;
  manualQueue: string[];
  playingFromManualQueue: boolean;
  audioEl: HTMLAudioElement | null;
  crossfadeSec: number;
  setCrossfadeSec: (sec: number) => void;
};

function elReady(el: HTMLAudioElement): boolean {
  return el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
}

export function useMusicPlayback(
  audioARef: React.RefObject<HTMLAudioElement | null>,
  audioBRef: React.RefObject<HTMLAudioElement | null>,
  mediaEpoch = 0,
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
  const [primaryIsA, setPrimaryIsA] = useState(true);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [crossfadeSec, setCrossfadeSecState] = useState(() => readMusicCrossfadeSec());

  const isDraggingRef = useRef(false);
  const lastPlaybackPersistRef = useRef(0);
  const pendingResumeRef = useRef<PendingMusicResume | null>(null);
  const scrubGenerationRef = useRef(0);
  const primaryPathRef = useRef<string | null>(null);
  const sessionRecentKeysRef = useRef<string[]>([]);
  const primaryIsARef = useRef(true);
  primaryIsARef.current = primaryIsA;

  const loopModeRef = useRef(loopMode);
  loopModeRef.current = loopMode;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const crossfadeSecRef = useRef(crossfadeSec);
  crossfadeSecRef.current = crossfadeSec;
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;

  const phaseRef = useRef<CrossfadePhase>("idle");
  const pendingRef = useRef<PendingCrossfade | null>(null);
  const generationRef = useRef(0);
  const committingRef = useRef(false);
  const transitionFromPathRef = useRef<string | null>(null);
  const secondaryReadyRef = useRef(false);
  const primaryGainRef = useRef(1);
  const secondaryGainRef = useRef(0);
  const rampStartMsRef = useRef(0);
  const rampPausedElapsedRef = useRef<number | null>(null);
  const rampRafRef = useRef<number | null>(null);
  const outgoingElRef = useRef<HTMLAudioElement | null>(null);

  const playingFileRef = useRef(playingFile);
  playingFileRef.current = playingFile;
  const folderAudioPlaylistRef = useRef(folderAudioPlaylist);
  folderAudioPlaylistRef.current = folderAudioPlaylist;
  const manualQueueRef = useRef(manualQueue);
  manualQueueRef.current = manualQueue;
  const playingFromManualQueueRef = useRef(playingFromManualQueue);
  playingFromManualQueueRef.current = playingFromManualQueue;
  const manualQueueContextIndexRef = useRef(manualQueueContextIndex);
  manualQueueContextIndexRef.current = manualQueueContextIndex;
  const musicEndlessExtendedRef = useRef(musicEndlessExtended);
  musicEndlessExtendedRef.current = musicEndlessExtended;
  const musicEndlessFromIndexRef = useRef(musicEndlessFromIndex);
  musicEndlessFromIndexRef.current = musicEndlessFromIndex;
  const musicLikedKeysRef = useRef(musicLikedKeys);
  musicLikedKeysRef.current = musicLikedKeys;
  const navModeRef = useRef(navMode);
  navModeRef.current = navMode;

  const getPrimary = useCallback((): HTMLAudioElement | null => {
    return primaryIsARef.current ? audioARef.current : audioBRef.current;
  }, [audioARef, audioBRef]);

  const getSecondary = useCallback((): HTMLAudioElement | null => {
    return primaryIsARef.current ? audioBRef.current : audioARef.current;
  }, [audioARef, audioBRef]);

  const applyElOutput = useCallback(
    (el: HTMLAudioElement | null, gain: number) => {
      if (!el) return;
      applyMediaOutputState(el, volumeRef.current * gain, isMutedRef.current);
    },
    [],
  );

  const applyPrimaryOutput = useCallback(() => {
    applyElOutput(getPrimary(), primaryGainRef.current);
  }, [applyElOutput, getPrimary]);

  const applyPendingResume = useCallback((el: HTMLAudioElement) => {
    const pending = pendingResumeRef.current;
    if (!pending) return false;
    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
    const startAt =
      dur > 0
        ? Math.min(Math.max(0, pending.currentTime), dur)
        : Math.max(0, pending.currentTime);
    pendingResumeRef.current = null;
    el.currentTime = startAt;
    setCurrentTime(startAt);
    el.playbackRate = pending.playbackSpeed;
    if (!pending.paused) {
      void el.play()
        .then(() => setPaused(false))
        .catch(() => setPaused(true));
    } else {
      el.pause();
      setPaused(true);
    }
    return true;
  }, []);

  const tryApplyPendingResume = useCallback(
    (el: HTMLAudioElement) => {
      if (!pendingResumeRef.current) return;
      if (el.readyState < HTMLMediaElement.HAVE_METADATA) return;
      applyPendingResume(el);
    },
    [applyPendingResume],
  );

  const stopRampLoop = useCallback(() => {
    if (rampRafRef.current != null) {
      cancelAnimationFrame(rampRafRef.current);
      rampRafRef.current = null;
    }
  }, []);

  const clearSecondary = useCallback(() => {
    const sec = getSecondary();
    if (!sec) return;
    sec.pause();
    releaseAnalyserGraph(sec, true);
    sec.removeAttribute("src");
    sec.load();
    secondaryReadyRef.current = false;
    secondaryGainRef.current = 0;
    applyElOutput(sec, 0);
  }, [applyElOutput, getSecondary]);

  const abortCrossfade = useCallback((reason: CrossfadeAbortReason = "preload-cancel") => {
    if (phaseRef.current === "overlapping" && !OVERLAP_ABORTABLE.has(reason)) {
      return;
    }
    stopRampLoop();
    phaseRef.current = "idle";
    pendingRef.current = null;
    secondaryReadyRef.current = false;
    rampPausedElapsedRef.current = null;
    if (reason !== "preload-cancel") {
      transitionFromPathRef.current = null;
    }
    const outgoing = outgoingElRef.current;
    outgoingElRef.current = null;
    if (outgoing && outgoing !== getPrimary()) {
      outgoing.pause();
      releaseAnalyserGraph(outgoing, true);
      outgoing.removeAttribute("src");
      outgoing.load();
    }
    clearSecondary();
    primaryGainRef.current = 1;
    applyPrimaryOutput();
  }, [applyPrimaryOutput, clearSecondary, getPrimary, stopRampLoop]);

  const setCrossfadeSec = useCallback(
    (sec: number) => {
      writeMusicCrossfadeSec(sec);
      const next = readMusicCrossfadeSec();
      setCrossfadeSecState(next);
      crossfadeSecRef.current = next;
      if (next <= 0) abortCrossfade("crossfade-off");
    },
    [abortCrossfade],
  );

  const pushSessionRecent = useCallback((file: MediaFile) => {
    const key = musicTrackIdentityKey(file, primaryArtist);
    const next = [...sessionRecentKeysRef.current.filter((k) => k !== key), key];
    sessionRecentKeysRef.current = next.slice(-12);
  }, []);

  const libraryAudio = useMemo(
    () => flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path)),
    [entries],
  );
  const libraryAudioRef = useRef(libraryAudio);
  libraryAudioRef.current = libraryAudio;

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
  const effectivePlaylistRef = useRef(effectivePlaylist);
  effectivePlaylistRef.current = effectivePlaylist;

  const playlistIndex = playingFile
    ? effectivePlaylist.findIndex((f) => f.path === playingFile.path)
    : -1;
  const playlistIndexRef = useRef(playlistIndex);
  playlistIndexRef.current = playlistIndex;

  const chapters = useMemo(() => {
    if (!playingFile?.chapters) return null;
    const dur = duration > 0 ? duration : playingFile.duration;
    return normalizeChapters(playingFile.chapters, dur);
  }, [playingFile, duration]);

  const setPlaybackSpeed = useCallback((speed: number) => {
    writePlaybackSpeed(speed);
    setPlaybackSpeedState(speed);
  }, []);

  const advanceLoopOpts = useMemo(
    () => musicAdvanceLoopOpts(loopMode, effectivePlaylist.length, musicEndlessFromIndex),
    [loopMode, effectivePlaylist.length, musicEndlessFromIndex],
  );
  const advanceLoopOptsRef = useRef(advanceLoopOpts);
  advanceLoopOptsRef.current = advanceLoopOpts;

  const syncAudioElState = useCallback(() => {
    const el = getPrimary();
    setAudioEl(el);
  }, [getPrimary]);

  useEffect(() => {
    syncAudioElState();
  }, [primaryIsA, syncAudioElState]);

  useEffect(() => {
    try {
      if (getCurrentWindow().label === "main") {
        stopMusicMiniForMainClaim();
      }
    } catch {}
  }, []);

  const finishOutgoingAfterRamp = useCallback((outgoing: HTMLAudioElement | null) => {
    if (!outgoing) return;
    outgoing.pause();
    releaseAnalyserGraph(outgoing, true);
    outgoing.removeAttribute("src");
    outgoing.load();
    applyElOutput(outgoing, 0);
    transitionFromPathRef.current = null;
  }, [applyElOutput]);

  const runRampFrame = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || phaseRef.current !== "overlapping") return;
    if (rampPausedElapsedRef.current != null) return;

    const fadeSec = pending.fadeSec;
    if (fadeSec <= 0) return;

    const elapsedMs = performance.now() - rampStartMsRef.current;
    const t = Math.min(1, elapsedMs / (fadeSec * 1000));
    const outGain = equalPowerOutGain(t);
    const inGain = equalPowerInGain(t);
    primaryGainRef.current = inGain;
    secondaryGainRef.current = outGain;

    const primary = getPrimary();
    const outgoing = outgoingElRef.current;
    applyElOutput(primary, inGain);
    applyElOutput(outgoing, outGain);

    if (t >= 1) {
      stopRampLoop();
      phaseRef.current = "idle";
      pendingRef.current = null;
      finishOutgoingAfterRamp(outgoing);
      outgoingElRef.current = null;
      primaryGainRef.current = 1;
      secondaryGainRef.current = 0;
      applyElOutput(primary, 1);
      return;
    }

    rampRafRef.current = requestAnimationFrame(runRampFrame);
  }, [applyElOutput, finishOutgoingAfterRamp, getPrimary, stopRampLoop]);

  const startRampLoop = useCallback(() => {
    stopRampLoop();
    rampPausedElapsedRef.current = null;
    rampRafRef.current = requestAnimationFrame(runRampFrame);
  }, [runRampFrame, stopRampLoop]);

  const peekNextForCrossfade = useCallback((): PendingCrossfade | null => {
    const current = playingFileRef.current;
    if (!current) return null;
    if (loopModeRef.current === "one") return null;

    const playlist = effectivePlaylistRef.current;
    const advanceState = {
      manualQueue: manualQueueRef.current,
      effectivePlaylist: playlist,
      playlistIndex: playlistIndexRef.current,
      playingFromManualQueue: playingFromManualQueueRef.current,
      manualQueueContextIndex: manualQueueContextIndexRef.current,
    };
    const resolveFromPlaylist = (path: string): MediaFile | null =>
      playlist.find((f) => f.path === path) ?? null;
    const resolved = resolveMusicNextTrack(
      advanceState,
      resolveFromPlaylist,
      advanceLoopOptsRef.current,
    );
    if (resolved) {
      return {
        generation: generationRef.current,
        file: resolved.file,
        fadeSec: 0,
        fromResolve: resolved,
        fromEndless: null,
      };
    }

    if (loopModeRef.current === "all") return null;
    if (navModeRef.current !== "music") return null;

    const endless = resolveMusicEndlessNext({
      libraryAudio: libraryAudioRef.current,
      folderAudioPlaylist: folderAudioPlaylistRef.current,
      current,
      endlessExtended: musicEndlessExtendedRef.current,
      endlessFromIndex: musicEndlessFromIndexRef.current,
      effectivePlaylist: playlist,
      likedKeys: musicLikedKeysRef.current,
      sessionRecentKeys: sessionRecentKeysRef.current,
    });
    if (!endless) return null;
    return {
      generation: generationRef.current,
      file: endless.next,
      fadeSec: 0,
      fromResolve: null,
      fromEndless: {
        folderAudioPlaylistAfter: endless.folderAudioPlaylistAfter,
        endlessFromIndex: endless.endlessFromIndex,
      },
    };
  }, []);

  const resolvePrimaryDuration = useCallback((primary: HTMLAudioElement): number => {
    if (Number.isFinite(primary.duration) && primary.duration > 0) return primary.duration;
    const fromFile = playingFileRef.current?.duration;
    if (typeof fromFile === "number" && Number.isFinite(fromFile) && fromFile > 0) {
      return fromFile;
    }
    return 0;
  }, []);

  const commitCrossfade = useCallback(
    async (pending: PendingCrossfade) => {
      if (committingRef.current || phaseRef.current === "overlapping") return false;
      const fromPath = primaryPathRef.current;
      if (fromPath && transitionFromPathRef.current === fromPath) return false;
      const outgoing = getPrimary();
      const incoming = getSecondary();
      if (!outgoing || !incoming || !elReady(incoming)) return false;

      committingRef.current = true;
      phaseRef.current = "overlapping";
      if (fromPath) transitionFromPathRef.current = fromPath;

      try {
        await flushListenSessionAccum(true);
        await endListenSession("completed");

        if (pending.fromResolve) {
          if (pending.fromResolve.playingFromManualQueue) {
            applyManualQueueAdvance(pending.fromResolve.manualQueueContextIndex);
          } else {
            clearManualQueuePlayingState();
          }
        } else if (pending.fromEndless) {
          clearManualQueuePlayingState();
          applyMusicEndlessAdvance(
            pending.fromEndless.folderAudioPlaylistAfter,
            pending.fromEndless.endlessFromIndex,
          );
        }

        outgoingElRef.current = outgoing;
        primaryIsARef.current = !primaryIsARef.current;
        setPrimaryIsA(primaryIsARef.current);
        primaryPathRef.current = pending.file.path;
        primaryGainRef.current = 0;
        secondaryGainRef.current = 1;
        applyElOutput(incoming, 0);
        applyElOutput(outgoing, 1);
        reconnectAnalyserPlaybackRoute(outgoing);

        pendingRef.current = pending;
        rampStartMsRef.current = performance.now();
        setAudioEl(incoming);
        setCurrentTime(incoming.currentTime);
        setDuration(Number.isFinite(incoming.duration) ? incoming.duration : 0);

        pushSessionRecent(pending.file);
        const key = musicTrackIdentityKey(pending.file, primaryArtist);
        void beginListenSession(pending.file, "main", {
          wasLiked: musicLikedKeysRef.current.includes(key),
        });

        void incoming.play().catch(() => {});

        setPendingListenEndReason("manual_switch");
        handlePlayFolderNeighbor(pending.file);
        startRampLoop();
        return true;
      } finally {
        committingRef.current = false;
      }
    },
    [
      applyElOutput,
      applyManualQueueAdvance,
      applyMusicEndlessAdvance,
      clearManualQueuePlayingState,
      getPrimary,
      getSecondary,
      handlePlayFolderNeighbor,
      pushSessionRecent,
      startRampLoop,
    ],
  );

  const armOrTickCrossfade = useCallback(() => {
    const primary = getPrimary();
    if (!primary || primary.paused) return;
    if (phaseRef.current === "overlapping") return;

    const fromPath = primaryPathRef.current;
    if (fromPath && transitionFromPathRef.current === fromPath) return;

    const configuredFade = crossfadeSecRef.current;
    const dur = resolvePrimaryDuration(primary);
    if (
      !musicCrossfadeEligible(dur, configuredFade, loopModeRef.current === "one")
    ) {
      if (phaseRef.current === "preloading") abortCrossfade("preload-cancel");
      return;
    }

    const fadeSec = musicCrossfadeEffectiveSec(dur, configuredFade);
    if (fadeSec <= 0) {
      if (phaseRef.current === "preloading") abortCrossfade("preload-cancel");
      return;
    }

    const remaining = dur - primary.currentTime;
    const armAt = fadeSec + MUSIC_CROSSFADE_PRELOAD_LEAD_SEC;

    if (remaining > armAt) {
      if (phaseRef.current === "preloading") abortCrossfade("preload-cancel");
      return;
    }

    if (phaseRef.current === "idle") {
      if (musicCrossfadeArmWindowBlown(remaining, fadeSec)) {
        return;
      }
      const pending = peekNextForCrossfade();
      if (!pending) return;
      const sec = getSecondary();
      if (!sec) return;
      generationRef.current += 1;
      pending.generation = generationRef.current;
      pending.fadeSec = fadeSec;
      pendingRef.current = pending;
      phaseRef.current = "preloading";
      secondaryReadyRef.current = false;
      sec.pause();
      releaseAnalyserGraph(sec, true);
      sec.src = convertFileSrc(pending.file.path);
      sec.loop = false;
      sec.playbackRate = playbackSpeedRef.current;
      sec.load();
      void applyAudioOutputSink(sec);
      applyElOutput(sec, 0);
      const markReady = () => {
        if (pendingRef.current?.generation !== pending.generation) return;
        if (elReady(sec)) secondaryReadyRef.current = true;
      };
      sec.addEventListener("canplay", markReady, { once: true });
      sec.addEventListener("canplaythrough", markReady, { once: true });
    }

    if (remaining > fadeSec) return;
    if (committingRef.current) return;

    const pending = pendingRef.current;
    if (!pending) return;
    const sec = getSecondary();
    if (!sec) return;

    if (elReady(sec) || secondaryReadyRef.current) {
      secondaryReadyRef.current = true;
      void commitCrossfade(pending);
    }
  }, [
    abortCrossfade,
    applyElOutput,
    commitCrossfade,
    getPrimary,
    getSecondary,
    peekNextForCrossfade,
    resolvePrimaryDuration,
  ]);

  useLayoutEffect(() => {
    if (!playingFile || !isAudioOnlyPath(playingFile.path) || activityOwner) return;
    setCurrentTime(0);
    setDuration(0);
  }, [playingFile?.path, activityOwner, playingFile]);

  useEffect(() => {
    const el = getPrimary();
    const secondary = getSecondary();
    if (!el) return;

    const isAudioEngineFile = !!playingFile && isAudioOnlyPath(playingFile.path);
    const engineActive = isAudioEngineFile && !activityOwner;

    if (!engineActive) {
      const explicitStop = !playingFile && !activityOwner;
      const switchedToVideo = !!playingFile && !isAudioOnlyPath(playingFile.path);

      abortCrossfade(activityOwner ? "handoff" : "stop");
      el.pause();
      releaseAnalyserGraph(el, true);
      secondary?.pause();
      if (secondary) releaseAnalyserGraph(secondary, true);

      if (explicitStop || switchedToVideo) {
        primaryPathRef.current = null;
        transitionFromPathRef.current = null;
        void endListenSession("abandoned_paused").catch(() => null);
        el.removeAttribute("src");
        el.load();
        if (secondary) {
          secondary.removeAttribute("src");
          secondary.load();
        }
        setCurrentTime(0);
        setDuration(0);
      }

      setPaused(true);
      return;
    }

    const path = playingFile.path;
    const src = convertFileSrc(path);
    const needsLoad = primaryPathRef.current !== path;

    if (needsLoad) {
      lastPlaybackPersistRef.current = 0;
      if (phaseRef.current === "overlapping") {
        abortCrossfade("user-skip");
      } else {
        abortCrossfade("preload-cancel");
      }
      void (async () => {
        if (primaryPathRef.current) {
          await endListenSession(takePendingListenEndReason());
        }
        pushSessionRecent(playingFile);
        const key = musicTrackIdentityKey(playingFile, primaryArtist);
        await beginListenSession(playingFile, "main", {
          wasLiked: musicLikedKeys.includes(key),
        });
      })();

      el.pause();
      releaseAnalyserGraph(el, true);
      el.src = src;
      el.load();
      primaryPathRef.current = path;
      transitionFromPathRef.current = null;
      primaryGainRef.current = 1;
      setCurrentTime(0);
      setDuration(0);
      void applyAudioOutputSink(el);
      applyElOutput(el, 1);
      setAudioEl(el);
    }

    el.loop = loopMode === "one";
    el.playbackRate = playbackSpeed;

    const resume = musicPlayerResume;
    if (needsLoad) {
      if (resume) {
        pendingResumeRef.current = {
          currentTime: Math.max(0, resume.currentTime),
          paused: resume.paused,
          playbackSpeed: resume.playbackSpeed,
        };
        clearMusicPlayerResume();
      } else {
        pendingResumeRef.current = null;
      }

      const onResumeMetadata = () => {
        tryApplyPendingResume(el);
      };
      el.addEventListener("loadedmetadata", onResumeMetadata, { once: true });
      queueMicrotask(() => tryApplyPendingResume(el));

      if (!resume) {
        void el.play()
          .then(() => setPaused(false))
          .catch(() => setPaused(true));
      }
    } else {
      applyPrimaryOutput();
    }
  }, [
    playingFile?.path,
    musicPlayerResume,
    clearMusicPlayerResume,
    loopMode,
    playbackSpeed,
    pushSessionRecent,
    playingFile,
    musicLikedKeys,
    activityOwner,
    abortCrossfade,
    applyElOutput,
    applyPrimaryOutput,
    getPrimary,
    getSecondary,
    mediaEpoch,
    tryApplyPendingResume,
  ]);

  useEffect(() => {
    syncAudioElState();
  }, [mediaEpoch, syncAudioElState]);

  useEffect(() => {
    applyPrimaryOutput();
    if (phaseRef.current === "overlapping") {
      applyElOutput(outgoingElRef.current, secondaryGainRef.current);
    }
  }, [volume, isMuted, applyPrimaryOutput, applyElOutput]);

  useEffect(() => {
    const el = getPrimary();
    if (!el) return;
    el.loop = loopMode === "one";
    if (loopMode === "one") abortCrossfade("loop-one");
  }, [loopMode, getPrimary, abortCrossfade]);

  useEffect(() => {
    const el = getPrimary();
    if (!el) return;
    el.playbackRate = playbackSpeed;
    const sec = getSecondary();
    if (sec && phaseRef.current !== "idle") sec.playbackRate = playbackSpeed;
  }, [playbackSpeed, getPrimary, getSecondary]);

  const togglePlay = useCallback(() => {
    scrubGenerationRef.current += 1;
    isDraggingRef.current = false;
    const el = getPrimary();
    if (!el) return;

    if (el.paused) {
      reconnectAnalyserPlaybackRoute(el);
      if (phaseRef.current === "overlapping" && rampPausedElapsedRef.current != null) {
        rampStartMsRef.current = performance.now() - rampPausedElapsedRef.current;
        rampPausedElapsedRef.current = null;
        const outgoing = outgoingElRef.current;
        void outgoing?.play().catch(() => {});
        startRampLoop();
      }
      applyPrimaryOutput();
      void el.play().then(() => setPaused(false)).catch(() => setPaused(true));
    } else {
      if (phaseRef.current === "overlapping") {
        stopRampLoop();
        rampPausedElapsedRef.current = performance.now() - rampStartMsRef.current;
        outgoingElRef.current?.pause();
      }
      el.pause();
      setPaused(true);
    }
  }, [applyPrimaryOutput, getPrimary, startRampLoop, stopRampLoop]);

  const seek = useCallback((seconds: number) => {
    const el = getPrimary();
    if (!el) return;
    if (phaseRef.current !== "idle") abortCrossfade("user-seek");
    el.currentTime = seconds;
    setCurrentTime(seconds);
  }, [abortCrossfade, getPrimary]);

  const skipBySeconds = useCallback((delta: number) => {
    const el = getPrimary();
    if (!el) return;
    if (phaseRef.current !== "idle") abortCrossfade("user-seek");
    const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
    const next = Math.max(0, Math.min(max || 0, el.currentTime + delta));
    el.currentTime = next;
    setCurrentTime(next);
  }, [abortCrossfade, duration, getPrimary]);

  const beginScrub = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const releaseScrub = useCallback((seconds: number) => {
    const el = getPrimary();
    const finishDrag = () => {
      isDraggingRef.current = false;
    };
    if (!el) {
      finishDrag();
      return;
    }

    if (phaseRef.current !== "idle") abortCrossfade("user-seek");

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
  }, [abortCrossfade, duration, getPrimary]);

  useEffect(() => {
    const clearStuckDrag = () => {
      scrubGenerationRef.current += 1;
      isDraggingRef.current = false;
      const el = getPrimary();
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
  }, [getPrimary]);

  const skipPrev = useCallback(() => {
    if (!playingFile) return;
    const el = getPrimary();
    if (el && el.currentTime > 3) {
      if (phaseRef.current !== "idle") abortCrossfade("user-seek");
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
      abortCrossfade("user-skip");
      noteIslandSkipDir(-1);
      if (playingFromManualQueue) {
        clearManualQueuePlayingState();
      }
      setPendingListenEndReason("skipped");
      handlePlayFolderNeighbor(prev);
    }
  }, [
    playingFile,
    playlistIndex,
    effectivePlaylist,
    manualQueue,
    playingFromManualQueue,
    manualQueueContextIndex,
    advanceLoopOpts,
    handlePlayFolderNeighbor,
    clearManualQueuePlayingState,
    getPrimary,
    abortCrossfade,
  ]);

  const skipNext = useCallback(() => {
    if (!playingFile) return;
    const advanceState = {
      manualQueue,
      effectivePlaylist,
      playlistIndex,
      playingFromManualQueue,
      manualQueueContextIndex,
    };

    const resolveFromLibrary = (path: string): MediaFile | null => {
      return effectivePlaylist.find((f) => f.path === path) ?? null;
    };

    const result = resolveMusicNextTrack(advanceState, resolveFromLibrary, advanceLoopOpts);
    if (!result) return;

    abortCrossfade("user-skip");
    noteIslandSkipDir(1);
    if (result.playingFromManualQueue) {
      applyManualQueueAdvance(result.manualQueueContextIndex);
    } else {
      clearManualQueuePlayingState();
    }

    setPendingListenEndReason("skipped");
    handlePlayFolderNeighbor(result.file);
  }, [
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
    abortCrossfade,
  ]);

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
    if (phaseRef.current === "overlapping") {
      const outgoing = outgoingElRef.current;
      if (outgoing) {
        outgoing.pause();
        releaseAnalyserGraph(outgoing, true);
      }
      return;
    }
    if (phaseRef.current === "preloading" && pendingRef.current) {
      const pending = pendingRef.current;
      if (secondaryReadyRef.current || (getSecondary() && elReady(getSecondary()!))) {
        secondaryReadyRef.current = true;
        void commitCrossfade(pending);
        return;
      }
      abortCrossfade("preload-cancel");
    }

    if (loopMode === "one" || !playingFile) return;
    const fromPath = primaryPathRef.current ?? playingFile.path;
    if (transitionFromPathRef.current === fromPath) return;
    transitionFromPathRef.current = fromPath;
    abortCrossfade("preload-cancel");
    await flushListenSessionAccum(true);
    const advanceState = {
      manualQueue,
      effectivePlaylist,
      playlistIndex,
      playingFromManualQueue,
      manualQueueContextIndex,
    };

    const resolveFromPlaylist = (path: string): MediaFile | null =>
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
    abortCrossfade,
    commitCrossfade,
    getSecondary,
  ]);

  useEffect(() => {
    const el = getPrimary();
    if (!el) return;

    const writeSessionFromMedia = (media: HTMLAudioElement, pausedNow: boolean) => {
      const file = playingFileRef.current;
      if (!file) return;
      writeMusicPlaybackSession({
        path: file.path,
        paused: pausedNow,
        currentTime: media.currentTime,
        playbackSpeed: playbackSpeedRef.current,
      });
    };

    const persistPlaybackSnapshot = (media: HTMLAudioElement, pausedNow: boolean) => {
      const file = playingFileRef.current;
      if (!file || !Number.isFinite(media.duration) || media.duration <= 0) return;
      if (pausedNow) {
        writeSessionFromMedia(media, true);
        return;
      }
      const now = Date.now();
      if (now - lastPlaybackPersistRef.current <= 4000) return;
      lastPlaybackPersistRef.current = now;
      const t = media.currentTime;
      if (t <= 0.5) return;
      writeSessionFromMedia(media, false);
    };

    const onTimeUpdate = (ev: Event) => {
      if (ev.target !== el || el !== getPrimary()) return;
      if (!isDraggingRef.current) setCurrentTime(el.currentTime);
      if (!el.paused && playingFileRef.current) {
        tickListenAccumulator();
        void onListenTimeUpdateTick();
        persistPlaybackSnapshot(el, false);
      } else {
        pauseListenAccumulator();
      }
      armOrTickCrossfade();
    };

    const onLoadedMetadata = () => {
      setDuration(el.duration);
      tryApplyPendingResume(el);
    };
    const onPlay = () => {
      setPaused(false);
      persistPlaybackSnapshot(el, false);
    };
    const onPause = () => {
      if (phaseRef.current === "overlapping" && outgoingElRef.current && !outgoingElRef.current.paused) {
        return;
      }
      setPaused(true);
      persistPlaybackSnapshot(el, true);
    };
    const onEnded = () => {
      void handleEnded();
    };

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
  }, [getPrimary, handleEnded, armOrTickCrossfade, primaryIsA, playingFile?.path, tryApplyPendingResume]);

  useEffect(() => {
    const flushSession = () => {
      const file = playingFileRef.current;
      const media = getPrimary();
      if (!file || !media) return;
      writeMusicPlaybackSession({
        path: file.path,
        paused: media.paused,
        currentTime: media.currentTime,
        playbackSpeed: playbackSpeedRef.current,
      });
    };
    window.addEventListener("pagehide", flushSession);
    window.addEventListener("beforeunload", flushSession);
    return () => {
      window.removeEventListener("pagehide", flushSession);
      window.removeEventListener("beforeunload", flushSession);
      stopRampLoop();
    };
  }, [getPrimary, stopRampLoop]);

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
    audioEl,
    crossfadeSec,
    setCrossfadeSec,
  };
}
