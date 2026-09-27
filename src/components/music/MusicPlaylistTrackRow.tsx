import { memo, useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ChevronDown, ChevronUp, Clock3, MoreHorizontal, Music } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { bestCoverPath } from "@/mediaKind";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import type { MediaFile } from "@/types";
import { cn } from "@/lib/utils";
import { useStuckHeader } from "@/hooks/useStuckHeader";
import { MusicLikeButton } from "./MusicLikeButton";
import { MusicTrackIndexPlay } from "./MusicTrackIndexPlay";
import { primaryArtist } from "./musicArtist";
import { musicTrackIdentityKey } from "./musicShelfDedup";
import { setMusicTrackDragData } from "./musicPlaylists";
import { setMusicTrackDragImage } from "./musicDragImage";
import {
  formatDateAdded,
  trackAlbum,
  trackArtistCredit,
  trackTitle,
  type PlaylistSortKey,
  type PlaylistViewMode,
  type PlaylistViewPrefs,
} from "./musicPlaylistSort";

/**
 * Shared column template for the header and rows. Columns drop out as the pane narrows
 * (container queries), the way Spotify hides Date added and then Album.
 */
const GRID: Record<PlaylistViewMode, string> = {
  list: cn(
    "grid-cols-[16px_minmax(0,4fr)_minmax(120px,1fr)]",
    "@lg:grid-cols-[16px_minmax(0,4fr)_minmax(0,2fr)_minmax(120px,1fr)]",
    "@3xl:grid-cols-[16px_minmax(0,4fr)_minmax(0,2fr)_minmax(0,1.3fr)_minmax(120px,1fr)]",
  ),
  compact: cn(
    "grid-cols-[16px_minmax(0,4fr)_minmax(120px,1fr)]",
    "@lg:grid-cols-[16px_minmax(0,4fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(120px,1fr)]",
    "@3xl:grid-cols-[16px_minmax(0,4fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.3fr)_minmax(120px,1fr)]",
  ),
};

const ROW_BASE = "grid items-center gap-4 px-4";
const MID_COL = "hidden @lg:block";
const DATE_COL = "hidden @3xl:block";

type HeaderProps = {
  prefs: PlaylistViewPrefs;
  onSort: (key: PlaylistSortKey) => void;
};

export function MusicPlaylistColumnHeader({ prefs, onSort }: HeaderProps) {
  const { sentinelRef, stuck } = useStuckHeader();
  const cell = (key: PlaylistSortKey, label: React.ReactNode, className?: string) => {
    const active = prefs.sort === key;
    return (
      <button
        type="button"
        onClick={() => onSort(key)}
        className={cn(
          "flex items-center gap-1 min-w-0 text-left transition-colors hover:text-white",
          active && "text-white",
          className,
        )}
      >
        <span className="truncate">{label}</span>
        {active && (prefs.desc ? <ChevronDown size={14} className="shrink-0" /> : <ChevronUp size={14} className="shrink-0" />)}
      </button>
    );
  };

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px -mb-px" />
      <div
        className={cn(
          "sticky top-0 z-20 px-6 transition-[background-color,box-shadow] duration-200",
          stuck
            ? "bg-[var(--music-surface-raised)] shadow-[0_3px_6px_-4px_rgb(0_0_0_/_0.35)]"
            : "bg-[var(--music-surface)]",
        )}
      >
        <div
          className={cn(
            ROW_BASE,
            GRID[prefs.view],
            "h-9 text-sm text-white/60 border-b transition-colors duration-200",
            stuck ? "border-transparent" : "border-white/10",
          )}
        >
          <span className="text-center">#</span>
          {cell("title", "Title")}
          {prefs.view === "compact" && cell("artist", "Artist", MID_COL)}
          {cell("album", "Album", MID_COL)}
          {cell("added", "Date added", DATE_COL)}
          <div className="flex items-center justify-end pr-8">
            <button
              type="button"
              onClick={() => onSort("duration")}
              className={cn(
                "rf-music-tooltip-anchor flex items-center gap-1 w-12 justify-end transition-colors hover:text-white",
                prefs.sort === "duration" && "text-white",
              )}
              aria-label="Duration"
              data-tooltip="Duration"
            >
              {prefs.sort === "duration" && (prefs.desc ? <ChevronDown size={14} /> : <ChevronUp size={14} />)}
              <Clock3 size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Every prop is a primitive, the (stable) file, or a stable callback that takes the row's
 * file or path, so a row re-renders only when its own state changes. Playback ticks and
 * drag hovers used to re-render the whole list, which made dragging stutter.
 */
type Props = {
  file: MediaFile;
  index: number;
  view: PlaylistViewMode;
  addedAt: number;
  isPlaying: boolean;
  /** Only ever true on the playing row, so pausing re-renders just that one. */
  showPause: boolean;
  selected: boolean;
  menuOpen: boolean;
  reorderable: boolean;
  /** This row is the one being dragged. */
  dragging: boolean;
  dropIndicator: "above" | "below" | null;
  onSelect: (path: string) => void;
  onPlay: (file: MediaFile) => void;
  /** Index button: pauses or resumes the playing row, starts any other. */
  onPlayToggle: (file: MediaFile) => void;
  onContextMenu: (e: React.MouseEvent, file: MediaFile) => void;
  onReorderStart: (path: string) => void;
  onReorderOver: (e: React.DragEvent, path: string) => void;
  onReorderDrop: (path: string) => void;
  onReorderEnd: () => void;
};

export const MusicPlaylistTrackRow = memo(function MusicPlaylistTrackRow({
  file,
  index,
  view,
  addedAt,
  isPlaying,
  showPause,
  selected,
  menuOpen,
  reorderable,
  dragging,
  dropIndicator,
  onSelect,
  onPlay,
  onPlayToggle,
  onContextMenu,
  onReorderStart,
  onReorderOver,
  onReorderDrop,
  onReorderEnd,
}: Props) {
  const cover = bestCoverPath(file);
  const title = trackTitle(file);
  const artist = trackArtistCredit(file);
  const album = trackAlbum(file);
  const identityKey = useMemo(() => musicTrackIdentityKey(file, primaryArtist), [file]);
  const liked = useRuforgeStore((s) => s.musicLikedKeys.includes(identityKey));
  const compact = view === "compact";
  const lit = selected || menuOpen;

  return (
    <div
      draggable
      onDragStart={(e) => {
        setMusicTrackDragData(e, [file.path]);
        setMusicTrackDragImage(e, file);
        if (reorderable) onReorderStart(file.path);
      }}
      onDragOver={(e) => onReorderOver(e, file.path)}
      onDrop={(e) => {
        e.preventDefault();
        onReorderDrop(file.path);
      }}
      onDragEnd={onReorderEnd}
      onClick={() => onSelect(file.path)}
      onDoubleClick={() => onPlay(file)}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect(file.path);
        onContextMenu(e, file);
      }}
      aria-selected={selected}
      className={cn(
        "group/row relative select-none rounded-md cursor-default transition-[background-color,opacity] duration-150",
        ROW_BASE,
        GRID[view],
        compact ? "h-8" : "h-14",
        lit ? "bg-white/[0.14]" : "hover:bg-white/[0.07]",
        dragging && "opacity-40",
      )}
    >
      {dropIndicator && (
        <span
          className={cn(
            "rf-music-drop-line pointer-events-none absolute left-3 right-4 z-10 h-0.5 rounded-full bg-[var(--music-accent)]",
            dropIndicator === "above" ? "-top-px" : "-bottom-px",
          )}
          aria-hidden
        />
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPlayToggle(file);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className="flex justify-center"
        aria-label={showPause ? `Pause ${title}` : `Play ${title}`}
      >
        <MusicTrackIndexPlay
          indexLabel={index + 1}
          isPlaying={isPlaying}
          showPause={showPause}
          className={cn("!w-4", lit && "[&>span:first-child]:opacity-0 [&>span:last-child]:opacity-100")}
          labelClassName="text-base"
        />
      </button>

      <div className="flex items-center gap-3 min-w-0">
        {!compact && (cover ? (
          <img
            src={convertFileSrc(cover)}
            alt=""
            draggable={false}
            className="w-10 h-10 shrink-0 object-cover rounded"
          />
        ) : (
          <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded bg-white/[0.08] text-white/40">
            <Music size={16} />
          </div>
        ))}
        <div className="min-w-0">
          <div
            className={cn(
              "truncate",
              compact ? "text-sm" : "text-base",
              isPlaying ? "text-[color:var(--music-accent)]" : "text-white",
            )}
          >
            {title}
          </div>
          {!compact && artist && (
            <div className="truncate text-sm text-white/60 group-hover/row:text-white/80">
              {artist}
            </div>
          )}
        </div>
      </div>

      {compact && (
        <div className={cn(MID_COL, "truncate text-sm text-white/60 group-hover/row:text-white/80")}>
          {artist}
        </div>
      )}
      <div className={cn(MID_COL, "truncate text-sm text-white/60 group-hover/row:text-white/80")}>
        {album}
      </div>
      <div className={cn(DATE_COL, "truncate text-sm text-white/60")}>{formatDateAdded(addedAt)}</div>

      <div className="flex items-center justify-end">
        <MusicLikeButton
          file={file}
          size={16}
          className={liked || lit ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"}
        />
        <span className="w-12 text-right text-sm tabular-nums text-white/60">{formatDuration(file.duration)}</span>
        <button
          type="button"
          className={cn(
            "rf-music-press w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white",
            menuOpen && "text-[color:var(--music-accent)] hover:text-[color:var(--music-accent)]",
            lit ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
          )}
          // Opening the menu here doesn't select the row, so it stops glowing once the menu closes.
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e, file);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={`More options for ${title}`}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>
  );
});
