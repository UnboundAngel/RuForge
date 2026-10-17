import { useState, useEffect, useRef, memo } from "react";
import { motion } from "motion/react";
import { MoreVertical, Loader2, Trash2, Image as ImageIcon, Video, Volume2, VolumeX, Play, Music, FileText, FolderOutput, FolderOpen, Clock, ListPlus, UserCheck, UserPlus, CircleUserRound, Tag } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { localImageSrc } from "@/lib/localImageSrc";
import { copyTranscriptForFile, type TranscriptVariant } from "@/copyTranscript";
import { isAudioOnlyPath } from "@/mediaKind";
import type { MediaFile } from "@/types";
import { formatStorageSize } from "@/formatStorageSize";
import { openInFileManager } from "@/openInFileManager";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import { useGalleryScrubExtracting } from "@/scrubSpriteGallerySync";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuFlyoutRow,
  MusicMenuRow,
  MusicMenuSection,
  menuAnchorPoint,
  type MenuAt,
} from "@/components/music/musicMenuUi";
import { useChannelFollow } from "@/components/watchlist/useChannelFollow";
import { cn } from "@/lib/utils";
import { formatAge, formatViewCount } from "./youtubeFeed";
import { MetaParts, VideoByline } from "./VideoByline";
import { openCreatorPage } from "./creatorPageStore";
import { useLibraryArrivalFlight } from "./useLibraryArrivalFlight";
import { TagBadge } from "./tags/TagChips";
import { VideoTagsMenu } from "./tags/VideoTagsMenu";
import { useVideoTags } from "./tags/useVideoTags";

export type ThumbnailBar = { show: boolean; widthPct: number; completed: boolean };

function mediaDisplayTitle(file: MediaFile): string {
  return file.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "");
}

const PREVIEW_HOVER_DELAY_MS = 420;

const TRANSCRIPT_FORMATS: ReadonlyArray<readonly [TranscriptVariant, string]> = [
  ["plain", "Plain text"],
  ["timestamped", "With timestamps"],
  ["markdown", "Markdown"],
];

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
  const channelFollow = useChannelFollow(file.youtube?.channelId, file.youtube?.channel);
  const [isHovered, setIsHovered] = useState(false);
  const [menuAt, setMenuAt] = useState<MenuAt>({ x: 0, y: 0, placement: "anchor" });
  const [tagsAt, setTagsAt] = useState<MenuAt | null>(null);
  const tags = useVideoTags(file);
  const [previewActive, setPreviewActive] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [views, setViews] = useState(() => {
    const saved = localStorage.getItem(`views-${file.path}`);
    return saved ? parseInt(saved) : 0;
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const arriving = useLibraryArrivalFlight(file.path, coverRef);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stillPoster = file.thumbnailPath ?? file.ruforgePosterPath;
  const isAudioItem = isAudioOnlyPath(file.path);
  const title = mediaDisplayTitle(file);
  const youtube = file.youtube;
  const shellOpen = isHovered || menuOpen;
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

  const setMenuOpen = (next: boolean, at?: MenuAt) => {
    if (next) {
      stopPreview();
      if (at) setMenuAt(at);
      setGalleryActiveMenu({ path: file.path });
    } else {
      const active = useRuforgeStore.getState().activeMenu;
      if (active?.path === file.path && !active.floating) {
        setGalleryActiveMenu(null);
      }
    }
  };

  const act = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };
  const channelId = youtube?.channelId;
  const channelName = youtube?.channel?.trim();
  const icon = MUSIC_MENU_ICON_SIZE;

  return (
    <div
      className={`group relative z-0 cursor-pointer ${menuOpen ? "z-30" : "hover:z-20"}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handlePlayAction}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(true, { x: e.clientX, y: e.clientY, placement: "cursor" });
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
        <div
          ref={coverRef}
          data-squish-cover
          className={cn(
            "rf-art-clip relative aspect-video bg-[color:var(--rf-well-raised)] transition-transform duration-150 ease-out",
            arriving && "invisible",
          )}
        >
          {stillPoster ? (
            <img
              src={localImageSrc(stillPoster)}
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

          {!menuOpen && !extracting ? <TagBadge tags={tags} expanded={isHovered} /> : null}

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

        <div className={cn("transition-opacity duration-300 ease-out", arriving ? "opacity-0" : "opacity-100")}>
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
          active={isHovered}
          action={
            <div
              className={`relative self-start mt-0.5 transition-opacity duration-150 ${
                optionsVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              <button
                type="button"
                aria-label="Video options"
                data-tooltip="More options"
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                  menuOpen ? "text-stone-100 bg-white/[0.08]" : "text-stone-500 hover:text-stone-200",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (menuOpen) {
                    setMenuOpen(false);
                    return;
                  }
                  setIsHovered(true);
                  setMenuOpen(true, { ...menuAnchorPoint(e.currentTarget), placement: "anchor" });
                }}
              >
                <MoreVertical size={16} strokeWidth={2.25} />
              </button>
            </div>
          }
        />
        </div>
      </div>

      <MusicFloatingMenu
        open={menuOpen}
        x={menuAt.x}
        y={menuAt.y}
        placement={menuAt.placement}
        theme="library"
        onClose={() => setMenuOpen(false)}
        ariaLabel={`Actions for ${title}`}
        measureKey={`${inWatchLater}:${channelFollow.following}:${channelFollow.available}`}
      >
        <MusicMenuSection label="Playback" tone={MUSIC_MENU_TONES.playback}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playback}
            label="Play"
            icon={<Play size={icon} strokeWidth={2.25} />}
            onClick={act(() => void handlePlayFile(file, undefined, null))}
          />
        </MusicMenuSection>
        <MusicMenuSection label="Save" tone={MUSIC_MENU_TONES.playlist}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playlist}
            label={inWatchLater ? "Remove from Watch later" : "Save to Watch later"}
            active={inWatchLater}
            icon={<Clock size={icon} strokeWidth={2.25} />}
            onClick={act(() => onToggleWatchLater(file))}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playlist}
            label="Save to playlist"
            icon={<ListPlus size={icon} strokeWidth={2.25} />}
            onClick={act(() => onSaveToPlaylist(file))}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playlist}
            label="Tags…"
            icon={<Tag size={icon} strokeWidth={2.25} />}
            onClick={act(() => setTagsAt(menuAt))}
          />
        </MusicMenuSection>
        {(channelFollow.available || (channelId && channelName)) && (
          <MusicMenuSection label="Channel" tone={MUSIC_MENU_TONES.navigate}>
            {channelFollow.available && (
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.navigate}
                label={channelFollow.following ? "Unfollow channel" : "Follow channel"}
                active={channelFollow.following}
                icon={channelFollow.following
                  ? <UserCheck size={icon} strokeWidth={2.25} />
                  : <UserPlus size={icon} strokeWidth={2.25} />}
                onClick={act(() => void channelFollow.toggle())}
              />
            )}
            {channelId && channelName && (
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.navigate}
                label="Go to channel"
                icon={<CircleUserRound size={icon} strokeWidth={2.25} />}
                onClick={act(() => openCreatorPage(channelId, channelName))}
              />
            )}
          </MusicMenuSection>
        )}
        <MusicMenuSection label="File" tone={MUSIC_MENU_TONES.file}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.file}
            label="Previews"
            icon={<ImageIcon size={icon} strokeWidth={2.25} />}
            onClick={act(() => onExtract(file))}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.file}
            label="Export"
            icon={<FolderOutput size={icon} strokeWidth={2.25} />}
            onClick={act(() => openExportPanel({ paths: [file.path], label: file.name }))}
          />
          {file.subtitlePath && (
            <MusicMenuFlyoutRow
              tone={MUSIC_MENU_TONES.file}
              label="Copy transcript"
              ariaLabel="Copy transcript"
              icon={<FileText size={icon} strokeWidth={2.25} />}
              renderFlyout={() => (
                <MusicMenuSection label="Format" tone={MUSIC_MENU_TONES.file}>
                  {TRANSCRIPT_FORMATS.map(([variant, label]) => (
                    <MusicMenuRow
                      key={variant}
                      tone={MUSIC_MENU_TONES.file}
                      label={label}
                      icon={<FileText size={icon} strokeWidth={2.25} />}
                      onClick={act(() => void copyTranscriptForFile(file, variant))}
                    />
                  ))}
                </MusicMenuSection>
              )}
            />
          )}
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.file}
            label="Open folder"
            icon={<FolderOpen size={icon} strokeWidth={2.25} />}
            onClick={act(() => void openInFileManager(file.path))}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.file}
            label="Delete"
            variant="danger"
            icon={<Trash2 size={icon} strokeWidth={2.25} />}
            onClick={act(() => onDelete(file))}
          />
        </MusicMenuSection>
      </MusicFloatingMenu>
      <VideoTagsMenu file={file} title={title} at={tagsAt} onClose={() => setTagsAt(null)} />
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
