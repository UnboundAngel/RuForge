import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Play,
  Shuffle,
  ArrowLeft,
  HardDrive,
  MoreVertical,
  GripVertical,
  ArrowUpToLine,
  ArrowDownToLine,
  Image as ImageIcon,
  Trash2,
} from "lucide-react";
import { PlaylistCollection, MediaFile } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";
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
import { MorphLabelMenu, usePlaylistSortItems } from "./MorphLabelMenu";
import { MORPH_MENU_SHELL } from "./ui/Morph";

type SortMode = "manual" | "added-newest" | "added-oldest";

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
  const [sortOpen, setSortOpen] = useState(false);
  const [rowMenuPath, setRowMenuPath] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const sortItems = usePlaylistSortItems(sortMode, setSortMode);

  useEffect(() => {
    setSortMode("manual");
    setRowMenuPath(null);
    setSortOpen(false);
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

  const sortLabel =
    sortMode === "manual"
      ? "Manual"
      : sortMode === "added-newest"
        ? "Date added (newest)"
        : "Date added (oldest)";

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
      onClick={() => setRowMenuPath(null)}
    >
      <div className="absolute inset-0 pointer-events-none shadow-[inset_4px_4px_18px_rgba(0,0,0,0.32)] z-20 rounded-tl-[32px]" />

      <div className="relative w-full md:w-[420px] lg:w-[460px] flex flex-col flex-shrink-0 px-6 pt-6 z-10 bg-[#1D1613]">
        <div className="relative flex-1 w-full rounded-t-[28px] flex flex-col bg-[#271C18]">
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
                className="relative aspect-video rounded-2xl overflow-hidden bg-[#1a1411] group cursor-pointer"
                onClick={() => playOrdered(false)}
              >
                {mainThumbnail ? (
                  <img
                    src={convertFileSrc(mainThumbnail)}
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

      <motion.div className="flex-1 overflow-y-auto pl-4 pr-8 py-10 bg-[#1D1613] rf-scrollbar">
        <div className="space-y-3 relative z-10 max-w-3xl">
          {isVirtual ? (
            <MorphLabelMenu
              label={sortLabel}
              items={sortItems}
              open={sortOpen}
              onOpenChange={setSortOpen}
              ariaLabel="Sort playlist"
            />
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
                menuOpen={rowMenuPath === item.path}
                dragOver={dragOver === index}
                onOpenMenu={() =>
                  setRowMenuPath((p) => (p === item.path ? null : item.path))
                }
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
                        setRowMenuPath(null);
                      }
                    : undefined
                }
                onMoveTop={
                  playlistId && sortMode === "manual"
                    ? () => {
                        moveVirtualPlaylistItem(playlistId, item.path, "top");
                        setRowMenuPath(null);
                      }
                    : undefined
                }
                onMoveBottom={
                  playlistId && sortMode === "manual"
                    ? () => {
                        moveVirtualPlaylistItem(playlistId, item.path, "bottom");
                        setRowMenuPath(null);
                      }
                    : undefined
                }
                onSetThumbnail={
                  playlistId
                    ? () => {
                        setVirtualPlaylistThumbnail(playlistId, item.path);
                        notify("Playlist thumbnail updated");
                        setRowMenuPath(null);
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
  menuOpen,
  dragOver,
  onOpenMenu,
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
  menuOpen: boolean;
  dragOver: boolean;
  onOpenMenu: () => void;
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

  return (
    <div
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
          title="Drag to reorder"
        >
          <GripVertical size={16} />
        </div>
      ) : (
        <div className="text-stone-700 font-mono text-[10px] w-6 text-center group-hover:text-[color:var(--accent)] transition-colors">
          {index + 1}
        </div>
      )}

      <div className="relative w-44 aspect-video rounded-2xl overflow-hidden bg-stone-900 flex-shrink-0 shadow-lg border border-white/5">
        {item.thumbnailPath || item.ruforgePosterPath ? (
          <img
            src={convertFileSrc(item.thumbnailPath || item.ruforgePosterPath!)}
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

      {(onRemove || onMoveTop || onMoveBottom || onSetThumbnail) && (
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onOpenMenu}
            className={`p-2.5 text-stone-500 hover:text-white transition-all rounded-xl ${
              menuOpen ? "opacity-100 bg-white/5" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <MoreVertical size={18} />
          </button>
          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                className={`absolute right-0 top-full mt-1 z-40 w-max rounded-2xl p-1 ${MORPH_MENU_SHELL}`}
              >
                {onRemove ? (
                  <button
                    type="button"
                    onClick={onRemove}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[11px] font-bold text-stone-300 hover:bg-white/5 hover:text-white text-left"
                  >
                    <Trash2 size={13} />
                    Remove from playlist
                  </button>
                ) : null}
                {onMoveTop ? (
                  <button
                    type="button"
                    onClick={onMoveTop}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[11px] font-bold text-stone-300 hover:bg-white/5 hover:text-white text-left"
                  >
                    <ArrowUpToLine size={13} />
                    Move to top
                  </button>
                ) : null}
                {onMoveBottom ? (
                  <button
                    type="button"
                    onClick={onMoveBottom}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[11px] font-bold text-stone-300 hover:bg-white/5 hover:text-white text-left"
                  >
                    <ArrowDownToLine size={13} />
                    Move to bottom
                  </button>
                ) : null}
                {onSetThumbnail ? (
                  <button
                    type="button"
                    onClick={onSetThumbnail}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[11px] font-bold text-stone-300 hover:bg-white/5 hover:text-white text-left"
                  >
                    <ImageIcon size={13} />
                    Set as playlist thumbnail
                  </button>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
