import { memo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Eye,
  EyeOff,
  Flag,
  FlagOff,
  GripVertical,
  Image as ImageIcon,
  ListEnd,
  ListStart,
  MoreVertical,
  Play,
  Trash2,
} from "lucide-react";
import { localImageSrc } from "@/lib/localImageSrc";
import { getPlaybackThumbnailBar } from "@/playbackStorage";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
  menuAnchorPoint,
  type MenuAt,
} from "@/components/music/musicMenuUi";
import { OVERLAY_EASE } from "@/lib/overlayMotion";
import { PlaylistRowMeta } from "./PlaylistRowMeta";
import { formatAge, formatViewCount } from "@/components/library/youtubeFeed";
import { COL_ADDED, COL_UPLOADED, COL_VIEWS, PLAYLIST_GRID } from "./playlistGrid";
import { rowTitle, type FileRow } from "./playlistRows";

export type RowHandlers = {
  onPlay: (row: FileRow) => void;
  onPlayNext: (row: FileRow) => void;
  onAddToQueue: (row: FileRow) => void;
  onMoveTop?: (row: FileRow) => void;
  onMoveBottom?: (row: FileRow) => void;
  onSetStart: (row: FileRow | null) => void;
  onSetCover?: (row: FileRow) => void;
  onToggleWatched: (row: FileRow, watched: boolean) => void;
  onRemove: (row: FileRow) => void;
  onGrip: (e: React.PointerEvent, key: string, index: number) => void;
};

type Props = {
  row: FileRow;
  /** Row's place in the shown list, 0-based. */
  index: number;
  watched: boolean;
  isStart: boolean;
  canDrag: boolean;
  /** Pixels this row is pushed out of the way. */
  shift: number;
  dragging: boolean;
  settling: boolean;
  /** Any drag is in progress, so rows slide instead of snapping. */
  dragActive: boolean;
  removeLabel: string;
  handlers: RowHandlers;
  /** The onboarding demo row: no menu, only dragging works. */
  locked?: boolean;
  /** `data-onboarding-target` for the tour's spotlight. */
  target?: string;
  rowRef: (el: HTMLDivElement | null) => void;
};

export const PlaylistVideoRow = memo(function PlaylistVideoRow({
  row,
  index,
  watched,
  isStart,
  canDrag,
  shift,
  dragging,
  settling,
  dragActive,
  removeLabel,
  handlers,
  locked,
  target,
  rowRef,
}: Props) {
  const { file } = row;
  const title = rowTitle(file.name);
  const [menuAt, setMenuAt] = useState<MenuAt | null>(null);
  const menuOpen = menuAt != null;
  const icon = MUSIC_MENU_ICON_SIZE;
  const close = () => setMenuAt(null);
  const act = (fn: () => void) => () => {
    close();
    fn();
  };
  const bar = getPlaybackThumbnailBar(file.path, file.duration);
  const thumb = file.thumbnailPath || file.ruforgePosterPath;
  const slide = dragActive && (!dragging || settling);

  return (
    <div
      ref={rowRef}
      data-playlist-row={row.key}
      data-onboarding-target={target}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!locked) setMenuAt({ x: e.clientX, y: e.clientY, placement: "cursor" });
      }}
      onClick={() => handlers.onPlay(row)}
      style={{
        transform: shift ? `translateY(${shift}px)` : undefined,
        transition: slide ? `transform 180ms cubic-bezier(${OVERLAY_EASE.join(",")})` : "none",
      }}
      className={`group relative cursor-pointer select-none rounded-xl px-2 py-1.5 ${PLAYLIST_GRID} ${
        dragActive ? "pointer-events-none" : ""
      } ${
        dragging ? "opacity-0" : "hover:bg-white/[0.025]"
      }`}
    >
      {/* Number and grip share one slot and crossfade, so hover never shifts the row. */}
      <div
        onPointerDown={canDrag ? (e) => handlers.onGrip(e, row.key, index) : undefined}
        onClick={canDrag ? (e) => e.stopPropagation() : undefined}
        data-tooltip={canDrag ? "Drag to reorder" : undefined}
        style={{ touchAction: canDrag ? "none" : undefined }}
        className={`relative flex h-8 w-10 shrink-0 items-center justify-center ${
          canDrag ? "cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        <span
          className={`font-mono text-[13px] font-semibold tabular-nums text-stone-300 transition-[opacity,transform] duration-200 ease-out ${
            canDrag ? `group-hover:scale-75 group-hover:opacity-0 ${dragging ? "scale-75 opacity-0" : ""}` : ""
          }`}
        >
          {row.position}
        </span>
        {canDrag ? (
          <GripVertical
            size={18}
            className={`absolute text-stone-300 transition-[opacity,transform] duration-200 ease-out group-hover:scale-100 group-hover:opacity-100 ${
              dragging ? "scale-100 opacity-100" : "scale-75 opacity-0"
            }`}
          />
        ) : null}
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <div className="w-28 flex-shrink-0 min-[1400px]:w-32">
          <div className="rf-art-clip relative aspect-video border border-white/5 bg-stone-900">
            {thumb ? (
              <img
                src={localImageSrc(thumb)}
                alt=""
                draggable={false}
                className={`h-full w-full object-cover transition-opacity group-hover:opacity-100 ${
                  watched ? "opacity-50" : "opacity-85"
                }`}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Play size={20} className="text-stone-800" />
              </div>
            )}
            {bar.show ? (
              <div className="absolute bottom-0 left-0 right-0 z-10 h-1 overflow-hidden bg-white/20">
                <div
                  className={`h-full bg-[color:var(--accent)] ${bar.completed ? "opacity-90" : ""}`}
                  style={{ width: `${bar.widthPct}%` }}
                />
              </div>
            ) : null}
          </div>
        </div>
  
        <div className="min-w-0 flex-1">
          <h3
            className={`truncate text-[15px] font-bold transition-colors group-hover:text-[color:var(--accent)] ${
              watched ? "text-stone-400" : "text-stone-100"
            }`}
          >
            {title}
          </h3>
          <PlaylistRowMeta file={file} watched={watched} isStart={isStart} />
        </div>
  
      </div>

      <span className={`${COL_VIEWS} truncate text-sm font-medium text-stone-400`}>
        {formatViewCount(file.youtube?.viewCount ?? null)?.replace(" views", "").replace(" view", "") ?? "-"}
      </span>
      <span className={`${COL_UPLOADED} truncate text-sm font-medium text-stone-400`}>
        {file.youtube?.publishedAt ? formatAge(file.youtube.publishedAt) : "-"}
      </span>
      <span className={`${COL_ADDED} truncate text-sm font-medium text-stone-400`}>{formatAge(file.created)}</span>
      <span className="text-right font-mono text-[13px] tabular-nums text-stone-400">{formatDuration(file.duration)}</span>

      <div className="relative flex justify-end" onClick={(e) => e.stopPropagation()}>
        {locked ? null : <button
          type="button"
          aria-label="Video options"
          data-tooltip="More options"
          onClick={(e) => {
            if (menuOpen) close();
            else setMenuAt({ ...menuAnchorPoint(e.currentTarget), placement: "anchor" });
          }}
          className={`rounded-xl p-2 text-stone-500 transition-all hover:text-white ${
            menuOpen ? "bg-white/5 opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <MoreVertical size={18} />
        </button>}
      </div>

      <MusicFloatingMenu
        open={menuOpen}
        x={menuAt?.x ?? 0}
        y={menuAt?.y ?? 0}
        placement={menuAt?.placement}
        theme="library"
        onClose={close}
        ariaLabel={`Actions for ${title}`}
        measureKey={`${isStart}:${watched}`}
      >
        <MusicMenuSection label="Playback" tone={MUSIC_MENU_TONES.playback}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playback}
            label="Play next"
            icon={<ListStart size={icon} strokeWidth={2.25} />}
            onClick={act(() => handlers.onPlayNext(row))}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playback}
            label="Add to queue"
            icon={<ListEnd size={icon} strokeWidth={2.25} />}
            onClick={act(() => handlers.onAddToQueue(row))}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playback}
            label={watched ? "Mark as unwatched" : "Mark as watched"}
            icon={watched ? <EyeOff size={icon} strokeWidth={2.25} /> : <Eye size={icon} strokeWidth={2.25} />}
            onClick={act(() => handlers.onToggleWatched(row, !watched))}
          />
        </MusicMenuSection>
        <MusicMenuSection label="Order" tone={MUSIC_MENU_TONES.navigate}>
          {handlers.onMoveTop ? (
            <MusicMenuRow
              tone={MUSIC_MENU_TONES.navigate}
              label="Move to top"
              icon={<ArrowUpToLine size={icon} strokeWidth={2.25} />}
              onClick={act(() => handlers.onMoveTop?.(row))}
            />
          ) : null}
          {handlers.onMoveBottom ? (
            <MusicMenuRow
              tone={MUSIC_MENU_TONES.navigate}
              label="Move to bottom"
              icon={<ArrowDownToLine size={icon} strokeWidth={2.25} />}
              onClick={act(() => handlers.onMoveBottom?.(row))}
            />
          ) : null}
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.navigate}
            label={isStart ? "Clear start video" : "Set as start video"}
            icon={isStart ? <FlagOff size={icon} strokeWidth={2.25} /> : <Flag size={icon} strokeWidth={2.25} />}
            onClick={act(() => handlers.onSetStart(isStart ? null : row))}
          />
        </MusicMenuSection>
        <MusicMenuSection label="Playlist" tone={MUSIC_MENU_TONES.playlist}>
          {handlers.onSetCover ? (
            <MusicMenuRow
              tone={MUSIC_MENU_TONES.playlist}
              label="Use as playlist cover"
              icon={<ImageIcon size={icon} strokeWidth={2.25} />}
              onClick={act(() => handlers.onSetCover?.(row))}
            />
          ) : null}
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playlist}
            label={removeLabel}
            variant="danger"
            icon={<Trash2 size={icon} strokeWidth={2.25} />}
            onClick={act(() => handlers.onRemove(row))}
          />
        </MusicMenuSection>
      </MusicFloatingMenu>
    </div>
  );
});
