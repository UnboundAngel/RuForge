import {
  HardDrive,
  Play,
  MoreVertical,
  GripVertical,
  ArrowUpToLine,
  ArrowDownToLine,
  Image as ImageIcon,
  Trash2,
} from "lucide-react";
import type { MediaFile } from "../types";
import { localImageSrc } from "@/lib/localImageSrc";
import { getPlaybackThumbnailBar } from "../playbackStorage";
import { formatDuration } from "./downloader/downloaderFormat";
import { formatStorageSize } from "../formatStorageSize";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
  menuAnchorPoint,
  type MenuAt,
} from "./music/musicMenuUi";

function displayTitle(file: MediaFile): string {
  return file.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "");
}

export function PlaylistRow({
  item,
  index,
  canReorder,
  menuAt,
  dragOver,
  onOpenMenu,
  onCloseMenu,
  onPlay,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRemove,
  removeLabel,
  onMoveTop,
  onMoveBottom,
  onSetThumbnail,
}: {
  item: MediaFile;
  index: number;
  canReorder: boolean;
  menuAt: MenuAt | null;
  dragOver: boolean;
  onOpenMenu: (at: MenuAt) => void;
  onCloseMenu: () => void;
  onPlay: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onRemove?: () => void;
  removeLabel: string;
  onMoveTop?: () => void;
  onMoveBottom?: () => void;
  onSetThumbnail?: () => void;
}) {
  const title = displayTitle(item);
  const menuOpen = menuAt != null;
  const hasMenu = Boolean(onRemove || onMoveTop || onMoveBottom || onSetThumbnail);
  const icon = MUSIC_MENU_ICON_SIZE;

  return (
    <div
      onContextMenu={(e) => {
        if (!hasMenu) return;
        e.preventDefault();
        onOpenMenu({ x: e.clientX, y: e.clientY, placement: "cursor" });
      }}
      draggable={canReorder}
      onDragStart={(e) => {
        if (!canReorder) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => {
        if (!canReorder) return;
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        if (!canReorder) return;
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      onClick={onPlay}
      className={`group relative flex items-center gap-4 py-3 px-2 rounded-2xl cursor-pointer border border-transparent ${
        dragOver ? "border-[color:var(--accent)]/40" : ""
      }`}
    >
      {canReorder ? (
        <div
          className="text-stone-600 group-hover:text-stone-400 cursor-grab active:cursor-grabbing shrink-0"
          onClick={(e) => e.stopPropagation()}
          data-tooltip="Drag to reorder"
        >
          <GripVertical size={16} />
        </div>
      ) : (
        <div className="text-stone-700 font-mono text-[10px] w-6 text-center group-hover:text-[color:var(--accent)] transition-colors">
          {index + 1}
        </div>
      )}

      <div className="w-44 flex-shrink-0 rounded-2xl shadow-lg">
      <div className="rf-art-clip relative aspect-video bg-stone-900 border border-white/5">
        {item.thumbnailPath || item.ruforgePosterPath ? (
          <img
            src={localImageSrc(item.thumbnailPath || item.ruforgePosterPath!)}
            alt=""
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play size={20} className="text-stone-800" />
          </div>
        )}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded-md text-[9px] font-bold text-white tracking-widest">
          {formatDuration(item.duration)}
        </div>
        {(() => {
          const bar = getPlaybackThumbnailBar(item.path, item.duration);
          if (!bar.show) return null;
          return (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-10 overflow-hidden">
              <div
                className={`h-full bg-[color:var(--accent)] ${
                  bar.completed ? "opacity-90" : ""
                }`}
                style={{ width: `${bar.widthPct}%` }}
              />
            </div>
          );
        })()}
      </div>
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-[15px] font-bold text-stone-100 group-hover:text-[color:var(--accent)] transition-colors truncate">
          {title}
        </h3>
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1.5 text-[10px] text-stone-500 font-black uppercase tracking-[0.15em]">
            <HardDrive size={10} className="opacity-40" />
            <span>{formatStorageSize(item.size)}</span>
          </div>
        </div>
      </div>

      {hasMenu && (
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label="Video options"
            data-tooltip="More options"
            onClick={(e) => {
              if (menuOpen) onCloseMenu();
              else onOpenMenu({ ...menuAnchorPoint(e.currentTarget), placement: "anchor" });
            }}
            className={`p-2.5 text-stone-500 hover:text-white transition-all rounded-xl ${
              menuOpen ? "opacity-100 bg-white/5" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <MoreVertical size={18} />
          </button>
        </div>
      )}
      <MusicFloatingMenu
        open={menuOpen}
        x={menuAt?.x ?? 0}
        y={menuAt?.y ?? 0}
        placement={menuAt?.placement}
        theme="library"
        onClose={onCloseMenu}
        ariaLabel={`Actions for ${title}`}
      >
        {onMoveTop || onMoveBottom ? (
          <MusicMenuSection label="Order" tone={MUSIC_MENU_TONES.playback}>
            {onMoveTop ? (
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.playback}
                label="Move to top"
                icon={<ArrowUpToLine size={icon} strokeWidth={2.25} />}
                onClick={onMoveTop}
              />
            ) : null}
            {onMoveBottom ? (
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.playback}
                label="Move to bottom"
                icon={<ArrowDownToLine size={icon} strokeWidth={2.25} />}
                onClick={onMoveBottom}
              />
            ) : null}
          </MusicMenuSection>
        ) : null}
        {onSetThumbnail || onRemove ? (
          <MusicMenuSection label="Playlist" tone={MUSIC_MENU_TONES.playlist}>
            {onSetThumbnail ? (
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.playlist}
                label="Use as playlist cover"
                icon={<ImageIcon size={icon} strokeWidth={2.25} />}
                onClick={onSetThumbnail}
              />
            ) : null}
            {onRemove ? (
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.playlist}
                label={removeLabel}
                variant="danger"
                icon={<Trash2 size={icon} strokeWidth={2.25} />}
                onClick={onRemove}
              />
            ) : null}
          </MusicMenuSection>
        ) : null}
      </MusicFloatingMenu>
    </div>
  );
}
