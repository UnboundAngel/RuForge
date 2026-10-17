import { useEffect, useLayoutEffect, useRef, useMemo, useCallback, type CSSProperties } from "react";
import { motion } from "motion/react";
import { Loader2, Trash2, Layers, Play, FolderOutput, Shuffle, FolderOpen, Plus } from "lucide-react";
import { MediaFile, GalleryEntry, PlaylistCollection } from "../types";
import { getPlaybackThumbnailBar, getWatchProgress, isVideoWatched } from "../playbackStorage";
import { openInFileManager } from "../openInFileManager";
import { useRuforgeStore } from "../store/ruforgeStore";
import { filterMainLibraryEntries } from "../mainLibraryFilter";
import { galleryScrollChromeAmount } from "../lib/galleryScrollChrome";
import { menuAnchorPoint } from "./music/musicMenuUi";
import { libraryPathKey, useTaggableFiles, useVideoCardActions } from "./library/useVideoCardActions";
import {
  WATCH_LATER_ID,
  isVirtualPlaylistPath,
  parseVirtualPlaylistId,
  virtualPlaylistPath,
} from "../virtualPlaylists";
import { VideoCard, type ThumbnailBar } from "./library/LibraryVideoCard";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
} from "./music/musicMenuUi";
import { FeedVideoCard } from "./library/FeedVideoCard";
import { FeedLoadMore } from "./library/FeedLoadMore";
import { useYoutubeFeed, useYoutubeFeedAvailability } from "./library/useYoutubeFeed";
import { feedWithoutLibrary, interleaveFeed, type MixedGridItem } from "./library/youtubeFeed";
import { composeHomeSections } from "./library/homeSections";
import { useHomeChannelShelves } from "./library/useHomeChannelShelves";
import { CreatorPage } from "./library/CreatorPage";
import { closeLibraryPage, useCreatorPage } from "./library/creatorPageStore";
import { TagPage } from "./library/tags/TagPage";
import { OVERLAY_EASE } from "@/lib/overlayMotion";
import { LibraryHome } from "./library/LibraryHome";
import { GRID_GAP_PX, useGridColumns } from "./library/useGridColumns";
import { useWatchlistShelf } from "./watchlist/useWatchlistShelf";
import { fileVideoId } from "./music/musicOutsideRecommend";
import { RecommendedGamePlaylistsSlot } from "@games";
import { PlaylistStackCard } from "./PlaylistStackCard";

const CREATOR_SLIDE = { duration: 0.24, ease: OVERLAY_EASE };
const CREATOR_FORWARD_IN = { opacity: 0, x: 28 };
const CREATOR_BACK_IN = { opacity: 0, x: -28 };
const CREATOR_SETTLED = { opacity: 1, x: 0 };

function isInProgressFile(file: MediaFile): boolean {
  const progress = getWatchProgress(file.path, file.duration);
  return progress > 0 && !isVideoWatched(file.path, file.duration);
}

export const MediaView = ({
  onPlaylistClick,
}: {
  onPlaylistClick: (playlist: PlaylistCollection) => void;
}) => {
  const libraryScanDirs = useRuforgeStore((s) => s.libraryScanDirs);
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
  const ensureGalleryOnViewMount = useRuforgeStore((s) => s.ensureGalleryOnViewMount);
  const handlePlayPlaylist = useRuforgeStore((s) => s.handlePlayPlaylist);
  const openExportPanel = useRuforgeStore((s) => s.openExportPanel);
  const deleteVirtualPlaylist = useRuforgeStore((s) => s.deleteVirtualPlaylist);
  const libraryScanRevision = useRuforgeStore((s) => s.libraryScanRevision);

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

  const creator = useCreatorPage((s) => s.creator);
  const tagId = useCreatorPage((s) => s.tagId);
  const pageKey = creator ? `creator:${creator.channelId}` : tagId ? `tag:${tagId}` : null;
  const prevPageKeyRef = useRef<string | null>(null);
  const homeScrollTopRef = useRef(0);
  const returningFromCreator = pageKey === null && prevPageKeyRef.current !== null;
  useLayoutEffect(() => {
    const prev = prevPageKeyRef.current;
    prevPageKeyRef.current = pageKey;
    const el = libraryScrollRef.current;
    if (!el || prev === pageKey) return;
    el.scrollTop = pageKey ? 0 : homeScrollTopRef.current;
  }, [pageKey]);

  const prevViewRef = useRef({ filter, searchQuery });
  useEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = { filter, searchQuery };
    if (prev.filter !== filter || prev.searchQuery !== searchQuery) closeLibraryPage();
  }, [filter, searchQuery]);

  const handleLibraryScroll = useCallback(() => {
    const el = libraryScrollRef.current;
    if (!el) return;
    // Read live: the scroll that clamps on entering a creator or tag page must not overwrite the saved spot.
    const page = useCreatorPage.getState();
    if (!page.creator && !page.tagId) homeScrollTopRef.current = el.scrollTop;
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const amount = galleryScrollChromeAmount(el.scrollTop);
      applyLibraryHeaderChrome(amount);
      pushGalleryChrome(amount);
    });
  }, [applyLibraryHeaderChrome, pushGalleryChrome]);

  // Effects re-run when the kept-alive Library shell is shown again; only a real filter change
  // should throw away the scroll position.
  const scrolledFilterRef = useRef(filter);
  useEffect(() => {
    if (scrolledFilterRef.current === filter) return;
    scrolledFilterRef.current = filter;
    pushedChromeRef.current = 0;
    setGalleryScrollChrome(0);
    applyLibraryHeaderChrome(0);
    const el = libraryScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [filter, setGalleryScrollChrome, applyLibraryHeaderChrome]);

  const chromeSyncedRef = useRef(false);
  useLayoutEffect(() => {
    // A fresh scroller sits at 0, and reading scrollTop mid-commit forces layout of the whole
    // Library on every mode switch.
    const scrollTop = chromeSyncedRef.current ? (libraryScrollRef.current?.scrollTop ?? 0) : 0;
    chromeSyncedRef.current = true;
    const amount = galleryScrollChromeAmount(scrollTop);
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
  const allMediaFiles = useMemo(
    () => libraryEntries.filter((e): e is GalleryEntry & { kind: "media" } => e.kind === "media"),
    [libraryEntries],
  );

  const floatingMenu =
    activeMenu?.floating && activeMenu.x != null && activeMenu.y != null
      ? activeMenu
      : null;

  const floatingPlaylist = (() => {
    if (!floatingMenu) return null;
    const entry = libraryEntries.find((e) => e.path === floatingMenu.path);
    return entry?.kind === "playlist" ? entry : null;
  })();

  const cardActions = useVideoCardActions();
  const { openSavePopover } = cardActions;

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

  const { ref: gridMeasureRef, columns } = useGridColumns<HTMLDivElement>();
  const gridLayoutClass = "grid gap-x-4 gap-y-10";
  const gridStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }),
    [columns],
  );
  /** A shelf is the same grid laid out sideways, so its cards match the grid below it. */
  const layoutStyle = (cols: number, shelf?: boolean): CSSProperties =>
    shelf
      ? { gridAutoFlow: "column", gridAutoColumns: `calc((100% - ${(cols - 1) * GRID_GAP_PX}px) / ${cols})` }
      : cols === columns
        ? gridStyle
        : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
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

  const libraryPlaylists = useMemo(
    () => libraryEntries.filter((e): e is PlaylistCollection => e.kind === "playlist" && e.items.length > 0),
    [libraryEntries],
  );
  const taggableFiles = useTaggableFiles();
  const virtualPlaylistRecords = useRuforgeStore((s) => s.virtualPlaylistRecords);
  const createVirtualPlaylist = useRuforgeStore((s) => s.createVirtualPlaylist);
  const addToVirtualPlaylist = useRuforgeStore((s) => s.addToVirtualPlaylist);
  const homePlaylists = useMemo(
    () => libraryPlaylists.slice(0, columns),
    [libraryPlaylists, columns],
  );

  const continueFiles = useMemo(
    () => (homeMode ? mediaOnlyEntries.filter(isInProgressFile).slice(0, Math.max(2, columns - 1)) : []),
    [homeMode, mediaOnlyEntries, columns],
  );
  // The newest row stays put, so a fresh download lands at the top instead of a channel shelf further down.
  const channelShelfFiles = useMemo(() => {
    const onContinue = new Set(continueFiles);
    return mediaOnlyEntries.slice(columns).filter((f) => !onContinue.has(f));
  }, [mediaOnlyEntries, continueFiles, columns]);
  const channelShelfExclude = useMemo(
    () => new Set([...libraryVideoIds, ...watchlistShelf.map((v) => v.videoId)]),
    [libraryVideoIds, watchlistShelf],
  );
  const channelShelves = useHomeChannelShelves({
    active: homeMode,
    files: channelShelfFiles,
    columns,
    exclude: channelShelfExclude,
  });

  const homeSections = useMemo(() => {
    if (!homeMode) return [];
    const shelved = new Set<MediaFile>(continueFiles);
    const shelvedIds = new Set(watchlistShelf.map((v) => v.videoId));
    for (const shelf of channelShelves) {
      for (const item of shelf.items) {
        if (item.kind === "file") shelved.add(item.file);
        else shelvedIds.add(item.video.videoId);
      }
    }
    const feedVideos = showFeed
      ? feedWithoutLibrary(feed.items, libraryVideoIds).filter((v) => !shelvedIds.has(v.videoId))
      : [];
    return composeHomeSections<MediaFile>({
      mixed: interleaveFeed(
        mediaOnlyEntries.filter((f) => !shelved.has(f)),
        feedVideos,
      ),
      columns,
      continueFiles,
      watchlist: watchlistShelf,
      hasPlaylists: homePlaylists.length > 0,
      channels: channelShelves,
    });
  }, [
    homeMode,
    mediaOnlyEntries,
    columns,
    continueFiles,
    channelShelves,
    showFeed,
    feed.items,
    libraryVideoIds,
    homePlaylists.length,
    watchlistShelf,
  ]);

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
  const renderVideoGrid = (
    items: MixedGridItem<MediaFile>[],
    cols = columns,
    opts?: { feedOpensInExplorer?: boolean; shelf?: boolean },
  ) => (
    <div className={gridLayoutClass} style={layoutStyle(cols, opts?.shelf)}>
      {items.map((item) =>
        item.kind === "feed" ? (
          <FeedVideoCard
            key={`feed-${item.video.videoId}`}
            video={item.video}
            opensInExplorer={opts?.feedOpensInExplorer}
          />
        ) : (
          <VideoCard
            key={item.file.path}
            file={item.file}
            progressBar={progressBarsByPath.get(item.file.path) ?? emptyProgressBar}
            onDelete={cardActions.onDelete}
            onExtract={cardActions.onExtract}
            onSaveToPlaylist={cardActions.onSaveToPlaylist}
            onToggleWatchLater={cardActions.onToggleWatchLater}
            inWatchLater={cardActions.watchLaterPaths.has(libraryPathKey(item.file.path))}
          />
        ),
      )}
    </div>
  );

  const renderPlaylistGrid = (playlists: PlaylistCollection[], opts?: { shelf?: boolean }) => (
    <div className={gridLayoutClass} style={layoutStyle(columns, opts?.shelf)}>
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
    <RecommendedGamePlaylistsSlot
      taggableFiles={taggableFiles}
      virtualPlaylistRecords={virtualPlaylistRecords}
      columns={columns}
      gridClassName={gridLayoutClass}
      gridStyle={layoutStyle(columns)}
      onAdd={(rec) => {
        if (rec.playlist) {
          addToVirtualPlaylist(
            rec.playlist.id,
            rec.missing.map((f) => f.path),
          );
        } else {
          createVirtualPlaylist(
            rec.game.name,
            rec.tagged.map((f) => f.path),
            { gameId: rec.game.id },
          );
        }
      }}
    >
    {(recommendedSection) => (
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
        {pageKey ? null : (
          <motion.div key="home-header" initial={returningFromCreator ? CREATOR_BACK_IN : false} animate={CREATOR_SETTLED} transition={CREATOR_SLIDE}>
            <div ref={libraryHeaderRef} className="pt-16 pb-8">
              <h1 className="text-3xl font-black tracking-tight text-stone-50">Video Library</h1>
              <p className="text-stone-400 font-medium text-sm mt-1.5">
                Browse and manage your downloaded videos.
              </p>
            </div>
          </motion.div>
        )}

        <div ref={gridMeasureRef}>
        {creator ? (
          <motion.div key={`creator-${creator.channelId}`} initial={CREATOR_FORWARD_IN} animate={CREATOR_SETTLED} transition={CREATOR_SLIDE}>
            <CreatorPage
              creator={creator}
              files={allMediaFiles}
              playlists={libraryPlaylists}
              libraryIds={libraryVideoIds}
              columns={columns}
              gridClass={gridLayoutClass}
              renderGrid={renderVideoGrid}
              renderPlaylists={renderPlaylistGrid}
            />
          </motion.div>
        ) : tagId ? (
          <motion.div key={`tag-${tagId}`} initial={CREATOR_FORWARD_IN} animate={CREATOR_SETTLED} transition={CREATOR_SLIDE}>
            <TagPage tagId={tagId} files={taggableFiles} columns={columns} renderGrid={renderVideoGrid} />
          </motion.div>
        ) : (
        <motion.div key="home" initial={returningFromCreator ? CREATOR_BACK_IN : false} animate={CREATOR_SETTLED} transition={CREATOR_SLIDE}>
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
              <>
              <section className="space-y-5">
                <div className="flex items-end justify-between gap-4">
                  <h2 className="text-2xl font-bold tracking-tight text-stone-50">Playlists</h2>
                  <button
                    type="button"
                    onClick={(e) => openSavePopover([], { ...menuAnchorPoint(e.currentTarget, "start"), placement: "anchor" })}
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
                      onClick={(e) => openSavePopover([], { ...menuAnchorPoint(e.currentTarget, "start"), placement: "anchor" })}
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
              {recommendedSection}
              </>
            ) : null}

            {homeMode ? (
              <>
                <LibraryHome
                  sections={homeSections}
                  columns={columns}
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
        </motion.div>
        )}
        </div>
      </div>

      {cardActions.saveModal}

      {floatingMenu && floatingPlaylist && (() => {
        const playlist = floatingPlaylist;
        const virtual = isVirtualPlaylistPath(playlist.path);
        const virtualId = parseVirtualPlaylistId(playlist.path);
        const deleteId = virtual && virtualId && virtualId !== WATCH_LATER_ID ? virtualId : null;
        const icon = MUSIC_MENU_ICON_SIZE;
        const act = (fn: () => void) => () => {
          setGalleryActiveMenu(null);
          fn();
        };
        return (
          <MusicFloatingMenu
            open
            x={floatingMenu.x!}
            y={floatingMenu.y!}
            placement="cursor"
            theme="library"
            onClose={() => setGalleryActiveMenu(null)}
            ariaLabel={`Actions for ${playlist.title}`}
            measureKey={playlist.path}
          >
            <MusicMenuSection label="Playback" tone={MUSIC_MENU_TONES.playback}>
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.playback}
                label="Play all"
                icon={<Play size={icon} strokeWidth={2.25} />}
                onClick={act(() => handlePlayPlaylist(playlist.items, false, null))}
              />
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.playback}
                label="Shuffle"
                icon={<Shuffle size={icon} strokeWidth={2.25} />}
                onClick={act(() => handlePlayPlaylist(playlist.items, true, null))}
              />
            </MusicMenuSection>
            <MusicMenuSection label="Go to" tone={MUSIC_MENU_TONES.navigate}>
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.navigate}
                label="Open playlist"
                icon={<Layers size={icon} strokeWidth={2.25} />}
                onClick={act(() => onPlaylistClick(playlist))}
              />
            </MusicMenuSection>
            <MusicMenuSection label="File" tone={MUSIC_MENU_TONES.file}>
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.file}
                label="Export"
                icon={<FolderOutput size={icon} strokeWidth={2.25} />}
                onClick={act(() => openExportPanel({
                  paths: playlist.items.map((i) => i.path),
                  label: playlist.title,
                }))}
              />
              {!virtual && (
                <MusicMenuRow
                  tone={MUSIC_MENU_TONES.file}
                  label="Open folder"
                  icon={<FolderOpen size={icon} strokeWidth={2.25} />}
                  onClick={act(() => void openInFileManager(playlist.path))}
                />
              )}
              {deleteId && (
                <MusicMenuRow
                  tone={MUSIC_MENU_TONES.file}
                  label="Delete playlist"
                  variant="danger"
                  icon={<Trash2 size={icon} strokeWidth={2.25} />}
                  onClick={act(() => {
                    if (deleteVirtualPlaylist(deleteId)) notify("Playlist deleted");
                  })}
                />
              )}
            </MusicMenuSection>
          </MusicFloatingMenu>
        );
      })()}
    </motion.div>
    )}
    </RecommendedGamePlaylistsSlot>
  );
};
