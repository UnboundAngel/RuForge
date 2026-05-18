import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icon } from "@iconify/react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
// @ts-ignore
import { openPath } from "@tauri-apps/plugin-opener";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize2,
  Minimize2,
  ArrowLeft,
  Music,
  Speaker,
  SkipBack,
  SkipForward,
  X,
  Video,
  Layers,
} from "lucide-react";
import { type FfprobeHint, type MediaFile } from "../types";
import { ScrubberHoverThumb } from "../scrubSpritePreview";
import { readResumeSeconds, writePlaybackPos } from "../playbackStorage";
import { readPlaybackSpeed, writePlaybackSpeed } from "../playbackSpeedStorage";
import { useVideoAmbientBackdrop } from "../useVideoAmbientBackdrop";
import {
  readAudioAutoAdvanceFolder,
  readAudioPrefetchNext,
} from "../audioPlaybackPrefs";
import { isAudioOnlyPath } from "../mediaKind";
import { fetchSubtitleTracks, revokeSubtitleBlobSrcs, subtitleTracksWithBlobSrc, syncVideoTextTrackModes, type SubtitleTrack } from "../localVideoSubtitles";
import { useRuforgeStore } from "../store/ruforgeStore";
import { useSubtitleCueOverlay } from "../useSubtitleCueOverlay";

const SpeedIcon = ({ speed, className = "" }: { speed: number; className?: string }) => {
  const speedToAngle: Record<number, number> = {
    0.25: -90, 0.5: -60, 0.75: -30, 1: 0, 1.25: 30, 1.5: 60, 1.75: 90, 2: 120
  };
  const angle = speedToAngle[speed] || 0;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" className={className}>
      <path fill="currentColor" opacity="0.4" d="m20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1a10 10 0 0 0-.27-10.44z"/>
      <path 
        fill="currentColor" 
        d="M10.59 15.41a2 2 0 0 0 2.83 0l5.66-8.49l-8.49 5.66a2 2 0 0 0 0 2.83"
        style={{ 
          transform: `rotate(${-45 + angle}deg)`,
          transformOrigin: '12px 14px',
          transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}
      />
    </svg>
  );
};

const Tooltip = ({ text, children, side = "bottom", className = "" }: { text: string; children: React.ReactNode; side?: "bottom" | "top"; className?: string }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div className={`relative flex flex-col items-center ${className}`} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      {children}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: side === "bottom" ? 10 : -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: side === "bottom" ? 10 : -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`absolute ${side === "bottom" ? "bottom-full mb-3" : "top-full mt-3"} px-3 py-1.5 bg-stone-950/95 backdrop-blur-xl border border-white/10 rounded-xl text-[10px] font-black tracking-widest text-white uppercase whitespace-nowrap z-[100] shadow-2xl shadow-black pointer-events-none left-1/2 -translate-x-1/2`}
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface PlayerViewProps {
  onSubtitleToggle?: (enabled: boolean) => void;
  onBack: () => void;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export type PlayerViewHandle = {
  getCurrentTime: () => number;
  getIsPaused: () => boolean;
};

const PlayerViewWithFile = forwardRef<PlayerViewHandle, PlayerViewProps & { file: MediaFile }>(function PlayerViewWithFile(
  { file, onSubtitleToggle, onBack },
  ref,
) {
  const galleryEntries = useRuforgeStore((s) => s.entries);
  const audioLibrarySorted = useMemo(
    () =>
      galleryEntries
        .flatMap((e) => (e.kind === "media" ? [e] : e.items))
        .filter((f) => isAudioOnlyPath(f.path))
        .sort((a, b) =>
          a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }),
        ),
    [galleryEntries],
  );

  const videoLibrarySorted = useMemo(
    () =>
      galleryEntries
        .flatMap((e) => (e.kind === "media" ? [e] : e.items))
        .filter((f) => !isAudioOnlyPath(f.path))
        .sort((a, b) =>
          a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }),
        ),
    [galleryEntries],
  );

  const folderAudioPlaylist = useRuforgeStore((s) => s.folderAudioPlaylist);
  const volume = useRuforgeStore((s) => s.volume);
  const isMuted = useRuforgeStore((s) => s.isMuted);
  const isLooping = useRuforgeStore((s) => s.isLooping);
  const setVolume = useRuforgeStore((s) => s.setVolume);
  const setMuted = useRuforgeStore((s) => s.setMuted);
  const setLooping = useRuforgeStore((s) => s.setLooping);
  const setPlayingFile = useRuforgeStore((s) => s.setPlayingFile);
  const handlePopOutFromStore = useRuforgeStore((s) => s.handlePopOut);
  const playerResumeAt = useRuforgeStore((s) => s.playerResumeAt);
  const clearPlayerResumeAt = useRuforgeStore((s) => s.clearPlayerResumeAt);

  const subtitlePreferredLang = useRuforgeStore((s) =>
    typeof s.settings.subtitlePreferredLang === "string" ? s.settings.subtitlePreferredLang : null,
  );
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const audioOnly = isAudioOnlyPath(file.path);
  const mediaRef = useRef<HTMLMediaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  useImperativeHandle(ref, () => ({
    getCurrentTime: () => mediaRef.current?.currentTime ?? 0,
    getIsPaused: () => mediaRef.current?.paused ?? true,
  }));
  const [showControls, setShowControls] = useState(true);
  const [showVolume, setShowVolume] = useState(false);
  const [scrubberHoverPos, setScrubberHoverPos] = useState(0);
  const [isHoveringScrubber, setIsHoveringScrubber] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubDragPercent, setScrubDragPercent] = useState<number | null>(null);
  const [scrubberThumbs, setScrubberThumbs] = useState<string[]>([]);
  const [isPressing, setIsPressing] = useState<"left" | "right" | null>(null);
  const [previousSpeed, setPreviousSpeed] = useState(1);
  const pressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockClickRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  /** Blocks `timeupdate` from snapping the scrub thumb while a seek is in flight. */
  const isUserSeekingRef = useRef(false);
  const lastPlaybackPersistRef = useRef(0);
  const progressRafRef = useRef<number | null>(null);
  /** Avoid re-seeking on repeat `loadedmetadata` while the same file keeps playing. */
  const resumeSeekAppliedPathRef = useRef<string | null>(null);

  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const subtitleBlobTracksRef = useRef<SubtitleTrack[]>([]);
  const [selectedSubtitleLang, setSelectedSubtitleLang] = useState("");
  const [isSubtitlesEnabled, setIsSubtitlesEnabled] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);

  const ambientCanvasRef = useRef<HTMLCanvasElement>(null);
  const subtitleOverlayTextRef = useRef<HTMLDivElement>(null);
  const subtitleDragRowRef = useRef<HTMLDivElement>(null);
  const [mediaBlendOpacity, setMediaBlendOpacity] = useState(1);
  const prevVideoPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (audioOnly) {
      prevVideoPathRef.current = file.path;
      setMediaBlendOpacity(1);
      return;
    }
    const p = file.path;
    if (prevVideoPathRef.current === null) {
      prevVideoPathRef.current = p;
      setMediaBlendOpacity(1);
      return;
    }
    if (prevVideoPathRef.current === p) {
      setMediaBlendOpacity(1);
      return;
    }
    prevVideoPathRef.current = p;
    setMediaBlendOpacity(0);
    const id = window.setTimeout(() => setMediaBlendOpacity(1), 70);
    return () => clearTimeout(id);
  }, [file.path, audioOnly]);

  useVideoAmbientBackdrop(
    mediaRef as React.RefObject<HTMLVideoElement | null>,
    ambientCanvasRef,
    !audioOnly,
  );

  useEffect(() => {
    if (!file || audioOnly) {
      setScrubberThumbs([]);
      return;
    }
    invoke<string[]>("extract_frames", { videoPath: file.path })
      .then((paths) =>
        setScrubberThumbs(
          paths.filter((p) => {
            const f = p.replace(/^.*[/\\]/, "");
            return f.startsWith("sprite_") && f.endsWith(".jpg");
          }),
        ),
      )
      .catch(console.error);
  }, [file, audioOnly]);

  /** Warm ffprobe disk cache; results are not shown in the player UI. */
  useEffect(() => {
    void invoke<FfprobeHint>("probe_local_media_ffprobe", {
      mediaPath: file.path,
      forceRefresh: false,
    }).catch(() => {});
  }, [file.path]);

  const subtitlePreferredLangRef = useRef(subtitlePreferredLang);
  subtitlePreferredLangRef.current = subtitlePreferredLang;

  useEffect(() => {
    setShowSubtitleMenu(false);
    if (audioOnly) {
      revokeSubtitleBlobSrcs(subtitleBlobTracksRef.current);
      subtitleBlobTracksRef.current = [];
      setSubtitleTracks([]);
      setIsSubtitlesEnabled(false);
      setSelectedSubtitleLang("");
      return;
    }
    revokeSubtitleBlobSrcs(subtitleBlobTracksRef.current);
    subtitleBlobTracksRef.current = [];
    let cancelled = false;
    fetchSubtitleTracks(file.path)
      .then((raw) => subtitleTracksWithBlobSrc(raw))
      .then((tracks) => {
        if (cancelled) {
          revokeSubtitleBlobSrcs(tracks);
          return;
        }
        subtitleBlobTracksRef.current = tracks;
        setSubtitleTracks(tracks);
        const pref = subtitlePreferredLangRef.current?.trim() || null;
        const found = pref ? tracks.find((t) => t.lang === pref) : undefined;
        if (pref && found) {
          setSelectedSubtitleLang(found.lang);
          setIsSubtitlesEnabled(true);
        } else {
          setIsSubtitlesEnabled(false);
          setSelectedSubtitleLang(tracks[0]?.lang ?? "");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSubtitleTracks([]);
          setIsSubtitlesEnabled(false);
          setSelectedSubtitleLang("");
        }
      });
    return () => {
      cancelled = true;
      revokeSubtitleBlobSrcs(subtitleBlobTracksRef.current);
      subtitleBlobTracksRef.current = [];
    };
  }, [file.path, audioOnly]);

  useEffect(() => {
    if (audioOnly) return;
    const v = mediaRef.current as HTMLVideoElement | null;
    if (!v) return;
    const apply = () => syncVideoTextTrackModes(v, isSubtitlesEnabled, selectedSubtitleLang);
    apply();
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [audioOnly, file.path, isSubtitlesEnabled, selectedSubtitleLang, subtitleTracks]);

  useSubtitleCueOverlay({
    videoRef: mediaRef as React.RefObject<HTMLVideoElement | null>,
    textElRef: subtitleOverlayTextRef,
    dragRowRef: subtitleDragRowRef,
    layoutLimitRef: scrubberRef,
    layoutContainerRef: containerRef,
    inactive: audioOnly,
    captionsEnabled: isSubtitlesEnabled,
    selectedLang: selectedSubtitleLang,
    filePath: file.path,
    subtitleTracks,
  });

  useEffect(() => {
    lastPlaybackPersistRef.current = 0;
    resumeSeekAppliedPathRef.current = null;
  }, [file.path, playerResumeAt]);

  useEffect(() => {
    return () => {
      if (progressRafRef.current != null) {
        cancelAnimationFrame(progressRafRef.current);
        progressRafRef.current = null;
      }
    };
  }, []);

  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [playbackSpeed, setPlaybackSpeedState] = useState(() => readPlaybackSpeed());
  const setPlaybackSpeed = (speed: number) => {
    writePlaybackSpeed(speed);
    setPlaybackSpeedState(speed);
  };
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [clickFlash, setClickFlash] = useState<"play" | "pause" | null>(null);
  const [skipFlash, setSkipFlash] = useState<{ side: "left" | "right"; amount: number } | null>(null);
  const skipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync volume/mute/loop from store to <video> / <audio> (store actions persist flat LS for MiniPlayer)
  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.volume = volume;
      mediaRef.current.muted = isMuted;
      mediaRef.current.loop = isLooping;
    }
  }, [volume, isMuted, isLooping]);

  // Sync playback speed (preservesPitch reduces time-stretch artifacts when rate ≠ 1)
  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.preservesPitch = true;
      mediaRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Fullscreen change listener
  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFSChange);
    return () => document.removeEventListener("fullscreenchange", onFSChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(10);
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(-10);
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
          const next = !useRuforgeStore.getState().isMuted;
          setMuted(next);
          setShowVolume(true);
          if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
          volumeTimeoutRef.current = setTimeout(() => setShowVolume(false), 2000);
          break;
        }
        case "KeyF":
          toggleFullscreen();
          break;
        case "KeyL": {
          const l = useRuforgeStore.getState().isLooping;
          setLooping(!l);
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, isPaused]);

  const togglePlay = useCallback(() => {
    if (blockClickRef.current) {
      blockClickRef.current = false;
      return;
    }
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) {
      media.play();
      setIsPaused(false);
      setClickFlash("play");
    } else {
      media.pause();
      setIsPaused(true);
      setClickFlash("pause");
      writePlaybackPos(file.path, media.currentTime, media.duration);
    }
    setTimeout(() => setClickFlash(null), 500);
  }, [file.path]);

  const handlePlaybackEnded = useCallback(() => {
    if (isLooping) return;
    const m = mediaRef.current;
    if (m && isFinite(m.duration) && m.duration > 0) {
      writePlaybackPos(file.path, m.duration, m.duration);
    }
    if (!readAudioAutoAdvanceFolder()) {
      setIsPaused(true);
      return;
    }
    const idx = folderAudioPlaylist.findIndex((f) => f.path === file.path);
    const folderNeighbor =
      idx >= 0 && idx < folderAudioPlaylist.length - 1 ? folderAudioPlaylist[idx + 1] : null;
    if (folderNeighbor) {
      setPlayingFile(folderNeighbor);
      return;
    }
    const libList = audioOnly ? audioLibrarySorted : videoLibrarySorted;
    const li = libList.findIndex((f) => f.path === file.path);
    const libNext = li >= 0 && li < libList.length - 1 ? libList[li + 1] : null;
    if (libNext) {
      setPlayingFile(libNext);
      return;
    }
    setIsPaused(true);
  }, [
    isLooping,
    file.path,
    audioOnly,
    folderAudioPlaylist,
    audioLibrarySorted,
    videoLibrarySorted,
    setPlayingFile,
  ]);

  const skip = (seconds: number) => {
    const vid = mediaRef.current;
    if (!vid || !isFinite(vid.duration) || vid.duration <= 0) return;
    const next = Math.min(vid.duration, Math.max(0, vid.currentTime + seconds));
    applyScrubPosition(next / vid.duration, { persist: true });
    setSkipFlash({ side: seconds > 0 ? "right" : "left", amount: Math.abs(seconds) });
    if (skipTimeoutRef.current) clearTimeout(skipTimeoutRef.current);
    skipTimeoutRef.current = setTimeout(() => setSkipFlash(null), 600);
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    if (v > 0 && isMuted) setMuted(false);

    setShowVolume(true);
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(() => setShowVolume(false), 2000);
  };

  const handleAuxClickMute = (e: React.MouseEvent) => {
    if (e.button !== 1 || !mediaRef.current) return;
    e.preventDefault();
    const nextMuted = !mediaRef.current.muted;
    mediaRef.current.muted = nextMuted;
    setMuted(nextMuted);
    setShowVolume(true);
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(() => setShowVolume(false), 2000);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const side = x > rect.width / 2 ? "right" : "left";
    
    pressTimeout.current = setTimeout(() => {
      setIsPressing(side);
      setPreviousSpeed(playbackSpeed);
      setPlaybackSpeed(side === "right" ? 2 : 0.5);
    }, 500);
  };

  const handleMouseUp = () => {
    if (pressTimeout.current) {
      clearTimeout(pressTimeout.current);
      pressTimeout.current = null;
    }
    if (isPressing) {
      setPlaybackSpeed(previousSpeed);
      setIsPressing(null);
      blockClickRef.current = true;
      // Safety reset in case click event doesn't fire for some reason
      setTimeout(() => { blockClickRef.current = false; }, 50);
    }
  };

  const handlePopOut = () => {
    const media = mediaRef.current;
    if (media) {
      writePlaybackPos(file.path, media.currentTime, media.duration);
      setVolume(media.volume);
      setMuted(media.muted);
      const wasPlaying = !media.paused;
      media.pause();
      void handlePopOutFromStore(media.currentTime, {
        paused: !wasPlaying,
        playbackSpeed,
      });
      return;
    }
    void handlePopOutFromStore(0, { paused: true, playbackSpeed });
  };

  const syncProgressFromVideo = useCallback((vid: HTMLMediaElement) => {
    if (!isFinite(vid.duration) || vid.duration <= 0) return;
    setCurrentTime(vid.currentTime);
    setProgress((vid.currentTime / vid.duration) * 100);
    if (vid.buffered.length > 0) {
      setBuffered((vid.buffered.end(vid.buffered.length - 1) / vid.duration) * 100);
    }
  }, []);

  const applyScrubPosition = useCallback(
    (pos: number, opts?: { persist?: boolean }) => {
      const vid = mediaRef.current;
      if (!vid || !isFinite(vid.duration) || vid.duration <= 0) return;
      const ratio = Math.min(1, Math.max(0, pos));
      const t = ratio * vid.duration;
      isUserSeekingRef.current = true;
      setScrubDragPercent(ratio * 100);
      setCurrentTime(t);
      setProgress(ratio * 100);
      vid.currentTime = t;
      if (opts?.persist) {
        writePlaybackPos(file.path, t, vid.duration);
        lastPlaybackPersistRef.current = Date.now();
      }
    },
    [file.path],
  );

  const handleSeeked = useCallback(() => {
    isUserSeekingRef.current = false;
    setScrubDragPercent(null);
    setIsScrubbing(false);
    const vid = mediaRef.current;
    if (vid) syncProgressFromVideo(vid);
  }, [syncProgressFromVideo]);

  const handleTimeUpdate = () => {
    if (isUserSeekingRef.current) return;
    if (progressRafRef.current != null) return;
    progressRafRef.current = requestAnimationFrame(() => {
      progressRafRef.current = null;
      if (isUserSeekingRef.current) return;
      const vid = mediaRef.current;
      if (!vid || !isFinite(vid.duration)) return;
      setCurrentTime(vid.currentTime);
      setProgress((vid.currentTime / vid.duration) * 100);
      if (vid.buffered.length > 0) {
        setBuffered((vid.buffered.end(vid.buffered.length - 1) / vid.duration) * 100);
      }
      const now = Date.now();
      if (now - lastPlaybackPersistRef.current > 4000 && vid.duration > 0) {
        lastPlaybackPersistRef.current = now;
        if (vid.currentTime > 0.5) {
          writePlaybackPos(file.path, vid.currentTime, vid.duration);
        }
      }
    });
  };

  const handleLoadedMetadata = () => {
    if (isUserSeekingRef.current) return;
    const vid = mediaRef.current;
    if (!vid) return;
    setDuration(vid.duration);
    vid.volume = volume;
    vid.muted = isMuted;
    vid.preservesPitch = true;
    vid.playbackRate = playbackSpeed;

    const handoffResume =
      playerResumeAt !== null && Number.isFinite(playerResumeAt);
    if (!handoffResume && resumeSeekAppliedPathRef.current === file.path) return;

    const resume = handoffResume
      ? Math.min(Math.max(0, playerResumeAt), vid.duration || playerResumeAt)
      : readResumeSeconds(file.path, vid.duration);
    if (handoffResume) clearPlayerResumeAt();
    resumeSeekAppliedPathRef.current = file.path;
    vid.currentTime = resume;
  };

  // Scrubber drag
  const getScrubPosition = (e: { clientX: number }): number => {
    const rect = scrubberRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const handleScrubMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const vid = mediaRef.current;
    if (!vid || !isFinite(vid.duration)) return;

    wasPlayingBeforeScrubRef.current = !vid.paused;
    if (wasPlayingBeforeScrubRef.current) {
      vid.pause();
    }

    setIsScrubbing(true);
    const pos0 = getScrubPosition(e);
    applyScrubPosition(pos0);

    const onMove = (ev: MouseEvent) => {
      applyScrubPosition(getScrubPosition(ev));
    };

    const onUp = (ev: MouseEvent) => {
      applyScrubPosition(getScrubPosition(ev), { persist: true });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);

      if (wasPlayingBeforeScrubRef.current && mediaRef.current) {
        void mediaRef.current.play().catch(() => {});
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Volume drag
  const getVolumePosition = (e: { clientX: number }): number => {
    const rect = volumeRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const handleVolumeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsVolumeDragging(true);
    changeVolume(getVolumePosition(e));
    const onMove = (ev: MouseEvent) => changeVolume(getVolumePosition(ev));
    const onUp = () => {
      setIsVolumeDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Controls auto-hide
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    if (!isPaused && !isScrubbing && !isVolumeDragging) {
      controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPaused, isScrubbing, isVolumeDragging]);

  useEffect(() => {
    resetControlsTimer();
  }, [isPaused, resetControlsTimer]);

  const formatTime = (time: number) => {
    if (!isFinite(time)) return "0:00";
    const h = Math.floor(time / 3600);
    const m = Math.floor((time % 3600) / 60);
    const s = Math.floor(time % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const playedBarPercent = scrubDragPercent !== null ? scrubDragPercent : progress;
  const isProbablyWindows =
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
  const coverArtSrc = file.ruforgePosterPath ?? file.thumbnailPath;

  const playlistIdx = folderAudioPlaylist.findIndex((f) => f.path === file.path);
  const prevInFolder =
    playlistIdx > 0 ? folderAudioPlaylist[playlistIdx - 1] : null;
  const nextInFolder =
    playlistIdx >= 0 && playlistIdx < folderAudioPlaylist.length - 1
      ? folderAudioPlaylist[playlistIdx + 1]
      : null;
  const prefetchNextEnabled = audioOnly && readAudioPrefetchNext() && nextInFolder !== null;

  const openWindowsSoundSettings = useCallback(() => {
    void invoke("open_windows_sound_settings").catch(console.error);
  }, []);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => { if (!isPaused) setShowControls(false); }}
      className={`absolute inset-0 bg-black flex flex-col select-none overflow-hidden z-50 ${!showControls ? 'controls-hidden' : ''}`}
      style={{ cursor: showControls ? "default" : "none" }}
    >
      {/* Next Up Drawer */}
      <AnimatePresence>
        {showPlaylist && (
          <motion.div
            initial={{ x: "110%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "110%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 200 }}
            className="absolute top-8 bottom-8 right-0 w-80 bg-stone-950/80 backdrop-blur-3xl rounded-l-[32px] z-[60] flex flex-col shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] pointer-events-auto border border-white/5"
          >
            <div className="p-7 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-stone-400 ml-2">Next Up</h3>
              <button 
                onClick={() => setShowPlaylist(false)}
                className="p-2 text-stone-500 hover:text-white transition-colors hover:bg-white/5 rounded-full"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-none px-4 pb-8 space-y-2">
              {folderAudioPlaylist.map((item) => {
                const isActive = item.path === file.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => setPlayingFile(item)}
                    className={`w-full flex flex-col gap-3 p-3 rounded-[24px] transition-all group ${isActive ? 'bg-[color:var(--accent)]/10 ring-1 ring-[color:var(--accent)]/20' : 'hover:bg-white/5'}`}
                  >
                    <div className="w-full aspect-video rounded-[18px] bg-stone-900 overflow-hidden flex-shrink-0 relative border border-white/5 shadow-xl">
                      {(item.thumbnailPath || item.ruforgePosterPath) ? (
                        <img src={convertFileSrc(item.thumbnailPath || item.ruforgePosterPath!)} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {isAudioOnlyPath(item.path) ? <Music size={24} className="text-stone-700" /> : <Video size={24} className="text-stone-700" />}
                        </div>
                      )}
                      <div className={`absolute inset-0 bg-black/20 transition-opacity ${isActive ? 'opacity-0' : 'group-hover:opacity-0'}`} />
                      
                      {item.duration > 0 && (
                        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded-md border border-white/10">
                          <p className="text-[10px] font-black text-white leading-none">
                            {formatTime(item.duration)}
                          </p>
                        </div>
                      )}

                      {isActive && (
                        <div className="absolute inset-0 bg-[color:var(--accent)]/40 flex items-center justify-center backdrop-blur-[2px]">
                           <Play size={28} className="text-[#1D1613] fill-current" />
                        </div>
                      )}
                    </div>
                    <div className="px-2 pb-1 text-left">
                      <p className={`text-[13px] font-bold leading-snug line-clamp-2 ${isActive ? 'text-[color:var(--accent)]' : 'text-stone-100 group-hover:text-white'}`}>
                        {item.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "")}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Local <video> or <audio> (Chromium stack); audio skips video decode path */}
      <div className="absolute inset-0">
        {audioOnly ? (
          <>
            <audio
              ref={mediaRef}
              src={convertFileSrc(file.path)}
              className="absolute w-px h-px opacity-0 pointer-events-none"
              preload="metadata"
              autoPlay
              onTimeUpdate={handleTimeUpdate}
              onSeeked={handleSeeked}
              onLoadedMetadata={handleLoadedMetadata}
              onPause={() => setIsPaused(true)}
              onPlay={() => setIsPaused(false)}
              onEnded={() => {
                if (!isLooping) handlePlaybackEnded();
              }}
            />
            {prefetchNextEnabled && nextInFolder && (
              <audio
                preload="auto"
                src={convertFileSrc(nextInFolder.path)}
                className="absolute w-px h-px opacity-0 pointer-events-none"
                aria-hidden
              />
            )}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-10 bg-gradient-to-b from-stone-950 via-black to-black"
              onClick={togglePlay}
              onDoubleClick={toggleFullscreen}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onAuxClick={handleAuxClickMute}
              onWheel={(e) => {
                if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
                if (e.deltaY === 0) return;
                changeVolume(Math.min(1, Math.max(0, volume + (e.deltaY > 0 ? -0.05 : 0.05))));
              }}
            >
              <div className="flex flex-col items-center gap-4 max-w-lg w-full pointer-events-none">
                {coverArtSrc ? (
                  <img
                    src={convertFileSrc(coverArtSrc)}
                    alt=""
                    className="max-h-[min(55vh,520px)] max-w-[min(90vw,520px)] rounded-2xl shadow-2xl border border-white/10 object-contain"
                  />
                ) : (
                  <Music className="w-28 h-28 text-[color:var(--accent)] opacity-30" strokeWidth={1} aria-hidden />
                )}
                <p className="text-center text-[11px] font-medium text-stone-600 max-w-sm leading-relaxed">
                  {file.sourceUrl 
                    ? "In-app playback uses WebView audio (Chromium engine). Click 'Open in Browser' at the top to watch the original source in your native browser."
                    : "In-app playback uses WebView audio (Chromium engine). Opens the same file in your default browser/player if you prefer another decoder."
                  }
                </p>
              </div>
              {isProbablyWindows && (
                <button
                  type="button"
                  className="pointer-events-auto z-10 shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-[10px] font-black tracking-[0.12em] text-stone-300 uppercase hover:bg-white/10 hover:text-white transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    openWindowsSoundSettings();
                  }}
                  title="Open Windows Settings → Sound (output device, exclusive mode app controls, enhancements)"
                >
                  <Speaker className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
                  Sound settings…
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <canvas
              ref={ambientCanvasRef}
              className="absolute inset-[-15%] w-[130%] h-[130%] z-0 blur-[100px] opacity-50 pointer-events-none transition-opacity duration-700"
              aria-hidden
            />
            <div
              className="relative z-10 flex h-full w-full min-h-0 items-center justify-center transition-opacity duration-200"
              style={{ opacity: mediaBlendOpacity }}
            >
              <video
                ref={mediaRef as React.RefObject<HTMLVideoElement>}
                src={convertFileSrc(file.path)}
                className="relative h-full w-full object-contain"
                autoPlay
                playsInline
                preload="metadata"
                onTimeUpdate={handleTimeUpdate}
                onSeeked={handleSeeked}
                onLoadedMetadata={handleLoadedMetadata}
                onPause={() => setIsPaused(true)}
                onPlay={() => setIsPaused(false)}
                onEnded={() => {
                  if (!isLooping) handlePlaybackEnded();
                }}
                onClick={togglePlay}
                onDoubleClick={toggleFullscreen}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onAuxClick={handleAuxClickMute}
                onWheel={(e) => {
                  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
                  if (e.deltaY === 0) return;
                  changeVolume(Math.min(1, Math.max(0, volume + (e.deltaY > 0 ? -0.05 : 0.05))));
                }}
              >
                {subtitleTracks.map((t, i) => (
                  <track key={`${file.path}:${t.lang}:${i}`} kind="subtitles" src={t.src} srcLang={t.lang} label={t.label} />
                ))}
              </video>
              <div className="subtitle-overlay-host">
                <div
                  ref={subtitleDragRowRef}
                  title="Drag vertically to reposition (stays above the progress bar)"
                  className={`subtitle-overlay-drag-row ${isSubtitlesEnabled ? "" : "pointer-events-none"}`}
                >
                  <div ref={subtitleOverlayTextRef} className="subtitle-overlay-text" aria-live="off" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Speed Indicator (YouTube style hold) */}
      <AnimatePresence>
        {isPressing && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="absolute top-24 left-1/2 z-[100] px-6 py-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center gap-3 pointer-events-none"
          >
            <div className="flex gap-0.5">
              {[...Array(2)].map((_, i) => (
                <Icon 
                  key={i}
                  icon={isPressing === "right" ? "tabler:player-play-filled" : "tabler:player-play-filled"} 
                  className={`w-4 h-4 text-[#271C18] ${isPressing === "left" ? "rotate-180" : ""}`}
                />
              ))}
            </div>
            <span className="text-sm font-black tracking-widest text-white uppercase">
              {isPressing === "right" ? "2.0x Faster" : "0.5x Slower"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click flash feedback */}
      <AnimatePresence>
        {clickFlash && (
          <motion.div
            key={clickFlash}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1.2 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] pointer-events-none"
          >
            {clickFlash === "play"
              ? <Play className="w-[clamp(3.5rem,10vw,6rem)] h-[clamp(3.5rem,10vw,6rem)] text-white fill-white opacity-40" />
              : <Pause className="w-[clamp(3.5rem,10vw,6rem)] h-[clamp(3.5rem,10vw,6rem)] text-white fill-white opacity-40" />
            }
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip feedback overlay */}
      <AnimatePresence mode="popLayout">
        {skipFlash && (
          <motion.div
            key={skipFlash.side}
            initial={{ opacity: 0, x: skipFlash.side === "left" ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: skipFlash.side === "left" ? -40 : 40 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={`absolute top-1/2 ${skipFlash.side === "left" ? "left-[15%]" : "right-[15%]"} -translate-y-1/2 z-[100] pointer-events-none`}
          >
            <span className="text-[clamp(1.25rem,4vw,2.5rem)] font-black tracking-[0.2em] text-white opacity-40 uppercase whitespace-nowrap">
              {skipFlash.side === "left" ? "−" : "+"}{skipFlash.amount}s
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Volume/Mute Overlay */}
      <AnimatePresence>
        {showVolume && (
          <motion.div 
            initial={{ opacity: 0, y: 10, x: 10 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 10, x: 10 }}
            className="absolute bottom-6 right-6 z-[80] bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 flex items-center gap-3 pointer-events-none shadow-2xl"
          >
            <div className="text-white">
              {isMuted ? <VolumeX size={20} /> : volume > 0.5 ? <Volume2 size={20} /> : <Volume1 size={20} />}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-black text-white leading-none uppercase tracking-widest">{isMuted ? "Muted" : `${Math.round(volume * 100)}%`}</span>
            </div>
            {!isMuted && (
              <div className="w-1.5 h-8 bg-white/10 rounded-full relative overflow-hidden ml-1">
                  <motion.div 
                    className="absolute bottom-0 left-0 right-0 bg-white rounded-full"
                    initial={{ height: 0 }}
                    animate={{ height: `${volume * 100}%` }}
                  />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Chrome */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="absolute top-0 left-0 right-0 px-8 pt-6 pb-20 flex items-start justify-between z-50 bg-gradient-to-b from-black/85 via-black/30 to-transparent pointer-events-none"
          >
            <div className="flex items-center gap-5 pointer-events-auto">
              <button
                onClick={onBack}
                className="w-11 h-11 flex items-center justify-center text-stone-400 hover:text-white transition-all active:scale-90"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h2 className="text-lg font-black tracking-tight text-white leading-tight truncate max-w-xl">
                  {file.name.replace(/_/g, " ")}
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  {audioOnly && (
                    <span className="text-[10px] font-black tracking-widest text-sky-400 uppercase px-2 py-0.5 bg-sky-400/10 border border-sky-400/20 rounded-md">
                      AUDIO
                    </span>
                  )}
                  {playbackSpeed !== 1 && (
                    <span className="text-[10px] font-black tracking-widest text-sky-400 uppercase px-2 py-0.5 bg-sky-400/10 border border-sky-400/20 rounded-md">
                      {playbackSpeed}×
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 left-0 right-0 px-8 pb-8 pt-24 z-50 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none"
          >
            {/* Scrubber */}
            <div
              ref={scrubberRef}
              className={`w-full relative cursor-pointer group/scrubber py-3 -my-3 pointer-events-auto ${isScrubbing ? "cursor-grabbing" : ""}`}
              onMouseDown={handleScrubMouseDown}
              onMouseMove={(e) => {
                const rect = scrubberRef.current?.getBoundingClientRect();
                if (!rect) return;
                setScrubberHoverPos(((e.clientX - rect.left) / rect.width) * 100);
                setIsHoveringScrubber(true);
              }}
              onMouseLeave={() => setIsHoveringScrubber(false)}
            >
              <div className={`w-full rounded-full relative transition-all duration-150 ${isScrubbing || isHoveringScrubber ? "h-3" : "h-1.5"} bg-white/15`}>
                <div className="absolute top-0 left-0 h-full bg-white/20 rounded-full" style={{ width: `${buffered}%` }} />
                <div className="absolute top-0 left-0 h-full bg-[#271C18] rounded-full shadow-[0_0_10px_rgba(39,28,24,0.4)]" style={{ width: `${playedBarPercent}%` }} />
                {isHoveringScrubber && (
                  <div className="absolute top-0 left-0 h-full bg-white/10 rounded-full pointer-events-none" style={{ width: `${scrubberHoverPos}%` }} />
                )}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full border-2 border-[#271C18] shadow-lg transition-opacity ${isHoveringScrubber || isScrubbing ? "opacity-100" : "opacity-0"}`}
                  style={{ left: `${playedBarPercent}%` }}
                />
                {isHoveringScrubber && isFinite(duration) && duration > 0 && (
                  <AnimatePresence>
                    {scrubberThumbs.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.8, x: "-50%" }}
                        animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
                        exit={{ opacity: 0, y: 10, scale: 0.8, x: "-50%" }}
                        className="absolute bottom-full mb-8 z-[100] pointer-events-none"
                        style={{ left: `${scrubberHoverPos}%` }}
                      >
                        <div className="relative p-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                          <ScrubberHoverThumb
                            hoverTimeSec={(scrubberHoverPos / 100) * duration}
                            duration={duration}
                            spritePaths={scrubberThumbs}
                            displayWidth={192}
                          />
                          <div className="absolute bottom-3 left-3 right-3 flex justify-center">
                             <span className="text-xs font-black text-[#271C18] bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                               {formatTime((scrubberHoverPos / 100) * duration)}
                             </span>
                          </div>
                        </div>
                        <div className="w-px h-6 bg-[#271C18]/50 mx-auto mt-2" />
                      </motion.div>
                    ) : (
                      <div
                        className="absolute -top-9 -translate-x-1/2 bg-stone-950 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-black tracking-wider text-white pointer-events-none whitespace-nowrap shadow-xl"
                        style={{ left: `${scrubberHoverPos}%` }}
                      >
                        {formatTime((scrubberHoverPos / 100) * duration)}
                      </div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            </div>

            {/* Controls Bar */}
            <div className="flex items-center justify-between mt-3 px-2 pointer-events-auto">
              {/* Left */}
              <div className="flex items-center gap-1.5 sm:gap-4">
                <Tooltip text={isPaused ? "Play" : "Pause"}>
                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 flex items-center justify-center text-stone-200 hover:text-white active:scale-90 transition-all"
                  >
                    {isPaused
                      ? <Play className="w-8 h-8 fill-current ml-0.5" />
                      : <Pause className="w-8 h-8 fill-current" />
                    }
                  </button>
                </Tooltip>

                <Tooltip text="Rewind 15 Seconds" className="hidden sm:flex">
                  <button onClick={() => skip(-15)} className="p-2 text-stone-400 transition-colors active:scale-90 hover:text-white">
                    <Icon icon="tabler:rewind-backward-15" width={22} />
                  </button>
                </Tooltip>
                <Tooltip text="Jump 15 Seconds" className="hidden sm:flex">
                  <button onClick={() => skip(15)} className="p-2 text-stone-400 transition-colors active:scale-90 hover:text-white">
                    <Icon icon="tabler:rewind-forward-15" width={22} />
                  </button>
                </Tooltip>
                {prevInFolder && (
                  <Tooltip text="Previous in this folder" className="hidden md:flex">
                    <button
                      type="button"
                      onClick={() => setPlayingFile(prevInFolder)}
                      className="p-2 text-stone-400 transition-colors active:scale-90 hover:text-white"
                    >
                      <SkipBack className="w-[18px] h-[18px]" aria-hidden />
                    </button>
                  </Tooltip>
                )}
                {nextInFolder && (
                  <Tooltip text="Next in this folder" className="hidden md:flex">
                    <button
                      type="button"
                      onClick={() => setPlayingFile(nextInFolder)}
                      className="p-2 text-stone-400 transition-colors active:scale-90 hover:text-white"
                    >
                      <SkipForward className="w-[18px] h-[18px]" aria-hidden />
                    </button>
                  </Tooltip>
                )}

                {/* Volume */}
                <div className="flex items-center gap-1.5 sm:gap-3 group/vol ml-0.5 sm:ml-2">
                  <Tooltip
                  text={
                    (isMuted ? "Unmute" : "Mute") +
                    (audioOnly ? " · WASAPI exclusive mode is configured in Windows sound settings." : "")
                  }
                >
                    <button
                      onClick={() => setMuted(!isMuted)}
                      className="p-2 text-stone-400 hover:text-white transition-colors"
                    >
                      <VolumeIcon className="w-5 h-5" />
                    </button>
                  </Tooltip>
                  <div
                    ref={volumeRef}
                    className={`relative rounded-full cursor-pointer transition-all ${isVolumeDragging ? "cursor-grabbing" : ""} w-0 opacity-0 group-hover/vol:w-24 group-hover/vol:opacity-100 h-1.5 bg-white/15`}
                    onMouseDown={handleVolumeMouseDown}
                  >
                    <div className="absolute top-0 left-0 h-full bg-[#271C18] rounded-full shadow-[0_0_8px_rgba(39,28,24,0.5)]" style={{ width: `${isMuted ? 0 : volume * 100}%` }} />
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow border border-[#271C18] transition-opacity ${isVolumeDragging ? "opacity-100" : "opacity-0 group-hover/vol:opacity-100"}`}
                      style={{ left: `${isMuted ? 0 : volume * 100}%` }}
                    />
                  </div>
                </div>

                {/* Time */}
                <div className="hidden min-[500px]:flex text-xs font-medium text-stone-400 font-mono tracking-wider ml-4 items-center gap-2">
                  <span className="text-stone-200">{formatTime(currentTime)}</span>
                  <span>/</span>
                  <span>{isFinite(duration) ? formatTime(duration) : "0:00"}</span>
                </div>
              </div>

              {/* Right */}
              <div className="flex items-center gap-1 sm:gap-2">
                <Tooltip text="Toggle Loop Playback" className="hidden md:flex">
                  <button
                    onClick={() => setLooping(!isLooping)}
                    className={`p-2.5 rounded-xl transition-all outline-none border-none ${isLooping ? "text-[color:var(--accent)]" : "text-stone-500 hover:text-white"}`}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={isLooping ? "looping" : "not-looping"}
                        initial={{ opacity: 0, rotate: -20, scale: 0.8 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        exit={{ opacity: 0, rotate: 20, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Icon icon={isLooping ? "streamline:arrow-infinite-loop" : "radix-icons:loop"} width={16} height={16} />
                      </motion.div>
                    </AnimatePresence>
                  </button>
                </Tooltip>

                {/* Speed */}
                <div className="relative hidden xs:block min-[400px]:block">
                  <Tooltip text="Playback Speed">
                    <button
                      onClick={() => setShowSpeedMenu((s) => !s)}
                      className={`p-2.5 rounded-xl transition-all flex items-center gap-1.5 ${showSpeedMenu ? "text-[#271C18] bg-[#271C18]/10 border border-[#271C18]/20" : "text-stone-500 hover:text-white"}`}
                    >
                      <SpeedIcon speed={playbackSpeed} className="w-4 h-4" />
                      <span className="text-[10px] font-black tracking-wider">{playbackSpeed}×</span>
                    </button>
                  </Tooltip>
                  <AnimatePresence>
                    {showSpeedMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full mb-3 right-0 bg-stone-950/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl min-w-[100px]"
                      >
                        {PLAYBACK_SPEEDS.map((speed) => (
                          <button
                            key={speed}
                            onClick={() => { setPlaybackSpeed(speed); setShowSpeedMenu(false); }}
                            className={`w-full px-4 py-2.5 text-left text-[11px] font-black tracking-widest transition-colors ${
                              playbackSpeed === speed ? "bg-[#271C18] text-white" : "text-stone-400 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            {speed}×
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <Tooltip text="Next Up Playlist" className="hidden sm:flex">
                  <button
                    onClick={() => setShowPlaylist(!showPlaylist)}
                    className={`p-2.5 rounded-xl transition-all ${showPlaylist ? "text-[#271C18] bg-[#271C18]/10 border border-[#271C18]/20" : "text-stone-500 hover:text-white"}`}
                  >
                    <Layers className="w-4 h-4" />
                  </button>
                </Tooltip>

                <Tooltip text="Launch Mini Player" className="hidden sm:flex">
                  <button onClick={handlePopOut} className="p-2.5 rounded-xl text-stone-500 hover:text-white transition-all">
                    <Icon icon="material-symbols:tab-unselected-sharp" className="w-5 h-5" />
                  </button>
                </Tooltip>

                {/* Subtitles Toggle */}
                {!audioOnly && subtitleTracks.length > 0 && (
                  <div className="relative block">
                    <Tooltip text="Subtitles">
                      <button
                        onClick={() => {
                          if (subtitleTracks.length > 1) {
                            setShowSubtitleMenu(!showSubtitleMenu);
                          } else {
                            const only = subtitleTracks[0];
                            if (isSubtitlesEnabled) {
                              setIsSubtitlesEnabled(false);
                              onSubtitleToggle?.(false);
                            } else {
                              setSelectedSubtitleLang(only.lang);
                              setIsSubtitlesEnabled(true);
                              void updateSetting("subtitlePreferredLang", only.lang);
                              onSubtitleToggle?.(true);
                            }
                          }
                        }}
                        className={`p-2.5 rounded-xl transition-all ${isSubtitlesEnabled ? "text-[color:var(--accent)]" : "text-stone-500 hover:text-white"}`}
                      >
                        <Icon 
                          icon={isSubtitlesEnabled ? "streamline-ultimate:subtitles-bold" : "streamline-ultimate:subtitles"} 
                          className="w-4 h-4" 
                        />
                      </button>
                    </Tooltip>
                    
                    <AnimatePresence>
                      {showSubtitleMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute bottom-full mb-3 right-0 bg-stone-950/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl min-w-[140px] z-[110] p-1.5"
                        >
                          <button
                            onClick={() => {
                              setIsSubtitlesEnabled(false);
                              onSubtitleToggle?.(false);
                              setShowSubtitleMenu(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-[10px] font-black tracking-widest transition-colors rounded-xl flex items-center justify-between ${!isSubtitlesEnabled ? "bg-[color:var(--accent)] text-[#1d1613]" : "text-stone-400 hover:bg-white/5 hover:text-white"}`}
                          >
                            <span>OFF</span>
                            {!isSubtitlesEnabled && <Icon icon="tabler:check" width={12} />}
                          </button>
                          <div className="h-px bg-white/5 my-1 mx-2" />
                          {subtitleTracks.map((track) => (
                            <button
                              key={track.lang + track.src}
                              onClick={() => {
                                setSelectedSubtitleLang(track.lang);
                                setIsSubtitlesEnabled(true);
                                void updateSetting("subtitlePreferredLang", track.lang);
                                onSubtitleToggle?.(true);
                                setShowSubtitleMenu(false);
                              }}
                              className={`w-full px-3 py-2 text-left text-[10px] font-black tracking-widest transition-colors rounded-xl flex items-center justify-between ${isSubtitlesEnabled && selectedSubtitleLang === track.lang ? "bg-[color:var(--accent)] text-[#1d1613]" : "text-stone-400 hover:bg-white/5 hover:text-white"}`}
                            >
                              <span className="truncate mr-2">{track.label.toUpperCase()}</span>
                              {isSubtitlesEnabled && selectedSubtitleLang === track.lang && <Icon icon="tabler:check" width={12} />}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                <Tooltip text="Toggle Fullscreen">
                  <button onClick={toggleFullscreen} className="p-2.5 rounded-xl text-stone-500 hover:text-white transition-all">
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </Tooltip>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

/**
 * Store-driven shell: `playingFile` can go null (e.g. mini emits `stop-playback` before React drops this
 * subtree). Outer only subscribes to `playingFile`; all heavy hooks live in {@link PlayerViewWithFile}.
 */
export const PlayerView = forwardRef<PlayerViewHandle, PlayerViewProps>(function PlayerView(props, ref) {
  const file = useRuforgeStore((s) => s.playingFile);
  if (!file) return null;
  return <PlayerViewWithFile ref={ref} file={file} {...props} />;
});
