import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { convertFileSrc } from "@tauri-apps/api/core";

import { emitTo } from "@tauri-apps/api/event";

import { releaseAnalyserGraph } from "@/audioAnalyserGraph";

import { applyMediaOutputState } from "@/applyMediaOutputState";

import {

  chapterAtTime,

  nextChapterIndex,

  normalizeChapters,

  prevChapterIndex,

} from "@/chapters";

import { flattenGalleryScanToMediaFiles } from "@/galleryScan";

import { isAudioOnlyPath } from "@/mediaKind";

import { readPlaybackSpeed, writePlaybackSpeed } from "@/playbackSpeedStorage";

import { useRuforgeStore } from "@/store/ruforgeStore";



type PlaybackState = {

  paused: boolean;

  currentTime: number;

  duration: number;

  playbackSpeed: number;

  setPlaybackSpeed: (speed: number) => void;

  togglePlay: () => void;

  seek: (seconds: number) => void;

  skipBySeconds: (delta: number) => void;

  pauseForScrub: () => boolean;

  resumeAfterScrub: (wasPlaying: boolean) => void;

  skipPrev: () => void;

  skipNext: () => void;

  jumpPrevChapter: () => void;

  jumpNextChapter: () => void;

  hasPrevInQueue: boolean;

  hasNextInQueue: boolean;

  hasChapters: boolean;

  isDraggingRef: React.MutableRefObject<boolean>;

};



/** One hidden `<audio>` in MusicShell; this hook owns load/play/pause/cleanup. */

export function useMusicPlayback(

  audioRef: React.RefObject<HTMLAudioElement | null>,

): PlaybackState {

  const playingFile = useRuforgeStore((s) => s.playingFile);

  const folderAudioPlaylist = useRuforgeStore((s) => s.folderAudioPlaylist);

  const entries = useRuforgeStore((s) => s.entries);

  const volume = useRuforgeStore((s) => s.volume);

  const isMuted = useRuforgeStore((s) => s.isMuted);

  const isLooping = useRuforgeStore((s) => s.isLooping);

  const handlePlayFolderNeighbor = useRuforgeStore((s) => s.handlePlayFolderNeighbor);



  const [paused, setPaused] = useState(true);

  const [currentTime, setCurrentTime] = useState(0);

  const [duration, setDuration] = useState(0);

  const [playbackSpeed, setPlaybackSpeedState] = useState(() => readPlaybackSpeed());

  const isDraggingRef = useRef(false);

  const loadedPathRef = useRef<string | null>(null);



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

    void emitTo("mini", "stop-playback", "main-app").catch(() => null);

    return () => {

      const el = audioRef.current;

      if (el) {

        el.pause();

        releaseAnalyserGraph(el, true);

        el.removeAttribute("src");

        el.load();

      }

    };

  }, [audioRef]);



  useEffect(() => {

    const el = audioRef.current;

    if (!el || !playingFile) {

      loadedPathRef.current = null;

      if (el) {

        el.pause();

        releaseAnalyserGraph(el, true);

      }

      setPaused(true);

      setCurrentTime(0);

      setDuration(0);

      return;

    }



    const path = playingFile.path;

    const src = convertFileSrc(path);

    const needsLoad = loadedPathRef.current !== path;



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

    el.loop = isLooping;

    el.playbackRate = playbackSpeed;



    if (needsLoad) {

      void el.play()

        .then(() => setPaused(false))

        .catch(() => setPaused(true));

    }

  }, [playingFile?.path, audioRef]);



  useEffect(() => {

    const el = audioRef.current;

    if (!el) return;

    applyMediaOutputState(el, volume, isMuted);

  }, [volume, isMuted, audioRef]);



  useEffect(() => {

    const el = audioRef.current;

    if (!el) return;

    el.loop = isLooping;

  }, [isLooping, audioRef]);



  useEffect(() => {

    const el = audioRef.current;

    if (!el) return;

    el.playbackRate = playbackSpeed;

  }, [playbackSpeed, audioRef]);



  const togglePlay = useCallback(() => {

    const el = audioRef.current;

    if (!el) return;

    if (el.paused) {

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



  const pauseForScrub = useCallback(() => {

    const el = audioRef.current;

    if (!el) return false;

    const wasPlaying = !el.paused;

    if (wasPlaying) el.pause();

    return wasPlaying;

  }, [audioRef]);



  const resumeAfterScrub = useCallback((wasPlaying: boolean) => {

    if (!wasPlaying) return;

    const el = audioRef.current;

    if (!el) return;

    void el.play().then(() => setPaused(false)).catch(() => setPaused(true));

  }, [audioRef]);



  const skipPrev = useCallback(() => {

    if (!playingFile) return;

    const el = audioRef.current;

    if (el && el.currentTime > 3) {

      el.currentTime = 0;

      setCurrentTime(0);

      return;

    }

    if (playlistIndex > 0) {

      handlePlayFolderNeighbor(effectivePlaylist[playlistIndex - 1]);

    }

  }, [playingFile, playlistIndex, effectivePlaylist, handlePlayFolderNeighbor, audioRef]);



  const skipNext = useCallback(() => {

    if (!playingFile) return;

    if (playlistIndex >= 0 && playlistIndex < effectivePlaylist.length - 1) {

      handlePlayFolderNeighbor(effectivePlaylist[playlistIndex + 1]);

    }

  }, [playingFile, playlistIndex, effectivePlaylist, handlePlayFolderNeighbor]);



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



  const handleEnded = useCallback(() => {

    if (isLooping || !playingFile) return;

    if (playlistIndex >= 0 && playlistIndex < effectivePlaylist.length - 1) {

      handlePlayFolderNeighbor(effectivePlaylist[playlistIndex + 1]);

    } else {

      setPaused(true);

    }

  }, [isLooping, playingFile, playlistIndex, effectivePlaylist, handlePlayFolderNeighbor]);



  useEffect(() => {

    const el = audioRef.current;

    if (!el) return;



    const onTimeUpdate = () => {

      if (!isDraggingRef.current) setCurrentTime(el.currentTime);

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

  }, [audioRef, playingFile?.path, handleEnded]);



  return {

    paused,

    currentTime,

    duration,

    playbackSpeed,

    setPlaybackSpeed,

    togglePlay,

    seek,

    skipBySeconds,

    pauseForScrub,

    resumeAfterScrub,

    skipPrev,

    skipNext,

    jumpPrevChapter,

    jumpNextChapter,

    hasPrevInQueue: playlistIndex > 0,

    hasNextInQueue: playlistIndex >= 0 && playlistIndex < effectivePlaylist.length - 1,

    hasChapters: !!(chapters && chapters.length >= 2),

    isDraggingRef,

  };

}


