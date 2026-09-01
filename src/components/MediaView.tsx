import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, memo, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MoreVertical, Loader2, Trash2, Image as ImageIcon, Video, Volume2, VolumeX, Layers, Play, Music, FileText, FolderOutput, Shuffle, FolderOpen, Clock, ListPlus, Plus, ListVideo } from "lucide-react";
import { copyTranscriptForFile, type TranscriptVariant } from "../copyTranscript";
import { isAudioOnlyPath } from "../mediaKind";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { askConfirm } from "./ConfirmDialog";
import { MediaFile, GalleryEntry, PlaylistCollection } from "../types";
import { getPlaybackThumbnailBar, getWatchProgress, isVideoWatched } from "../playbackStorage";
import { formatStorageSize } from "../formatStorageSize";
import { clearPlaybackStateForDeletedPaths } from "../cleanupCandidates";
import { deleteMediaAtPath } from "../deleteMedia";
import { openInFileManager } from "../openInFileManager";
import { releasePlaybackBeforeDelete } from "../releasePlaybackBeforeDelete";
import { useRuforgeStore } from "../store/ruforgeStore";
import { filterMainLibraryEntries } from "../mainLibraryFilter";
import { formatDuration } from "./downloader/downloaderFormat";
import { youtubeUrlsMatch } from "../youtubeUrl";
import { useGalleryScrubExtracting } from "../scrubSpriteGallerySync";
import { galleryScrollChromeAmount } from "../lib/galleryScrollChrome";
import { MorphMenu, type MorphMenuItem } from "./ui/Morph";
import { SaveToPlaylistModal } from "./SaveToPlaylistModal";
import {
  WATCH_LATER_ID,
  isVirtualPlaylistPath,
  parseVirtualPlaylistId,
  virtualPlaylistPath,
} from "../virtualPlaylists";
import { PlaylistEmptyThumb } from "./PlaylistEmptyThumb";
import { cn } from "../lib/utils";

type ThumbnailBar = { show: boolean; widthPct: number; completed: boolean };

function deleteMediaErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/os error 32|being used by another process/i.test(msg)) {
    return "This file is still in use. Close the player, wait a moment, then try again.";
  }
  return "Failed to delete video.";
}

async function removeQueueJobsForSourceUrl(sourceUrl: string): Promise<void> {
  const jobs = useRuforgeStore.getState().downloadJobs;
  const ids = jobs.filter((j) => youtubeUrlsMatch(j.url, sourceUrl)).map((j) => j.id);
  const removeDownloadJob = useRuforgeStore.getState().removeDownloadJob;
  for (const id of ids) {
    await removeDownloadJob(id);
  }
}

function mediaDisplayTitle(file: MediaFile): string {
  return file.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "");
}

function isInProgressFile(file: MediaFile): boolean {
  const progress = getWatchProgress(file.path, file.duration);
  return progress > 0 && !isVideoWatched(file.path, file.duration);
}

function dateLabelForCreated(created: number): string {
  const date = new Date(created * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function groupEntriesByDate(entries: GalleryEntry[]): { label: string; entries: GalleryEntry[] }[] {
  const groups = new Map<string, GalleryEntry[]>();
  for (const entry of entries) {
    const created = entry.kind === "media" ? entry.created : entry.items[0]?.created || 0;
    const label = dateLabelForCreated(created);
    const bucket = groups.get(label);
    if (bucket) bucket.push(entry);
    else groups.set(label, [entry]);
  }
  return Array.from(groups, ([label, groupEntries]) => ({ label, entries: groupEntries }));
}

const PREVIEW_HOVER_DELAY_MS = 420;
const MENU_EDGE_PAD = 12;
const MENU_ESTIMATE_W = 176;
const MENU_ESTIMATE_H = 280;

function placeFloatingMenu(
  x: number,
  y: number,
  width: number,
  height: number,
): { left: number; top: number } {
  let left = x;
  let top = y;
  if (left + width > window.innerWidth - MENU_EDGE_PAD) {
    left = Math.max(MENU_EDGE_PAD, window.innerWidth - width - MENU_EDGE_PAD);
  }
  if (left < MENU_EDGE_PAD) left = MENU_EDGE_PAD;
  if (top + height > window.innerHeight - MENU_EDGE_PAD) {
    top = Math.max(MENU_EDGE_PAD, y - height);
  }
  if (top < MENU_EDGE_PAD) top = MENU_EDGE_PAD;
  return { left, top };
}

function GalleryMenuTitle({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldMarquee, setShouldMarquee] = useState(false);

  useEffect(() => {
    const check = () => {
      if (!containerRef.current || !textRef.current) return;
      setShouldMarquee(textRef.current.offsetWidth > containerRef.current.offsetWidth + 1);
    };
    check();
    const t = setTimeout(check, 80);
    window.addEventListener("resize", check);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", check);
    };
  }, [text]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden whitespace-nowrap"
    >
      <div className={`flex w-max ${shouldMarquee ? "animate-marquee" : ""}`}>
        <span
          ref={textRef}
          className={`text-[10px] font-black uppercase tracking-widest text-stone-500 ${
            shouldMarquee ? "pr-10" : ""
          }`}
        >
          {text}
        </span>
        {shouldMarquee && (
          <span className="pr-10 text-[10px] font-black uppercase tracking-widest text-stone-500">
            {text}
          </span>
        )}
      </div>
    </div>
  );
}

const PlaylistStackCard = ({
  playlist,
  onClick,
  onContextMenu,
}: {
  playlist: PlaylistCollection;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) => {
  const mainThumbnail =
    playlist.stackThumbnailPath ||
    playlist.items[0]?.thumbnailPath ||
    playlist.items[0]?.ruforgePosterPath;
  const countLabel =
    playlist.itemCount === 0
      ? "No videos"
      : `${playlist.itemCount} video${playlist.itemCount === 1 ? "" : "s"}`;

  return (
    <div
      className="group cursor-pointer flex flex-col gap-2.5"
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="relative aspect-video rounded-[var(--r-media,16px)] overflow-hidden bg-[#2a221e]">
        {mainThumbnail ? (
          <img
            src={convertFileSrc(mainThumbnail)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-200 group-hover:brightness-110"
          />
        ) : (
          <PlaylistEmptyThumb className="absolute inset-0" />
        )}

        {/* YouTube-style right count strip */}
        <div className="absolute inset-y-0 right-0 w-[28%] min-w-[4.5rem] bg-black/70 flex flex-col items-center justify-center gap-1.5 px-2">
          <ListVideo size={18} strokeWidth={2} className="text-white" />
          <span className="text-[11px] font-semibold text-white text-center leading-tight">
            {countLabel}
          </span>
        </div>
      </div>

      <div className="px-0.5 min-w-0">
        <h3 className="text-[13px] font-bold text-stone-100 leading-snug truncate">
          {playlist.title.replace(/_/g, " ")}
        </h3>
        <p className="mt-0.5 text-[11px] font-medium text-stone-500 truncate">Playlist</p>
        <p className="mt-0.5 text-[11px] font-medium text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity">
          View full playlist
        </p>
      </div>
    </div>
  );
};
const VideoCard = memo(function VideoCard({
  file,
  progressBar,
  onDelete,
  onExtract,
  onSaveToPlaylist,
  onToggleWatchLater,
  inWatchLater,
}: {
  file: MediaFile;
  progressBar: ThumbnailBar;
  onDelete: (file: MediaFile) => void;
  onExtract: (file: MediaFile) => void;
  onSaveToPlaylist: (file: MediaFile) => void;
  onToggleWatchLater: (file: MediaFile) => void;
  inWatchLater: boolean;
}) {
  const handlePlayFile = useRuforgeStore((s) => s.handlePlayFile);
  const openExportPanel = useRuforgeStore((s) => s.openExportPanel);
  const menuOpen = useRuforgeStore(
    (s) => s.activeMenu?.path === file.path && !s.activeMenu?.floating,
  );
  const setGalleryActiveMenu = useRuforgeStore((s) => s.setGalleryActiveMenu);
  const extracting = useGalleryScrubExtracting(file.path);
  const [isHovered, setIsHovered] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [views, setViews] = useState(() => {
    const saved = localStorage.getItem(`views-${file.path}`);
    return saved ? parseInt(saved) : 0;
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stillPoster = file.thumbnailPath ?? file.ruforgePosterPath;
  const isAudioItem = isAudioOnlyPath(file.path);
  const title = mediaDisplayTitle(file);
  const timeLabel = new Date(file.created * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const shellOpen = isHovered || menuOpen;
  const mountMorph = isHovered || menuOpen;
  const optionsVisible = isHovered || menuOpen;
  const titleHot = isHovered || menuOpen;

  const clearPreviewTimer = () => {
    if (previewTimerRef.current != null) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  };

  const stopPreview = () => {
    clearPreviewTimer();
    setPreviewVisible(false);
    setPreviewActive(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0.1;
    }
  };

  useEffect(() => () => clearPreviewTimer(), []);

  useEffect(() => {
    if (menuOpen) stopPreview();
  }, [menuOpen]);

  useEffect(() => {
    if (!previewActive || isAudioItem || menuOpen) return;
    const el = videoRef.current;
    if (!el) return;
    const onPlaying = () => setPreviewVisible(true);
    el.addEventListener("playing", onPlaying);
    el.play().catch(() => {});
    return () => {
      el.removeEventListener("playing", onPlaying);
      el.pause();
    };
  }, [previewActive, isAudioItem, file.path, menuOpen]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (isAudioItem || menuOpen) return;
    clearPreviewTimer();
    previewTimerRef.current = setTimeout(() => {
      setPreviewActive(true);
    }, PREVIEW_HOVER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (!menuOpen) stopPreview();
  };

  const handlePlayAction = async () => {
    if (menuOpen) return;
    const newViews = views + 1;
    setViews(newViews);
    localStorage.setItem(`views-${file.path}`, newViews.toString());
    void handlePlayFile(file, undefined, null);
  };

  const setMenuOpen = (next: boolean) => {
    if (next) {
      stopPreview();
      setGalleryActiveMenu({ path: file.path });
    } else {
      const active = useRuforgeStore.getState().activeMenu;
      if (active?.path === file.path && !active.floating) {
        setGalleryActiveMenu(null);
      }
    }
  };

  const menuItems = useMemo((): MorphMenuItem[] => {
    const iconBox = (node: ReactNode) => (
      <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--accent),transparent_88%)] flex items-center justify-center shrink-0">
        {node}
      </div>
    );
    const rows: MorphMenuItem[] = [
      {
        id: "play",
        label: "Play Video",
        icon: iconBox(<Play size={13} fill="currentColor" />),
        onSelect: () => {
          void handlePlayFile(file, undefined, null);
        },
      },
      {
        id: "watch-later",
        label: inWatchLater ? "Remove from Watch later" : "Save to Watch later",
        icon: <Clock size={14} className="shrink-0 ml-1.5" />,
        onSelect: () => onToggleWatchLater(file),
      },
      {
        id: "save-playlist",
        label: "Save to playlist",
        icon: <ListPlus size={14} className="shrink-0 ml-1.5" />,
        onSelect: () => onSaveToPlaylist(file),
      },
      {
        id: "previews",
        label: "Previews",
        icon: <ImageIcon size={14} className="shrink-0 ml-1.5" />,
        onSelect: () => onExtract(file),
      },
      {
        id: "export",
        label: "Export",
        icon: <FolderOutput size={14} className="shrink-0 ml-1.5" />,
        onSelect: () => openExportPanel({ paths: [file.path], label: file.name }),
      },
    ];
    if (file.subtitlePath) {
      rows.push({
        id: "transcript",
        label: "Transcript",
        icon: <FileText size={14} className="shrink-0 ml-1.5" />,
        submenu: (
          <div className="relative space-y-0.5 overflow-hidden">
            <div className="absolute top-[8px] bottom-[8px] left-4 w-px bg-white/10 pointer-events-none" />
            {([
              ["plain", "Plain text"],
              ["timestamped", "Timestamps"],
              ["markdown", "Markdown"],
            ] as const).map(([variant, label]) => (
              <button
                key={variant}
                type="button"
                className="w-full pl-5 pr-2 py-1.5 rounded-lg text-[10px] font-black text-left text-stone-500 hover:text-white transition-colors"
                onClick={() => {
                  void copyTranscriptForFile(file, variant as TranscriptVariant);
                  setGalleryActiveMenu(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ),
      });
    }
    rows.push(
      {
        id: "folder",
        label: "Open folder",
        icon: <FolderOpen size={14} className="shrink-0 ml-1.5" />,
        onSelect: () => {
          void openInFileManager(file.path);
        },
      },
      {
        id: "delete",
        label: "Delete",
        icon: <Trash2 size={14} className="shrink-0 ml-1.5" />,
        danger: true,
        onSelect: () => onDelete(file),
      },
    );
    return rows;
  }, [
    file,
    handlePlayFile,
    inWatchLater,
    onDelete,
    onExtract,
    onSaveToPlaylist,
    onToggleWatchLater,
    openExportPanel,
    setGalleryActiveMenu,
  ]);

  return (
    <div
      className={`group relative z-0 cursor-pointer ${menuOpen ? "z-30" : "hover:z-20"}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handlePlayAction}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(true);
      }}
    >
      <motion.div
        aria-hidden
        initial={false}
        animate={{
          opacity: shellOpen ? 1 : 0,
          scale: shellOpen ? 1 : 0.92,
        }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute -inset-3 -z-10 rounded-[22px] bg-[#241c18] origin-center"
      />

      <div className="relative z-10 flex flex-col gap-3">
        <div
          className="relative aspect-video overflow-hidden rounded-2xl bg-[#1D1613]"
          style={{ contentVisibility: "auto", containIntrinsicSize: "auto 180px" }}
        >
          {stillPoster ? (
            <img
              src={convertFileSrc(stillPoster)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#2a221e]">
              {isAudioItem ? (
                <Music className="w-12 h-12 text-stone-700" strokeWidth={1.25} aria-hidden />
              ) : (
                <Video className="w-12 h-12 text-stone-700" strokeWidth={1.25} aria-hidden />
              )}
            </div>
          )}

          {previewActive && !isAudioItem && !menuOpen && (
            <video
              ref={videoRef}
              src={`${convertFileSrc(file.path)}#t=0.1`}
              preload="metadata"
              muted={previewMuted}
              playsInline
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ease-out ${
                previewVisible ? "opacity-100" : "opacity-0"
              }`}
            />
          )}

          {previewVisible && !isAudioItem && !menuOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreviewMuted(!previewMuted);
              }}
              className="absolute top-2.5 right-2.5 p-2 rounded-full bg-black/55 backdrop-blur-md text-white z-40 transition-transform active:scale-90 hover:bg-black/70"
            >
              {previewMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          )}

          {isAudioItem && (
            <div
              className="absolute top-2.5 left-2.5 z-30 flex items-center justify-center p-1.5 rounded-full bg-black/55 backdrop-blur-sm pointer-events-none"
              aria-hidden
            >
              <Music size={12} className="text-white/85" strokeWidth={2.25} />
            </div>
          )}

          {file.duration > 0 && !previewVisible && !menuOpen && (
            <div className="absolute bottom-2.5 right-2.5 z-20 px-2 py-0.5 rounded-md bg-black/75 text-[11px] font-bold text-white tracking-wider tabular-nums">
              {formatDuration(file.duration)}
            </div>
          )}

          {progressBar.show && (
            <div className="absolute bottom-0 left-0 right-0 z-30 h-1 overflow-hidden bg-white/15">
              <div
                className={`h-full bg-[color:var(--accent)] ${progressBar.completed ? "opacity-90" : ""}`}
                style={{ width: `${progressBar.widthPct}%` }}
              />
            </div>
          )}

          {extracting && (
            <>
              <div className="absolute inset-0 z-40 bg-black/55 pointer-events-none" aria-hidden />
              <div
                className="absolute top-2.5 left-2.5 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md pointer-events-none"
                aria-live="polite"
                aria-label="Building scrubber previews"
              >
                <Loader2 className="animate-spin text-[color:var(--accent)] shrink-0" size={13} />
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--accent)]">
                  Previews
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 px-0.5">
          <div className="flex-1 min-w-0">
            <h3
              className={cn(
                "text-[14px] font-bold leading-snug line-clamp-2 transition-colors duration-150",
                titleHot ? "text-[color:var(--accent)]" : "text-stone-50",
              )}
            >
              {title}
            </h3>
            <p className="mt-1.5 text-[12px] font-medium text-stone-500 truncate">
              <span>{formatStorageSize(file.size)}</span>
              <span className="mx-1.5 text-stone-600">·</span>
              <span>
                {views} {views === 1 ? "view" : "views"}
              </span>
              <span className="mx-1.5 text-stone-600">·</span>
              <span>{timeLabel}</span>
            </p>
          </div>

          <div
            className={`relative self-start mt-0.5 transition-opacity duration-150 ${
              optionsVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            {mountMorph ? (
              <MorphMenu
                open={menuOpen}
                onOpenChange={setMenuOpen}
                triggerSize={32}
                align="end"
                paintedRest={false}
                aria-label="Video options"
                trigger={<MoreVertical size={16} strokeWidth={2.25} />}
                items={menuItems}
                header={<GalleryMenuTitle text={title} />}
              />
            ) : (
              <button
                type="button"
                aria-label="Video options"
                className="flex h-8 w-8 items-center justify-center text-stone-500 hover:text-stone-200"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsHovered(true);
                  setMenuOpen(true);
                }}
              >
                <MoreVertical size={16} strokeWidth={2.25} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export const MediaView = ({
  onPlaylistClick,
}: {
  onPlaylistClick: (playlist: PlaylistCollection) => void;
}) => {
  const libraryScanDirs = useRuforgeStore((s) => s.libraryScanDirs);
  const gridDensity = useRuforgeStore((s) => s.settings.gridDensity);
  const searchQuery = useRuforgeStore((s) => s.searchValue);
  const filter = useRuforgeStore((s) => s.galleryFilter);
  const notify = useRuforgeStore((s) => s.notify);
  const dismissNotification = useRuforgeStore((s) => s.dismissNotification);
  const entries = useRuforgeStore((s) => s.entries);
  const hideAudioFromMainLibrary = useRuforgeStore(
    (s) => s.settings.hideAudioFromMainLibrary !== false,
  );
  const galleryLoading = useRuforgeStore((s) => s.galleryLoading);
  const galleryDesktopReady = useRuforgeStore((s) => s.galleryDesktopReady);
  const activeMenu = useRuforgeStore((s) => s.activeMenu);
  const setGalleryActiveMenu = useRuforgeStore((s) => s.setGalleryActiveMenu);
  const fetchEntries = useRuforgeStore((s) => s.fetchEntries);
  const ensureGalleryOnViewMount = useRuforgeStore((s) => s.ensureGalleryOnViewMount);
  const removeGalleryEntryByPath = useRuforgeStore((s) => s.removeGalleryEntryByPath);
  const upsertGalleryMediaFile = useRuforgeStore((s) => s.upsertGalleryMediaFile);
  const addGalleryExtractingPath = useRuforgeStore((s) => s.addGalleryExtractingPath);
  const removeGalleryExtractingPath = useRuforgeStore((s) => s.removeGalleryExtractingPath);
  const handlePlayPlaylist = useRuforgeStore((s) => s.handlePlayPlaylist);
  const openExportPanel = useRuforgeStore((s) => s.openExportPanel);
  const toggleWatchLater = useRuforgeStore((s) => s.toggleWatchLater);
  const deleteVirtualPlaylist = useRuforgeStore((s) => s.deleteVirtualPlaylist);
  const libraryScanRevision = useRuforgeStore((s) => s.libraryScanRevision);

  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });
  const [savePaths, setSavePaths] = useState<string[] | null>(null);
  const galleryMenuRef = useRef<HTMLDivElement>(null);
  const libraryScrollRef = useRef<HTMLDivElement>(null);
  const libraryHeaderRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef(0);
  const pushedChromeRef = useRef(0);
  const setGalleryScrollChrome = useRuforgeStore((s) => s.setGalleryScrollChrome);

  const applyLibraryHeaderChrome = useCallback((amount: number) => {
    const header = libraryHeaderRef.current;
    if (!header) return;
    const opacity = 1 - amount;
    header.style.opacity = String(opacity);
    header.style.transform = amount > 0 ? `translateY(${-amount * 12}px)` : "";
    header.style.pointerEvents = opacity < 0.05 ? "none" : "";
    if (opacity < 0.05) header.setAttribute("aria-hidden", "true");
    else header.removeAttribute("aria-hidden");
  }, []);

  const pushGalleryChrome = useCallback(
    (amount: number) => {
      const quantized = Math.round(amount * 50) / 50;
      const prev = pushedChromeRef.current;
      if (prev >= 1 && quantized >= 1) return;
      if (prev <= 0 && quantized <= 0) return;
      if (quantized === prev) return;
      pushedChromeRef.current = quantized;
      setGalleryScrollChrome(quantized);
    },
    [setGalleryScrollChrome],
  );

  const handleLibraryScroll = useCallback(() => {
    const el = libraryScrollRef.current;
    if (!el) return;
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const amount = galleryScrollChromeAmount(el.scrollTop);
      applyLibraryHeaderChrome(amount);
      pushGalleryChrome(amount);
    });
  }, [applyLibraryHeaderChrome, pushGalleryChrome]);

  useEffect(() => {
    pushedChromeRef.current = 0;
    setGalleryScrollChrome(0);
    applyLibraryHeaderChrome(0);
    const el = libraryScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [filter, setGalleryScrollChrome, applyLibraryHeaderChrome]);

  useLayoutEffect(() => {
    const el = libraryScrollRef.current;
    const amount = galleryScrollChromeAmount(el?.scrollTop ?? 0);
    applyLibraryHeaderChrome(amount);
    // Force a store write even if the local ref thinks we are already at 0/1
    // (HMR or tab remount can leave galleryScrollChrome stale).
    pushedChromeRef.current = Number.NaN;
    pushGalleryChrome(amount);
  }, [applyLibraryHeaderChrome, pushGalleryChrome]);

  useEffect(
    () => () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      setGalleryScrollChrome(0);
    },
    [setGalleryScrollChrome],
  );

  const libraryEntries = useMemo(
    () => filterMainLibraryEntries(entries, hideAudioFromMainLibrary),
    [entries, hideAudioFromMainLibrary],
  );

  const floatingMenu =
    activeMenu?.floating && activeMenu.x != null && activeMenu.y != null
      ? activeMenu
      : null;

  useEffect(() => {
    if (!floatingMenu) return;
    setMenuPos(
      placeFloatingMenu(
        floatingMenu.x!,
        floatingMenu.y!,
        MENU_ESTIMATE_W,
        MENU_ESTIMATE_H,
      ),
    );
  }, [floatingMenu]);

  useLayoutEffect(() => {
    if (!floatingMenu || !galleryMenuRef.current) return;
    const { width, height } = galleryMenuRef.current.getBoundingClientRect();
    setMenuPos(
      placeFloatingMenu(
        floatingMenu.x!,
        floatingMenu.y!,
        Math.max(width, MENU_ESTIMATE_W),
        Math.max(height, 1),
      ),
    );
  }, [floatingMenu]);

  const handleDelete = useCallback(
    async (file: MediaFile) => {
      setGalleryActiveMenu(null);
      const approved = await askConfirm({
        title: "Delete video",
        message: `Move this item to the system Recycle Bin? You can restore it from Recently Deleted while it stays in the bin.`,
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        itemPreview: file.thumbnailPath ?? file.ruforgePosterPath,
        itemMeta: `${formatStorageSize(file.size)} • ${file.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "")}`,
      });
      if (!approved) {
        return;
      }

      await releasePlaybackBeforeDelete([file.path]);
      const deletingId = notify("Deleting…", "progress");
      removeGalleryEntryByPath(file.path);

      try {
        const result = await deleteMediaAtPath(file.path);
        clearPlaybackStateForDeletedPaths([file.path]);
        const sourceUrl = file.sourceUrl?.trim();
        if (sourceUrl) {
          await removeQueueJobsForSourceUrl(sourceUrl);
        }
        if (result.alreadyMissing && !result.removed) {
          notify("Removed from library (file was already gone).");
        } else if (result.removed) {
          notify("Moved to Recycle Bin. Restore from Recently Deleted if needed.");
        } else {
          notify("Removed from library.");
        }
      } catch (e) {
        console.error(e);
        upsertGalleryMediaFile(file);
        const message = deleteMediaErrorMessage(e);
        notify(message, message.includes("still in use") ? "warning" : "error");
      } finally {
        dismissNotification(deletingId);
        setGalleryActiveMenu(null);
      }
    },
    [
      dismissNotification,
      notify,
      removeGalleryEntryByPath,
      setGalleryActiveMenu,
      upsertGalleryMediaFile,
    ],
  );

  const handleExtract = useCallback(
    async (file: MediaFile) => {
      addGalleryExtractingPath(file.path);
      try {
        await invoke("extract_frames", { videoPath: file.path, allowGenerate: true });
        notify("Previews generated successfully.");
        await fetchEntries({
          manageLoadingStart: false,
          skipPosterBackfill: true,
          skipScrubBackfill: true,
        });
      } catch (e) {
        console.error(e);
        notify("Failed to generate previews.");
      } finally {
        removeGalleryExtractingPath(file.path);
        setGalleryActiveMenu(null);
      }
    },
    [
      addGalleryExtractingPath,
      fetchEntries,
      notify,
      removeGalleryExtractingPath,
      setGalleryActiveMenu,
    ],
  );

  const libraryScanDirsPrevRef = useRef<string[] | null>(null);

  useEffect(() => {
    const prev = libraryScanDirsPrevRef.current;
    libraryScanDirsPrevRef.current = libraryScanDirs;
    const dirsChanged =
      prev !== null &&
      (prev.length !== libraryScanDirs.length ||
        prev.some((d, i) => d !== libraryScanDirs[i]));
    void ensureGalleryOnViewMount({ forceCold: dirsChanged });
  }, [ensureGalleryOnViewMount, libraryScanDirs]);

  const gridLayoutClass =
    gridDensity === "Cozy"
      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8"
      : gridDensity === "Compact"
        ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-6"
        : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-7";

  const filteredEntries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const matched = libraryEntries.filter((entry) => {
      const title = entry.kind === "media" ? entry.name : entry.title;
      if (q && !title.toLowerCase().includes(q)) return false;
      if (filter === "all") return entry.kind === "media";
      if (filter === "playlists") return entry.kind === "playlist";
      if (entry.kind === "playlist") return false;
      const file = entry as MediaFile;
      if (filter === "in-progress") return isInProgressFile(file);
      if (filter === "watched") return isVideoWatched(file.path, file.duration);
      return true;
    });

    return [...matched].sort((a, b) => {
      if (a.kind === "playlist" && b.kind === "playlist") {
        const aWatch = a.path === virtualPlaylistPath(WATCH_LATER_ID);
        const bWatch = b.path === virtualPlaylistPath(WATCH_LATER_ID);
        if (aWatch && !bWatch) return -1;
        if (!aWatch && bWatch) return 1;
        if (isVirtualPlaylistPath(a.path) && !isVirtualPlaylistPath(b.path)) return -1;
        if (!isVirtualPlaylistPath(a.path) && isVirtualPlaylistPath(b.path)) return 1;
      }
      const timeA = a.kind === "media" ? a.created : a.items[0]?.created || 0;
      const timeB = b.kind === "media" ? b.created : b.items[0]?.created || 0;
      return timeB - timeA;
    });
  }, [libraryEntries, searchQuery, filter, libraryScanRevision]);

  const playlistStacks = useMemo(
    () => filteredEntries.filter((e): e is PlaylistCollection => e.kind === "playlist"),
    [filteredEntries],
  );

  const mediaOnlyEntries = useMemo(
    () => filteredEntries.filter((e): e is GalleryEntry & { kind: "media" } => e.kind === "media"),
    [filteredEntries],
  );

  const datedGroups = useMemo(
    () => groupEntriesByDate(filter === "playlists" ? [] : mediaOnlyEntries),
    [mediaOnlyEntries, filter],
  );

  const watchLaterPaths = useMemo(() => {
    const wl = playlistStacks.find((p) => p.path === virtualPlaylistPath(WATCH_LATER_ID));
    return new Set((wl?.items ?? []).map((i) => i.path.replace(/\//g, "\\").toLowerCase()));
  }, [playlistStacks]);

  const progressBarsByPath = useMemo(() => {
    const map = new Map<string, ThumbnailBar>();
    for (const entry of mediaOnlyEntries) {
      map.set(entry.path, getPlaybackThumbnailBar(entry.path, entry.duration));
    }
    return map;
  }, [mediaOnlyEntries]);

  const emptyProgressBar = useMemo<ThumbnailBar>(
    () => ({ show: false, widthPct: 0, completed: false }),
    [],
  );

  const handleToggleWatchLater = useCallback(
    (file: MediaFile) => {
      const added = toggleWatchLater(file.path);
      notify(added ? "Saved to Watch later" : "Removed from Watch later");
      setGalleryActiveMenu(null);
    },
    [notify, setGalleryActiveMenu, toggleWatchLater],
  );

  const handleSaveToPlaylist = useCallback(
    (file: MediaFile) => {
      setGalleryActiveMenu(null);
      setSavePaths([file.path]);
    },
    [setGalleryActiveMenu],
  );

  const emptyCopy =
    filter === "in-progress"
      ? "nothing in progress right now"
      : filter === "watched"
        ? "nothing finished yet"
        : filter === "playlists"
          ? "no playlists yet — create one"
          : searchQuery.trim()
            ? "no matches for that search"
            : "dang.. library's empty";

  const showPlaylistSection = filter === "playlists";
  const showEmptyState =
    filter === "playlists"
      ? playlistStacks.length === 0 && Boolean(searchQuery.trim())
      : filteredEntries.length === 0;
  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="h-full flex flex-col"
      onClick={() => { setGalleryActiveMenu(null); }}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('.group')) return;
        e.preventDefault();
        setGalleryActiveMenu(null);
      }}
    >
      <div
        ref={libraryScrollRef}
        onScroll={handleLibraryScroll}
        className="flex-1 overflow-y-auto px-6 xl:px-10 pb-32 rf-scrollbar"
      >
        <div ref={libraryHeaderRef} className="pt-16 pb-8">
          <h1 className="text-3xl font-black tracking-tight text-stone-50">Video Library</h1>
          <p className="text-stone-400 font-medium text-sm mt-1.5">
            Browse and manage your downloaded videos.
          </p>
        </div>

        {galleryLoading && !galleryDesktopReady ? (
          <div className="flex justify-center py-40">
            <Loader2 className="animate-spin text-[color:var(--accent)] opacity-20" size={60} />
          </div>
        ) : showEmptyState ? (
          <div className="py-36 text-center space-y-2">
            <p className="text-stone-400 font-medium text-sm">{emptyCopy}</p>
            {filter !== "all" && filter !== "playlists" && (
              <p className="text-stone-600 text-xs font-medium">
                switch to All to browse everything
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-12">
            {showPlaylistSection ? (
              <section className="space-y-5">
                <div className="flex items-end justify-between gap-4">
                  <h2 className="text-[12px] font-bold text-stone-500 tracking-[0.18em] uppercase">
                    Playlists
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSavePaths([])}
                    className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500 hover:text-[color:var(--accent)] transition-colors"
                  >
                    <Plus size={12} />
                    New
                  </button>
                </div>
                {playlistStacks.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <p className="text-stone-400 font-medium text-sm">{emptyCopy}</p>
                    <button
                      type="button"
                      onClick={() => setSavePaths([])}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] text-[11px] font-semibold text-stone-200 hover:bg-white/[0.1] transition-colors"
                    >
                      <Plus size={12} />
                      Create playlist
                    </button>
                  </div>
                ) : (
                  <div className={gridLayoutClass}>
                    {playlistStacks.map((entry) => (
                      <PlaylistStackCard
                        key={entry.path}
                        playlist={entry}
                        onClick={() => onPlaylistClick(entry)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setGalleryActiveMenu({
                            path: entry.path,
                            x: e.clientX,
                            y: e.clientY,
                            floating: true,
                          });
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {filter !== "playlists"
              ? datedGroups.map(({ label, entries: groupEntries }) => (
                  <section key={label} className="space-y-5">
                    <h2 className="text-[12px] font-bold text-stone-500 tracking-[0.18em] uppercase">
                      {label}
                    </h2>
                    <div className={gridLayoutClass}>
                      {groupEntries.map((entry) => {
                        if (entry.kind === "playlist") return null;
                        return (
                          <VideoCard
                            key={entry.path}
                            file={entry}
                            progressBar={progressBarsByPath.get(entry.path) ?? emptyProgressBar}
                            onDelete={handleDelete}
                            onExtract={handleExtract}
                            onSaveToPlaylist={handleSaveToPlaylist}
                            onToggleWatchLater={handleToggleWatchLater}
                            inWatchLater={watchLaterPaths.has(
                              entry.path.replace(/\//g, "\\").toLowerCase(),
                            )}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))
              : null}
          </div>
        )}
      </div>

      <SaveToPlaylistModal
        open={savePaths !== null}
        onClose={() => setSavePaths(null)}
        mediaPaths={savePaths ?? []}
      />

      <AnimatePresence>
        {floatingMenu && (
          <motion.div
            ref={galleryMenuRef}
            initial={{ opacity: 0, scale: 0.96, x: -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.96, x: -8 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="fixed w-max bg-[#271C18] rounded-2xl z-[100] overflow-hidden shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
            style={{
              left: menuPos.left,
              top: menuPos.top,
              transformOrigin: "left center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const entry = libraryEntries.find((e) => e.path === floatingMenu.path);
              if (!entry || entry.kind !== "playlist") return null;
              const playlist = entry;
              const virtual = isVirtualPlaylistPath(playlist.path);
              const virtualId = parseVirtualPlaylistId(playlist.path);
              return (
                <div className="p-1">
                  <div className="px-2.5 py-2 mb-0.5">
                    <GalleryMenuTitle text={playlist.title} />
                  </div>
                  <button
                    onClick={() => {
                      onPlaylistClick(playlist);
                      setGalleryActiveMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2.5 hover:bg-white/5 transition-colors text-stone-300 hover:text-white rounded-lg group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--accent),transparent_88%)] flex items-center justify-center group-hover:bg-[color:var(--accent)] group-hover:text-stone-900 transition-all shrink-0">
                      <Layers size={13} />
                    </div>
                    <span className="text-[11px] font-bold truncate">Open</span>
                  </button>
                  <button
                    onClick={() => {
                      handlePlayPlaylist(playlist.items, false, null);
                      setGalleryActiveMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2.5 hover:bg-white/5 transition-colors text-stone-300 hover:text-white rounded-lg group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--accent),transparent_88%)] flex items-center justify-center group-hover:bg-[color:var(--accent)] group-hover:text-stone-900 transition-all shrink-0">
                      <Play size={13} fill="currentColor" />
                    </div>
                    <span className="text-[11px] font-bold truncate">Play All</span>
                  </button>
                  <button
                    onClick={() => {
                      handlePlayPlaylist(playlist.items, true, null);
                      setGalleryActiveMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2.5 hover:bg-white/5 transition-colors text-stone-300 hover:text-white rounded-lg"
                  >
                    <Shuffle size={14} className="shrink-0 ml-1.5" />
                    <span className="text-[11px] font-bold truncate">Shuffle</span>
                  </button>
                  <div className="h-px bg-white/5 my-1 mx-2" />
                  <button
                    onClick={() => {
                      openExportPanel({
                        paths: playlist.items.map((i) => i.path),
                        label: playlist.title,
                      });
                      setGalleryActiveMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2.5 hover:bg-white/5 transition-colors text-stone-300 hover:text-white rounded-lg"
                  >
                    <FolderOutput size={14} className="shrink-0 ml-1.5" />
                    <span className="text-[11px] font-bold truncate">Export</span>
                  </button>
                  {!virtual ? (
                    <button
                      onClick={() => {
                        void openInFileManager(playlist.path);
                        setGalleryActiveMenu(null);
                      }}
                      className="w-full px-2.5 py-2 flex items-center gap-2.5 hover:bg-white/5 transition-colors text-stone-300 hover:text-white rounded-lg"
                    >
                      <FolderOpen size={14} className="shrink-0 ml-1.5" />
                      <span className="text-[11px] font-bold truncate">Open folder</span>
                    </button>
                  ) : virtualId && virtualId !== WATCH_LATER_ID ? (
                    <button
                      onClick={() => {
                        if (deleteVirtualPlaylist(virtualId)) {
                          notify("Playlist deleted");
                        }
                        setGalleryActiveMenu(null);
                      }}
                      className="w-full px-2.5 py-2 flex items-center gap-2.5 hover:bg-white/5 transition-colors text-rose-400 hover:text-rose-300 rounded-lg"
                    >
                      <Trash2 size={14} className="shrink-0 ml-1.5" />
                      <span className="text-[11px] font-bold truncate">Delete playlist</span>
                    </button>
                  ) : null}
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
