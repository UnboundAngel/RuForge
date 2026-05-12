import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icon } from "@iconify/react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "./assets/neotubeIcon.png";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Volume1,
  Pin,
  Video,
  ExternalLink,
  Music,
  Speaker,
} from "lucide-react";
import { MediaFile } from "./types";
import { flattenGalleryScanToMediaFiles } from "./galleryScan";
import { ScrubberHoverThumb } from "./scrubSpritePreview";
import {
  readResumeSeconds,
  writePlaybackPos,
  clearPlaybackPos,
  END_EPSILON_SEC,
} from "./playbackStorage";
import { ensurePostersForFiles, filesMissingPoster } from "./posterBackfill";
import { isAudioOnlyPath } from "./mediaKind";
import {
  readAudioAutoAdvanceFolder,
  readAudioPrefetchNext,
} from "./audioPlaybackPrefs";
import { syncRuforgeAccentCss } from "./accentCss";

const Waveform = ({ isPaused }: { isPaused: boolean }) => {
  return (
    <div className="flex items-end space-x-[3px] h-4">
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          animate={{
            height: isPaused ? 4 : [8, 16, 10, 20, 6][i % 5],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
            delay: i * 0.08,
          }}
          className="w-[2px] bg-[color:var(--accent)] opacity-80 rounded-full"
        />
      ))}
    </div>
  );
};

export default function MiniPlayer() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ruforge-settings");
      const parsed = raw ? JSON.parse(raw) : null;
      const hex = typeof parsed?.accentColor === "string" ? parsed.accentColor : "#f59e0b";
      syncRuforgeAccentCss(hex);
    } catch {
      syncRuforgeAccentCss("#f59e0b");
    }
  }, []);

  const [playingFile, setPlayingFile] = useState<MediaFile | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubberThumbs, setScrubberThumbs] = useState<string[]>([]);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [isCursorVisible, setIsCursorVisible] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const cursorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!playingFile || isAudioOnlyPath(playingFile.path)) {
      setScrubberThumbs([]);
      return;
    }
    invoke<string[]>("extract_frames", { videoPath: playingFile.path })
      .then((paths) =>
        setScrubberThumbs(
          paths.filter((p) => {
            const f = p.replace(/^.*[/\\]/, "");
            return f.startsWith("sprite_") && f.endsWith(".jpg");
          }),
        ),
      )
      .catch(console.error);
  }, [playingFile]);

  const [winSize, setWinSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setWinSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isSmallMode = winSize.width < 450 || winSize.height < 300;
  const isNarrow = winSize.width < 400;
  const isMini = winSize.width < 340;

  useEffect(() => {
    const handleMouseMove = () => {
      setIsCursorVisible(true);
      if (cursorTimeout.current) clearTimeout(cursorTimeout.current);
      cursorTimeout.current = setTimeout(() => setIsCursorVisible(false), 2000);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (cursorTimeout.current) clearTimeout(cursorTimeout.current);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        seek(-15);
      } else if (e.key === "ArrowRight") {
        seek(15);
      } else if (e.key === " ") {
        togglePlay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playingFile, isPaused]); // Added isPaused to ensure togglePlay is fresh

  const [isPinned, setIsPinned] = useState(() => localStorage.getItem("miniplayer-pinned") === "true");
  const [library, setLibrary] = useState<MediaFile[]>([]);
  const [isGalleryHovered, setIsGalleryHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [volumeLabel, setVolumeLabel] = useState(() => {
    const saved = localStorage.getItem("miniplayer-volume");
    return saved ? Math.round(parseFloat(saved) * 100) : 100;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const mediaRef = useRef<HTMLMediaElement>(null);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPlaybackPersistRef = useRef(0);
  const progressRafRef = useRef<number | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    win.setAlwaysOnTop(isPinned).catch(console.error);
  }, [isPinned]);

  useEffect(() => {
    if (mediaRef.current) {
      const targetVol = volumeLabel / 100;
      mediaRef.current.volume = targetVol;
    }
  }, [playingFile, volumeLabel]);

  useEffect(() => {
    return () => {
      if (progressRafRef.current != null) {
        cancelAnimationFrame(progressRafRef.current);
        progressRafRef.current = null;
      }
    };
  }, []);

  const savePlaybackPos = () => {
    if (mediaRef.current && playingFile) {
      const t = mediaRef.current.currentTime;
      const d = mediaRef.current.duration;
      if (Number.isFinite(d) && d > 0 && t > 0.5 && t < d - END_EPSILON_SEC) {
        writePlaybackPos(playingFile.path, t);
      }
    }
  };

  useEffect(() => {
    lastPlaybackPersistRef.current = 0;
    if (mediaRef.current) {
      mediaRef.current.preservesPitch = true;
    }
  }, [playingFile?.path]);

  const [outputDir] = useState(() => {
    return localStorage.getItem("ruforge-output-dir") || "C:\\Downloads";
  });

  useEffect(() => {
    const run = async () => {
      try {
        const raw = await invoke("scan_gallery", { dir: outputDir });
        const data = flattenGalleryScanToMediaFiles(raw);
        setLibrary(data);
        if (filesMissingPoster(data).length === 0) return;
        void (async () => {
          await ensurePostersForFiles(data);
          try {
            const raw2 = await invoke("scan_gallery", { dir: outputDir });
            setLibrary(flattenGalleryScanToMediaFiles(raw2));
          } catch (e) {
            console.error(e);
          }
        })();
      } catch (e) {
        console.error(e);
      }
    };
    run();
  }, [outputDir]);

  useEffect(() => {
    const win = getCurrentWindow();
    
    const onBlur = () => setIsFocused(false);
    const onFocus = () => setIsFocused(true);

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    const unlistenFocus = win.onFocusChanged(({ payload: focused }) => {
      setIsFocused(focused);
    });

    return () => { 
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      unlistenFocus.then(f => f()); 
    };
  }, []);

  const handleMouseEnter = async () => {
    setIsHovering(true);
    const win = getCurrentWindow();
    await win.setFocus();
  };

  useEffect(() => {
    const unlisten = listen<MediaFile>("play-media", (event) => {
      setPlayingFile(event.payload);
      import("@tauri-apps/api/event").then(({ emit }) => emit("stop-playback"));
    });

    const unlistenStop = listen("stop-playback", () => {
      setPlayingFile(null);
    });

    return () => { 
      unlisten.then(f => f()); 
      unlistenStop.then(f => f());
    };
  }, []);

  const adjustVolume = (delta: number) => {
    if (!mediaRef.current) return;

    const start = mediaRef.current.volume;
    const target = Math.max(0, Math.min(1, start + delta));
    if (Math.abs(target - start) < 0.001) return;

    mediaRef.current.volume = target;
    setVolumeLabel(Math.round(target * 100));
    localStorage.setItem("miniplayer-volume", target.toString());
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!mediaRef.current) return;
    
    // Request window focus on interaction. The onFocusChanged listener will handle the opacity.
    getCurrentWindow().setFocus();

    // Unmute on scroll if muted
    if (mediaRef.current.muted) {
      mediaRef.current.muted = false;
      setIsMuted(false);
    }

    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    adjustVolume(delta);
    setShowVolume(true);
    
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(() => setShowVolume(false), 2000);
  };

  const handleTimeUpdate = () => {
    if (progressRafRef.current != null) return;
    progressRafRef.current = requestAnimationFrame(() => {
      progressRafRef.current = null;
      const v = mediaRef.current;
      if (!v || !isFinite(v.duration)) return;
      const { currentTime, duration } = v;
      setCurrentTime(currentTime);
      setDuration(duration);
      setProgress((currentTime / duration) * 100);
      const now = Date.now();
      if (playingFile && now - lastPlaybackPersistRef.current > 4000 && duration > 0) {
        lastPlaybackPersistRef.current = now;
        if (currentTime > 0.5 && currentTime < duration - END_EPSILON_SEC) {
          writePlaybackPos(playingFile.path, currentTime);
        }
      }
    });
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mediaRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    mediaRef.current.currentTime = percent * mediaRef.current.duration;
  };

  const handleMouseMoveScrubber = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHoverProgress(x / rect.width);
  };

  useEffect(() => {
    if (!isPaused) {
      setIsGalleryHovered(false);
    }
  }, [isPaused]);

  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (mediaRef.current.paused) {
      mediaRef.current.play();
      setIsPaused(false);
    } else {
      mediaRef.current.pause();
      setIsPaused(true);
      savePlaybackPos();
    }
  };

  const seek = (seconds: number) => {
    if (!mediaRef.current) return;
    mediaRef.current.currentTime += seconds;
  };

  const showGallery = !isSmallMode && (!playingFile || isPaused || isGalleryHovered);

  const playingAudioOnly = Boolean(playingFile && isAudioOnlyPath(playingFile.path));
  const coverArtSrc = playingFile?.ruforgePosterPath ?? playingFile?.thumbnailPath;
  const isProbablyWindows =
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

  const openWindowsSoundSettings = () => {
    invoke("open_windows_sound_settings").catch(console.error);
  };

  const audioPlaylistMini = useMemo(
    () =>
      library
        .filter((f) => isAudioOnlyPath(f.path))
        .sort((a, b) =>
          a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }),
        ),
    [library],
  );

  const playlistIdxMini =
    playingFile && playingAudioOnly
      ? audioPlaylistMini.findIndex((p) => p.path === playingFile.path)
      : -1;
  const nextMini =
    playingFile && playlistIdxMini >= 0 && playlistIdxMini < audioPlaylistMini.length - 1
      ? audioPlaylistMini[playlistIdxMini + 1]
      : null;
  const prefetchMini = Boolean(playingAudioOnly && readAudioPrefetchNext() && nextMini);

  return (
    <div 
      className={`h-screen w-screen bg-[#121212] overflow-hidden border border-white/5 rounded-3xl select-none relative group/mini shadow-2xl transition-opacity duration-700 ${isFocused ? 'opacity-100' : 'opacity-75'} ${!isCursorVisible && !isPaused ? 'cursor-none' : 'cursor-default'}`}
      onWheel={handleWheel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovering(false)}
    >
      <style>{`
        @keyframes slideSquiggle {
          from { transform: translateX(0); }
          to { transform: translateX(-40px); }
        }
      `}</style>

      {/* Dynamic Volume/Mute Overlay (Mini Flush Bottom Right) */}
      <AnimatePresence>
        {showVolume && (
          <motion.div 
            initial={{ opacity: 0, y: 10, x: 10 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 10, x: 10 }}
            className={`absolute bottom-0 right-0 z-[80] bg-black/80 backdrop-blur-2xl border-t border-l border-white/10 rounded-tl-2xl ${isMini ? 'p-2 space-x-2' : isNarrow ? 'p-3 space-x-3' : 'p-4 space-x-3'} flex items-center pointer-events-none shadow-2xl`}
          >
            <div className="text-[color:var(--accent)]">
              {isMuted ? <VolumeX size={isMini ? 12 : 16} /> : volumeLabel > 50 ? <Volume2 size={isMini ? 12 : 16} /> : <Volume1 size={isMini ? 12 : 16} />}
            </div>
            <div className="flex flex-col">
              <span className={`${isMini ? 'text-[9px]' : 'text-xs'} font-black text-[color:var(--accent)] leading-none`}>{isMuted ? "MUTED" : `${volumeLabel}%`}</span>
            </div>
            {!isMuted && (
              <div className={`${isMini ? 'w-[2px] h-3' : 'w-1 h-6'} bg-stone-900/50 rounded-full relative overflow-hidden ml-1`}>
                  <motion.div 
                    className="absolute bottom-0 left-0 right-0 bg-[color:var(--accent)] rounded-full"
                    initial={{ height: 0 }}
                    animate={{ height: `${volumeLabel}%` }}
                  />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Controls Strip */}
      <div className="absolute top-0 left-0 right-0 h-12 z-[100] flex items-center justify-between px-3 pointer-events-none group-hover/mini:opacity-100 opacity-0 transition-opacity duration-300">
        <button className="p-1.5 text-stone-400 hover:text-white pointer-events-auto transition-colors">
          <Icon icon="tabler:adjustments-horizontal" width="18" height="18" />
        </button>
        
        <div 
          className="flex-1 h-full cursor-move flex items-center justify-center pointer-events-auto"
          onPointerDown={(e) => {
              e.stopPropagation();
              getCurrentWindow().startDragging();
          }}
        >
          <div className="grid grid-cols-2 gap-0.5 opacity-40">
            {[...Array(8)].map((_, i) => <div key={i} className="w-0.5 h-0.5 bg-white rounded-full" />)}
          </div>
        </div>

        <div className="flex items-center space-x-1 pointer-events-auto">
          {playingFile && (
            <button
              type="button"
              title="Open in default media app (same file on disk)"
              onClick={(e) => {
                e.stopPropagation();
                void openPath(playingFile.path).catch(console.error);
              }}
              className="p-1.5 text-stone-400 hover:text-[color:var(--accent)] transition-colors"
            >
              <ExternalLink size={16} strokeWidth={2.5} />
            </button>
          )}
          {playingFile && playingAudioOnly && isProbablyWindows && (
            <button
              type="button"
              title="Open Windows Sound settings"
              onClick={(e) => {
                e.stopPropagation();
                openWindowsSoundSettings();
              }}
              className="p-1.5 text-stone-400 hover:text-[color:var(--accent)] transition-colors"
            >
              <Speaker size={16} strokeWidth={2.5} aria-hidden />
            </button>
          )}
          <button 
            onClick={async () => {
              const newPinned = !isPinned;
              setIsPinned(newPinned);
              localStorage.setItem("miniplayer-pinned", newPinned.toString());
              await getCurrentWindow().setAlwaysOnTop(newPinned);
            }}
            className={`p-1.5 transition-colors ${isPinned ? 'text-[color:var(--accent)]' : 'text-stone-400 hover:text-white'}`}
            title={isPinned ? "Unpin" : "Pin"}
          >
            <Pin size={16} strokeWidth={2.5} className={isPinned ? 'fill-current' : ''} />
          </button>

          <button 
            onPointerDown={(e) => {
              e.stopPropagation();
              getCurrentWindow().close();
            }} 
            className="p-1.5 text-stone-400 hover:text-white transition-colors"
          >
            <Icon icon="tabler:x" width={18} height={18} />
          </button>
        </div>
      </div>

      <motion.div 
        animate={{ bottom: showGallery ? 112 : 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 200 }}
        className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center bg-black"
      >
         {playingFile ? (
            <>
              {playingAudioOnly ? (
                <>
                  <audio
                    key={playingFile.path}
                    ref={mediaRef}
                    className="absolute w-px h-px opacity-0 pointer-events-none"
                    preload="metadata"
                    autoPlay
                    src={convertFileSrc(playingFile.path)}
                    onPause={() => setIsPaused(true)}
                    onPlay={() => {
                      setIsPaused(false);
                      setIsGalleryHovered(false);
                      if (mediaRef.current) mediaRef.current.volume = volumeLabel / 100;
                    }}
                    onLoadedData={(e) => {
                      e.currentTarget.volume = volumeLabel / 100;
                    }}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      v.volume = volumeLabel / 100;
                      v.preservesPitch = true;
                      const t = readResumeSeconds(playingFile.path, v.duration);
                      v.currentTime = t;
                    }}
                    onEnded={() => {
                      if (playingFile) clearPlaybackPos(playingFile.path);
                      const advance = readAudioAutoAdvanceFolder();
                      if (advance && nextMini && playingFile) {
                        setPlayingFile(nextMini);
                        return;
                      }
                      setIsPaused(true);
                    }}
                    onTimeUpdate={handleTimeUpdate}
                  />
                  {prefetchMini && nextMini && (
                    <audio
                      preload="auto"
                      src={convertFileSrc(nextMini.path)}
                      className="absolute w-px h-px opacity-0 pointer-events-none"
                      aria-hidden
                    />
                  )}
                </>
              ) : (
                <video
                  key={playingFile.path}
                  ref={mediaRef as React.RefObject<HTMLVideoElement>}
                  autoPlay
                  playsInline
                  preload="metadata"
                  className={`${isSmallMode ? "w-24 h-24 absolute left-6 rounded-2xl object-cover shadow-2xl border border-white/5" : "w-full h-full object-contain"} cursor-pointer pointer-events-auto transition-all duration-500 z-20`}
                  src={convertFileSrc(playingFile.path)}
                  onPause={() => setIsPaused(true)}
                  onPlay={() => {
                    setIsPaused(false);
                    setIsGalleryHovered(false);
                    if (mediaRef.current) mediaRef.current.volume = volumeLabel / 100;
                  }}
                  onLoadedData={(e) => {
                    e.currentTarget.volume = volumeLabel / 100;
                  }}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    v.volume = volumeLabel / 100;
                    v.preservesPitch = true;
                    const t = readResumeSeconds(playingFile.path, v.duration);
                    v.currentTime = t;
                  }}
                  onEnded={() => {
                    clearPlaybackPos(playingFile.path);
                    setIsPaused(true);
                  }}
                  onTimeUpdate={handleTimeUpdate}
                  onClick={togglePlay}
                  onAuxClick={(e) => {
                    if (e.button === 1 && mediaRef.current) {
                      getCurrentWindow().setFocus();
                      const nextMuted = !mediaRef.current.muted;
                      mediaRef.current.muted = nextMuted;
                      setIsMuted(nextMuted);
                      setShowVolume(true);
                      if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
                      volumeTimeoutRef.current = setTimeout(() => setShowVolume(false), 2000);
                    }
                  }}
                />
              )}

              {playingAudioOnly && isSmallMode && (
                <button
                  type="button"
                  className="w-24 h-24 absolute left-6 rounded-2xl shadow-2xl border border-white/5 z-20 overflow-hidden flex items-center justify-center bg-stone-900 cursor-pointer pointer-events-auto transition-all duration-500"
                  onClick={togglePlay}
                  onAuxClick={(e) => {
                    if (e.button === 1 && mediaRef.current) {
                      getCurrentWindow().setFocus();
                      const nextMuted = !mediaRef.current.muted;
                      mediaRef.current.muted = nextMuted;
                      setIsMuted(nextMuted);
                      setShowVolume(true);
                      if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
                      volumeTimeoutRef.current = setTimeout(() => setShowVolume(false), 2000);
                    }
                  }}
                >
                  {coverArtSrc ? (
                    <img src={convertFileSrc(coverArtSrc)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music className="w-10 h-10 text-[color:var(--accent)] opacity-40" strokeWidth={1.25} aria-hidden />
                  )}
                </button>
              )}

              {playingAudioOnly && !isSmallMode && (
                <button
                  type="button"
                  className="absolute inset-0 z-20 flex cursor-pointer pointer-events-auto items-center justify-center bg-gradient-to-b from-stone-950 to-black p-8"
                  onClick={togglePlay}
                  onAuxClick={(e) => {
                    if (e.button === 1 && mediaRef.current) {
                      getCurrentWindow().setFocus();
                      const nextMuted = !mediaRef.current.muted;
                      mediaRef.current.muted = nextMuted;
                      setIsMuted(nextMuted);
                      setShowVolume(true);
                      if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
                      volumeTimeoutRef.current = setTimeout(() => setShowVolume(false), 2000);
                    }
                  }}
                >
                  {coverArtSrc ? (
                    <img
                      src={convertFileSrc(coverArtSrc)}
                      alt=""
                      className="max-h-[min(50vh,420px)] max-w-[min(88vw,420px)] rounded-2xl border border-white/10 object-contain shadow-2xl"
                    />
                  ) : (
                    <Music className="w-24 h-24 text-[color:var(--accent)] opacity-35" strokeWidth={1} aria-hidden />
                  )}
                </button>
              )}

              {isSmallMode && (
                <div className="absolute inset-0 pl-36 pr-8 flex flex-col justify-center pointer-events-none">
                   <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0 flex-1 mr-4">
                        <p className="text-[11px] font-black text-[color:var(--accent)] truncate uppercase tracking-widest">{playingFile.name}</p>
                        <p className="text-[9px] font-bold text-stone-500 uppercase tracking-tighter">
                          {playingAudioOnly ? "Audio · in-app WebView" : "System Audio Active"}
                        </p>
                      </div>
                      <Waveform isPaused={isPaused} />
                   </div>
                   <div className="w-full h-1 bg-stone-800 rounded-full overflow-hidden mb-4 pointer-events-auto cursor-pointer" onClick={handleSeek}>
                      <motion.div 
                         className="h-full bg-[color:var(--accent)]"
                         initial={{ width: 0 }}
                         animate={{ width: `${progress}%` }}
                      />
                   </div>
                   <div className="flex items-center space-x-8 text-stone-400 pointer-events-auto">
                      <button onClick={() => seek(-10)} className="hover:text-[color:var(--accent)] transition"><SkipBack size={18} /></button>
                      <button onClick={togglePlay} className="text-[color:var(--accent)] hover:scale-110 transition">{isPaused ? <Play size={24} fill="currentColor" /> : <Pause size={24} fill="currentColor" />}</button>
                      <button onClick={() => seek(10)} className="hover:text-[color:var(--accent)] transition"><SkipForward size={18} /></button>
                   </div>
                </div>
              )}

              {/* Custom Controls Bar */}
              <motion.div 
                initial={false}
                animate={{ 
                  y: !isSmallMode && ((isCursorVisible && isHovering) || isPaused || isGalleryHovered) ? 0 : 120,
                  opacity: !isSmallMode && ((isCursorVisible && isHovering) || isPaused || isGalleryHovered) ? 1 : 0 
                }}
                transition={{ type: "spring", damping: 30, stiffness: 200 }}
                className={`absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-xl rounded-t-[24px] ${isMini ? 'py-2.5 px-4 space-y-3' : isNarrow ? 'py-3.5 px-5 space-y-3.5' : 'py-4 px-6 space-y-4'} flex flex-col pointer-events-auto border-t border-white/5 shadow-2xl z-20`}
                onMouseEnter={() => {
                  setIsHovering(true);
                  if (isPaused) setIsGalleryHovered(true);
                }}
              >
                {/* True Squiggly Line Progress Area */}
                <div 
                  className={`w-full ${isMini ? 'h-5' : 'h-8'} cursor-pointer relative group flex items-center`}
                  onClick={handleSeek}
                  onMouseMove={handleMouseMoveScrubber}
                  onMouseLeave={() => setHoverProgress(null)}
                >
                  <AnimatePresence>
                    {hoverProgress !== null && scrubberThumbs.length > 0 && isFinite(duration) && duration > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.8, x: "-50%" }}
                        animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
                        exit={{ opacity: 0, y: 10, scale: 0.8, x: "-50%" }}
                        className="absolute bottom-full mb-4 z-[100] pointer-events-none"
                        style={{ left: `${hoverProgress * 100}%` }}
                      >
                        <div className="relative p-1.5 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                          <ScrubberHoverThumb
                            hoverTimeSec={hoverProgress * duration}
                            duration={duration}
                            spritePaths={scrubberThumbs}
                            displayWidth={128}
                          />
                          <div className="absolute bottom-2 left-2 right-2 flex justify-center">
                             <span className="text-[9px] font-black text-[color:var(--accent)] bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm">
                               {formatTime(hoverProgress * duration)}
                             </span>
                          </div>
                        </div>
                        <div className="w-px h-4 bg-[color:var(--accent)] opacity-50 mx-auto mt-1" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className={`w-full relative ${isMini ? 'h-[2px]' : 'h-1'} group-hover:h-2 transition-all duration-300`}>
                    <div className="absolute inset-0 bg-stone-800/80 rounded-full overflow-hidden" />
                    <div 
                      className="absolute top-0 bottom-0 left-0 transition-all duration-100 flex items-center justify-end overflow-hidden"
                      style={{ width: `${progress}%` }}
                    >
                      <svg className="absolute left-0 h-full w-[2000px] pointer-events-none" preserveAspectRatio="none" style={{
                        animation: !isPaused ? 'slideSquiggle 1s linear infinite' : 'none'
                      }}>
                         {!isPaused ? (
                           <path d="M0,2 Q5,0 10,2 T20,2 T30,2 T40,2 T50,2 T60,2 T70,2 T80,2 T90,2 T100,2 T110,2 T120,2 T130,2 T140,2 T150,2 T160,2 T170,2 T180,2 T190,2 T200,2 T210,2 T220,2 T230,2 T240,2 T250,2 T260,2 T270,2 T280,2 T290,2 T300,2 T310,2 T320,2 T330,2 T340,2 T350,2 T360,2 T370,2 T380,2 T390,2 T400,2 T410,2 T420,2 T430,2 T440,2 T450,2 T460,2 T470,2 T480,2 T490,2 T500,2 T510,2 T520,2 T530,2 T540,2 T550,2 T560,2 T570,2 T580,2 T590,2 T600,2 T610,2 T620,2 T630,2 T640,2 T650,2 T660,2 T670,2 T680,2 T690,2 T700,2 T710,2 T720,2 T730,2 T740,2 T750,2 T760,2 T770,2 T780,2 T790,2 T800,2 T810,2 T820,2 T830,2 T840,2 T850,2 T860,2 T870,2 T880,2 T890,2 T900,2 T910,2 T920,2 T930,2 T940,2 T950,2 T960,2 T970,2 T980,2 T990,2 T1000,2 T1010,2 T1020,2 T1030,2 T1040,2 T1050,2 T1060,2 T1070,2 T1080,2 T1090,2 T1100,2 T1110,2 T1120,2 T1130,2 T1140,2 T1150,2 T1160,2 T1170,2 T1180,2 T1190,2 T1200,2 T1210,2 T1220,2 T1230,2 T1240,2 T1250,2 T1260,2 T1270,2 T1280,2 T1290,2 T1300,2 T1310,2 T1320,2 T1330,2 T1340,2 T1350,2 T1360,2 T1370,2 T1380,2 T1390,2 T1400,2 T1410,2 T1420,2 T1430,2 T1440,2 T1450,2 T1460,2 T1470,2 T1480,2 T1490,2 T1500,2 T1510,2 T1520,2 T1530,2 T1540,2 T1550,2 T1560,2 T1570,2 T1580,2 T1590,2 T1600,2 T1610,2 T1620,2 T1630,2 T1640,2 T1650,2 T1660,2 T1670,2 T1680,2 T1690,2 T1700,2 T1710,2 T1720,2 T1730,2 T1740,2 T1750,2 T1760,2 T1770,2 T1780,2 T1790,2 T1800,2 T1810,2 T1820,2 T1830,2 T1840,2 T1850,2 T1860,2 T1870,2 T1880,2 T1890,2 T1900,2 T1910,2 T1920,2 T1930,2 T1940,2 T1950,2 T1960,2 T1970,2 T1980,2 T1990,2 T2000,2" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                         ) : (
                           <line x1="0" y1="2" x2="2000" y2="2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                         )}
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className={`flex items-center ${isMini ? 'space-x-3' : 'space-x-4'}`}>
                    <button onClick={() => seek(-15)} className="text-stone-400 transition" onMouseEnter={(e) => e.currentTarget.style.color = '#fbbf24'} onMouseLeave={(e) => e.currentTarget.style.color = ''}><Icon icon="tabler:rewind-backward-15" width={isMini ? 16 : 22} /></button>
                    <button onClick={togglePlay} className="text-[color:var(--accent)] transition" onMouseEnter={(e) => e.currentTarget.style.color = '#fbbf24'} onMouseLeave={(e) => e.currentTarget.style.color = ''}>{isPaused ? <Play size={isMini ? 16 : 20} fill="currentColor" /> : <Pause size={isMini ? 16 : 20} fill="currentColor" />}</button>
                    <button onClick={() => seek(15)} className="text-stone-400 transition" onMouseEnter={(e) => e.currentTarget.style.color = '#fbbf24'} onMouseLeave={(e) => e.currentTarget.style.color = ''}><Icon icon="tabler:rewind-forward-15" width={isMini ? 16 : 22} /></button>
                  </div>
                  <div className={`${isMini ? 'text-[8px]' : 'text-[10px]'} font-bold text-stone-500 tracking-wider`}>
                    -{formatTime(duration - currentTime)}
                  </div>
                  <div className={`flex items-center ${isMini ? 'space-x-1.5' : 'space-x-2'} text-stone-500`}>
                    <AnimatePresence mode="wait">
                      {!showVolume && (
                        <motion.div 
                          key="static-vol"
                          initial={{ opacity: 0 }} 
                          animate={{ opacity: 1 }} 
                          exit={{ opacity: 0 }}
                          className={`flex items-center ${isMini ? 'space-x-1' : 'space-x-2'}`}
                        >
                           {isMuted ? <VolumeX size={isMini ? 12 : 16} className="text-[color:var(--accent)] opacity-50" /> : <Volume2 size={isMini ? 12 : 16} />}
                           <span className={`${isMini ? 'text-[8px]' : 'text-[10px]'} font-bold`}>{isMuted ? "MUTED" : `${volumeLabel}%`}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            </>
          ) : (           
            <div className="flex flex-col items-center space-y-4 opacity-20 w-full h-full justify-center pointer-events-auto">
              <img src={logo} className="w-16 h-16 rounded-2xl grayscale pointer-events-none" alt="" />
              <p className="text-[9px] text-stone-500 font-black uppercase tracking-[0.3em] pointer-events-none">Waiting for Content</p>
            </div>
          )}
      </motion.div>


      {/* Bottom Interactive Area - Wraps library strip for stable hover state */}
      <div 
        className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none flex flex-col justify-end"
        onMouseEnter={() => {
          if (isPaused) setIsGalleryHovered(true);
        }}
        onMouseLeave={() => setIsGalleryHovered(false)}
      >
        {/* Library Strip */}
        <motion.div 
           initial={false}
           animate={{ 
             y: showGallery ? 0 : 120,
             opacity: showGallery ? 1 : 0
           }}
           transition={{ type: "spring", damping: 30, stiffness: 200 }}
           className="w-full h-28 glass-elevated border-t border-white/5 flex flex-col overflow-hidden shadow-2xl pointer-events-auto relative z-10"
        >
           <div className="h-28 overflow-x-auto overflow-y-hidden scrollbar-none px-4 py-4 flex items-center space-x-3 pointer-events-auto">
            {library.map((file) => {
              const stillPoster = file.thumbnailPath ?? file.ruforgePosterPath;
              return (
              <button 
                key={file.path}
                onClick={() => setPlayingFile(file)}
                className={`flex-shrink-0 w-32 h-full rounded-xl overflow-hidden relative group border-2 transition-all ${playingFile?.path === file.path ? 'border-[color:var(--accent)] shadow-lg shadow-black/30' : 'border-transparent opacity-60 hover:opacity-100'}`}
              >
                {stillPoster ? (
                  <img src={convertFileSrc(stillPoster)} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-stone-900 pointer-events-none">
                    <Video className="w-8 h-8 text-stone-700" strokeWidth={1.25} aria-hidden />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                <p className="absolute bottom-1 left-2 right-2 text-[7px] font-black text-stone-100 truncate uppercase tracking-tighter">
                  {file.name}
                </p>
              </button>
            );
            })}
            {library.length === 0 && (
              <p className="text-[8px] text-stone-600 font-bold uppercase tracking-widest w-full text-center">Library Empty</p>
            )}
         </div>
      </motion.div>
      </div>
    </div>
  );
}
