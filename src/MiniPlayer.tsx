import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Icon } from "@iconify/react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { setMiniWindowFocused } from "./appWindowFocus";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
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
import {
  DEFAULT_OUTPUT_DIR,
  RUFORGE_INTERNAL_DIR,
  hydratePlatformDefaultPaths,
} from "./platformPaths";

import { ScrubberHoverThumb } from "./scrubSpritePreview";
import {
  readResumeSeconds,
  writePlaybackPos,
  getPlaybackThumbnailBar,
} from "./playbackStorage";
import { readLoopForPath, writeLoopForPath } from "./playbackLoopStorage";
import { readPlaybackSpeed, writePlaybackSpeed } from "./playbackSpeedStorage";
import { extractProminentColor } from "./prominentColor";
import { useVideoAmbientBackdrop } from "./useVideoAmbientBackdrop";
import type { PlayInMiniPayload, SendToMainPayload } from "./playerHandoff";
import { ensurePostersForFiles, filesMissingPoster } from "./posterBackfill";
import { isAudioOnlyPath } from "./mediaKind";
import {
  readAudioAutoAdvanceFolder,
  readAudioPrefetchNext,
  readAutoDownloadScrubberPreviews,
} from "./audioPlaybackPrefs";
import { applyMediaOutputState } from "./applyMediaOutputState";
import { chapterAtTime, normalizeChapters } from "./chapters";
import { ChapterScrubber } from "./components/player/ChapterScrubber";
import { SponsorBlockScrubOverlay } from "./components/player/SponsorBlockScrubOverlay";
import { SponsorBlockSkipButton } from "./components/player/SponsorBlockSkipButton";
import { useSponsorBlockPlayback } from "./hooks/useSponsorBlockPlayback";
import type { SponsorBlockSkipCategory } from "./sponsorBlock";
import { loadMergedSettings, type RuforgeSettings } from "./store/types";
import { syncRuforgeAccentCss } from "./accentCss";
import {
  fetchSubtitleTracks,
  readSubtitlePreferredLang,
  revokeSubtitleBlobSrcs,
  subtitleTracksWithBlobSrc,
  syncVideoTextTrackModes,
  writeSubtitlePreferredLang,
  type SubtitleTrack,
} from "./localVideoSubtitles";
import { useSubtitleCueOverlay } from "./useSubtitleCueOverlay";
import { formatDuration } from "./components/downloader/downloaderFormat";

const SPONSORBLOCK_STUB_FILE: MediaFile = {
  name: "",
  path: "",
  size: 0,
  created: 0,
  duration: 0,
  thumbnailPath: null,
  ruforgePosterPath: null,
  subtitlePath: null,
  chapters: null,
  downloadMetadataHint: null,
  sourceUrl: null,
  sourceId: null,
};

const Waveform = ({ isPaused, mutedBars }: { isPaused: boolean; mutedBars?: boolean }) => {
  const playingPaths1 = [
    "M12,1.5 C18,0.5 22.5,6 23.5,12 C24.5,18 19,23.5 12,23 C5,22.5 0.5,18.5 1.5,12 C2.5,5.5 6,2.5 12,1.5 Z",
    "M12,2.5 C16,1.5 20,4.5 22,9 C24,13.5 24,19 19,21.5 C14,24 8,24 4.5,20 C1,16 1.5,10.5 4,6 C6.5,1.5 8,3.5 12,2.5 Z",
    "M12,1 C17.5,2.5 21,5 21.5,11 C22,17 19.5,21.5 13,23 C6.5,24.5 2,21.5 1.5,15 C1,8.5 6.5,-0.5 12,1 Z"
  ];
  
  const playingPaths2 = [
    "M12,1 C6.5,-0.5 2,2.5 1.5,8 C1,13.5 5.5,18.5 12,19 C18.5,19.5 23,15.5 22.5,9 C22,2.5 17.5,2.5 12,1 Z",
    "M12,2 C8,1 3.5,4 2,8.5 C0.5,13 1,18.5 6,21 C11,23.5 17,23 20.5,19 C24,15 23,9.5 20.5,5 C18,0.5 16,3 12,2 Z",
    "M12,1.5 C6.5,0.5 2.5,6 1.5,12 C0.5,18 6,23.5 12,23 C18,22.5 22.5,18.5 21.5,12 C20.5,5.5 18,2.5 12,1.5 Z"
  ];

  const idlePaths1 = [
    "M12,2 C17,2 22,7 22,12 C22,17 17,22 12,22 C7,22 2,17 2,12 C2,7 7,2 12,2 Z",
    "M12,2.5 C16.5,2 21.5,7.5 21,12 C20.5,16.5 16.5,21.5 12,21.5 C7.5,21.5 2.5,16.5 3,12 C3.5,7.5 7.5,3 12,2.5 Z",
    "M12,2 C17,2 22,7 22,12 C22,17 17,22 12,22 C7,22 2,17 2,12 C2,7 7,2 12,2 Z"
  ];

  const fillClass = mutedBars ? "fill-white/60" : "fill-[color:var(--accent)]";

  return (
    <div className="relative flex items-center justify-center w-9 h-9 shrink-0">
      {/* Animated Ambient Glow */}
      <motion.div 
        animate={{
          scale: isPaused ? [0.95, 1.05, 0.95] : [1, 1.3, 0.95, 1.2, 1],
          opacity: isPaused ? 0.2 : [0.3, 0.6, 0.4, 0.7, 0.3]
        }}
        transition={{
          duration: isPaused ? 3 : 1.5,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute inset-1.5 rounded-full bg-[color:var(--accent)] opacity-40 pointer-events-none"
        style={{ filter: "blur(8px)" }}
      />

      {/* Outer Morphing Fluid Layer (Semi-transparent, slower/counter-rotated) */}
      <svg viewBox="0 0 24 24" className={`absolute inset-1.5 w-6 h-6 ${fillClass} opacity-30`}>
        <motion.path
          key={isPaused ? 'paused' : 'playing'}
          animate={{
            d: isPaused ? idlePaths1 : playingPaths2,
            rotate: isPaused ? 0 : -360
          }}
          transition={{
            d: { duration: isPaused ? 4 : 2.2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" },
            rotate: { duration: 15, repeat: Infinity, ease: "linear" }
          }}
        />
      </svg>

      {/* Inner Morphing Fluid Layer (Prominent, faster) */}
      <svg viewBox="0 0 24 24" className={`relative w-[22px] h-[22px] ${fillClass} opacity-85 drop-shadow-md`}>
        <motion.path
          key={isPaused ? 'paused' : 'playing'}
          animate={{
            d: isPaused ? idlePaths1 : playingPaths1,
            rotate: isPaused ? 0 : 360
          }}
          transition={{
            d: { duration: isPaused ? 3 : 1.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" },
            rotate: { duration: 12, repeat: Infinity, ease: "linear" }
          }}
        />
      </svg>
    </div>
  );
};

const getArtistName = (file: MediaFile | null) => {
  if (!file) return "";
  if (file.downloadMetadataHint) {
    try {
      const parsed = JSON.parse(file.downloadMetadataHint);
      if (parsed.uploader) return parsed.uploader;
      if (parsed.channel) return parsed.channel;
      if (parsed.artist) return parsed.artist;
    } catch {
      // Ignore invalid JSON format hints (like "opus · ~137 kb/s")
    }
  }
  if (file.name.includes(" - ")) {
    return file.name.split(" - ")[0].trim();
  }
  return "";
};

const getTrackTitle = (file: MediaFile | null) => {
  if (!file) return "";
  if (file.name.includes(" - ")) {
    return file.name.split(" - ").slice(1).join(" - ").trim();
  }
  return file.name;
};

/** Max mini window size while browsing the in-player Video Library (no active file). */
const VIDEO_LIBRARY_MAX_WIDTH = 430;
const VIDEO_LIBRARY_MAX_HEIGHT = 275;

function computeMiniTooltipPlacement(
  anchor: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number,
  side: "bottom" | "top",
): { top: number; left: number; transform: string } {
  const pad = 8;
  const gap = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tw = Math.max(tooltipWidth, 1);
  const th = Math.max(tooltipHeight, 1);

  const preferBelow = side === "top";
  const belowTop = anchor.bottom + gap;
  const aboveTop = anchor.top - gap;
  const fitsBelow = belowTop + th <= vh - pad;
  const fitsAbove = aboveTop - th >= pad;

  let top: number;
  let translateY: string;
  if (preferBelow && fitsBelow) {
    top = belowTop;
    translateY = "0";
  } else if (!preferBelow && fitsAbove) {
    top = aboveTop;
    translateY = "-100%";
  } else if (fitsBelow) {
    top = belowTop;
    translateY = "0";
  } else {
    top = aboveTop;
    translateY = "-100%";
  }

  const centerX = anchor.left + anchor.width / 2;
  const half = tw / 2;
  let left = centerX;
  let translateX = "-50%";

  if (centerX - half < pad) {
    left = anchor.left;
    translateX = "0";
  } else if (centerX + half > vw - pad) {
    left = anchor.right;
    translateX = "-100%";
  }

  return { top, left, transform: `translate(${translateX}, ${translateY})` };
}

function MiniVolumeIcon({
  size,
  muted,
  volumePercent,
  className,
}: {
  size: number;
  muted: boolean;
  volumePercent: number;
  className?: string;
}) {
  if (muted || volumePercent <= 0) {
    return <VolumeX size={size} className={className} />;
  }
  if (volumePercent < 50) {
    return <Volume1 size={size} className={className} />;
  }
  return <Volume2 size={size} className={className} />;
}

const Tooltip = ({ text, children, side = "bottom", disabled = false }: { text: string; children: React.ReactNode; side?: "bottom" | "top"; disabled?: boolean }) => {
  const [isHovered, setIsHovered] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ top: number; left: number; transform: string } | null>(null);

  useLayoutEffect(() => {
    if (!isHovered || disabled || !anchorRef.current) {
      setPlacement(null);
      return;
    }
    const update = () => {
      const anchor = anchorRef.current;
      const tip = measureRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const tw = tip?.offsetWidth ?? 0;
      const th = tip?.offsetHeight ?? 0;
      if (tw === 0 || th === 0) return;
      setPlacement(computeMiniTooltipPlacement(r, tw, th, side));
    };
    update();
    const raf = requestAnimationFrame(() => requestAnimationFrame(update));
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
    };
  }, [isHovered, disabled, side, text]);

  if (disabled) return <>{children}</>;

  const tipClassName =
    "px-2 py-1 bg-stone-950/95 backdrop-blur-xl border border-white/10 rounded-lg text-[8px] font-black tracking-[0.2em] text-white uppercase whitespace-nowrap shadow-2xl shadow-black pointer-events-none";

  return (
    <div
      ref={anchorRef}
      className="relative flex flex-col items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              ref={measureRef}
              aria-hidden
              className={`fixed left-0 top-0 opacity-0 ${tipClassName}`}
            >
              {text}
            </div>
            <AnimatePresence>
              {isHovered && placement && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    position: "fixed",
                    top: placement.top,
                    left: placement.left,
                    transform: placement.transform,
                    zIndex: 10000,
                  }}
                  className={tipClassName}
                >
                  {text}
                </motion.div>
              )}
            </AnimatePresence>
          </>,
          document.body,
        )}
    </div>
  );
};

const MarqueeText = ({
  text,
  className,
  layoutKey,
}: {
  text: string;
  className?: string;
  /** Bumps overflow measurement when surrounding layout changes (e.g. tiny sidebar). */
  layoutKey?: boolean | number | string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldMarquee, setShouldMarquee] = useState(false);

  useEffect(() => {
    const check = () => {
      if (containerRef.current && textRef.current) {
        const isOverflowing = textRef.current.offsetWidth > containerRef.current.offsetWidth;
        setShouldMarquee(isOverflowing);
      }
    };
    check();
    // A small delay to ensure layout is stable
    const t = setTimeout(check, 100);
    window.addEventListener('resize', check);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', check);
    };
  }, [text, layoutKey]);

  return (
    <div ref={containerRef} className={`${className} overflow-hidden whitespace-nowrap`}>
      <div className={`flex w-max ${shouldMarquee ? "animate-marquee" : ""}`}>
        <span ref={textRef} className={shouldMarquee ? "pr-12" : ""}>{text}</span>
        {shouldMarquee && <span className="pr-12">{text}</span>}
      </div>
    </div>
  );
};

export default function MiniPlayer() {
  const [defaultAccent, setDefaultAccent] = useState("#EDCF9B");

  const [settings, setSettings] = useState<RuforgeSettings>(() => loadMergedSettings());

  useEffect(() => {
    const refresh = () => setSettings(loadMergedSettings());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "ruforge-settings") refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    try {
      const hex =
        typeof settings.accentColor === "string" ? settings.accentColor : "#EDCF9B";
      setDefaultAccent(hex);
      syncRuforgeAccentCss(hex);
    } catch {
      syncRuforgeAccentCss("#EDCF9B");
    }
  }, [settings.accentColor]);

  useEffect(() => {
    emit("mini-player-ready");
  }, []);

  useEffect(() => {
    void hydratePlatformDefaultPaths();
  }, []);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    document.addEventListener("dragover", onDragOver, { passive: false });
    return () => document.removeEventListener("dragover", onDragOver);
  }, []);

  const [playingFile, setPlayingFile] = useState<MediaFile | null>(null);
  const coverArtSrc = playingFile?.thumbnailPath ?? playingFile?.ruforgePosterPath;
  const playingAudioOnly = Boolean(playingFile && isAudioOnlyPath(playingFile.path));

  const [isPaused, setIsPaused] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [scrubberThumbs, setScrubberThumbs] = useState<string[]>([]);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [scrubPreviewRatio, setScrubPreviewRatio] = useState<number | null>(null);
  const [isCursorVisible, setIsCursorVisible] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handlePointerUp = () => setIsDragging(false);
    const handleBlur = () => setIsDragging(false);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);
  const cursorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoScrubberPreviews = readAutoDownloadScrubberPreviews();

  useEffect(() => {
    if (!playingFile || isAudioOnlyPath(playingFile.path)) {
      setScrubberThumbs([]);
      return;
    }
    invoke<string[]>("extract_frames", {
      videoPath: playingFile.path,
      allowGenerate: autoScrubberPreviews,
    })
      .then((paths) =>
        setScrubberThumbs(
          paths.filter((p) => {
            const f = p.replace(/^.*[/\\]/, "");
            return f.startsWith("sprite_") && f.endsWith(".jpg");
          }),
        ),
      )
      .catch(console.error);
  }, [playingFile, autoScrubberPreviews]);

  const [winSize, setWinSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setWinSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isCompactMode = winSize.height < 180;
  const isMicroMode = isCompactMode && winSize.height <= 135 && winSize.height > 85;
  const isTinyMode = isCompactMode && winSize.height <= 85;
  const isSmallMode = (winSize.width < 450 || winSize.height < 300) && !isCompactMode;
  const isLargeMode = !isSmallMode && !isCompactMode;
  const isNarrow = winSize.width < 400;
  const isMini = winSize.width < 340;
  
  const isUltraCompact = isCompactMode && winSize.width < 250;
  const isSuperUltraCompact = isCompactMode && winSize.width < 210;

  const buttonSpacing = isSuperUltraCompact 
    ? "space-x-0.5" 
    : isUltraCompact 
    ? "space-x-1" 
    : "space-x-2.5";

  const playBtnSize = isUltraCompact ? "w-7 h-7" : "w-9 h-9";
  const playIconSize = isUltraCompact ? 14 : 18;

  const controlBtnSize = isUltraCompact ? "w-6 h-6" : "w-7 h-7";
  const controlIconWidth = isUltraCompact ? 14 : 16;
  const rewindForwardIconWidth = isUltraCompact ? 14 : 18;

  const outerBtnSize = isUltraCompact ? "w-6 h-6" : "w-8 h-8";
  const outerIconSize = isUltraCompact ? 14 : 16;

  useEffect(() => {
    if (!isSmallMode && playingFile && !playingAudioOnly) return;
    if (!coverArtSrc) {
      syncRuforgeAccentCss(defaultAccent);
      return;
    }
    const src = convertFileSrc(coverArtSrc);
    extractProminentColor(src).then((color) => {
      syncRuforgeAccentCss(color || defaultAccent);
    });
  }, [coverArtSrc, defaultAccent, isSmallMode, playingFile, playingAudioOnly]);

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
  const libraryPosterBackfillEpochRef = useRef(0);
  const [isGalleryHovered, setIsGalleryHovered] = useState(false);
  const [, setIsFocused] = useState(true);
  const [isLooping, setIsLooping] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [isMediaSelectorOpen, setIsMediaSelectorOpen] = useState(false);

  const [volumeLabel, setVolumeLabel] = useState(() => {
    const saved = localStorage.getItem("miniplayer-volume");
    return saved ? Math.round(parseFloat(saved) * 100) : 100;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const mediaRef = useRef<HTMLMediaElement>(null);
  /** When set, next `loadedmetadata` on the main media element uses this instead of `readResumeSeconds`. */
  const playInMiniStartTimeRef = useRef<number | null>(null);
  const handoffPausedRef = useRef(false);
  /** Avoid re-seeking on repeat `loadedmetadata` while the same file keeps playing. */
  const resumeSeekAppliedPathRef = useRef<string | null>(null);
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null);
  const wasPlayingBeforeScrubRef = useRef(false);
  /** Blocks `timeupdate` from snapping the scrub thumb while a seek is in flight. */
  const isUserSeekingRef = useRef(false);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPlaybackPersistRef = useRef(0);
  const progressRafRef = useRef<number | null>(null);
  const [playbackSpeed, setPlaybackSpeedState] = useState(() => readPlaybackSpeed());
  const setPlaybackSpeed = (speed: number) => {
    writePlaybackSpeed(speed);
    setPlaybackSpeedState(speed);
  };
  const [isPressing, setIsPressing] = useState<"left" | "right" | null>(null);
  const [previousSpeed, setPreviousSpeed] = useState(1);
  const videoPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockClickRef = useRef(false);
  const videoSurfaceRef = useRef<HTMLDivElement>(null);
  const [mediaBlendOpacity, setMediaBlendOpacity] = useState(1);
  const prevVideoPathRef = useRef<string | null>(null);

  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const subtitleBlobTracksRef = useRef<SubtitleTrack[]>([]);
  const [selectedSubtitleLang, setSelectedSubtitleLang] = useState("");
  const [isSubtitlesEnabled, setIsSubtitlesEnabled] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const subtitleOverlayTextRef = useRef<HTMLDivElement>(null);
  const subtitleDragRowRef = useRef<HTMLDivElement>(null);
  /** Top of expanded-mode scrub strip — captions avoid overlapping higher-z controls. */
  const subtitleLayoutLimitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    win.setAlwaysOnTop(isPinned).catch(console.error);
  }, [isPinned]);

  useEffect(() => {
    const win = getCurrentWindow();
    let cancelled = false;
    const librarySize = new LogicalSize(
      VIDEO_LIBRARY_MAX_WIDTH,
      VIDEO_LIBRARY_MAX_HEIGHT,
    );

    const releasePlaybackWindowChrome = async () => {
      await win.setResizable(true);
      await win.setMinSize(null);
      await win.setMaxSize(null);
    };

    const applyLibraryWindowChrome = async () => {
      setIsMediaSelectorOpen(false);
      await win.setResizable(false);
      await win.setMinSize(librarySize);
      await win.setMaxSize(librarySize);
      await win.setSize(librarySize);
    };

    const enforceLibraryWindowSize = async () => {
      if (cancelled) return;
      const physical = await win.innerSize();
      const scale = await win.scaleFactor();
      const logical = physical.toLogical(scale);
      if (
        Math.abs(logical.width - VIDEO_LIBRARY_MAX_WIDTH) > 2 ||
        Math.abs(logical.height - VIDEO_LIBRARY_MAX_HEIGHT) > 2
      ) {
        await win.setSize(librarySize);
      }
    };

    if (playingFile) {
      void releasePlaybackWindowChrome().catch(console.error);
      return () => {
        cancelled = true;
      };
    }

    void applyLibraryWindowChrome()
      .then(() => enforceLibraryWindowSize())
      .catch(console.error);

    const unlistenResize = win.onResized(() => {
      void enforceLibraryWindowSize().catch(console.error);
    });

    return () => {
      cancelled = true;
      void unlistenResize.then((unlisten) => unlisten());
    };
  }, [playingFile]);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    applyMediaOutputState(el, volumeLabel / 100, isMuted);
  }, [playingFile, volumeLabel, isMuted]);

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
      if (Number.isFinite(d) && d > 0 && t > 0.5) {
        writePlaybackPos(playingFile.path, t, d);
      }
    }
  };

  useEffect(() => {
    lastPlaybackPersistRef.current = 0;
    resumeSeekAppliedPathRef.current = null;
    if (mediaRef.current) {
      mediaRef.current.preservesPitch = true;
      mediaRef.current.playbackRate = playbackSpeed;
    }
  }, [playingFile?.path, playbackSpeed]);

  useEffect(() => {
    setShowSubtitleMenu(false);
    const audioOnly = Boolean(playingFile && isAudioOnlyPath(playingFile.path));
    if (!playingFile || audioOnly) {
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
    fetchSubtitleTracks(playingFile.path)
      .then((raw) => subtitleTracksWithBlobSrc(raw))
      .then((tracks) => {
        if (cancelled) {
          revokeSubtitleBlobSrcs(tracks);
          return;
        }
        subtitleBlobTracksRef.current = tracks;
        setSubtitleTracks(tracks);
        const pref = readSubtitlePreferredLang()?.trim() || null;
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
  }, [playingFile?.path]);

  useEffect(() => {
    const audioOnly = Boolean(playingFile && isAudioOnlyPath(playingFile.path));
    if (!playingFile || audioOnly) return;
    const v = mediaRef.current as HTMLVideoElement | null;
    if (!v || v.tagName !== "VIDEO") return;
    const apply = () => syncVideoTextTrackModes(v, isSubtitlesEnabled, selectedSubtitleLang);
    apply();
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [playingFile?.path, isSubtitlesEnabled, selectedSubtitleLang, subtitleTracks, isSmallMode]);

  useSubtitleCueOverlay({
    videoRef: mediaRef as React.RefObject<HTMLVideoElement | null>,
    textElRef: subtitleOverlayTextRef,
    dragRowRef: subtitleDragRowRef,
    layoutLimitRef: subtitleLayoutLimitRef,
    layoutContainerRef: videoSurfaceRef,
    inactive: isSmallMode || !playingFile || Boolean(playingFile && isAudioOnlyPath(playingFile.path)),
    captionsEnabled: isSubtitlesEnabled,
    selectedLang: selectedSubtitleLang,
    filePath: playingFile?.path ?? "",
    subtitleTracks,
  });

  const [outputDir] = useState(() => {
    return localStorage.getItem("ruforge-output-dir") || DEFAULT_OUTPUT_DIR;
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
      const posterEpoch = ++libraryPosterBackfillEpochRef.current;
      try {
        const dirs = [RUFORGE_INTERNAL_DIR, outputDir].filter((d) => d && d.trim() !== "");
        
        const scans = await Promise.all(
          dirs.map((d) => invoke<GalleryEntry[]>("scan_gallery", { dir: d }))
        );
        
        const combined = scans.flat();
        const uniqueMap = new Map<string, GalleryEntry>();
        for (const entry of combined) {
          uniqueMap.set(entry.path, entry);
        }
        
        const data = Array.from(uniqueMap.values());
        if (libraryPosterBackfillEpochRef.current !== posterEpoch) return;
        setLibrary(data);

        const mediaFiles = data.flatMap(e => e.kind === 'media' ? [e] : e.items);
        const missing = filesMissingPoster(mediaFiles);
        if (missing.length === 0) return;
        
        void (async () => {
          await ensurePostersForFiles(missing);
          if (libraryPosterBackfillEpochRef.current !== posterEpoch) return;
          try {
            const scans2 = await Promise.all(
              dirs.map((d) => invoke<GalleryEntry[]>("scan_gallery", { dir: d }))
            );
            const combined2 = scans2.flat();
            const uniqueMap2 = new Map<string, GalleryEntry>();
            for (const entry of combined2) {
              uniqueMap2.set(entry.path, entry);
            }
            if (libraryPosterBackfillEpochRef.current !== posterEpoch) return;
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
    
    const onBlur = () => {
      setIsFocused(false);
      setMiniWindowFocused(false);
    };
    const onFocus = () => {
      setIsFocused(true);
      setMiniWindowFocused(true);
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    const unlistenFocus = win.onFocusChanged(({ payload: focused }) => {
      setIsFocused(focused);
      setMiniWindowFocused(focused);
    });
    void win.isFocused().then((f) => setMiniWindowFocused(f));

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

  const applyMiniHandoff = (payload: PlayInMiniPayload) => {
    const startTime = Number.isFinite(payload.startTime) ? Math.max(0, payload.startTime) : 0;
    const paused = payload.paused ?? false;
    handoffPausedRef.current = paused;
    playInMiniStartTimeRef.current = startTime;

    if (typeof payload.playbackSpeed === "number" && payload.playbackSpeed > 0) {
      setPlaybackSpeed(payload.playbackSpeed);
    }
    if (typeof payload.volume === "number") {
      const vol = Math.max(0, Math.min(1, payload.volume));
      setVolumeLabel(Math.round(vol * 100));
      localStorage.setItem("miniplayer-volume", String(vol));
    }
    if (typeof payload.muted === "boolean") setIsMuted(payload.muted);

    const v = mediaRef.current;
    if (!v) return;
    let t = startTime;
    if (isFinite(v.duration) && v.duration > 0) t = Math.min(t, v.duration);
    v.currentTime = t;
    v.playbackRate = payload.playbackSpeed ?? playbackSpeed;
    applyMediaOutputState(
      v,
      typeof payload.volume === "number" ? payload.volume : volumeLabel / 100,
      payload.muted ?? isMuted,
    );
    if (paused) {
      v.pause();
      setIsPaused(true);
    } else {
      void v.play().catch(() => {});
      setIsPaused(false);
    }
    playInMiniStartTimeRef.current = null;
    resumeSeekAppliedPathRef.current = payload.file.path;
  };

  useEffect(() => {
    if (!playingFile) {
      setIsLooping(false);
      return;
    }
    setIsLooping(readLoopForPath(playingFile.path));
  }, [playingFile?.path]);

  useVideoAmbientBackdrop(
    mediaRef as React.RefObject<HTMLVideoElement | null>,
    ambientCanvasRef,
    Boolean(playingFile && !playingAudioOnly && !isSmallMode),
  );

  const syncProgressFromVideo = useCallback((v: HTMLMediaElement) => {
    if (!isFinite(v.duration) || v.duration <= 0) return;
    const t = v.currentTime;
    setCurrentTime(t);
    setDuration(v.duration);
    setProgress((t / v.duration) * 100);
    if (v.buffered.length > 0) {
      setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
    }
  }, []);

  const applySeekRatio = useCallback(
    (ratio: number, opts?: { persist?: boolean }) => {
      const v = mediaRef.current;
      if (!v || !isFinite(v.duration) || v.duration <= 0) return;
      const r = Math.min(1, Math.max(0, ratio));
      const t = r * v.duration;
      isUserSeekingRef.current = true;
      setScrubPreviewRatio(r);
      setCurrentTime(t);
      setProgress(r * 100);
      v.currentTime = t;
      if (opts?.persist && playingFile) {
        writePlaybackPos(playingFile.path, t, v.duration);
        lastPlaybackPersistRef.current = Date.now();
      }
    },
    [playingFile],
  );

  const handleSeeked = useCallback(() => {
    isUserSeekingRef.current = false;
    setScrubPreviewRatio(null);
    const v = mediaRef.current;
    if (v) syncProgressFromVideo(v);
  }, [syncProgressFromVideo]);

  const applyInitialMediaSeek = (v: HTMLMediaElement) => {
    if (isUserSeekingRef.current) return;
    if (!playingFile) return;
    applyMediaOutputState(v, volumeLabel / 100, isMuted);
    v.preservesPitch = true;
    v.playbackRate = playbackSpeed;

    const handoffTime = playInMiniStartTimeRef.current;
    const isHandoff = handoffTime !== null;
    if (!isHandoff && resumeSeekAppliedPathRef.current === playingFile.path) return;

    let t: number;
    if (isHandoff) {
      t = handoffTime;
      playInMiniStartTimeRef.current = null;
      if (isFinite(v.duration) && v.duration > 0) {
        t = Math.min(Math.max(0, t), v.duration);
      }
    } else {
      t = readResumeSeconds(playingFile.path, v.duration);
    }
    resumeSeekAppliedPathRef.current = playingFile.path;
    v.currentTime = t;
    if (handoffPausedRef.current) {
      v.pause();
      setIsPaused(true);
      handoffPausedRef.current = false;
    }
  };

  useEffect(() => {
    const unlisten = listen<MediaFile>("play-media", (_event) => {
      setPlayingFile(null);
    });

    const unlistenMiniHandoff = listen<PlayInMiniPayload>("play-in-mini", (event) => {
      const payload = event.payload;
      playInMiniStartTimeRef.current = Number.isFinite(payload.startTime)
        ? Math.max(0, payload.startTime)
        : 0;
      handoffPausedRef.current = payload.paused ?? false;
      setPlayingFile(payload.file);
      setIsLooping(readLoopForPath(payload.file.path));
      incrementViewCount(payload.file);
      void emit("stop-playback", "mini-player");
      getCurrentWindow().setFocus().catch(console.error);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => applyMiniHandoff(payload));
      });
    });

    const unlistenStop = listen<string>("stop-playback", (event) => {
      if (event.payload !== "mini-player") {
        const v = mediaRef.current;
        if (v) v.pause();
        setPlayingFile(null);
        setIsPaused(true);
      }
    });

    return () => {
      unlisten.then((f) => f());
      unlistenMiniHandoff.then((f) => f());
      unlistenStop.then((f) => f());
    };
    // applyMiniHandoff closes over latest volume/speed handlers
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (e.deltaY === 0) return;
    
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
    if (isUserSeekingRef.current) return;
    if (progressRafRef.current != null) return;
    progressRafRef.current = requestAnimationFrame(() => {
      progressRafRef.current = null;
      if (isUserSeekingRef.current) return;
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
        if (currentTime > 0.5) {
          writePlaybackPos(playingFile.path, currentTime, duration);
        }
      }
    });
  };

  const seekRatioFromClientX = (clientX: number, bar: HTMLElement) => {
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const handleScrubberBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !mediaRef.current) return;
    e.preventDefault();
    const bar = e.currentTarget;
    const v = mediaRef.current;
    if (!isFinite(v.duration)) return;

    wasPlayingBeforeScrubRef.current = !v.paused;
    if (wasPlayingBeforeScrubRef.current) v.pause();

    const r0 = seekRatioFromClientX(e.clientX, bar);
    setHoverProgress(r0);
    applySeekRatio(r0);

    const onMove = (ev: MouseEvent) => {
      const r = seekRatioFromClientX(ev.clientX, bar);
      setHoverProgress(r);
      applySeekRatio(r);
    };

    const onUp = (ev: MouseEvent) => {
      const r = seekRatioFromClientX(ev.clientX, bar);
      applySeekRatio(r, { persist: true });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);

      if (wasPlayingBeforeScrubRef.current && mediaRef.current) {
        void mediaRef.current.play().catch(() => {});
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleMouseMoveScrubber = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHoverProgress(x / rect.width);
  };

  const scrubBarProgressPct = scrubPreviewRatio !== null ? scrubPreviewRatio * 100 : progress;

  const chapters = useMemo(() => {
    if (!playingFile) return null;
    const dur =
      isFinite(duration) && duration > 0
        ? duration
        : playingFile.duration > 0
          ? playingFile.duration
          : 0;
    return normalizeChapters(playingFile.chapters, dur);
  }, [playingFile?.chapters, playingFile?.duration, duration]);

  const activeChapter = useMemo(
    () => (chapters ? chapterAtTime(chapters, currentTime) : null),
    [chapters, currentTime],
  );

  const miniSbScrubBar = Boolean(playingFile) && (isLargeMode || isSmallMode);

  const seekToTimeSeconds = useCallback(
    (t: number) => {
      const v = mediaRef.current;
      if (!v || !isFinite(v.duration) || v.duration <= 0) return;
      applySeekRatio(t / v.duration, { persist: true });
    },
    [applySeekRatio],
  );

  const patchSbStats = useCallback(
    (
      cat: SponsorBlockSkipCategory,
      patch: Partial<{
        appearances: number;
        manualSkips: number;
        undoSignals: number;
      }>,
    ) => {
      setSettings((prev) => {
        const stats = { ...prev.sponsorBlockCategoryStats };
        stats[cat] = { ...stats[cat], ...patch };
        const next = { ...prev, sponsorBlockCategoryStats: stats };
        try {
          const raw = localStorage.getItem("ruforge-settings");
          const parsed =
            raw && typeof raw === "string"
              ? (JSON.parse(raw) as Record<string, unknown>)
              : {};
          localStorage.setItem(
            "ruforge-settings",
            JSON.stringify({ ...parsed, sponsorBlockCategoryStats: stats }),
          );
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );

  const onSbAppearance = useCallback(
    (cat: SponsorBlockSkipCategory) => {
      const cur = settings.sponsorBlockCategoryStats[cat];
      patchSbStats(cat, { appearances: cur.appearances + 1 });
    },
    [settings.sponsorBlockCategoryStats, patchSbStats],
  );

  const onSbManualSkip = useCallback(
    (cat: SponsorBlockSkipCategory) => {
      const cur = settings.sponsorBlockCategoryStats[cat];
      patchSbStats(cat, { manualSkips: cur.manualSkips + 1 });
    },
    [settings.sponsorBlockCategoryStats, patchSbStats],
  );

  const onSbDemoteUndo = useCallback(
    (cat: SponsorBlockSkipCategory) => {
      const cur = settings.sponsorBlockCategoryStats[cat];
      patchSbStats(cat, { undoSignals: cur.undoSignals + 1 });
    },
    [settings.sponsorBlockCategoryStats, patchSbStats],
  );

  const sponsorBlock = useSponsorBlockPlayback({
    file: playingFile ?? SPONSORBLOCK_STUB_FILE,
    currentTime,
    enabled:
      settings.sponsorBlockEnabled &&
      miniSbScrubBar &&
      Boolean(playingFile?.sourceId?.trim()),
    settings,
    seekTo: seekToTimeSeconds,
    onManualSkip: onSbManualSkip,
    onAppearance: onSbAppearance,
    onDemoteUndo: onSbDemoteUndo,
  });

  const scrubDuration =
    isFinite(duration) && duration > 0
      ? duration
      : playingFile && playingFile.duration > 0
        ? playingFile.duration
        : 0;

  const sbOverlayActive =
    settings.sponsorBlockEnabled && miniSbScrubBar && scrubDuration > 0;

  useEffect(() => {
    if (!isPaused) {
      setIsGalleryHovered(false);
    }
  }, [isPaused]);

  const togglePlay = () => {
    if (blockClickRef.current) {
      blockClickRef.current = false;
      return;
    }
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) {
      applyMediaOutputState(media, volumeLabel / 100, isMuted);
      void media.play().catch(() => {});
      setIsPaused(false);
    } else {
      media.pause();
      setIsPaused(true);
      savePlaybackPos();
    }
  };

  const seek = (seconds: number) => {
    const v = mediaRef.current;
    if (!v || !isFinite(v.duration) || v.duration <= 0) return;
    const next = Math.min(v.duration, Math.max(0, v.currentTime + seconds));
    applySeekRatio(next / v.duration, { persist: true });
  };

  const showGallery = isMediaSelectorOpen;

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

  const videoPlaylistMini = useMemo(
    () =>
      library
        .flatMap((e) => (e.kind === "media" ? [e] : e.items))
        .filter((f) => !isAudioOnlyPath(f.path))
        .sort((a, b) =>
          a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }),
        ),
    [library],
  );

  const playlistVideoIdxMini =
    playingFile && !playingAudioOnly
      ? videoPlaylistMini.findIndex((p) => p.path === playingFile.path)
      : -1;
  const nextVideoMini =
    playingFile &&
    !playingAudioOnly &&
    playlistVideoIdxMini >= 0 &&
    playlistVideoIdxMini < videoPlaylistMini.length - 1
      ? videoPlaylistMini[playlistVideoIdxMini + 1]
      : null;

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

  const returnToLibraryBrowse = () => {
    if (mediaRef.current) {
      mediaRef.current.pause();
    }
    setIsPaused(true);
    setIsMediaSelectorOpen(false);
    setPlayingFile(null);
  };

  const pickShuffleNext = (): MediaFile | null => {
    const playlist = playingAudioOnly ? audioPlaylistMini : videoPlaylistMini;
    if (!playingFile || playlist.length < 2) return null;
    const others = playlist.filter((p) => p.path !== playingFile.path);
    const pool = others.length > 0 ? others : playlist;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  };

  const resolveNextTrack = (): MediaFile | null => {
    if (isShuffling) return pickShuffleNext();
    return playingAudioOnly ? nextMini : nextVideoMini;
  };

  const skipToNextTrack = () => {
    if (!playingFile) return;
    const next = resolveNextTrack();
    if (next) handleSelectMedia(next);
  };

  const toggleShuffle = () => {
    const next = !isShuffling;
    setIsShuffling(next);
    if (next) {
      const random = pickShuffleNext();
      if (random) handleSelectMedia(random);
    }
  };

  useEffect(() => {
    if (!playingFile || isAudioOnlyPath(playingFile.path)) {
      prevVideoPathRef.current = playingFile?.path ?? null;
      setMediaBlendOpacity(1);
      return;
    }
    const p = playingFile.path;
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
  }, [playingFile]);

  const handleMiniVideoMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isSmallMode) return;
    const rect = videoSurfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const x = e.clientX - rect.left;
    const side = x > rect.width / 2 ? "right" : "left";
    videoPressTimeoutRef.current = setTimeout(() => {
      setIsPressing(side);
      setPreviousSpeed(playbackSpeed);
      setPlaybackSpeed(side === "right" ? 2 : 0.5);
    }, 500);
  };

  const handleMiniVideoMouseUpLeave = () => {
    if (videoPressTimeoutRef.current) {
      clearTimeout(videoPressTimeoutRef.current);
      videoPressTimeoutRef.current = null;
    }
    if (isPressing) {
      setPlaybackSpeed(previousSpeed);
      setIsPressing(null);
      blockClickRef.current = true;
      window.setTimeout(() => {
        blockClickRef.current = false;
      }, 50);
    }
  };

  const controlsVisible = !isSmallMode && ((isCursorVisible && isHovering) || isPaused || isGalleryHovered);
  const sbSkipShowControls = isSmallMode ? true : controlsVisible;

  return (
    <div 
      className={`h-screen w-screen bg-[#121212] overflow-hidden rounded-3xl select-none relative group/mini shadow-2xl outline-none ring-0 [clip-path:inset(0_round_1.5rem)] ${!isCursorVisible && !isPaused ? 'cursor-none' : ''} ${!controlsVisible ? 'controls-hidden' : ''}`}
      onWheel={handleWheel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovering(false)}
    >

      <AnimatePresence>
        {miniSbScrubBar && sponsorBlock.showSkipButton && (
          <SponsorBlockSkipButton
            showControls={sbSkipShowControls}
            onClick={sponsorBlock.handleSkipClick}
            label={sponsorBlock.skipButtonLabel}
            activeCategory={sponsorBlock.activeSkipCategory}
          />
        )}
      </AnimatePresence>

      {/* Dynamic Volume/Mute Overlay (Mini Flush Bottom Right) */}
      <AnimatePresence>
        {showVolume && (
          <motion.div 
            initial={{ opacity: 0, y: 10, x: 10 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 10, x: 10 }}
            className={`absolute bottom-0 right-0 z-[80] bg-black/80 backdrop-blur-2xl border-t border-l border-white/10 rounded-tl-2xl ${(isMicroMode || isTinyMode) ? 'p-1.5 px-2 space-x-1.5' : isMini ? 'p-2 space-x-2' : isNarrow ? 'p-3 space-x-3' : 'p-4 space-x-3'} flex items-center pointer-events-none shadow-2xl`}
          >
            <div className="text-[color:var(--accent)]">
              <MiniVolumeIcon
                size={(isMicroMode || isTinyMode) ? 10 : isMini ? 12 : 16}
                muted={isMuted}
                volumePercent={isMuted ? 0 : volumeLabel}
              />
            </div>
            <div className="flex flex-col">
              <span className={`${(isMicroMode || isTinyMode) ? 'text-[8px]' : isMini ? 'text-[9px]' : 'text-xs'} font-black text-[color:var(--accent)] leading-none`}>{isMuted ? "MUTED" : `${volumeLabel}%`}</span>
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
      <div className={`absolute top-0 left-0 right-0 h-12 z-[100] flex items-center justify-between px-3 pointer-events-none group-hover/mini:opacity-100 opacity-0 transition-opacity duration-300 ${(isMicroMode || isTinyMode) ? 'hidden' : ''}`}>
        {!isCompactMode && playingFile ? (
          <Tooltip text="Toggle Media Selector" side="top" disabled={isSmallMode}>
            <button 
              onClick={() => setIsMediaSelectorOpen(!isMediaSelectorOpen)}
              className={`p-1.5 pointer-events-auto transition-colors ${isMediaSelectorOpen ? 'text-[color:var(--accent)]' : 'text-stone-400 hover:text-white'}`}
            >
              <Icon icon="tabler:library" width={18} height={18} />
            </button>
          </Tooltip>
        ) : (
          <div className="w-8" />
        )}
        
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
          {!isCompactMode && playingFile && (
            <Tooltip text="Back to App" side="top" disabled={isSmallMode}>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const media = mediaRef.current;
                  const payload: SendToMainPayload = {
                    file: playingFile,
                    currentTime: media?.currentTime ?? 0,
                    paused: media ? media.paused : true,
                    playbackSpeed,
                    volume: media?.volume ?? volumeLabel / 100,
                    muted: isMuted,
                  };
                  if (media && playingFile) {
                    writePlaybackPos(playingFile.path, media.currentTime, media.duration);
                  }
                  const { emit } = await import("@tauri-apps/api/event");
                  await emit("send-to-main", payload);
                  const main = await WebviewWindow.getByLabel("main");
                  await main?.setFocus().catch(console.error);
                  getCurrentWindow().close();
                }}
                className="p-1.5 text-stone-400 hover:text-[color:var(--accent)] transition-colors"
              >
                <ExternalLink size={16} strokeWidth={2.5} />
              </button>
            </Tooltip>
          )}
          {!isCompactMode && playingFile && playingAudioOnly && isProbablyWindows && (
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
          <Tooltip text={isPinned ? "Unpin Window" : "Pin Window"} side="top" disabled={isSmallMode || isCompactMode}>
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

          <Tooltip text="Close Player" side="top" disabled={isSmallMode || isCompactMode}>
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
        {/* Cover art backdrop: audio-only and layouts where video is not shown (not large-mode video). */}
        {playingFile && coverArtSrc && (playingAudioOnly || isSmallMode || isCompactMode) && (
          <>
            {/* If in small or compact mode, show the image on the full background fading to the right */}
            {(isSmallMode || isCompactMode) && (
              <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <img
                  src={convertFileSrc(coverArtSrc)}
                  alt=""
                  className="w-full h-full object-cover"
                />
                {/* Smooth gradient fade to black */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/40 via-30% to-black to-60%" />
              </div>
            )}

            {/* Large-mode blurred backdrop is audio-only (video uses a plain surface). */}
            {isLargeMode && playingAudioOnly && (
              <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <img
                  src={convertFileSrc(coverArtSrc)}
                  alt=""
                  className="w-full h-full object-cover opacity-35 blur-[12px] scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/90 to-black" />
              </div>
            )}
          </>
        )}

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
                      if (mediaRef.current) {
                        applyMediaOutputState(mediaRef.current, volumeLabel / 100, isMuted);
                      }
                    }}
                    onCanPlay={(e) =>
                      applyMediaOutputState(e.currentTarget, volumeLabel / 100, isMuted)
                    }
                    onLoadedData={(e) =>
                      applyMediaOutputState(e.currentTarget, volumeLabel / 100, isMuted)
                    }
                    onLoadedMetadata={(e) => applyInitialMediaSeek(e.currentTarget)}
                    onEnded={() => {
                      if (isLooping && mediaRef.current) {
                        mediaRef.current.currentTime = 0;
                        void mediaRef.current.play().catch(() => {});
                        return;
                      }
                      const v = mediaRef.current;
                      if (playingFile && v && isFinite(v.duration) && v.duration > 0) {
                        writePlaybackPos(playingFile.path, v.duration, v.duration);
                      }
                      const advance = readAudioAutoAdvanceFolder();
                      if (advance && playingFile) {
                        const next = resolveNextTrack();
                        if (next) {
                          handleSelectMedia(next);
                          return;
                        }
                      }
                      returnToLibraryBrowse();
                    }}
                    onTimeUpdate={handleTimeUpdate}
                    onSeeked={handleSeeked}
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
                <div
                  ref={videoSurfaceRef}
                  className="relative z-10 flex h-full w-full min-h-0 items-center justify-center transition-opacity duration-200"
                  style={{ opacity: mediaBlendOpacity }}
                  onMouseDown={isLargeMode ? handleMiniVideoMouseDown : undefined}
                  onMouseUp={isLargeMode ? handleMiniVideoMouseUpLeave : undefined}
                  onMouseLeave={isLargeMode ? handleMiniVideoMouseUpLeave : undefined}
                >
                  {isLargeMode && isPaused && (
                    <canvas
                      ref={ambientCanvasRef}
                      className="pointer-events-none absolute inset-[-15%] z-0 h-[130%] w-[130%] opacity-50 blur-[100px]"
                      aria-hidden
                    />
                  )}
                  <video
                    ref={mediaRef as React.RefObject<HTMLVideoElement>}
                    autoPlay
                    playsInline
                    preload="metadata"
                    poster={coverArtSrc ? convertFileSrc(coverArtSrc) : undefined}
                    className={`${!isLargeMode ? "hidden" : "h-full w-full object-contain"} cursor-pointer pointer-events-auto transition-all duration-500`}
                    src={convertFileSrc(playingFile.path)}
                    onPause={() => setIsPaused(true)}
                    onPlay={() => {
                      setIsPaused(false);
                      setIsGalleryHovered(false);
                      if (mediaRef.current) {
                        applyMediaOutputState(mediaRef.current, volumeLabel / 100, isMuted);
                      }
                    }}
                    onCanPlay={(e) =>
                      applyMediaOutputState(e.currentTarget, volumeLabel / 100, isMuted)
                    }
                    onLoadedData={(e) =>
                      applyMediaOutputState(e.currentTarget, volumeLabel / 100, isMuted)
                    }
                    onLoadedMetadata={(e) => applyInitialMediaSeek(e.currentTarget)}
                    onEnded={() => {
                      if (isLooping && mediaRef.current) {
                        mediaRef.current.currentTime = 0;
                        void mediaRef.current.play().catch(() => {});
                        return;
                      }
                      const v = mediaRef.current;
                      if (playingFile && v && isFinite(v.duration) && v.duration > 0) {
                        writePlaybackPos(playingFile.path, v.duration, v.duration);
                      }
                      const advance = readAudioAutoAdvanceFolder();
                      if (advance && playingFile) {
                        const next = resolveNextTrack();
                        if (next) {
                          handleSelectMedia(next);
                          return;
                        }
                      }
                      returnToLibraryBrowse();
                    }}
                    onTimeUpdate={handleTimeUpdate}
                    onSeeked={handleSeeked}
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
                    {/* Subtitles only render in expanded mode */}
                    {isLargeMode &&
                      subtitleTracks.map((t, i) => (
                        <track
                          key={`${playingFile?.path ?? ""}:${t.lang}:${i}`}
                          kind="subtitles"
                          src={t.src}
                          srcLang={t.lang}
                          label={t.label}
                        />
                      ))}
                  </video>
                  <AnimatePresence>
                    {isPressing && isLargeMode && (
                      <motion.div
                        initial={{ opacity: 0, y: -12, x: "-50%" }}
                        animate={{ opacity: 1, y: 0, x: "-50%" }}
                        exit={{ opacity: 0, y: -12, x: "-50%" }}
                        className="absolute top-[16%] left-1/2 z-[100] px-4 py-1.5 bg-black/50 backdrop-blur-md border border-white/10 rounded-full flex items-center gap-2 pointer-events-none"
                      >
                        <Icon icon="tabler:player-play-filled" className="w-3.5 h-3.5 text-white" />
                        <span className="text-[10px] font-black tracking-widest text-white uppercase">
                          {isPressing === "right" ? "2.0x" : "0.5x"}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
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
              )}
              {playingAudioOnly && (
                <button
                  type="button"
                  className={`${
                    isCompactMode 
                      ? "hidden"
                      : isSmallMode
                      ? "hidden"
                      : "absolute inset-0 z-20 flex cursor-pointer pointer-events-auto items-center justify-center bg-gradient-to-b from-stone-950 to-black p-8"
                  } transition-all duration-500`}
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
                      className={isLargeMode ? "max-h-[min(50vh,420px)] max-w-[min(88vw,420px)] rounded-2xl border border-white/10 object-contain shadow-2xl" : "w-full h-full object-cover"}
                    />
                  ) : (
                    <Music
                      className={isLargeMode ? "w-24 h-24 text-[color:var(--accent)] opacity-35" : "w-10 h-10 text-[color:var(--accent)] opacity-40"}
                      strokeWidth={isLargeMode ? 1 : 1.25}
                      aria-hidden
                    />
                  )}
                </button>
              )}

              <AnimatePresence mode="wait">
                {isLargeMode && (
                  <motion.div
                    key="large"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 pointer-events-none"
                  >
                    <AnimatePresence>
                      {controlsVisible && (
                    <motion.div
                      key="large-controls"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", damping: 30, stiffness: 200 }}
                      className={`absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-xl rounded-t-[24px] ${isMini ? 'py-2.5 px-4 space-y-3' : isNarrow ? 'py-3.5 px-5 space-y-3.5' : 'py-4 px-6 space-y-4'} flex flex-col border-t border-white/5 shadow-2xl z-20 pointer-events-auto`}
                      onMouseEnter={() => {
                        setIsHovering(true);
                        if (isPaused) setIsGalleryHovered(true);
                      }}
                    >
                      {/* True Squiggly Line Progress Area */}
                      <div 
                        ref={subtitleLayoutLimitRef}
                        className={`w-full ${isMini ? 'h-5' : 'h-8'} cursor-pointer relative group flex items-center`}
                        onMouseDown={handleScrubberBarMouseDown}
                        onMouseMove={handleMouseMoveScrubber}
                        onMouseLeave={() => setHoverProgress(null)}
                      >
                        <AnimatePresence>
                          {hoverProgress !== null && scrubberThumbs.length > 0 && !chapters && isFinite(duration) && duration > 0 && (
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
                                     {formatDuration(hoverProgress * duration)}
                                   </span>
                                </div>
                              </div>
                              <div className="w-px h-4 bg-[color:var(--accent)] opacity-50 mx-auto mt-1" />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {chapters && chapters.length >= 2 && (duration > 0 || (playingFile?.duration ?? 0) > 0) ? (
                          <ChapterScrubber
                            chapters={chapters}
                            duration={duration > 0 ? duration : (playingFile?.duration ?? 0)}
                            currentTime={currentTime}
                            bufferedPercent={buffered}
                            playedPercent={scrubBarProgressPct}
                            hoverPercent={hoverProgress !== null ? hoverProgress * 100 : null}
                            isHovering={hoverProgress !== null}
                            isScrubbing={scrubPreviewRatio !== null}
                            scrubberThumbs={scrubberThumbs}
                            formatTime={formatDuration}
                            onMouseDown={handleScrubberBarMouseDown}
                            onMouseMove={handleMouseMoveScrubber}
                            onMouseLeave={() => setHoverProgress(null)}
                            overlay={sbOverlayActive ? sponsorBlock.scrubOverlay : undefined}
                          />
                        ) : (
                          <div className={`w-full rounded-full relative overflow-hidden transition-all duration-300 ${isMini ? (hoverProgress !== null || scrubPreviewRatio !== null ? 'h-3' : 'h-1.5') : (hoverProgress !== null || scrubPreviewRatio !== null ? 'h-4' : 'h-2')} bg-white/15`}>
                            {sbOverlayActive && (
                              <SponsorBlockScrubOverlay
                                duration={scrubDuration}
                                overlay={sponsorBlock.scrubOverlay}
                              />
                            )}
                            <div className="absolute top-0 left-0 h-full bg-white/20 rounded-full" style={{ width: `${buffered}%` }} />
                            <div className="absolute top-0 left-0 h-full bg-[#271C18] rounded-full shadow-[0_0_10px_rgba(39,28,24,0.4)]" style={{ width: `${scrubBarProgressPct}%` }} />
                            {hoverProgress !== null && (
                              <div className="absolute top-0 left-0 h-full bg-white/10 rounded-full pointer-events-none" style={{ width: `${hoverProgress * 100}%` }} />
                            )}
                            <div
                              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${isMini ? 'w-3 h-3' : 'w-4 h-4'} bg-white rounded-full border-2 border-[#271C18] shadow-lg transition-opacity ${hoverProgress !== null || scrubPreviewRatio !== null ? "opacity-100" : "opacity-0"}`}
                              style={{ left: `${scrubBarProgressPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className={`flex items-center ${isMini ? 'space-x-3' : 'space-x-4'}`}>
                          <Tooltip text="Rewind 15s" disabled={isSmallMode}>
                            <button onClick={() => seek(-15)} className="text-stone-400 transition" onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'} onMouseLeave={(e) => e.currentTarget.style.color = ''}><Icon icon="tabler:rewind-backward-15" width={isMini ? 16 : 22} /></button>
                          </Tooltip>
                          
                          <Tooltip text={isPaused ? "Play" : "Pause"} disabled={isSmallMode}>
                            <button onClick={togglePlay} className="text-[color:var(--accent)] transition" onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'} onMouseLeave={(e) => e.currentTarget.style.color = ''}>{isPaused ? <Play size={isMini ? 16 : 20} fill="currentColor" /> : <Pause size={isMini ? 16 : 20} fill="currentColor" />}</button>
                          </Tooltip>

                          <Tooltip text="Forward 15s" disabled={isSmallMode}>
                            <button onClick={() => seek(15)} className="text-stone-400 transition" onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'} onMouseLeave={(e) => e.currentTarget.style.color = ''}><Icon icon="tabler:rewind-forward-15" width={isMini ? 16 : 22} /></button>
                          </Tooltip>

                          <Tooltip text={isLooping ? "Disable Loop" : "Enable Loop"} disabled={isSmallMode}>
                            <button 
                              onClick={() => {
                                const nextLoop = !isLooping;
                                setIsLooping(nextLoop);
                                if (playingFile) writeLoopForPath(playingFile.path, nextLoop);
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

                          {/* Subtitles Toggle */}
                          {!playingAudioOnly && subtitleTracks.length > 0 && (
                            <div className="relative flex items-center">
                              <Tooltip text="Subtitles" disabled={isSmallMode}>
                                <button
                                  onClick={() => {
                                    if (subtitleTracks.length > 1) {
                                      setShowSubtitleMenu(!showSubtitleMenu);
                                    } else {
                                      const only = subtitleTracks[0];
                                      if (isSubtitlesEnabled) {
                                        setIsSubtitlesEnabled(false);
                                      } else {
                                        setSelectedSubtitleLang(only.lang);
                                        setIsSubtitlesEnabled(true);
                                        writeSubtitlePreferredLang(only.lang);
                                      }
                                    }
                                  }}
                                  className={`transition-all p-1 rounded-lg active:scale-90 ${isSubtitlesEnabled ? 'text-[color:var(--accent)] bg-[color:var(--accent)]/10' : 'text-stone-400 hover:text-white'}`}
                                >
                                  <Icon 
                                    icon={isSubtitlesEnabled ? "streamline-ultimate:subtitles-bold" : "streamline-ultimate:subtitles"} 
                                    width={isMini ? 16 : 20} 
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
                                    className="absolute bottom-full mb-3 right-0 bg-stone-950/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl min-w-[120px] z-[110] p-1.5"
                                  >
                                    <button
                                      onClick={() => {
                                        setIsSubtitlesEnabled(false);
                                        setShowSubtitleMenu(false);
                                      }}
                                      className={`w-full px-3 py-1.5 text-left text-[9px] font-black tracking-widest transition-colors rounded-xl flex items-center justify-between ${!isSubtitlesEnabled ? "bg-[color:var(--accent)] text-[#1d1613]" : "text-stone-400 hover:bg-white/5 hover:text-white"}`}
                                    >
                                      <span>OFF</span>
                                      {!isSubtitlesEnabled && <Icon icon="tabler:check" width={10} />}
                                    </button>
                                    <div className="h-px bg-white/5 my-1 mx-2" />
                                    {subtitleTracks.map((track) => (
                                      <button
                                        key={track.lang + track.src}
                                        onClick={() => {
                                          setSelectedSubtitleLang(track.lang);
                                          setIsSubtitlesEnabled(true);
                                          writeSubtitlePreferredLang(track.lang);
                                          setShowSubtitleMenu(false);
                                        }}
                                        className={`w-full px-3 py-1.5 text-left text-[9px] font-black tracking-widest transition-colors rounded-xl flex items-center justify-between ${isSubtitlesEnabled && selectedSubtitleLang === track.lang ? "bg-[color:var(--accent)] text-[#1d1613]" : "text-stone-400 hover:bg-white/5 hover:text-white"}`}
                                      >
                                        <span className="truncate mr-2">{track.label.toUpperCase()}</span>
                                        {isSubtitlesEnabled && selectedSubtitleLang === track.lang && <Icon icon="tabler:check" width={10} />}
                                      </button>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                        <div className={`${isMini ? "text-[8px]" : "text-[10px]"} font-bold text-stone-500 tracking-wider tabular-nums`}>
                          <span className="text-stone-300">{formatDuration(currentTime)}</span>
                          <span className="text-stone-600 mx-1">/</span>
                          <span>{scrubDuration > 0 ? formatDuration(scrubDuration) : "0:00"}</span>
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
                                 <MiniVolumeIcon
                                   size={isMini ? 12 : 16}
                                   muted={isMuted}
                                   volumePercent={isMuted ? 0 : volumeLabel}
                                   className={isMuted ? "text-[color:var(--accent)] opacity-50" : undefined}
                                 />
                                 <span className={`${isMini ? 'text-[8px]' : 'text-[10px]'} font-bold`}>{isMuted ? "MUTED" : `${volumeLabel}%`}</span>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {isSmallMode && (
                  <motion.div
                    key="small"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute inset-0 pl-36 pr-8 flex flex-col justify-center pointer-events-none"
                  >
                     <div className="flex items-center justify-between mb-2">
                        <div className="min-w-0 flex-1 mr-4">
                          <MarqueeText text={playingFile.name} className="text-[11px] font-black text-stone-100/95 uppercase tracking-widest" />
                        </div>
                        <Waveform isPaused={isPaused} mutedBars />
                     </div>
                     <div className="w-full h-1.5 bg-white/25 rounded-full relative overflow-hidden mb-4 pointer-events-auto cursor-pointer" onMouseDown={handleScrubberBarMouseDown}>
                        {sbOverlayActive && (
                          <SponsorBlockScrubOverlay
                            duration={scrubDuration}
                            overlay={sponsorBlock.scrubOverlay}
                          />
                        )}
                        <div className="absolute top-0 left-0 h-full bg-white/35 rounded-full" style={{ width: `${buffered}%` }} />
                        <div 
                           className="absolute top-0 left-0 h-full bg-[color:var(--accent)] rounded-full shadow-[0_0_10px_color-mix(in_srgb,var(--accent),transparent_55%)]"
                           style={{ width: `${scrubBarProgressPct}%` }}
                        />
                     </div>
                     <div className={`flex items-center justify-center ${winSize.width < 380 ? 'space-x-4' : 'space-x-8'} text-stone-200 pointer-events-auto transition-all`}>
                        <button onClick={() => seek(-15)} className="text-stone-400 hover:text-[color:var(--accent)] transition-all active:scale-90">
                          <Icon icon="tabler:rewind-backward-15" width={winSize.width < 380 ? 18 : 22} />
                        </button>
                        <button onClick={togglePlay} className="text-[color:var(--accent)] hover:scale-110 active:scale-90 transition-all">{isPaused ? <Play size={winSize.width < 380 ? 20 : 24} fill="currentColor" /> : <Pause size={winSize.width < 380 ? 20 : 24} fill="currentColor" />}</button>
                        <button onClick={() => seek(15)} className="text-stone-400 hover:text-[color:var(--accent)] transition-all active:scale-90">
                          <Icon icon="tabler:rewind-forward-15" width={winSize.width < 380 ? 18 : 22} />
                        </button>
                        <button 
                          onClick={() => {
                            const next = !isLooping;
                            setIsLooping(next);
                            if (playingFile) writeLoopForPath(playingFile.path, next);
                            if (mediaRef.current) mediaRef.current.loop = next;
                          }} 
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
                  </motion.div>
                )}

                {isCompactMode && !isMicroMode && !isTinyMode && (
                  <motion.div
                    key="compact"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute inset-0 pointer-events-none"
                  >


                    {/* Cover Art and Metadata Row */}
                    <motion.div 
                      animate={{ top: isHovering ? 36 : 16 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="absolute left-0 right-0 h-14 flex items-center justify-between px-3 z-10 pointer-events-none"
                    >
                      {/* Spacer to push text past the sharp part of the cover art */}
                      <div className="w-[84px] shrink-0" />
                      {/* Text Info: Title and Artist */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center pointer-events-auto">
                        <MarqueeText text={getTrackTitle(playingFile)} className="text-[12px] font-bold text-stone-100 leading-tight" />
                        {activeChapter ? (
                          <div className="text-[10px] text-stone-400 leading-tight truncate mt-0.5">
                            {activeChapter.chapter.title}
                          </div>
                        ) : (
                          getArtistName(playingFile) && (
                            <div className="text-[10px] text-stone-400 leading-tight truncate mt-0.5">
                              {getArtistName(playingFile)}
                            </div>
                          )
                        )}
                      </div>

                      {/* Morphing circle visualizer on the right */}
                      <div className="shrink-0 flex items-center justify-center ml-2 pointer-events-auto">
                        <Waveform isPaused={isPaused} />
                      </div>
                    </motion.div>

                    {/* Bottom controls row — grid keeps play centered when volume expands */}
                    <div className="absolute bottom-1.5 left-3 right-3 h-10 grid grid-cols-[auto_1fr_auto] items-center gap-2 z-10 pointer-events-none">
                      {/* Left: Volume Slider Wrapper */}
                      <div className="pointer-events-auto flex items-center justify-start min-w-0">
                        <div 
                          onMouseEnter={() => setIsVolumeHovered(true)}
                          onMouseLeave={() => setIsVolumeHovered(false)}
                          className={`relative z-20 flex items-center group/vol shrink-0 ${isUltraCompact ? "w-6 h-6" : "w-8 h-8"} justify-center`}
                        >
                          <button 
                            onClick={() => {
                              if (mediaRef.current) {
                                const nextMuted = !isMuted;
                                mediaRef.current.muted = nextMuted;
                                setIsMuted(nextMuted);
                              }
                            }}
                            className={`text-stone-400 hover:text-white transition-colors active:scale-95 flex items-center justify-center ${outerBtnSize} z-30`}
                            title={isMuted ? "Unmute" : "Mute"}
                          >
                            <MiniVolumeIcon
                              size={outerIconSize}
                              muted={isMuted}
                              volumePercent={isMuted ? 0 : volumeLabel}
                            />
                          </button>
                          {/* Sliding range input overlays sibling buttons */}
                          <div className={`absolute ${isUltraCompact ? "left-6" : "left-8"} top-1/2 -translate-y-1/2 w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300 ease-out flex items-center h-8 pl-2 z-20 pointer-events-none group-hover/vol:pointer-events-auto`}>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={isMuted ? 0 : volumeLabel}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (mediaRef.current) {
                                  mediaRef.current.muted = false;
                                  setIsMuted(false);
                                  mediaRef.current.volume = val / 100;
                                  setVolumeLabel(val);
                                  localStorage.setItem("miniplayer-volume", (val / 100).toString());
                                }
                              }}
                              className="w-16 h-1 bg-white/25 rounded-full appearance-none cursor-pointer accent-[color:var(--accent)] hover:bg-white/35 transition-all [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Center Cluster: Shuffle, Rewind, Play/Pause, Forward, Loop */}
                      <div className={`pointer-events-auto flex items-center justify-center justify-self-center ${buttonSpacing}`}>
                        {/* 1. Shuffle */}
                        <button 
                          type="button"
                          onClick={toggleShuffle}
                          className={`relative z-10 transition-all duration-300 ease-out active:scale-90 p-1 flex items-center justify-center ${controlBtnSize} shrink-0 ${isShuffling ? "text-[color:var(--accent)]" : "text-stone-400 hover:text-white"} ${isVolumeHovered ? "opacity-0 invisible pointer-events-none" : "opacity-100 visible"}`}
                          title={isShuffling ? "Disable shuffle" : "Shuffle"}
                        >
                          <Icon icon="tabler:arrows-shuffle" width={controlIconWidth} />
                        </button>

                        {/* 2. Rewind 15s */}
                        <button 
                          onClick={() => seek(-15)} 
                          className={`relative z-10 text-stone-400 hover:text-white transition-all duration-300 ease-out active:scale-90 flex items-center justify-center ${controlBtnSize} shrink-0 ${isVolumeHovered ? "opacity-0 invisible pointer-events-none" : "opacity-100 visible"}`}
                          title="Rewind 15s"
                        >
                          <Icon icon="tabler:rewind-backward-15" width={rewindForwardIconWidth} />
                        </button>

                        {/* 3. Play/Pause (Spotify style circle, using accent color) */}
                        <button 
                          onClick={togglePlay} 
                          className={`relative z-10 bg-[color:var(--accent)] hover:brightness-110 text-stone-950 transition-all duration-300 active:scale-95 flex items-center justify-center ${playBtnSize} rounded-full shrink-0`}
                          title={isPaused ? "Play" : "Pause"}
                        >
                          {isPaused ? <Play size={playIconSize} fill="currentColor" className="ml-0.5" /> : <Pause size={playIconSize} fill="currentColor" />}
                        </button>

                        {/* 4. Forward 15s */}
                        <button 
                          onClick={() => seek(15)} 
                          className={`relative z-10 text-stone-400 hover:text-white transition-all duration-300 active:scale-90 flex items-center justify-center ${controlBtnSize} shrink-0`}
                          title="Forward 15s"
                        >
                          <Icon icon="tabler:rewind-forward-15" width={rewindForwardIconWidth} />
                        </button>

                        {/* 5. Loop */}
                        <button 
                          onClick={() => {
                            const next = !isLooping;
                            setIsLooping(next);
                            if (playingFile) writeLoopForPath(playingFile.path, next);
                            if (mediaRef.current) mediaRef.current.loop = next;
                          }} 
                          className={`relative z-10 transition-all p-1 active:scale-90 flex items-center justify-center ${controlBtnSize} shrink-0 ${isLooping ? 'text-[color:var(--accent)]' : 'text-stone-400 hover:text-white'}`}
                          title={isLooping ? "Disable Loop" : "Enable Loop"}
                        >
                          <Icon icon={isLooping ? "streamline:arrow-infinite-loop" : "radix-icons:loop"} width={controlIconWidth} />
                        </button>
                      </div>

                      {/* Right: Export / Back-to-main */}
                      <div className={`pointer-events-auto flex items-center justify-end ${isUltraCompact ? "w-6" : "w-8"}`}>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const media = mediaRef.current;
                            const payload: SendToMainPayload = {
                              file: playingFile,
                              currentTime: media?.currentTime ?? 0,
                              paused: media ? media.paused : true,
                              playbackSpeed,
                              volume: media?.volume ?? volumeLabel / 100,
                              muted: isMuted,
                            };
                            if (media && playingFile) {
                              writePlaybackPos(playingFile.path, media.currentTime, media.duration);
                            }
                            const { emit } = await import("@tauri-apps/api/event");
                            await emit("send-to-main", payload);
                            const main = await WebviewWindow.getByLabel("main");
                            await main?.setFocus().catch(console.error);
                            getCurrentWindow().close();
                          }}
                          className={`relative z-10 text-stone-400 hover:text-white transition-colors flex items-center justify-center ${outerBtnSize} shrink-0`}
                          title="Back to Library"
                        >
                          <ExternalLink size={outerIconSize} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
                {(isMicroMode || isTinyMode) && (
                  <motion.div
                    key="micro"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-20 flex items-center pointer-events-none"
                  >
                    {/* Hover Sidebar (Left controls) */}
                    <div 
                      className={`absolute left-1.5 top-1.5 bottom-1.5 w-8 z-30 flex flex-col items-center justify-between py-1.5 transition-all duration-300 pointer-events-auto bg-stone-950/85 backdrop-blur-md border border-white/10 rounded-2xl
                        ${(isHovering || isDragging) ? "translate-x-0 opacity-100" : "-translate-x-12 opacity-0"}`}
                    >
                      {/* Top: Close Button */}
                      <button 
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          getCurrentWindow().close();
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-stone-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                        title="Close Player"
                      >
                        <Icon icon="tabler:x" width={16} height={16} />
                      </button>

                      {/* Middle: Back to Library (MicroMode only) */}
                      {!isTinyMode ? (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const media = mediaRef.current;
                            const payload: SendToMainPayload = {
                              file: playingFile,
                              currentTime: media?.currentTime ?? 0,
                              paused: media ? media.paused : true,
                              playbackSpeed,
                              volume: media?.volume ?? volumeLabel / 100,
                              muted: isMuted,
                            };
                            if (media && playingFile) {
                              writePlaybackPos(playingFile.path, media.currentTime, media.duration);
                            }
                            const { emit } = await import("@tauri-apps/api/event");
                            await emit("send-to-main", payload);
                            const main = await WebviewWindow.getByLabel("main");
                            await main?.setFocus().catch(console.error);
                            getCurrentWindow().close();
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-stone-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                          title="Back to Library"
                        >
                          <ExternalLink size={12} strokeWidth={2.5} />
                        </button>
                      ) : (
                        <div className="w-6 h-6" />
                      )}

                      {/* Bottom: Drag Handle */}
                      <div 
                        className="w-6 h-6 flex items-center justify-center cursor-move text-stone-500 hover:text-stone-300 transition-colors"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setIsDragging(true);
                          getCurrentWindow().startDragging();
                        }}
                        title="Drag Window"
                      >
                        <div className="grid grid-cols-2 gap-1 opacity-20 pointer-events-none">
                          {[...Array(8)].map((_, i) => <div key={i} className="w-0.5 h-0.5 bg-white rounded-full" />)}
                        </div>
                      </div>
                    </div>

                    {/* Hover Top Right Button (Pin in MicroMode, Back to Library in TinyMode) */}
                    <div 
                      className={`absolute top-1.5 right-1.5 z-30 transition-all duration-300 pointer-events-auto
                        ${(isHovering || isDragging) ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}
                    >
                      {!isTinyMode ? (
                        /* Pin Button (MicroMode) */
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            const newPinned = !isPinned;
                            setIsPinned(newPinned);
                            localStorage.setItem("miniplayer-pinned", newPinned.toString());
                            await getCurrentWindow().setAlwaysOnTop(newPinned);
                          }}
                          className={`w-6 h-6 flex items-center justify-center rounded-lg active:scale-95 transition-all
                            ${isPinned ? 'text-[color:var(--accent)] bg-[color:var(--accent)]/10' : 'text-stone-400 hover:text-white hover:bg-white/10'}`}
                          title={isPinned ? "Unpin Window" : "Pin Window"}
                        >
                          <Pin size={12} strokeWidth={2.5} className={isPinned ? 'fill-current' : ''} />
                        </button>
                      ) : (
                        /* Back to Library Button (TinyMode) */
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const media = mediaRef.current;
                            const payload: SendToMainPayload = {
                              file: playingFile,
                              currentTime: media?.currentTime ?? 0,
                              paused: media ? media.paused : true,
                              playbackSpeed,
                              volume: media?.volume ?? volumeLabel / 100,
                              muted: isMuted,
                            };
                            if (media && playingFile) {
                              writePlaybackPos(playingFile.path, media.currentTime, media.duration);
                            }
                            const { emit } = await import("@tauri-apps/api/event");
                            await emit("send-to-main", payload);
                            const main = await WebviewWindow.getByLabel("main");
                            await main?.setFocus().catch(console.error);
                            getCurrentWindow().close();
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-stone-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                          title="Back to Library"
                        >
                          <ExternalLink size={12} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>

                    <div className="w-full h-full relative overflow-hidden pointer-events-none">
                      <AnimatePresence mode="wait" initial={false}>
                        {isTinyMode ? (
                          /* Size 1 (Tiny Mode): Marquee Title/Artist on Left, Right Play & Next */
                          <motion.div 
                            key="tiny"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{
                              opacity: 1,
                              y: 0,
                              paddingLeft: isHovering || isDragging ? 44 : 12,
                            }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="absolute inset-0 flex items-center justify-between pr-3 pointer-events-none"
                          >
                            <div className="flex items-center min-w-0 flex-1">
                              {/* Title & Artist (metadata block with Marquee scrolling) */}
                              <motion.div 
                                initial={{ opacity: 0, x: 8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 8 }}
                                transition={{ type: "spring", damping: 20, stiffness: 180 }}
                                className="flex-1 flex flex-col justify-center min-w-0 mr-3 pointer-events-auto text-left"
                              >
                                <MarqueeText 
                                  text={playingFile ? getTrackTitle(playingFile) : "No File"} 
                                  className="text-[11px] font-bold text-white leading-tight"
                                  layoutKey={isHovering || isDragging}
                                />
                                {playingFile && getArtistName(playingFile) && (
                                  <div className="w-full truncate text-[9px] text-stone-400 leading-normal mt-0.5">
                                    {getArtistName(playingFile)}
                                  </div>
                                )}
                              </motion.div>
                            </div>

                            {/* Right: Controls (Play & Next/Forward) */}
                            <div className="flex items-center space-x-2 pointer-events-auto shrink-0 pr-1">
                              {/* Play/Pause */}
                              <button 
                                onClick={togglePlay} 
                                className="w-7 h-7 rounded-full bg-[color:var(--accent)] hover:brightness-110 text-stone-950 flex items-center justify-center active:scale-95 transition-all duration-300"
                                title={isPaused ? "Play" : "Pause"}
                              >
                                {isPaused ? <Play size={12} fill="currentColor" className="ml-0.5" /> : <Pause size={12} fill="currentColor" />}
                              </button>

                              {/* Next track */}
                              <button 
                                onClick={skipToNextTrack} 
                                className="w-7 h-7 flex items-center justify-center text-stone-400 hover:text-white transition-all duration-300 active:scale-90 disabled:opacity-30"
                                title="Next track"
                                disabled={!(playingAudioOnly ? nextMini : nextVideoMini)}
                              >
                                <Icon icon="tabler:player-skip-forward-filled" width={14} height={14} />
                              </button>
                            </div>
                          </motion.div>
                        ) : (
                          /* Size 2 (Micro Mode): Controls only, right-aligned, hides Loop or Rewind under width thresholds */
                          <motion.div
                            key="micro"
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            className="absolute inset-0 flex items-center justify-end pr-6 pointer-events-none"
                            style={{ paddingLeft: "12px" }}
                          >
                            {/* Controls Area */}
                            <div className="flex items-center justify-center space-x-3 pointer-events-auto">
                              {/* Rewind */}
                              {winSize.width >= 210 && (
                                <button 
                                  onClick={() => seek(-15)} 
                                  className="w-7 h-7 flex items-center justify-center text-stone-400 hover:text-white transition-all duration-300 active:scale-90"
                                  title="Rewind 15s"
                                >
                                  <Icon icon="tabler:rewind-backward-15" width={16} />
                                </button>
                              )}

                              {/* Play/Pause (Spotify style circle, user accent color) */}
                              <button 
                                onClick={togglePlay} 
                                className="w-8 h-8 rounded-full bg-[color:var(--accent)] hover:brightness-110 text-stone-950 flex items-center justify-center active:scale-95 transition-all duration-300"
                                title={isPaused ? "Play" : "Pause"}
                              >
                                {isPaused ? <Play size={14} fill="currentColor" className="ml-0.5" /> : <Pause size={14} fill="currentColor" />}
                              </button>

                              {/* Forward */}
                              <button 
                                onClick={() => seek(15)} 
                                className="w-7 h-7 flex items-center justify-center text-stone-400 hover:text-white transition-all duration-300 active:scale-90"
                                title="Forward 15s"
                              >
                                <Icon icon="tabler:rewind-forward-15" width={16} />
                              </button>

                              {/* Loop */}
                              {winSize.width >= 250 && (
                                <button 
                                  onClick={() => {
                                    const next = !isLooping;
                                    setIsLooping(next);
                                    if (playingFile) writeLoopForPath(playingFile.path, next);
                                    if (mediaRef.current) mediaRef.current.loop = next;
                                  }} 
                                  className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all active:scale-90
                                    ${isLooping ? 'text-[color:var(--accent)]' : 'text-stone-400 hover:text-white'}`}
                                  title={isLooping ? "Disable Loop" : "Enable Loop"}
                                >
                                  <Icon icon={isLooping ? "streamline:arrow-infinite-loop" : "radix-icons:loop"} width={14} />
                                </button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (           
            <div className="w-full h-full overflow-y-auto pt-16 pb-12 px-6 scrollbar-none pointer-events-auto bg-stone-950/50">
              <div className="mb-4">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-8 h-8 rounded-xl bg-[color:var(--accent)]/10 flex items-center justify-center border border-[color:var(--accent)]/20">
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
                                        <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center scale-75 group-hover:scale-100 transition-transform duration-300">
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
                                    <div className="w-10 h-10 rounded-full bg-[color:var(--accent)] text-black flex items-center justify-center scale-75 group-hover:scale-100 transition-transform duration-300">
                                      <Play size={18} fill="currentColor" />
                                    </div>
                                  </div>

                                  {(() => {
                                    const bar = getPlaybackThumbnailBar(file.path, file.duration);
                                    if (!bar.show) return null;
                                    return (
                                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-10 overflow-hidden">
                                        <div
                                          className={`h-full bg-[color:var(--accent)] shadow-[0_0_8px_var(--accent)] ${bar.completed ? "opacity-90" : ""}`}
                                          style={{ width: `${bar.widthPct}%` }}
                                        />
                                      </div>
                                    );
                                  })()}

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
                  className={`flex-shrink-0 w-32 h-full rounded-xl overflow-hidden relative group border-2 transition-all ${playingFile?.path === file?.path ? 'border-[color:var(--accent)]' : 'border-transparent opacity-60 hover:opacity-100'}`}
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
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors" />
                    
                    {(() => {
                      if (isPlaylist || !file) return null;
                      const bar = getPlaybackThumbnailBar(file.path, file.duration);
                      if (!bar.show) return null;
                      return (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 z-10 overflow-hidden">
                          <div
                            className={`h-full bg-[color:var(--accent)] ${bar.completed ? "opacity-90" : ""}`}
                            style={{ width: `${bar.widthPct}%` }}
                          />
                        </div>
                      );
                    })()}

                    {isPlaylist && (
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-[color:var(--accent)] rounded-full flex items-center gap-0.5 shadow-2xl z-20">
                        <Layers size={6} className="text-black" />
                        <span className="text-[6px] font-black text-black uppercase tracking-widest">{(entry as PlaylistCollection).itemCount}</span>
                      </div>
                    )}
                    <MarqueeText text={title} className="absolute bottom-1 left-2 right-2 text-[7px] font-black text-stone-100 uppercase tracking-tighter" />
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

      {/* Resize Handle (Spotify Style) — hidden in full Video Library browse (fixed size) */}
      <AnimatePresence>
        {playingFile && isHovering && (
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
