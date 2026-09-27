import { useState, useEffect, useRef, useMemo, memo, type ReactNode } from "react";
import { motion } from "motion/react";
import { MoreVertical, Loader2, Trash2, Image as ImageIcon, Video, Volume2, VolumeX, Play, Music, FileText, FolderOutput, FolderOpen, Clock, ListPlus } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { copyTranscriptForFile, type TranscriptVariant } from "@/copyTranscript";
import { isAudioOnlyPath } from "@/mediaKind";
import type { MediaFile } from "@/types";
import { formatStorageSize } from "@/formatStorageSize";
import { openInFileManager } from "@/openInFileManager";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import { useGalleryScrubExtracting } from "@/scrubSpriteGallerySync";
import { MorphMenu, type MorphMenuItem } from "@/components/ui/Morph";
import { cn } from "@/lib/utils";
import { formatAge, formatViewCount } from "./youtubeFeed";
import { MetaParts, VideoByline } from "./VideoByline";

export type ThumbnailBar = { show: boolean; widthPct: number; completed: boolean };

function mediaDisplayTitle(file: MediaFile): string {
  return file.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "");
}

const PREVIEW_HOVER_DELAY_MS = 420;

export function GalleryMenuTitle({ text }: { text: string }) {
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

export const VideoCard = memo(function VideoCard({
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
  const youtube = file.youtube;
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
        className="pointer-events-none absolute -inset-3 -z-10 rounded-[22px] bg-[color:var(--rf-well-raised)] origin-center"
      />

      <div className="relative z-10 flex flex-col gap-3">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-[color:var(--rf-well-raised)]">
          {stillPoster ? (
            <img
              src={convertFileSrc(stillPoster)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[color:var(--rf-well-raised)]">
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

        <VideoByline
          channel={youtube?.channel}
          channelId={youtube?.channelId}
          verified={youtube?.channelVerified ?? false}
          title={
            <h3
              className={cn(
                "text-[15px] font-semibold leading-snug line-clamp-2 transition-colors duration-150",
                titleHot ? "text-[color:var(--accent)]" : "text-stone-50",
              )}
            >
              {title}
            </h3>
          }
          meta={<LibraryCardMeta file={file} plays={views} />}
          action={
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
          }
        />
      </div>
    </div>
  );
});

/**
 * Online numbers are YouTube's, frozen at download; plays are this machine's own count, so they
 * get their own accent-tinted wording instead of reading as a second view count.
 */
function LibraryCardMeta({ file, plays }: { file: MediaFile; plays: number }) {
  const youtube = file.youtube;
  const online = [
    formatViewCount(youtube?.viewCount ?? null),
    youtube?.publishedAt ? formatAge(youtube.publishedAt) : null,
  ].filter((part): part is string => Boolean(part));
  const local = [formatStorageSize(file.size), `added ${formatAge(file.created)}`].map((part) => (
    <span className="text-stone-500">{part}</span>
  ));
  return (
    <MetaParts
      parts={[
        ...(online.length > 0 ? online : local),
        plays > 0 ? <span className="text-[color:var(--accent)]/80">played {plays}×</span> : null,
      ]}
    />
  );
}
