import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Trash2, Layers, Play, FolderOutput, Shuffle, FolderOpen, Plus, ListVideo } from "lucide-react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { MediaFile, GalleryEntry, PlaylistCollection } from "../types";
import { getPlaybackThumbnailBar, getWatchProgress, isVideoWatched } from "../playbackStorage";
import { deleteLibraryMedia } from "../deleteLibraryMedia";
import { openInFileManager } from "../openInFileManager";
import { useRuforgeStore } from "../store/ruforgeStore";
import { filterMainLibraryEntries } from "../mainLibraryFilter";
import { galleryScrollChromeAmount } from "../lib/galleryScrollChrome";
import { SaveToPlaylistModal } from "./SaveToPlaylistModal";
import {
  WATCH_LATER_ID,
  isVirtualPlaylistPath,
  parseVirtualPlaylistId,
  virtualPlaylistPath,
} from "../virtualPlaylists";
import { PlaylistEmptyThumb } from "./PlaylistEmptyThumb";
import { GalleryMenuTitle, VideoCard, type ThumbnailBar } from "./library/LibraryVideoCard";
import { FeedVideoCard } from "./library/FeedVideoCard";
import { FeedLoadMore } from "./library/FeedLoadMore";
import { useYoutubeFeed, useYoutubeFeedAvailability } from "./library/useYoutubeFeed";
import { feedWithoutLibrary, interleaveFeed, type MixedGridItem } from "./library/youtubeFeed";
import { composeHomeSections, pickChannelSpotlight } from "./library/homeSections";
import { LibraryHome } from "./library/LibraryHome";
import { useGridColumns } from "./library/useGridColumns";
import { useWatchlistShelf } from "./watchlist/useWatchlistShelf";
import { fileVideoId } from "./music/musicOutsideRecommend";

function isInProgressFile(file: MediaFile): boolean {
  const progress = getWatchProgress(file.path, file.duration);
  return progress > 0 && !isVideoWatched(file.path, file.duration);
}

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
      await deleteLibraryMedia(file);
      setGalleryActiveMenu(null);
    },
    [setGalleryActiveMenu],
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

  const density = gridDensity === "Cozy" || gridDensity === "Compact" ? gridDensity : "Default";
  const { ref: gridMeasureRef, columns } = useGridColumns<HTMLDivElement>(density);
  const gridLayoutClass =
    density === "Cozy" ? "grid gap-x-5 gap-y-12" : density === "Compact" ? "grid gap-x-3 gap-y-8" : "grid gap-x-4 gap-y-10";
  const gridStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }),
    [columns, density],
  );
  const { enabled: feedEnabled } = useYoutubeFeedAvailability();

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

  const homeMode = filter === "all" && !searchQuery.trim();
  const showFeed = feedEnabled && homeMode;
  const feed = useYoutubeFeed(showFeed);

  const libraryVideoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of entries) {
      for (const file of entry.kind === "media" ? [entry] : entry.items) {
        const id = fileVideoId(file);
        if (id) ids.add(id);
      }
    }
    return ids;
  }, [entries]);

  const watchlistShelf = useWatchlistShelf(homeMode, libraryVideoIds, columns);

  const gridItems = useMemo(() => interleaveFeed(mediaOnlyEntries, []), [mediaOnlyEntries]);

  const homePlaylists = useMemo(
    () =>
      libraryEntries
        .filter((e): e is PlaylistCollection => e.kind === "playlist" && e.items.length > 0)
        .slice(0, columns),
    [libraryEntries, columns],
  );

  const homeSections = useMemo(() => {
    if (!homeMode) return [];
    const continueFiles = mediaOnlyEntries.filter(isInProgressFile).slice(0, Math.max(2, columns - 1));
    const shelved = new Set<MediaFile>(continueFiles);
    const spotlight = pickChannelSpotlight(
      mediaOnlyEntries.filter((f) => !shelved.has(f)),
      (f) => f.youtube,
      columns,
    );
    for (const f of spotlight?.files ?? []) shelved.add(f);
    const shelvedIds = new Set(watchlistShelf.map((v) => v.videoId));
    const feedVideos = showFeed
      ? feedWithoutLibrary(feed.items, libraryVideoIds).filter((v) => !shelvedIds.has(v.videoId))
      : [];
    return composeHomeSections<MediaFile>({
      mixed: interleaveFeed(
        mediaOnlyEntries.filter((f) => !shelved.has(f)),
        feedVideos.filter((v) => !v.short),
      ),
      columns,
      continueFiles,
      shorts: feedVideos.filter((v) => v.short),
      watchlist: watchlistShelf,
      hasPlaylists: homePlaylists.length > 0,
      spotlight,
    });
  }, [homeMode, mediaOnlyEntries, columns, showFeed, feed.items, libraryVideoIds, homePlaylists.length, watchlistShelf]);

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
          ? "no playlists yet, create one"
          : searchQuery.trim()
            ? "no matches for that search"
            : "dang.. library's empty";

  const showPlaylistSection = filter === "playlists";
  const showEmptyState =
    filter === "playlists"
      ? playlistStacks.length === 0 && Boolean(searchQuery.trim())
      : homeMode
        ? homeSections.length === 0
        : gridItems.length === 0;
  const renderVideoGrid = (items: MixedGridItem<MediaFile>[], cols = columns) => (
    <div
      className={gridLayoutClass}
      style={cols === columns ? gridStyle : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map((item) =>
        item.kind === "feed" ? (
          <FeedVideoCard key={`feed-${item.video.videoId}`} video={item.video} />
        ) : (
          <VideoCard
            key={item.file.path}
            file={item.file}
            progressBar={progressBarsByPath.get(item.file.path) ?? emptyProgressBar}
            onDelete={handleDelete}
            onExtract={handleExtract}
            onSaveToPlaylist={handleSaveToPlaylist}
            onToggleWatchLater={handleToggleWatchLater}
            inWatchLater={watchLaterPaths.has(item.file.path.replace(/\//g, "\\").toLowerCase())}
          />
        ),
      )}
    </div>
  );

  const renderPlaylistGrid = (playlists: PlaylistCollection[]) => (
    <div className={gridLayoutClass} style={gridStyle}>
      {playlists.map((entry) => (
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
  );

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

        <div ref={gridMeasureRef}>
        {galleryLoading && !galleryDesktopReady ? (
          <div className="flex justify-center py-40">
            <Loader2 className="animate-spin text-[color:var(--accent)] opacity-20" size={60} />
          </div>
        ) : showEmptyState ? (
          <div className="text-center space-y-2 py-36">
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
                  <h2 className="text-2xl font-bold tracking-tight text-stone-50">Playlists</h2>
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
                  renderPlaylistGrid(playlistStacks)
                )}
              </section>
            ) : null}

            {homeMode ? (
              <>
                <LibraryHome
                  sections={homeSections}
                  columns={columns}
                  gridClass={gridLayoutClass}
                  renderGrid={renderVideoGrid}
                  renderPlaylists={() => renderPlaylistGrid(homePlaylists)}
                />
                {showFeed && feed.hasMore ? <FeedLoadMore key={feed.items.length} /> : null}
              </>
            ) : filter !== "playlists" ? (
              renderVideoGrid(gridItems)
            ) : null}
          </div>
        )}
        </div>
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
