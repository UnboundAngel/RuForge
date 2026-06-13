import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { applyMediaOutputState } from "@/applyMediaOutputState";
import { bestCoverPath } from "@/mediaKind";
import type { MediaFile } from "@/types";
import { emitActivityHandoffSync } from "@/lib/activityHandoffSync";
import type { PlayInMusicMiniPayload } from "@/playerHandoff";
import { writePlaybackPos } from "@/playbackStorage";
import {
  hasMusicNextTrack,
  hasMusicPrevTrack,
  resolveMusicNextTrack,
  resolveMusicPrevTrack,
  type MusicAdvanceState,
} from "@/components/music/musicAdvanceQueue";
import { MUSIC_MINI_VOLUME_KEY } from "./musicMiniConstants";
import {
  beginListenSession,
  endListenSession,
  flushListenSessionAccum,
  onListenTimeUpdateTick,
  pauseListenAccumulator,
  setPendingListenEndReason,
  stageHandoffListenEventId,
  takePendingListenEndReason,
  tickListenAccumulator,
} from "@/lib/musicListenSession";

export type TrackDirection = "next" | "prev" | null;

export interface CoverLayer {
  id: number;
  file: MediaFile;
  coverSrc: string | null;
  dir: TrackDirection;
}

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(MUSIC_MINI_VOLUME_KEY);
    const n = raw ? parseFloat(raw) : NaN;
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
  } catch {
    return 1;
  }
}

function writeStoredVolume(v: number) {
  try {
    localStorage.setItem(MUSIC_MINI_VOLUME_KEY, String(Math.max(0, Math.min(1, v))));
  } catch {
    /* quota */
  }
}

export function coverSrcFor(file: MediaFile): string | null {
  const p = bestCoverPath(file);
  return p ? convertFileSrc(p) : null;
}

const LAYER_PRUNE_MS = 760;

/** Drop exited crossfade layers; keep the layer for `keepId`, or the newest layer if stale. */
function pruneCoverLayers(prev: CoverLayer[], keepId: number): CoverLayer[] {
  const kept = prev.find((l) => l.id === keepId);
  if (kept) return [kept];
  return prev.length > 0 ? [prev[prev.length - 1]!] : prev;
}

function beginAtTime(
  el: HTMLAudioElement,
  startTime: number,
  shouldPause: boolean,
  onReady: (paused: boolean) => void,
) {
  const dur = el.duration;
  const t = Number.isFinite(startTime) ? Math.max(0, startTime) : 0;
  const target = isFinite(dur) && dur > 0 ? Math.min(t, dur) : t;

  const startPlayback = () => {
    if (shouldPause) {
      el.pause();
      onReady(true);
    } else {
      void el
        .play()
        .then(() => onReady(false))
        .catch(() => onReady(true));
    }
  };

  if (target <= 0.05) {
    el.currentTime = 0;
    startPlayback();
    return;
  }

  const onSeeked = () => {
    el.removeEventListener("seeked", onSeeked);
    startPlayback();
  };
  el.addEventListener("seeked", onSeeked);
  el.currentTime = target;
  if (Math.abs(el.currentTime - target) < 0.05) {
    el.removeEventListener("seeked", onSeeked);
    startPlayback();
  }
}

export function useMusicMiniPlayback() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingFile, setPlayingFile] = useState<MediaFile | null>(null);
  const [effectivePlaylist, setEffectivePlaylist] = useState<MediaFile[]>([]);
  const [playlistIndex, setPlaylistIndex] = useState(0);
  const [manualQueue, setManualQueue] = useState<string[]>([]);
  const [playingFromManualQueue, setPlayingFromManualQueue] = useState(false);
  const [manualQueueContextIndex, setManualQueueContextIndex] = useState<number | null>(null);
  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [shuffled, setShuffled] = useState(false);
  const [direction, setDirection] = useState<TrackDirection>(null);
  const [volume, setVolume] = useState(readStoredVolume);
  const [muted, setMuted] = useState(false);
  const [layers, setLayers] = useState<CoverLayer[]>([]);
  const layerIdRef = useRef(0);
  const layerPruneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedPathRef = useRef<string | null>(null);

  const advanceState: MusicAdvanceState = {
    manualQueue,
    effectivePlaylist,
    playlistIndex,
    playingFromManualQueue,
    manualQueueContextIndex,
  };

  const resolveFromPlaylist = useCallback(
    (path: string): MediaFile | null => effectivePlaylist.find((f) => f.path === path) ?? null,
    [effectivePlaylist],
  );

  const loadFile = useCallback(
    (
      file: MediaFile,
      startTime: number,
      shouldPause: boolean,
      playbackSpeed: number,
      dir: TrackDirection,
      advance?: {
        playingFromManualQueue: boolean;
        manualQueue: string[];
        manualQueueContextIndex: number | null;
        playlistIndex: number;
      },
    ) => {
      const el = audioRef.current;
      if (!el) return;
      setDirection(dir);
      setPlayingFile(file);
      if (advance) {
        setPlayingFromManualQueue(advance.playingFromManualQueue);
        setManualQueue(advance.manualQueue);
        setManualQueueContextIndex(advance.manualQueueContextIndex);
        setPlaylistIndex(advance.playlistIndex);
      }
      const id = layerIdRef.current++;
      const coverSrc = coverSrcFor(file);
      if (layerPruneTimerRef.current) {
        clearTimeout(layerPruneTimerRef.current);
        layerPruneTimerRef.current = null;
      }
      setLayers((prev) => [...prev, { id, file, coverSrc, dir }]);
      layerPruneTimerRef.current = window.setTimeout(() => {
        setLayers((prev) => pruneCoverLayers(prev, id));
        layerPruneTimerRef.current = null;
      }, LAYER_PRUNE_MS);

      const path = file.path;
      const needsLoad = loadedPathRef.current !== path;
      emitActivityHandoffSync("music-mini", file, startTime, shouldPause);
      if (needsLoad) {
        el.pause();
        el.src = convertFileSrc(path);
        el.load();
        loadedPathRef.current = path;
        setCurrentTime(0);
        setDuration(0);
        void (async () => {
          await endListenSession(takePendingListenEndReason());
          await beginListenSession(file, "music_mini");
        })();
      }
      el.playbackRate = playbackSpeed;
      applyMediaOutputState(el, volume, muted);
      el.loop = isLooping;

      const applyStart = () => {
        setDuration(el.duration || 0);
        beginAtTime(el, startTime, shouldPause, (isPaused) => {
          setCurrentTime(el.currentTime);
          setPaused(isPaused);
        });
      };

      if (el.readyState >= 1) applyStart();
      else el.addEventListener("loadedmetadata", applyStart, { once: true });
    },
    [volume, muted, isLooping],
  );

  const applyHandoff = useCallback(
    (payload: PlayInMusicMiniPayload) => {
      const snapshot = payload.queueSnapshot?.length ? payload.queueSnapshot : [payload.file];
      const idx =
        payload.queueIndex !== undefined && payload.queueIndex >= 0
          ? payload.queueIndex
          : snapshot.findIndex((f) => f.path === payload.file.path);
      setEffectivePlaylist(snapshot);
      setPlaylistIndex(idx >= 0 ? idx : 0);
      setManualQueue(payload.manualQueue ?? []);
      setPlayingFromManualQueue(payload.playingFromManualQueue ?? false);
      setManualQueueContextIndex(payload.manualQueueContextIndex ?? null);
      setIsLooping(payload.isLooping ?? false);
      if (typeof payload.volume === "number") {
        setVolume(payload.volume);
        writeStoredVolume(payload.volume);
      }
      if (typeof payload.muted === "boolean") setMuted(payload.muted);
      if (payload.listenEventId) {
        stageHandoffListenEventId(payload.listenEventId);
      }
      loadFile(
        payload.file,
        payload.startTime,
        payload.paused ?? false,
        payload.playbackSpeed ?? 1,
        null,
      );
    },
    [loadFile],
  );

  useEffect(() => () => {
    if (layerPruneTimerRef.current) {
      clearTimeout(layerPruneTimerRef.current);
      layerPruneTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    void emit("music-mini-ready");
    const unlistenPlay = listen<PlayInMusicMiniPayload>("play-in-music-mini", (e) => {
      applyHandoff(e.payload);
    });
    const unlistenStop = listen("stop-music-mini-playback", () => {
      void (async () => {
        await endListenSession("abandoned_paused");
        const el = audioRef.current;
        if (el) {
          el.pause();
          el.removeAttribute("src");
          el.load();
        }
        loadedPathRef.current = null;
        setPlayingFile(null);
        setLayers([]);
        if (layerPruneTimerRef.current) {
          clearTimeout(layerPruneTimerRef.current);
          layerPruneTimerRef.current = null;
        }
        setEffectivePlaylist([]);
        setPlaylistIndex(0);
        setManualQueue([]);
        setPlayingFromManualQueue(false);
        setManualQueueContextIndex(null);
        setPaused(true);
        setCurrentTime(0);
        setDuration(0);
      })();
    });
    return () => {
      void unlistenPlay.then((f) => f());
      void unlistenStop.then((f) => f());
    };
  }, [applyHandoff]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    applyMediaOutputState(el, volume, muted);
    writeStoredVolume(volume);
  }, [volume, muted]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.loop = isLooping;
  }, [isLooping]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !playingFile) return;

    const onTime = () => {
      setCurrentTime(el.currentTime);
      if (!el.paused && playingFile) {
        tickListenAccumulator();
        void onListenTimeUpdateTick();
      } else {
        pauseListenAccumulator();
      }
    };
    const onMeta = () => setDuration(el.duration || 0);
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onEnded = () => {
      void (async () => {
        if (isLooping) return;
        await flushListenSessionAccum(true);
        const state: MusicAdvanceState = {
          manualQueue,
          effectivePlaylist,
          playlistIndex,
          playingFromManualQueue,
          manualQueueContextIndex,
        };
        const result = resolveMusicNextTrack(state, resolveFromPlaylist);
        if (!result) {
          await endListenSession("completed");
          setPlayingFromManualQueue(false);
          setManualQueue([]);
          setManualQueueContextIndex(null);
          setPaused(true);
          return;
        }
        await endListenSession("completed");
        setManualQueue(result.manualQueueAfter);
        setPlayingFromManualQueue(result.playingFromManualQueue);
        setManualQueueContextIndex(result.manualQueueContextIndex);
        if (!result.playingFromManualQueue) {
          const nextIdx = effectivePlaylist.findIndex((f) => f.path === result.file.path);
          if (nextIdx >= 0) setPlaylistIndex(nextIdx);
        }
        setPendingListenEndReason("manual_switch");
        loadFile(result.file, 0, false, el.playbackRate, "next", {
          playingFromManualQueue: result.playingFromManualQueue,
          manualQueue: result.manualQueueAfter,
          manualQueueContextIndex: result.manualQueueContextIndex,
          playlistIndex:
            result.playingFromManualQueue
              ? playlistIndex
              : effectivePlaylist.findIndex((f) => f.path === result.file.path),
        });
      })();
    };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [
    playingFile,
    effectivePlaylist,
    playlistIndex,
    manualQueue,
    playingFromManualQueue,
    manualQueueContextIndex,
    isLooping,
    loadFile,
    resolveFromPlaylist,
  ]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }, []);

  const seekPct = useCallback((pct: number) => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    const t = Math.max(0, Math.min(el.duration, pct * el.duration));
    el.currentTime = t;
    setCurrentTime(t);
  }, []);

  const skipNext = useCallback(() => {
    const el = audioRef.current;
    const shouldPause = el?.paused ?? true;
    const state: MusicAdvanceState = {
      manualQueue,
      effectivePlaylist,
      playlistIndex,
      playingFromManualQueue,
      manualQueueContextIndex,
    };
    const result = resolveMusicNextTrack(state, resolveFromPlaylist);
    if (!result) return;
    setManualQueue(result.manualQueueAfter);
    setPlayingFromManualQueue(result.playingFromManualQueue);
    setManualQueueContextIndex(result.manualQueueContextIndex);
    const nextIdx = result.playingFromManualQueue
      ? playlistIndex
      : effectivePlaylist.findIndex((f) => f.path === result.file.path);
    if (!result.playingFromManualQueue && nextIdx >= 0) setPlaylistIndex(nextIdx);
    void (async () => {
      await endListenSession("skipped");
      setPendingListenEndReason("manual_switch");
      loadFile(result.file, 0, shouldPause, el?.playbackRate ?? 1, "next", {
      playingFromManualQueue: result.playingFromManualQueue,
      manualQueue: result.manualQueueAfter,
      manualQueueContextIndex: result.manualQueueContextIndex,
      playlistIndex: nextIdx >= 0 ? nextIdx : playlistIndex,
    });
    })();
  }, [
    manualQueue,
    effectivePlaylist,
    playlistIndex,
    playingFromManualQueue,
    manualQueueContextIndex,
    loadFile,
    resolveFromPlaylist,
  ]);

  const skipPrev = useCallback(() => {
    const el = audioRef.current;
    const shouldPause = el?.paused ?? true;
    if (el && el.currentTime > 3) {
      el.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const state: MusicAdvanceState = {
      manualQueue,
      effectivePlaylist,
      playlistIndex,
      playingFromManualQueue,
      manualQueueContextIndex,
    };
    const prev = resolveMusicPrevTrack(state);
    if (!prev) return;
    setPlayingFromManualQueue(false);
    const prevIdx = effectivePlaylist.findIndex((f) => f.path === prev.path);
    if (prevIdx >= 0) setPlaylistIndex(prevIdx);
    loadFile(prev, 0, shouldPause, el?.playbackRate ?? 1, "prev", {
      playingFromManualQueue: false,
      manualQueue,
      manualQueueContextIndex,
      playlistIndex: prevIdx >= 0 ? prevIdx : playlistIndex,
    });
  }, [
    manualQueue,
    effectivePlaylist,
    playlistIndex,
    playingFromManualQueue,
    manualQueueContextIndex,
    loadFile,
  ]);

  const toggleLoop = useCallback(() => setIsLooping((l) => !l), []);
  const toggleShuffle = useCallback(() => setShuffled((s) => !s), []);

  const persistPosition = useCallback(() => {
    const el = audioRef.current;
    if (el && playingFile && !el.paused) {
      writePlaybackPos(playingFile.path, el.currentTime, el.duration || duration);
    }
  }, [playingFile, duration]);

  return {
    audioRef,
    playingFile,
    paused,
    currentTime,
    duration,
    isLooping,
    shuffled,
    direction,
    layers,
    volume,
    muted,
    manualQueue,
    playingFromManualQueue,
    manualQueueContextIndex,
    hasPrev: hasMusicPrevTrack(advanceState, currentTime),
    hasNext: hasMusicNextTrack(advanceState),
    togglePlay,
    seekPct,
    skipNext,
    skipPrev,
    toggleLoop,
    toggleShuffle,
    persistPosition,
  };
}
