import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Play,
  Shuffle,
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronDown,
  HardDrive,
  MoreVertical,
  GripVertical,
  ArrowUpToLine,
  ArrowDownToLine,
  Image as ImageIcon,
  Trash2,
} from "lucide-react";
import { PlaylistCollection, MediaFile } from "../types";
import { localImageSrc } from "@/lib/localImageSrc";
import { getPlaybackThumbnailBar } from "../playbackStorage";
import { formatDuration } from "./downloader/downloaderFormat";
import { formatStorageSize } from "../formatStorageSize";
import { useRuforgeStore } from "../store/ruforgeStore";
import { musicQueueSource } from "./music/musicQueueSource";
import {
  getVirtualRecord,
  isVirtualPlaylistPath,
  parseVirtualPlaylistId,
} from "../virtualPlaylists";
import { mediaPathsMatch } from "../lib/mediaPathMatch";
import { PlaylistEmptyThumb } from "./PlaylistEmptyThumb";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
  menuAnchorPoint,
  type MenuAt,
} from "./music/musicMenuUi";

type SortMode = "manual" | "added-newest" | "added-oldest";

const SORT_OPTIONS: ReadonlyArray<readonly [SortMode, string]> = [
  ["manual", "Manual"],
  ["added-newest", "Date added (newest)"],
  ["added-oldest", "Date added (oldest)"],
];

function displayTitle(file: MediaFile): string {
  return file.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "");
}

function addedAtForPath(playlistId: string, path: string): number {
  const record = getVirtualRecord(playlistId);
  const hit = record?.items.find((i) => mediaPathsMatch(i.path, path));
  return hit?.addedAt ?? 0;
}

export const PlaylistDetailView = ({
  playlist,
  onBack,
}: {
  playlist: PlaylistCollection;
  onBack: () => void;
}) => {
  const handlePlayFile = useRuforgeStore((s) => s.handlePlayFile);
  const handlePlayPlaylist = useRuforgeStore((s) => s.handlePlayPlaylist);
  const removeFromVirtualPlaylist = useRuforgeStore((s) => s.removeFromVirtualPlaylist);
  const reorderVirtualPlaylist = useRuforgeStore((s) => s.reorderVirtualPlaylist);
  const moveVirtualPlaylistItem = useRuforgeStore((s) => s.moveVirtualPlaylistItem);
  const setVirtualPlaylistThumbnail = useRuforgeStore((s) => s.setVirtualPlaylistThumbnail);
  const notify = useRuforgeStore((s) => s.notify);

  const playlistId = parseVirtualPlaylistId(playlist.path);
  const isVirtual = isVirtualPlaylistPath(playlist.path);
  const playlistSource = musicQueueSource("playlist", playlist.title);
  const mainThumbnail =
    playlist.stackThumbnailPath ||
    playlist.items[0]?.thumbnailPath ||
    playlist.items[0]?.ruforgePosterPath;

  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [sortAt, setSortAt] = useState<MenuAt | null>(null);
  const [rowMenu, setRowMenu] = useState<{ path: string; at: MenuAt } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  useEffect(() => {
    setSortMode("manual");
    setRowMenu(null);
    setSortAt(null);
  }, [playlist.path]);

  const displayItems = useMemo(() => {
    if (!isVirtual || !playlistId || sortMode === "manual") {
      return playlist.items;
    }
    const items = [...playlist.items];
    items.sort((a, b) => {
      const da = addedAtForPath(playlistId, a.path);
      const db = addedAtForPath(playlistId, b.path);
      return sortMode === "added-newest" ? db - da : da - db;
    });
    return items;
  }, [isVirtual, playlistId, playlist.items, sortMode]);

  const sortLabel = SORT_OPTIONS.find(([mode]) => mode === sortMode)?.[1] ?? "Manual";

  const playOrdered = (shuffle: boolean) => {
    void handlePlayPlaylist(displayItems, shuffle, playlistSource);
  };

  const onDropReorder = (toIndex: number) => {
    if (!playlistId || sortMode !== "manual" || dragFrom == null) return;
    if (dragFrom === toIndex) {
      setDragFrom(null);
      setDragOver(null);
      return;
    }
    reorderVirtualPlaylist(playlistId, dragFrom, toIndex);
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col md:flex-row overflow-hidden relative"
    >
      <div className="relative w-full md:w-[420px] lg:w-[460px] flex flex-col flex-shrink-0 px-6 pt-6 z-10 bg-[color:var(--rf-well)]">
        <div className="relative flex-1 w-full rounded-t-[28px] flex flex-col bg-[color:var(--rf-surface)]">
          <div className="relative h-full px-7 pt-7 pb-28 flex flex-col overflow-y-auto z-10 rf-scrollbar">
            <button
              onClick={onBack}
              className="flex items-center gap-2.5 text-stone-500 hover:text-[color:var(--accent)] transition-colors group self-start"
            >
              <ArrowLeft size={15} className="group-hover:-translate-x-1 transition-transform" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                Back to Library
              </span>
            </button>

            <div className="mt-8 flex flex-col">
              <div
                className="rf-art-clip relative aspect-video bg-[color:var(--rf-surface-deep)] group cursor-pointer"
                onClick={() => playOrdered(false)}
              >
                {mainThumbnail ? (
                  <img
                    src={localImageSrc(mainThumbnail)}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <PlaylistEmptyThumb />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
                {playlist.items.length > 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-2.5 px-5 py-2">
                      <Play size={14} fill="white" className="text-white" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-white">
                        Play All
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <h1 className="mt-7 text-[1.75rem] lg:text-[2rem] font-bold text-white leading-snug tracking-[-0.02em]">
                {playlist.title}
              </h1>

              <p className="mt-2 text-[13px] font-medium text-stone-500">
                {playlist.itemCount} {playlist.itemCount === 1 ? "video" : "videos"}
                <span className="mx-1.5 text-stone-600">·</span>
                {formatDuration(playlist.combinedDuration)}
              </p>

              <div className="mt-8 flex flex-wrap gap-2.5">
                <button
                  onClick={() => playOrdered(false)}
                  disabled={playlist.items.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[color:var(--accent)] text-stone-950 hover:brightness-110 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Play size={13} fill="currentColor" />
                  <span className="text-[11px] font-semibold tracking-wide">
                    Play all
                  </span>
                </button>
                <button
                  onClick={() => playOrdered(true)}
                  disabled={playlist.items.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] text-stone-200 hover:bg-white/[0.1] transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Shuffle size={13} />
                  <span className="text-[11px] font-semibold tracking-wide">
                    Shuffle
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <motion.div className="flex-1 overflow-y-auto pl-4 pr-8 py-10 bg-[color:var(--rf-well)] rf-scrollbar">
        <div className="space-y-3 relative z-10 max-w-3xl">
          {isVirtual ? (
            <>
              <button
                type="button"
                aria-label="Sort playlist"
                aria-haspopup="menu"
                aria-expanded={sortAt != null}
                className={`inline-flex h-[30px] items-center gap-2 rounded-[10px] px-2.5 text-[10px] font-black uppercase tracking-[0.16em] transition-colors ${
                  sortAt ? "bg-white/[0.06] text-stone-200" : "text-stone-400 hover:text-stone-200"
                }`}
                onClick={(e) =>
                  setSortAt(sortAt ? null : { ...menuAnchorPoint(e.currentTarget, "start"), placement: "anchor" })
                }
              >
                <span>Sort: {sortLabel}</span>
                <ChevronDown size={12} className="shrink-0" />
              </button>
              <MusicFloatingMenu
                open={sortAt != null}
                x={sortAt?.x ?? 0}
                y={sortAt?.y ?? 0}
                placement="anchor"
                theme="library"
                onClose={() => setSortAt(null)}
                ariaLabel="Sort playlist"
              >
                <MusicMenuSection label="Sort by" tone={MUSIC_MENU_TONES.navigate}>
                  {SORT_OPTIONS.map(([mode, label]) => (
                    <MusicMenuRow
                      key={mode}
                      tone={MUSIC_MENU_TONES.navigate}
                      label={label}
                      active={sortMode === mode}
                      icon={<ArrowUpDown size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
                      trailing={sortMode === mode
                        ? <Check size={12} strokeWidth={2.5} className="shrink-0 text-[color:var(--accent)]" aria-hidden />
                        : null}
                      onClick={() => {
                        setSortMode(mode);
                        setSortAt(null);
                      }}
                    />
                  ))}
                </MusicMenuSection>
              </MusicFloatingMenu>
            </>
          ) : null}

          {displayItems.length === 0 ? (
            <div className="py-24 text-left space-y-2">
              <p className="text-stone-400 font-medium text-sm">No videos in this playlist</p>
              <p className="text-stone-600 text-xs font-medium">
                Add videos from the library card menu
              </p>
            </div>
          ) : (
            displayItems.map((item, index) => (
              <PlaylistRow
                key={item.path}
                item={item}
                index={index}
                canReorder={Boolean(isVirtual && playlistId && sortMode === "manual")}
                menuAt={rowMenu?.path === item.path ? rowMenu.at : null}
                dragOver={dragOver === index}
                onOpenMenu={(at) => setRowMenu({ path: item.path, at })}
                onCloseMenu={() => setRowMenu(null)}
                onPlay={() => void handlePlayFile(item, displayItems, playlistSource)}
                onDragStart={() => setDragFrom(index)}
                onDragOver={() => setDragOver(index)}
                onDrop={() => onDropReorder(index)}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
                onRemove={
                  playlistId
                    ? () => {
                        removeFromVirtualPlaylist(playlistId, item.path);
                        notify("Removed from playlist");
                        setRowMenu(null);
                      }
                    : undefined
                }
                onMoveTop={
                  playlistId && sortMode === "manual"
                    ? () => {
                        moveVirtualPlaylistItem(playlistId, item.path, "top");
                        setRowMenu(null);
                      }
                    : undefined
                }
                onMoveBottom={
                  playlistId && sortMode === "manual"
                    ? () => {
                        moveVirtualPlaylistItem(playlistId, item.path, "bottom");
                        setRowMenu(null);
                      }
                    : undefined
                }
                onSetThumbnail={
                  playlistId
                    ? () => {
                        setVirtualPlaylistThumbnail(playlistId, item.path);
                        notify("Playlist thumbnail updated");
                        setRowMenu(null);
                      }
                    : undefined
                }
              />
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

function PlaylistRow({
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
                label="Remove from playlist"
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
