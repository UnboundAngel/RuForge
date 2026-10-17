import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Play,
  Shuffle,
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronDown,
} from "lucide-react";
import { PlaylistCollection } from "../types";
import { localImageSrc } from "@/lib/localImageSrc";
import { formatDuration } from "./downloader/downloaderFormat";
import { useRuforgeStore } from "../store/ruforgeStore";
import { musicQueueSource } from "./music/musicQueueSource";
import {
  getVirtualRecord,
  isVirtualPlaylistPath,
  parseVirtualPlaylistId,
} from "../virtualPlaylists";
import { mediaPathsMatch } from "../lib/mediaPathMatch";
import { deleteLibraryMedia } from "../deleteLibraryMedia";
import { PlaylistEmptyThumb } from "./PlaylistEmptyThumb";
import { PlaylistRow } from "./PlaylistRow";
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
                    : () => {
                        // A pasted playlist is a folder on disk, so removing a video means trashing its file.
                        setRowMenu(null);
                        void deleteLibraryMedia(item);
                      }
                }
                removeLabel={playlistId ? "Remove from playlist" : "Delete video"}
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
