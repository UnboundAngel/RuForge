import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icon } from "@iconify/react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "./assets/neotubeIcon.png";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Pin,
  Video,
  ExternalLink,
  Music,
  Speaker,
  Layers,
} from "lucide-react";
import { MediaFile, GalleryEntry, PlaylistCollection } from "./types";
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
  const bars = 14;
  const barKeyframes = useMemo(() => {
    return [...Array(bars)].map((_, i) => {
      const maxAmplitude = i < 4 ? 14 : i < 10 ? 11 : 8;
      return [...Array(6)].map(() => Math.floor(Math.random() * maxAmplitude + 3));
    });
  }, []);

  return (
    <div className="flex items-end space-x-[2.5px] h-4">
      {barKeyframes.map((keyframes, i) => (
        <motion.div
          key={i}
          animate={{
            height: isPaused ? 2 : keyframes,
            opacity: isPaused ? 0.4 : 0.8
          }}
          transition={{
            duration: i < 4 ? 0.8 + Math.random() * 0.4 : 0.4 + Math.random() * 0.3,
            repeat: Infinity,
            repeatType: "mirror",
            ease: "easeInOut",
            delay: i * 0.03,
          }}
          className="w-[2px] bg-[color:var(--accent)] rounded-full"
        />
      ))}
    </div>
  );
};

const Tooltip = ({ text, children, side = "bottom", disabled = false }: { text: string; children: React.ReactNode; side?: "bottom" | "top"; disabled?: boolean }) => {
  const [isHovered, setIsHovered] = useState(false);
  if (disabled) return <>{children}</>;
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
            className={`absolute ${side === "bottom" ? "bottom-full mb-3" : "top-full mt-3"} px-2 py-1 bg-stone-950/95 backdrop-blur-xl border border-white/10 rounded-lg text-[8px] font-black tracking-[0.2em] text-white uppercase whitespace-nowrap z-[100] shadow-2xl shadow-black pointer-events-none`}
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

async function extractProminentColor(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Do NOT set crossOrigin for local asset:// or https://asset.localhost protocol
    // as it can often trigger CORS blocks on local resources that don't send headers.
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        
        ctx.drawImage(img, 0, 0, 32, 32);
        const imageData = ctx.getImageData(0, 0, 32, 32).data;
        
        let bestColor = null;
        let maxScore = -1;

        for (let i = 0; i < imageData.length; i += 4) {
          const r = imageData[i];
          const g = imageData[i+1];
          const b = imageData[i+2];
          const a = imageData[i+3];

          if (a < 200) continue; 

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          
          // Luma (perceived brightness)
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          // Saturation
          const sat = max === 0 ? 0 : (max - min) / max;

          // We want colors that are vivid but not too dark or too white.
          // Score based on saturation and a "sweet spot" for luminance.
          const lumWeight = 1 - Math.abs(lum - 0.5) * 2; // Peak score at 0.5 lum
          const score = sat * lumWeight;

          if (score > maxScore && lum > 0.15 && lum < 0.85) {
            maxScore = score;
            bestColor = { r, g, b };
          }
        }

        if (!bestColor) {
          // Fallback: If no "vibrant" color found, try to get a brightened average
          let tr = 0, tg = 0, tb = 0, tc = 0;
          for (let i = 0; i < imageData.length; i += 4) {
            if (imageData[i+3] < 200) continue;
            tr += imageData[i];
            tg += imageData[i+1];
            tb += imageData[i+2];
            tc++;
          }
          if (tc > 0) {
            bestColor = { r: tr/tc, g: tg/tc, b: tb/tc };
          }
        }

        if (!bestColor) return resolve(null);

        let { r, g, b } = bestColor;
        const finalLum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Always ensure visibility on black background (boost if too dark)
        if (finalLum < 0.4) {
          const boost = 0.4 / finalLum;
          r = Math.min(255, r * boost);
          g = Math.min(255, g * boost);
          b = Math.min(255, b * boost);
        }

        const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
        resolve(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
      } catch (e) {
        // This is usually a SecurityError if the canvas is tainted
        console.error("Dynamic color extraction failed (SecurityError/Tainted Canvas)", e);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export default function MiniPlayer() {
  const [defaultAccent, setDefaultAccent] = useState("#f59e0b");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ruforge-settings");
      const parsed = raw ? JSON.parse(raw) : null;
      const hex = typeof parsed?.accentColor === "string" ? parsed.accentColor : "#f59e0b";
      setDefaultAccent(hex);
      syncRuforgeAccentCss(hex);
    } catch {
      syncRuforgeAccentCss("#f59e0b");
    }
  }, []);

  useEffect(() => {
    emit("mini-player-ready");
  }, []);

  const [playingFile, setPlayingFile] = useState<MediaFile | null>(null);
  const coverArtSrc = playingFile?.ruforgePosterPath ?? playingFile?.thumbnailPath;

  useEffect(() => {
    if (!coverArtSrc) {
      syncRuforgeAccentCss(defaultAccent);
      return;
    }
    const src = convertFileSrc(coverArtSrc);
    extractProminentColor(src).then((color) => {
      syncRuforgeAccentCss(color || defaultAccent);
    });
  }, [coverArtSrc, defaultAccent]);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
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
  const [library, setLibrary] = useState<GalleryEntry[]>([]);
  const [isGalleryHovered, setIsGalleryHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [isLooping, setIsLooping] = useState(() => localStorage.getItem("miniplayer-loop") === "true");
  const [isMediaSelectorOpen, setIsMediaSelectorOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("miniplayer-loop", isLooping.toString());
  }, [isLooping]);

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

  const groupEntriesByDate = (entries: GalleryEntry[]) => {
    const sorted = [...entries].sort((a, b) => {
      const timeA = a.kind === 'media' ? a.created : (a.items[0]?.created || 0);
      const timeB = b.kind === 'media' ? b.created : (b.items[0]?.created || 0);
      return timeB - timeA;
    });

    const groups: { [key: string]: GalleryEntry[] } = {};

    sorted.forEach(entry => {
      const timestamp = entry.kind === 'media' ? entry.created : (entry.items[0]?.created || 0);
      const date = new Date(timestamp * 1000);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      let dateLabel = "";
      if (date.toDateString() === today.toDateString()) {
        dateLabel = "Today";
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateLabel = "Yesterday";
      } else {
        dateLabel = date.toLocaleDateString(undefined, { 
          weekday: 'long', 
          month: 'long', 
          day: 'numeric',
          year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
      }

      if (!groups[dateLabel]) groups[dateLabel] = [];
      groups[dateLabel].push(entry);
    });

    return groups;
  };

  useEffect(() => {
    const run = async () => {
      try {
        const ruforgeInternalDir = "C:\\RuForge\\Media";
        const dirs = [ruforgeInternalDir, outputDir].filter(d => d && d.trim() !== "");
        
        const scans = await Promise.all(
          dirs.map((d) => invoke<GalleryEntry[]>("scan_gallery", { dir: d }))
        );
        
        const combined = scans.flat();
        const uniqueMap = new Map<string, GalleryEntry>();
        for (const entry of combined) {
          uniqueMap.set(entry.path, entry);
        }
        
        const data = Array.from(uniqueMap.values());
        setLibrary(data);

        const mediaFiles = data.flatMap(e => e.kind === 'media' ? [e] : e.items);
        const missing = filesMissingPoster(mediaFiles);
        if (missing.length === 0) return;
        
        void (async () => {
          await ensurePostersForFiles(missing);
          try {
            const scans2 = await Promise.all(
              dirs.map((d) => invoke<GalleryEntry[]>("scan_gallery", { dir: d }))
            );
            const combined2 = scans2.flat();
            const uniqueMap2 = new Map<string, GalleryEntry>();
            for (const entry of combined2) {
              uniqueMap2.set(entry.path, entry);
            }
            setLibrary(Array.from(uniqueMap2.values()));
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
    const unlisten = listen<MediaFile>("play-media", (_event) => {
      // If someone else (main app) starts playing, the MiniPlayer should just STOP
      setPlayingFile(null);
    });

    const unlistenMiniHandoff = listen<MediaFile>("play-in-mini", (event) => {
      setPlayingFile(event.payload);
      incrementViewCount(event.payload);
      emit("stop-playback", "mini-player");
      getCurrentWindow().setFocus().catch(console.error);
    });

    const unlistenStop = listen<string>("stop-playback", (event) => {
      if (event.payload !== "mini-player") {
        setPlayingFile(null);
      }
    });

    return () => { 
      unlisten.then(f => f()); 
      unlistenMiniHandoff.then(f => f());
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
      if (v.buffered.length > 0) {
        setBuffered((v.buffered.end(v.buffered.length - 1) / duration) * 100);
      }
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

  const showGallery = isMediaSelectorOpen;

  const playingAudioOnly = Boolean(playingFile && isAudioOnlyPath(playingFile.path));
  const isProbablyWindows =
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

  const openWindowsSoundSettings = () => {
    invoke("open_windows_sound_settings").catch(console.error);
  };

  const audioPlaylistMini = useMemo(
    () =>
      library
        .flatMap(e => e.kind === 'media' ? [e] : e.items)
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

  const incrementViewCount = (file: MediaFile) => {
    const saved = localStorage.getItem(`views-${file.path}`);
    const current = saved ? parseInt(saved) : 0;
    localStorage.setItem(`views-${file.path}`, (current + 1).toString());
  };

  const handleSelectMedia = (file: MediaFile) => {
    setPlayingFile(file);
    incrementViewCount(file);
    setIsMediaSelectorOpen(false);
  };

  return (
    <div 
      className={`h-screen w-screen bg-[#121212] overflow-hidden border border-white/5 rounded-3xl select-none relative group/mini shadow-2xl ${!isCursorVisible && !isPaused ? 'cursor-none' : ''}`}
      onWheel={handleWheel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovering(false)}
    >
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
        <Tooltip text="Toggle Media Selector" side="top" disabled={isSmallMode}>
          <button 
            onClick={() => setIsMediaSelectorOpen(!isMediaSelectorOpen)}
            className={`p-1.5 pointer-events-auto transition-colors ${isMediaSelectorOpen ? 'text-[color:var(--accent)]' : 'text-stone-400 hover:text-white'}`}
          >
            <Icon icon="tabler:library" width={18} height={18} />
          </button>
        </Tooltip>
        
        <div 
          className="flex-1 h-full cursor-move pointer-events-auto relative"
          onPointerDown={(e) => {
              e.stopPropagation();
              getCurrentWindow().startDragging();
          }}
        />

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid grid-rows-2 grid-flow-col gap-1 opacity-20 pointer-events-none">
          {[...Array(8)].map((_, i) => <div key={i} className="w-0.5 h-0.5 bg-white rounded-full" />)}
        </div>

        <div className="flex items-center space-x-1 pointer-events-auto">
          {playingFile && (
            <Tooltip text="Back to App" side="top" disabled={isSmallMode}>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const { emit } = await import("@tauri-apps/api/event");
                  await emit("send-to-main", playingFile);
                  getCurrentWindow().close();
                }}
                className="p-1.5 text-stone-400 hover:text-[color:var(--accent)] transition-colors"
              >
                <ExternalLink size={16} strokeWidth={2.5} />
              </button>
            </Tooltip>
          )}
          {playingFile && playingAudioOnly && isProbablyWindows && (
            <Tooltip text="Windows Sound Settings" side="top" disabled={isSmallMode}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openWindowsSoundSettings();
                }}
                className="p-1.5 text-stone-400 hover:text-[color:var(--accent)] transition-colors"
              >
                <Speaker size={16} strokeWidth={2.5} aria-hidden />
              </button>
            </Tooltip>
          )}
          <Tooltip text={isPinned ? "Unpin Window" : "Pin Window"} side="top" disabled={isSmallMode}>
            <button 
              onClick={async () => {
                const newPinned = !isPinned;
                setIsPinned(newPinned);
                localStorage.setItem("miniplayer-pinned", newPinned.toString());
                await getCurrentWindow().setAlwaysOnTop(newPinned);
              }}
              className={`p-1.5 transition-colors ${isPinned ? 'text-[color:var(--accent)]' : 'text-stone-400 hover:text-white'}`}
            >
              <Pin size={16} strokeWidth={2.5} className={isPinned ? 'fill-current' : ''} />
            </button>
          </Tooltip>

          <Tooltip text="Close Player" side="top" disabled={isSmallMode}>
            <button 
              onPointerDown={(e) => {
                e.stopPropagation();
                getCurrentWindow().close();
              }} 
              className="p-1.5 text-stone-400 hover:text-white transition-colors"
            >
              <Icon icon="tabler:x" width={18} height={18} />
            </button>
          </Tooltip>
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
                      if (isLooping && mediaRef.current) {
                        mediaRef.current.currentTime = 0;
                        mediaRef.current.play();
                        return;
                      }
                      if (playingFile) clearPlaybackPos(playingFile.path);
                      const advance = readAudioAutoAdvanceFolder();
                      if (advance && nextMini && playingFile) {
                        handleSelectMedia(nextMini);
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
                    if (isLooping && mediaRef.current) {
                      mediaRef.current.currentTime = 0;
                      mediaRef.current.play();
                      return;
                    }
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
                      </div>
                      <Waveform isPaused={isPaused} />
                   </div>
                   <div className="w-full h-1.5 bg-white/15 rounded-full relative mb-4 pointer-events-auto cursor-pointer" onClick={handleSeek}>
                      <div className="absolute top-0 left-0 h-full bg-white/20 rounded-full" style={{ width: `${buffered}%` }} />
                      <div 
                         className="absolute top-0 left-0 h-full bg-[color:var(--accent)] rounded-full shadow-[0_0_8px_rgba(var(--accent-rgb),0.4)]"
                         style={{ width: `${progress}%` }}
                      />
                   </div>
                   <div className={`flex items-center justify-center ${winSize.width < 380 ? 'space-x-4' : 'space-x-8'} text-[color:var(--accent)] pointer-events-auto transition-all`}>
                      <button onClick={() => seek(-15)} className="opacity-60 hover:opacity-100 transition-all active:scale-90">
                        <Icon icon="tabler:rewind-backward-15" width={winSize.width < 380 ? 18 : 22} />
                      </button>
                      <button onClick={togglePlay} className="hover:scale-110 active:scale-90 transition-all">{isPaused ? <Play size={winSize.width < 380 ? 20 : 24} fill="currentColor" /> : <Pause size={winSize.width < 380 ? 20 : 24} fill="currentColor" />}</button>
                      <button onClick={() => seek(15)} className="opacity-60 hover:opacity-100 transition-all active:scale-90">
                        <Icon icon="tabler:rewind-forward-15" width={winSize.width < 380 ? 18 : 22} />
                      </button>
                      <button 
                        onClick={() => setIsLooping(!isLooping)} 
                        className={`transition-all p-1 rounded-lg active:scale-90 ${isLooping ? 'bg-[color:var(--accent)]/20' : 'opacity-40 hover:opacity-100'}`}
                        title={isLooping ? "Disable Loop" : "Enable Loop"}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.div
                            key={isLooping ? "looping-small" : "not-looping-small"}
                            initial={{ opacity: 0, rotate: -20, scale: 0.8 }}
                            animate={{ opacity: 1, rotate: 0, scale: 1 }}
                            exit={{ opacity: 0, rotate: 20, scale: 0.8 }}
                            transition={{ duration: 0.15 }}
                          >
                            <Icon icon={isLooping ? "streamline:arrow-infinite-loop" : "radix-icons:loop"} width={winSize.width < 380 ? 16 : 20} />
                          </motion.div>
                        </AnimatePresence>
                      </button>
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

                  <div className={`w-full rounded-full relative transition-all duration-300 ${isMini ? (hoverProgress !== null ? 'h-3' : 'h-1.5') : (hoverProgress !== null ? 'h-4' : 'h-2')} bg-white/15`}>
                    <div className="absolute top-0 left-0 h-full bg-white/20 rounded-full" style={{ width: `${buffered}%` }} />
                    <div className="absolute top-0 left-0 h-full bg-[#271C18] rounded-full shadow-[0_0_10px_rgba(39,28,24,0.4)]" style={{ width: `${progress}%` }} />
                    {hoverProgress !== null && (
                      <div className="absolute top-0 left-0 h-full bg-white/10 rounded-full pointer-events-none" style={{ width: `${hoverProgress * 100}%` }} />
                    )}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${isMini ? 'w-3 h-3' : 'w-4 h-4'} bg-white rounded-full border-2 border-[#271C18] shadow-lg transition-opacity ${hoverProgress !== null ? "opacity-100" : "opacity-0"}`}
                      style={{ left: `${progress}%` }}
                    />
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className={`flex items-center ${isMini ? 'space-x-3' : 'space-x-4'}`}>
                    <Tooltip text="Rewind 15s" disabled={isSmallMode}>
                      <button onClick={() => seek(-15)} className="text-stone-400 transition" onMouseEnter={(e) => e.currentTarget.style.color = '#fbbf24'} onMouseLeave={(e) => e.currentTarget.style.color = ''}><Icon icon="tabler:rewind-backward-15" width={isMini ? 16 : 22} /></button>
                    </Tooltip>
                    
                    <Tooltip text={isPaused ? "Play" : "Pause"} disabled={isSmallMode}>
                      <button onClick={togglePlay} className="text-[color:var(--accent)] transition" onMouseEnter={(e) => e.currentTarget.style.color = '#fbbf24'} onMouseLeave={(e) => e.currentTarget.style.color = ''}>{isPaused ? <Play size={isMini ? 16 : 20} fill="currentColor" /> : <Pause size={isMini ? 16 : 20} fill="currentColor" />}</button>
                    </Tooltip>

                    <Tooltip text="Forward 15s" disabled={isSmallMode}>
                      <button onClick={() => seek(15)} className="text-stone-400 transition" onMouseEnter={(e) => e.currentTarget.style.color = '#fbbf24'} onMouseLeave={(e) => e.currentTarget.style.color = ''}><Icon icon="tabler:rewind-forward-15" width={isMini ? 16 : 22} /></button>
                    </Tooltip>

                    <Tooltip text={isLooping ? "Disable Loop" : "Enable Loop"} disabled={isSmallMode}>
                      <button 
                        onClick={() => {
                          const nextLoop = !isLooping;
                          setIsLooping(nextLoop);
                          if (mediaRef.current) mediaRef.current.loop = nextLoop;
                        }} 
                        className={`transition-all p-1 rounded-lg ${isLooping ? 'text-[color:var(--accent)] bg-[color:var(--accent)]/10' : 'text-stone-400 hover:text-white'}`}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.div
                            key={isLooping ? "looping" : "not-looping"}
                            initial={{ opacity: 0, rotate: -20, scale: 0.8 }}
                            animate={{ opacity: 1, rotate: 0, scale: 1 }}
                            exit={{ opacity: 0, rotate: 20, scale: 0.8 }}
                            transition={{ duration: 0.15 }}
                          >
                            <Icon icon={isLooping ? "streamline:arrow-infinite-loop" : "radix-icons:loop"} width={isMini ? 16 : 20} />
                          </motion.div>
                        </AnimatePresence>
                      </button>
                    </Tooltip>
                  </div>
                  <div className={`${isMini ? 'text-[8px]' : 'text-[10px]'} font-bold text-stone-500 tracking-wider`}>
                    {formatTime(Math.max(0, duration - currentTime))}
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
            <div className="w-full h-full overflow-y-auto pt-16 pb-12 px-6 scrollbar-none pointer-events-auto bg-stone-950/50">
              <div className="mb-4">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-8 h-8 rounded-xl bg-[color:var(--accent)]/10 flex items-center justify-center border border-[color:var(--accent)]/20 shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)]">
                    <Video className="text-[color:var(--accent)]" size={16} />
                  </div>
                  <h2 className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Video Library</h2>
                </div>
                
                {library.length > 0 ? (
                  <div className="space-y-8">
                    {Object.entries(groupEntriesByDate(library)).map(([date, entries]) => (
                      <div key={date} className="space-y-4">
                        <h3 className="text-[9px] font-black text-stone-500 uppercase tracking-[0.2em] px-1 border-l-2 border-[color:var(--accent)]/30 ml-1 pl-2">{date}</h3>
                        <div className="grid grid-cols-2 gap-4">
                          {entries.map((entry) => {
                            if (entry.kind === 'playlist') {
                              const playlist = entry as PlaylistCollection;
                              const mainThumbnail = playlist.stackThumbnailPath || (playlist.items[0]?.thumbnailPath || playlist.items[0]?.ruforgePosterPath);
                              return (
                                <motion.button 
                                  key={playlist.path}
                                  initial={{ opacity: 0, y: 20 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  whileHover={{ y: -4, scale: 1.02 }}
                                  onClick={() => handleSelectMedia(playlist.items[0])}
                                  className="flex flex-col text-left group relative"
                                >
                                  <div className="aspect-video w-full rounded-2xl overflow-hidden relative border border-white/5 bg-stone-900/50 mb-2 shadow-xl group-hover:border-[color:var(--accent)]/30 transition-all duration-300">
                                    <div className="absolute inset-0 bg-stone-800 rounded-2xl rotate-[-2deg] scale-[0.98] opacity-40 translate-y-[-4px]" />
                                    <div className="absolute inset-0 bg-stone-800 rounded-2xl rotate-[2deg] scale-[0.98] opacity-60 translate-y-[-2px]" />
                                    <div className="absolute inset-0 rounded-2xl overflow-hidden bg-black z-10 border border-white/10">
                                      {mainThumbnail ? (
                                        <img src={convertFileSrc(mainThumbnail)} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-60" />
                                      ) : (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                           <Layers className="w-8 h-8 text-stone-700 opacity-20" strokeWidth={1} />
                                        </div>
                                      )}
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-[color:var(--accent)] rounded-full flex items-center gap-1 shadow-2xl z-20">
                                        <Layers size={8} className="text-black" />
                                        <span className="text-[7px] font-black text-black uppercase tracking-widest">{playlist.itemCount}</span>
                                      </div>
                                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30">
                                        <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-2xl scale-75 group-hover:scale-100 transition-transform duration-300">
                                          <Play size={18} fill="currentColor" />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <p className="text-[9px] font-black text-stone-400 truncate uppercase tracking-widest px-1 group-hover:text-white transition-colors">
                                    {playlist.title}
                                  </p>
                                </motion.button>
                              );
                            }

                            const file = entry as MediaFile;
                            const stillPoster = file.thumbnailPath ?? file.ruforgePosterPath;
                            return (
                              <motion.button 
                                key={file.path}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                whileHover={{ y: -4, scale: 1.02 }}
                                onClick={() => handleSelectMedia(file)}
                                className="flex flex-col text-left group relative"
                              >
                                <div className="aspect-video w-full rounded-2xl overflow-hidden relative border border-white/5 bg-stone-900/50 mb-2 shadow-xl group-hover:border-[color:var(--accent)]/30 transition-all duration-300">
                                  {stillPoster ? (
                                    <img src={convertFileSrc(stillPoster)} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                  ) : (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <Video className="w-8 h-8 text-stone-700 opacity-20" strokeWidth={1} />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors duration-300" />
                                  
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <div className="w-10 h-10 rounded-full bg-[color:var(--accent)] text-black flex items-center justify-center shadow-2xl scale-75 group-hover:scale-100 transition-transform duration-300">
                                      <Play size={18} fill="currentColor" />
                                    </div>
                                  </div>

                                  {isAudioOnlyPath(file.path) && (
                                    <div className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/5">
                                      <Music size={10} className="text-[color:var(--accent)]" />
                                    </div>
                                  )}
                                </div>
                                <p className="text-[9px] font-black text-stone-400 truncate uppercase tracking-widest px-1 group-hover:text-white transition-colors">
                                  {file.name}
                                </p>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 opacity-20">
                    <img src={logo} className="w-16 h-16 rounded-2xl grayscale mb-4" alt="" />
                    <p className="text-[9px] text-stone-500 font-black uppercase tracking-[0.3em]">No Media Found</p>
                  </div>
                )}
              </div>
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
            {[...library].sort((a, b) => {
              const timeA = a.kind === 'media' ? a.created : (a.items[0]?.created || 0);
              const timeB = b.kind === 'media' ? b.created : (b.items[0]?.created || 0);
              return timeB - timeA;
            }).map((entry) => {
              const isPlaylist = entry.kind === 'playlist';
              const file = isPlaylist ? (entry as PlaylistCollection).items[0] : (entry as MediaFile);
              const title = isPlaylist ? (entry as PlaylistCollection).title : file.name;
              const stillPoster = isPlaylist 
                ? ((entry as PlaylistCollection).stackThumbnailPath || file?.thumbnailPath || file?.ruforgePosterPath)
                : (file.thumbnailPath ?? file.ruforgePosterPath);
              
              return (
                <button 
                  key={entry.path}
                  onClick={() => handleSelectMedia(file)}
                  className={`flex-shrink-0 w-32 h-full rounded-xl overflow-hidden relative group border-2 transition-all ${playingFile?.path === file?.path ? 'border-[color:var(--accent)] shadow-lg shadow-black/30' : 'border-transparent opacity-60 hover:opacity-100'}`}
                >
                  {isPlaylist && (
                    <>
                      <div className="absolute inset-0 bg-stone-800 rounded-xl rotate-[-2deg] scale-[0.98] opacity-40 translate-y-[-2px]" />
                      <div className="absolute inset-0 bg-stone-800 rounded-xl rotate-[2deg] scale-[0.98] opacity-60 translate-y-[-1px]" />
                    </>
                  )}
                  <div className="absolute inset-0 rounded-xl overflow-hidden bg-black z-10">
                    {stillPoster ? (
                      <img src={convertFileSrc(stillPoster)} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-stone-900 pointer-events-none">
                        {isPlaylist ? <Layers size={14} className="text-stone-700" /> : <Video className="w-8 h-8 text-stone-700" strokeWidth={1.25} aria-hidden />}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                    {isPlaylist && (
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-[color:var(--accent)] rounded-full flex items-center gap-0.5 shadow-2xl z-20">
                        <Layers size={6} className="text-black" />
                        <span className="text-[6px] font-black text-black uppercase tracking-widest">{(entry as PlaylistCollection).itemCount}</span>
                      </div>
                    )}
                    <p className="absolute bottom-1 left-2 right-2 text-[7px] font-black text-stone-100 truncate uppercase tracking-tighter">
                      {title}
                    </p>
                  </div>
                </button>
              );
            })}
            {library.length === 0 && (
              <p className="text-[8px] text-stone-600 font-bold uppercase tracking-widest w-full text-center">Library Empty</p>
            )}
         </div>
      </motion.div>
      </div>

      {/* Resize Handle (Spotify Style) */}
      <AnimatePresence>
        {isFocused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
            className="absolute bottom-1 right-1 w-6 h-6 cursor-nwse-resize z-[150] flex items-center justify-center p-1"
            onMouseDown={(e) => {
              e.stopPropagation();
              // In Tauri v2, the method is startResizeDragging and directions are PascalCase
              // @ts-ignore
              getCurrentWindow().startResizeDragging("SouthEast").catch(console.error);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-stone-400">
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
              <line x1="12" y1="8" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
