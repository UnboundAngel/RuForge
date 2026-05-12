import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icon } from "@iconify/react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
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
  Repeat,
  ExternalLink,
  Music,
  Speaker,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { MediaFile, type FfprobeHint } from "../types";
import { ScrubberHoverThumb } from "../scrubSpritePreview";
import {
  readResumeSeconds,
  writePlaybackPos,
  clearPlaybackPos,
  END_EPSILON_SEC,
} from "../playbackStorage";
import {
  readAudioAutoAdvanceFolder,
  readAudioPrefetchNext,
} from "../audioPlaybackPrefs";
import { isAudioOnlyPath } from "../mediaKind";

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

const Tooltip = ({ text, children, side = "bottom" }: { text: string; children: React.ReactNode; side?: "bottom" | "top" }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div className="relative flex flex-col items-center" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      {children}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: side === "bottom" ? 10 : -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: side === "bottom" ? 10 : -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`absolute ${side === "bottom" ? "bottom-full mb-3" : "top-full mt-3"} px-3 py-1.5 bg-stone-950/95 backdrop-blur-xl border border-white/10 rounded-xl text-[10px] font-black tracking-widest text-white uppercase whitespace-nowrap z-[100] shadow-2xl shadow-black pointer-events-none right-0`}
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface PlayerViewProps {
  file: MediaFile;
  /** Alphabetically sorted mp3/m4a/flac in the same folder as `file`; used only when `file` is audio-only. */
  folderAudioPlaylist?: MediaFile[];
  onPlayFolderAudioNeighbor?: (file: MediaFile) => void;
  onBack: () => void;
  onMiniPlayerToggle: () => void;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const PlayerView = ({
  file,
  folderAudioPlaylist = [],
  onPlayFolderAudioNeighbor,
  onBack,
  onMiniPlayerToggle,
}: PlayerViewProps) => {
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
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem("miniplayer-volume");
    return saved ? parseFloat(saved) : 0.8;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [scrubberHoverPos, setScrubberHoverPos] = useState(0);
  const [isHoveringScrubber, setIsHoveringScrubber] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubberThumbs, setScrubberThumbs] = useState<string[]>([]);
  const [isPressing, setIsPressing] = useState<"left" | "right" | null>(null);
  const [previousSpeed, setPreviousSpeed] = useState(1);
  const pressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockClickRef = useRef(false);
  const lastPlaybackPersistRef = useRef(0);
  const progressRafRef = useRef<number | null>(null);

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

  useEffect(() => {
    lastPlaybackPersistRef.current = 0;
  }, [file.path]);

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
  const [isLooping, setIsLooping] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [clickFlash, setClickFlash] = useState<"play" | "pause" | null>(null);

  // Sync volume/mute to <video> / <audio>
  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.volume = volume;
      mediaRef.current.muted = isMuted;
      localStorage.setItem("miniplayer-volume", volume.toString());
    }
  }, [volume, isMuted]);

  // Sync loop
  useEffect(() => {
    if (mediaRef.current) mediaRef.current.loop = isLooping;
  }, [isLooping]);

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
        case "KeyM":
          setIsMuted((m) => !m);
          break;
        case "KeyF":
          toggleFullscreen();
          break;
        case "KeyL":
          setIsLooping((l) => !l);
          break;
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
      writePlaybackPos(file.path, media.currentTime);
    }
    setTimeout(() => setClickFlash(null), 500);
  }, [file.path]);

  const handlePlaybackEnded = useCallback(() => {
    if (isLooping) return;
    clearPlaybackPos(file.path);
    const idx = folderAudioPlaylist.findIndex((f) => f.path === file.path);
    const neighbor =
      idx >= 0 && idx < folderAudioPlaylist.length - 1 ? folderAudioPlaylist[idx + 1] : null;
    if (
      readAudioAutoAdvanceFolder() &&
      audioOnly &&
      neighbor &&
      onPlayFolderAudioNeighbor
    ) {
      onPlayFolderAudioNeighbor(neighbor);
      return;
    }
    setIsPaused(true);
  }, [
    isLooping,
    file.path,
    audioOnly,
    folderAudioPlaylist,
    onPlayFolderAudioNeighbor,
  ]);

  const skip = (seconds: number) => {
    if (mediaRef.current) mediaRef.current.currentTime += seconds;
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    if (v > 0 && isMuted) setIsMuted(false);
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

  const handlePopOut = async () => {
    try {
      if (mediaRef.current) {
        writePlaybackPos(file.path, mediaRef.current.currentTime);
        localStorage.setItem("miniplayer-volume", mediaRef.current.volume.toString());
      }
      await invoke("open_mini_player");
      setTimeout(() => emit("play-media", file), 500);
      onMiniPlayerToggle();
    } catch (e) {
      console.error(e);
    }
  };

  const handleTimeUpdate = () => {
    if (progressRafRef.current != null) return;
    progressRafRef.current = requestAnimationFrame(() => {
      progressRafRef.current = null;
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
        if (vid.currentTime > 0.5 && vid.currentTime < vid.duration - END_EPSILON_SEC) {
          writePlaybackPos(file.path, vid.currentTime);
        }
      }
    });
  };

  const handleLoadedMetadata = () => {
    const vid = mediaRef.current;
    if (!vid) return;
    setDuration(vid.duration);
    vid.volume = volume;
    vid.muted = isMuted;
    vid.preservesPitch = true;
    vid.playbackRate = playbackSpeed;
    const resume = readResumeSeconds(file.path, vid.duration);
    vid.currentTime = resume;
  };

  // Scrubber drag
  const getScrubPosition = (e: { clientX: number }): number => {
    const rect = scrubberRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const applyScrub = (pos: number) => {
    if (mediaRef.current && isFinite(mediaRef.current.duration)) {
      mediaRef.current.currentTime = pos * mediaRef.current.duration;
    }
  };

  const handleScrubMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsScrubbing(true);
    applyScrub(getScrubPosition(e));
    const onMove = (ev: MouseEvent) => applyScrub(getScrubPosition(ev));
    const onUp = () => {
      setIsScrubbing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
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
  const isProbablyWindows =
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
  const coverArtSrc = file.ruforgePosterPath ?? file.thumbnailPath;

  const playlistIdx = folderAudioPlaylist.findIndex((f) => f.path === file.path);
  const prevInFolder =
    audioOnly && playlistIdx > 0 ? folderAudioPlaylist[playlistIdx - 1] : null;
  const nextInFolder =
    audioOnly && playlistIdx >= 0 && playlistIdx < folderAudioPlaylist.length - 1
      ? folderAudioPlaylist[playlistIdx + 1]
      : null;
  const prefetchNextEnabled = audioOnly && readAudioPrefetchNext() && nextInFolder !== null;

  const openInExternalPlayer = () => {
    void openPath(file.path).catch(console.error);
  };

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
      className="absolute inset-0 bg-black flex flex-col select-none overflow-hidden z-50"
      style={{ cursor: showControls ? "default" : "none" }}
    >
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
              onWheel={(e) => {
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
                  <Music className="w-28 h-28 text-amber-500/30" strokeWidth={1} aria-hidden />
                )}
                <p className="text-center text-[11px] font-medium text-stone-600 max-w-sm leading-relaxed">
                  In-app playback uses WebView audio (same engine family as Chromium). Opens the same file in your default app if you prefer another decoder.
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
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={convertFileSrc(file.path)}
            className="absolute inset-0 w-full h-full object-contain"
            autoPlay
            playsInline
            preload="metadata"
            onTimeUpdate={handleTimeUpdate}
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
            onWheel={(e) => {
              changeVolume(Math.min(1, Math.max(0, volume + (e.deltaY > 0 ? -0.05 : 0.05))));
            }}
          />
        )}
      </div>

      {/* Speed Indicator (YouTube style hold) */}
      <AnimatePresence>
        {isPressing && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="absolute top-24 left-1/2 z-[100] px-6 py-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center gap-3"
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
            initial={{ opacity: 0.8, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.4 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-black/30 backdrop-blur-xl border border-white/10 flex items-center justify-center pointer-events-none"
          >
            {clickFlash === "play"
              ? <Play className="w-10 h-10 text-white fill-white ml-1" />
              : <Pause className="w-10 h-10 text-white fill-white" />
            }
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
            className="absolute top-0 left-0 right-0 px-8 pt-6 pb-20 flex items-start justify-between z-50 bg-gradient-to-b from-black/85 via-black/30 to-transparent pointer-events-auto"
          >
            <div className="flex items-center gap-5">
              <button
                onClick={onBack}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white/5 border border-white/10 backdrop-blur-xl hover:bg-white/15 transition-all active:scale-90"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h2 className="text-lg font-black tracking-tight text-white leading-tight truncate max-w-xl">
                  {file.name}
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

            <div className="flex items-center gap-2">
              <Tooltip text="Open in Browser" side="top">
                <button
                  type="button"
                  onClick={openInExternalPlayer}
                  className="p-2.5 rounded-xl text-stone-400 hover:text-white transition-all active:scale-90"
                >
                  <ExternalLink className="w-5 h-5" />
                </button>
              </Tooltip>
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
            className="absolute bottom-0 left-0 right-0 px-8 pb-8 pt-24 z-50 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-auto"
          >
            {/* Scrubber */}
            <div
              ref={scrubberRef}
              className={`w-full relative cursor-pointer group/scrubber py-3 -my-3 ${isScrubbing ? "cursor-grabbing" : ""}`}
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
                <div className="absolute top-0 left-0 h-full bg-[#271C18] rounded-full shadow-[0_0_10px_rgba(39,28,24,0.4)]" style={{ width: `${progress}%` }} />
                {isHoveringScrubber && (
                  <div className="absolute top-0 left-0 h-full bg-white/10 rounded-full pointer-events-none" style={{ width: `${scrubberHoverPos}%` }} />
                )}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full border-2 border-[#271C18] shadow-lg transition-opacity ${isHoveringScrubber || isScrubbing ? "opacity-100" : "opacity-0"}`}
                  style={{ left: `${progress}%` }}
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
            <div className="flex items-center justify-between mt-3 px-2">
              {/* Left */}
              <div className="flex items-center gap-4">
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

                <Tooltip text="Rewind 15 Seconds">
                  <button onClick={() => skip(-15)} className="p-2 text-stone-400 transition-colors active:scale-90 hover:text-white">
                    <Icon icon="tabler:rewind-backward-15" width={22} />
                  </button>
                </Tooltip>
                <Tooltip text="Jump 15 Seconds">
                  <button onClick={() => skip(15)} className="p-2 text-stone-400 transition-colors active:scale-90 hover:text-white">
                    <Icon icon="tabler:rewind-forward-15" width={22} />
                  </button>
                </Tooltip>
                {audioOnly && prevInFolder && onPlayFolderAudioNeighbor && (
                  <Tooltip text="Previous audio in this folder">
                    <button
                      type="button"
                      onClick={() => onPlayFolderAudioNeighbor(prevInFolder)}
                      className="p-2 text-stone-400 hover:text-emerald-400 transition-colors active:scale-90"
                    >
                      <SkipBack className="w-[18px] h-[18px]" aria-hidden />
                    </button>
                  </Tooltip>
                )}
                {audioOnly && nextInFolder && onPlayFolderAudioNeighbor && (
                  <Tooltip text="Next audio in this folder">
                    <button
                      type="button"
                      onClick={() => onPlayFolderAudioNeighbor(nextInFolder)}
                      className="p-2 text-stone-400 hover:text-emerald-400 transition-colors active:scale-90"
                    >
                      <SkipForward className="w-[18px] h-[18px]" aria-hidden />
                    </button>
                  </Tooltip>
                )}

                {/* Volume */}
                <div className="flex items-center gap-3 group/vol ml-2">
                  <Tooltip
                  text={
                    (isMuted ? "Unmute" : "Mute") +
                    (audioOnly ? " · WASAPI exclusive mode is configured in Windows sound settings." : "")
                  }
                >
                    <button
                      onClick={() => setIsMuted((m) => !m)}
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
                <div className="text-xs font-medium text-stone-400 font-mono tracking-wider ml-4 flex items-center gap-2">
                  <span className="text-stone-200">{formatTime(currentTime)}</span>
                  <span>/</span>
                  <span>{isFinite(duration) ? formatTime(duration) : "0:00"}</span>
                </div>
              </div>

              {/* Right */}
              <div className="flex items-center gap-2">
                <Tooltip text="Toggle Loop Playback">
                  <button
                    onClick={() => setIsLooping((l) => !l)}
                    className={`p-2.5 rounded-xl transition-all ${isLooping ? "text-[#271C18] bg-[#271C18]/10 border border-[#271C18]/20" : "text-stone-500 hover:text-white"}`}
                  >
                    <Repeat className="w-4 h-4" />
                  </button>
                </Tooltip>

                {/* Speed */}
                <div className="relative">
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

                <Tooltip text="Launch Mini Player">
                  <button onClick={handlePopOut} className="p-2.5 rounded-xl text-stone-500 hover:text-white transition-all">
                    <Icon icon="material-symbols:tab-unselected-sharp" className="w-5 h-5" />
                  </button>
                </Tooltip>
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
};
