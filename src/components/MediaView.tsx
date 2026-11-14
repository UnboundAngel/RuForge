import { useEffect, useLayoutEffect, useRef, useMemo, useCallback, type CSSProperties } from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { MediaFile, GalleryEntry, PlaylistCollection } from "../types";
import { getPlaybackThumbnailBar, getWatchProgress, isVideoWatched } from "../playbackStorage";
import { useRuforgeStore } from "../store/ruforgeStore";
import { flattenToMediaEntries } from "./library/flattenPlaylistFiles";
import { filterMainLibraryEntries } from "../mainLibraryFilter";
import { galleryScrollChromeAmount } from "../lib/galleryScrollChrome";
import { libraryPathKey, useTaggableFiles, useVideoCardActions } from "./library/useVideoCardActions";
import {
  WATCH_LATER_ID,
  isVirtualPlaylistPath,
  virtualPlaylistPath,
} from "../virtualPlaylists";
import { VideoCard, type ThumbnailBar } from "./library/LibraryVideoCard";
import { PlaylistCardMenu } from "./library/PlaylistCardMenu";
import { PlaylistsSection } from "./library/PlaylistsSection";
import { useLibraryPlaylistSync } from "./library/useLibraryPlaylistSync";
import { FeedVideoCard } from "./library/FeedVideoCard";
import { FeedLoadMore } from "./library/FeedLoadMore";
import { useYoutubeFeed, useYoutubeFeedAvailability } from "./library/useYoutubeFeed";
import { feedWithoutLibrary, interleaveFeed, type MixedGridItem } from "./library/youtubeFeed";
import { composeHomeSections } from "./library/homeSections";
import { useHomeChannelShelves } from "./library/useHomeChannelShelves";
import { CreatorPage } from "./library/CreatorPage";
import { closeLibraryPage, useCreatorPage } from "./library/creatorPageStore";
import { TagPage } from "./library/tags/TagPage";
import { motionDuration, pageTransition } from "@/lib/overlayMotion";
import { useLibraryPageMotion } from "./library/useLibraryPageMotion";
import { FadePresence, PageSwap } from "./motion/PageSwap";
import { LibraryHome } from "./library/LibraryHome";
import { GRID_GAP_PX, useGridColumns } from "./library/useGridColumns";
import { useWatchlistShelf } from "./watchlist/useWatchlistShelf";
import { fileVideoId } from "./music/musicOutsideRecommend";
import { RecommendedGamePlaylistsSlot } from "@games";
import { PlaylistStackCard } from "./PlaylistStackCard";
import { useDemoPlaylistStacks } from "../lib/useOnboardingMockPlaylists";


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
  const entries = useRuforgeStore((s) => s.entries);
  const hideAudioFromMainLibrary = useRuforgeStore(
    (s) => s.settings.hideAudioFromMainLibrary !== false,
  );
  const galleryLoading = useRuforgeStore((s) => s.galleryLoading);
  const galleryDesktopReady = useRuforgeStore((s) => s.galleryDesktopReady);
  const activeMenu = useRuforgeStore((s) => s.activeMenu);
  const setGalleryActiveMenu = useRuforgeStore((s) => s.setGalleryActiveMenu);
  const ensureGalleryOnViewMount = useRuforgeStore((s) => s.ensureGalleryOnViewMount);
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
  const homeScrollTopRef = useRef(0);
  const resetChrome = useCallback(() => {
    pushedChromeRef.current = 0;
    setGalleryScrollChrome(0);
    applyLibraryHeaderChrome(0);
  }, [setGalleryScrollChrome, applyLibraryHeaderChrome]);
  const motionPlan = useLibraryPageMotion({
    filter,
    pageKey,
    scrollRef: libraryScrollRef,
    homeScrollTopRef,
    resetChrome,
  });

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
    const progressView = filter === "in-progress" || filter === "watched";
    const source: GalleryEntry[] = progressView ? flattenToMediaEntries(libraryEntries) : libraryEntries;
    const matched = source.filter((entry) => {
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

  const playlistStacks = useDemoPlaylistStacks(filteredEntries, entries, filter === "playlists" && !searchQuery.trim());

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
  useLibraryPlaylistSync(libraryPlaylists);
  const taggableFiles = useTaggableFiles();
  const virtualPlaylistRecords = useRuforgeStore((s) => s.virtualPlaylistRecords);
  const createVirtualPlaylist = useRuforgeStore((s) => s.createVirtualPlaylist);
  const addToVirtualPlaylist = useRuforgeStore((s) => s.addToVirtualPlaylist);
  const homePlaylists = useMemo(
    () => libraryPlaylists.slice(0, columns),
    [libraryPlaylists, columns],
  );

  const continueFiles = useMemo(
    () =>
      homeMode
        ? flattenToMediaEntries(libraryEntries).filter(isInProgressFile).slice(0, Math.max(2, columns - 1))
        : [],
    [homeMode, libraryEntries, columns],
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
            onToggleWatchLater={cardActions.onToggleWatchLater}
            inWatchLater={cardActions.watchLaterPaths.has(libraryPathKey(item.file.path))}
          />
        ),
      )}
    </div>
  );

  const openPlaylistMenu = (e: React.MouseEvent, entry: PlaylistCollection) => {
    e.preventDefault();
    e.stopPropagation();
    setGalleryActiveMenu({ path: entry.path, x: e.clientX, y: e.clientY, floating: true });
  };

  const renderPlaylistGrid =(playlists: PlaylistCollection[], opts?: { shelf?: boolean }) => (
    <div className={gridLayoutClass} style={layoutStyle(columns, opts?.shelf)}>
      {playlists.map((entry) => (
        <PlaylistStackCard
          key={entry.path}
          playlist={entry}
          onClick={() => onPlaylistClick(entry)}
          onContextMenu={(e) => openPlaylistMenu(e, entry)}
        />
      ))}
    </div>
  );

  return (
    <RecommendedGamePlaylistsSlot
      taggableFiles={taggableFiles}
      virtualPlaylistRecords={virtualPlaylistRecords}
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
    {(recommendedCards) => (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={motionDuration(motionPlan.reduce, pageTransition)}
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
        <FadePresence show={!pageKey && filter !== "playlists"}>
          <div ref={libraryHeaderRef} className="pt-16 pb-8">
            <h1 className="text-3xl font-black tracking-tight text-stone-50">Video Library</h1>
            <p className="text-stone-400 font-medium text-sm mt-1.5">Browse and manage your downloaded videos.</p>
          </div>
        </FadePresence>

        <div ref={gridMeasureRef}>
        <PageSwap
          swapKey={motionPlan.bodyKey}
          direction={motionPlan.direction}
          onEnter={motionPlan.onEnter}
        >
        {creator ? (
          <>
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
          </>
        ) : tagId ? (
          <TagPage tagId={tagId} files={taggableFiles} columns={columns} renderGrid={renderVideoGrid} />
        ) : (
        <>
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
              <PlaylistsSection
                headerRef={libraryHeaderRef}
                playlists={playlistStacks}
                libraryFiles={allMediaFiles}
                emptyCopy={emptyCopy}
                gridClassName={gridLayoutClass}
                gridStyle={layoutStyle(columns)}
                recommendedGameCards={recommendedCards}
                onOpen={onPlaylistClick}
                onCardMenu={openPlaylistMenu}
              />
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
        </>
        )}
        </PageSwap>
        </div>
      </div>

      {cardActions.saveModal}

      {floatingMenu && floatingPlaylist ? (
        <PlaylistCardMenu
          playlist={floatingPlaylist}
          x={floatingMenu.x!}
          y={floatingMenu.y!}
          onClose={() => setGalleryActiveMenu(null)}
          onOpen={onPlaylistClick}
        />
      ) : null}
    </motion.div>
    )}
    </RecommendedGamePlaylistsSlot>
  );
};
