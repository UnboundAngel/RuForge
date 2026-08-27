import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Play, Search, X, ChevronLeft, ChevronRight, Waves, Brain } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isAudioOnlyPath, bestCoverPath, hasSquareCover } from "@/mediaKind";
import { albumCoverPathWithFallback } from "@/albumCoverPath";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { readFurthestPlaybackSec } from "@/playbackStorage";
import type { MediaFile } from "@/types";
import { MusicHomeSkeleton } from "./MusicHomeSkeleton";
import {
  buildMultiTrackAlbumGroups,
  dedupeMusicTracks,
  diversifyTracksByArtist,
} from "./musicShelfDedup";
import { primaryArtist } from "./musicArtist";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { MusicHomeSearchEmpty } from "./MusicHomeSearchEmpty";
import { resolveLikedFiles } from "./musicLikedTracks";
import { LikedSongsCard } from "./LikedSongsCover";
import { MusicQuickPickRow } from "./MusicQuickPickRow";
import { MusicAlbumCard } from "./MusicAlbumCard";
import { MusicAlbumShelf } from "./MusicAlbumShelf";
import { MUSIC_ALBUM_SHELF_GAP_HOME_PX } from "@/lib/musicAlbumShelfLayout";
import { MusicHomeRecentSection } from "./MusicHomeRecentSection";
import { musicQueueSource, type MusicQueueSource } from "./musicQueueSource";
import { cn } from "@/lib/utils";
import type { PlayHistoryEntry } from "./musicPlayHistory";

type HomeFilter = "all" | "relax" | "focus";

const HOME_FILTERS: {
  id: HomeFilter;
  label: string;
  icon: typeof Waves | null;
  accent: string;
  accentBg: string;
  accentBgMuted: string;
}[] = [
  {
    id: "all",
    label: "All",
    icon: null,
    accent: "var(--music-text-primary)",
    accentBg: "var(--music-text-primary)",
    accentBgMuted: "#2a2a2a",
  },
  {
    id: "relax",
    label: "Relax",
    icon: Waves,
    accent: "#6ec4dc",
    accentBg: "#357d92",
    accentBgMuted: "#1e3d45",
  },
  {
    id: "focus",
    label: "Focus",
    icon: Brain,
    accent: "#d4b65a",
    accentBg: "#9a8044",
    accentBgMuted: "#3d3520",
  },
];

const FILTER_LABEL_WIDTH: Record<HomeFilter, number> = {
  all: 24,
  relax: 54,
  focus: 50,
};

const FILTER_MORPH_MS = "260ms";
const FILTER_MORPH_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

const FILTER_PILL_SHADOW =
  "0 1px 3px rgb(0 0 0 / 0.42), 0 0 0 1px rgb(255 255 255 / 0.07)";
const FILTER_PILL_SHADOW_COMPACT =
  "0 2px 6px rgb(0 0 0 / 0.48), 0 0 0 1px rgb(255 255 255 / 0.09)";
const FILTER_PILL_SHADOW_ACTIVE =
  "0 3px 10px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.12)";

type HomeFilterPillProps = {
  filter: (typeof HOME_FILTERS)[number];
  isActive: boolean;
  compact: boolean;
  onSelect: () => void;
};

function HomeFilterPill({ filter, isActive, compact, onSelect }: HomeFilterPillProps) {
  const Icon = filter.icon;
  const showLabel = isActive || filter.id === "all" || !compact;

  const pillShadow = compact
    ? isActive
      ? FILTER_PILL_SHADOW_ACTIVE
      : FILTER_PILL_SHADOW_COMPACT
    : FILTER_PILL_SHADOW;

  const style = isActive
    ? filter.id === "all"
      ? {
          background: "var(--music-text-primary)",
          color: "var(--music-bg)",
          boxShadow: pillShadow,
        }
      : {
          background: filter.accentBg,
          color: "#ffffff",
          boxShadow: pillShadow,
        }
    : compact
      ? {
          background: "#2c2c2c",
          color: filter.id === "all" ? "var(--music-text-secondary)" : filter.accent,
          boxShadow: pillShadow,
        }
      : {
          background: filter.accentBgMuted,
          color: filter.id === "all" ? "var(--music-text-secondary)" : filter.accent,
          boxShadow: pillShadow,
        };

  const morphStyle = {
    transition: `max-width ${FILTER_MORPH_MS} ${FILTER_MORPH_EASE}, opacity ${FILTER_MORPH_MS} ${FILTER_MORPH_EASE}, padding ${FILTER_MORPH_MS} ${FILTER_MORPH_EASE}`,
  } as const;

  if (!Icon) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="flex h-8 items-center rounded-full px-3.5 text-xs font-bold uppercase tracking-wider cursor-pointer border-0 shrink-0 transition-[background,color,box-shadow] duration-200"
        style={style}
        aria-pressed={isActive}
      >
        {filter.label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex h-8 items-center rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer border-0 overflow-hidden shrink-0 transition-[background,color,box-shadow] duration-200"
      style={style}
      aria-pressed={isActive}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">
        <Icon size={14} strokeWidth={2.25} />
      </span>
      <span
        className="overflow-hidden whitespace-nowrap block"
        style={{
          ...morphStyle,
          maxWidth: showLabel ? FILTER_LABEL_WIDTH[filter.id] : 0,
          opacity: showLabel ? 1 : 0,
          paddingRight: showLabel ? 14 : 0,
        }}
        aria-hidden={!showLabel}
      >
        {filter.label}
      </span>
    </button>
  );
}

type MusicHomeViewProps = {
  onPlayFile: (file: MediaFile, playlist?: MediaFile[], source?: MusicQueueSource | null) => void;
  onOpenArtist: (artistKey: string) => void;
  onOpenAlbum: (artistKey: string, albumKey: string) => void;
  onSearchYoutubeMusic?: (query: string) => void;
  historyEntries?: PlayHistoryEntry[];
  /** Leave room for the collapsed right-panel hover rail. */
  reserveRightMiniPanel?: boolean;
};

/** Seeded shuffle: stable for the session based on a random seed frozen on first render. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const copy = [...items];
  let s = seed;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type ArtistPillProps = {
  artist: string;
  trackCount: number;
  cover: string | null;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

/** Circular artist avatars — profile-style, subtle hover only. */
function ArtistPill({ artist, trackCount, cover, onClick, onContextMenu }: ArtistPillProps) {
  const coverSrc = cover ? convertFileSrc(cover) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
      className="flex flex-col items-center gap-3 p-1.5 rounded-xl text-center shrink-0 w-24 md:w-28 group/artist"
    >
      <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full shrink-0 transition-transform duration-200 group-hover/artist:scale-105">
        <div className="relative w-full h-full rounded-full overflow-hidden shadow bg-transparent border border-white/10">
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-xl font-bold select-none bg-[rgba(255,255,255,0.04)]"
              style={{ color: "var(--music-text-secondary)" }}
            >
              {artist.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 bg-black/35 flex items-center justify-center opacity-0 group-hover/artist:opacity-100 transition-opacity duration-200">
            <Play size={16} className="text-white fill-white" />
          </div>
        </div>
      </div>
      <div className="min-w-0 w-full flex flex-col gap-0.5">
        <div className="text-xs font-bold truncate transition-colors group-hover/artist:text-white" style={{ color: "var(--music-text-primary)" }}>
          {artist}
        </div>
        <div className="text-[10px]" style={{ color: "var(--music-text-muted)" }}>
          {trackCount} song{trackCount !== 1 ? "s" : ""}
        </div>
      </div>
    </button>
  );
}

interface ScrollShelfProps {
  title: string;
  children: React.ReactNode;
}

/** Premium horizontal scroll shelf with YTM-style paginating navigation arrows that dynamically calculate layout scroll boundaries */
function ScrollShelf({ title, children }: ScrollShelfProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const updateScrollState = () => {
    const el = containerRef.current;
    if (el) {
      setCanScrollLeft(el.scrollLeft > 5);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
      setHasOverflow(el.scrollWidth > el.clientWidth);
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      updateScrollState();
      el.addEventListener("scroll", updateScrollState, { passive: true });
      window.addEventListener("resize", updateScrollState);

      const observer = new MutationObserver(updateScrollState);
      observer.observe(el, { childList: true, subtree: true });

      return () => {
        el.removeEventListener("scroll", updateScrollState);
        window.removeEventListener("resize", updateScrollState);
        observer.disconnect();
      };
    }
  }, [children]);

  const scroll = (direction: "left" | "right") => {
    if (containerRef.current) {
      const amt = direction === "left" ? -450 : 450;
      containerRef.current.scrollBy({ left: amt, behavior: "smooth" });
    }
  };

  return (
    <section className="relative w-full">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
        {hasOverflow && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scroll("left")}
              disabled={!canScrollLeft}
              className="w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
              style={{
                borderColor: canScrollLeft ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.05)",
                background: canScrollLeft ? "rgba(255, 255, 255, 0.08)" : "transparent",
                color: canScrollLeft ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.25)",
              }}
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              disabled={!canScrollRight}
              className="w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
              style={{
                borderColor: canScrollRight ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.05)",
                background: canScrollRight ? "rgba(255, 255, 255, 0.08)" : "transparent",
                color: canScrollRight ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.25)",
              }}
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
      <div
        ref={containerRef}
        className="flex gap-5 overflow-x-auto pb-1 scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>
    </section>
  );
}

export function MusicHomeView({
  onPlayFile,
  onOpenArtist,
  onOpenAlbum,
  onSearchYoutubeMusic,
  historyEntries = [],
  reserveRightMiniPanel = true,
}: MusicHomeViewProps) {
  const entries = useRuforgeStore((s) => s.entries);
  const galleryLoading = useRuforgeStore((s) => s.galleryLoading);
  const openMusicLiked = useRuforgeStore((s) => s.openMusicLiked);
  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);
  const sessionSeedRef = useRef(Math.floor(Math.random() * 0xffffffff));

  const [activeFilter, setActiveFilter] = useState<HomeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [headerCompact, setHeaderCompact] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const compactSentinelRef = useRef<HTMLDivElement>(null);
  const searching = searchQuery.trim().length > 0;
  const searchExpanded = searchFocused || searching;
  const searchSource = musicQueueSource("search", "Search");
  const quickPicksSource = searching
    ? searchSource
    : musicQueueSource("quick_picks", "Quick picks");
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);

  const syncHeaderCompact = useCallback(() => {
    const scroller = scrollRef.current;
    const sentinel = compactSentinelRef.current;
    let y = scroller?.scrollTop ?? 0;
    if (sentinel && headerRef.current) {
      y = Math.max(
        y,
        headerRef.current.getBoundingClientRect().bottom - sentinel.getBoundingClientRect().top,
      );
    }
    setHeaderCompact((prev) => {
      if (!prev && y > 44) return true;
      if (prev && y < 10) return false;
      return prev;
    });
  }, []);

  const assignScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      if (node) syncHeaderCompact();
    },
    [syncHeaderCompact],
  );

  const tracks = useMemo(
    () => flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path)),
    [entries],
  );
  const homeScrollReady = tracks.length > 0;

  useEffect(() => {
    if (!homeScrollReady) {
      setHeaderCompact(false);
      return;
    }
    syncHeaderCompact();
    document.addEventListener("scroll", syncHeaderCompact, { passive: true, capture: true });
    return () => {
      document.removeEventListener("scroll", syncHeaderCompact, true);
    };
  }, [homeScrollReady, syncHeaderCompact]);

  // Filter & search tracks in real-time
  const filteredTracks = useMemo(() => {
    let result = tracks;

    // 1. Filter by category chip
    if (activeFilter !== "all") {
      result = result.filter((t) => {
        const name = t.name.toLowerCase();
        const artist = (t.artist ?? t.albumArtist ?? "").toLowerCase();
        const album = (t.album ?? "").toLowerCase();
        
        if (activeFilter === "relax") {
          const relaxWords = ["lofi", "chill", "sleep", "relax", "dream", "ambient", "simple", "calm", "soft"];
          return relaxWords.some(w => name.includes(w) || artist.includes(w) || album.includes(w));
        }
        if (activeFilter === "focus") {
          const focusWords = ["jazz", "ambience", "study", "work", "beats", "homework", "coffee shop", "focus", "piano", "instrumental"];
          return focusWords.some(w => name.includes(w) || artist.includes(w) || album.includes(w));
        }
        return true;
      });
    }

    // 2. Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((t) => {
        const name = t.name.toLowerCase();
        const artist = (t.artist ?? t.albumArtist ?? "").toLowerCase();
        const album = (t.album ?? "").toLowerCase();
        return name.includes(q) || artist.includes(q) || album.includes(q);
      });
    }

    return result;
  }, [tracks, activeFilter, searchQuery]);

  const likedTracks = useMemo(
    () => resolveLikedFiles(filteredTracks),
    [filteredTracks, musicLikedKeys],
  );

  // Quick picks: most-listened first, then seeded shuffle fallback.
  const quickPicks = useMemo(() => {
    const withHistory = filteredTracks
      .map((t) => ({
        file: t,
        secs: readFurthestPlaybackSec(t.path),
      }))
      .filter((x) => x.secs > 30)
      .sort((a, b) => b.secs - a.secs)
      .map((x) => x.file);

    const pool =
      withHistory.length >= 6
        ? withHistory
        : (() => {
            const playedPaths = new Set(withHistory.map((f) => f.path));
            const rest = seededShuffle(
              filteredTracks.filter((f) => !playedPaths.has(f.path)),
              sessionSeedRef.current,
            );
            return [...withHistory, ...rest];
          })();

    return diversifyTracksByArtist(
      dedupeMusicTracks(pool, primaryArtist),
      2,
      12,
      primaryArtist,
    );
  }, [filteredTracks]);

  // Albums: only multi-track releases; single downloads stay standalone songs.
  const albums = useMemo(() => {
    return buildMultiTrackAlbumGroups(filteredTracks, primaryArtist)
      .slice(0, 12)
      .map((g) => {
        const paths = albumCoverPathWithFallback(g.tracks[0]!);
        return {
          albumKey: g.albumKey,
          artistKey: g.artistKey,
          album: g.album,
          artist: g.artist,
          cover: paths.primary,
          coverFallback: paths.fallback,
          isSquare: hasSquareCover(g.tracks[0]!),
          tracks: g.tracks,
        };
      });
  }, [filteredTracks]);

  // Artists: group by PRIMARY artist only so "Juice WRLD, Trippie Redd" and
  // "Juice WRLD" both map to "Juice WRLD" rather than creating separate entries.
  const artists = useMemo(() => {
    const map = new Map<string, { key: string; display: string; trackCount: number; cover: string | null }>();
    for (const t of filteredTracks) {
      const raw = t.artist ?? t.albumArtist ?? "";
      if (!raw) continue;
      const primary = primaryArtist(raw);
      const key = primary.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { key, display: primary, trackCount: 0, cover: bestCoverPath(t) });
      }
      map.get(key)!.trackCount++;
    }
    return [...map.values()].sort((a, b) => b.trackCount - a.trackCount).slice(0, 12);
  }, [filteredTracks]);

  if (galleryLoading && tracks.length === 0) {
    return <MusicHomeSkeleton />;
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: "var(--music-text-muted)" }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.3 }}>
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
        <div className="text-center">
          <p className="text-base font-medium mb-1" style={{ color: "var(--music-text-secondary)" }}>No music in your library</p>
          <p className="text-sm">Use the Explore tab to download music, or add a folder in Settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={assignScrollRef}
      onScroll={syncHeaderCompact}
      className="absolute inset-0 overflow-y-auto overflow-x-hidden rf-scrollbar min-h-0"
      style={{ background: "var(--music-surface)" }}
    >
      <header
        ref={headerRef}
        className={cn(
          "sticky top-0 z-40 flex h-16 items-center gap-4 pl-8 min-w-0 bg-transparent",
          reserveRightMiniPanel
            ? "pr-[calc(var(--music-sidebar-collapsed-width)+1.25rem)]"
            : "pr-8",
        )}
      >
        <div
          className={cn(
            "flex items-center shrink-0 gap-1 transition-[background,padding,gap] duration-300 ease-out",
            headerCompact ? "rounded-full bg-[var(--music-surface-raised)] p-1 shadow-[0_2px_8px_rgb(0_0_0_/_0.38),0_0_0_1px_rgb(255_255_255_/_0.06)]" : "gap-2",
          )}
        >
          {HOME_FILTERS.map((filter) => (
            <HomeFilterPill
              key={filter.id}
              filter={filter}
              isActive={activeFilter === filter.id}
              compact={headerCompact}
              onSelect={() => setActiveFilter(filter.id)}
            />
          ))}
        </div>

        <div className="ml-auto shrink-0">
          <div
            className={cn(
              "relative rounded-full overflow-hidden transition-[width] duration-250 ease-out",
              searchExpanded ? "w-[11rem]" : "w-[6.75rem]",
            )}
            style={{
              background: "var(--music-surface-raised)",
            }}
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search"
              className={cn(
                "w-full py-2 text-xs md:text-sm rounded-full outline-none border-0 bg-transparent placeholder:text-white/45",
                searchExpanded ? "pl-9 pr-8" : "pl-9 pr-3.5",
              )}
              style={{ color: "var(--music-text-primary)" }}
            />
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              size={15}
              style={{ color: "var(--music-text-secondary)" }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--music-text-secondary)] hover:text-white transition-colors flex items-center justify-center"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </header>
      <div ref={compactSentinelRef} className="h-0 w-full overflow-hidden pointer-events-none" aria-hidden />

      {filteredTracks.length === 0 ? (
          <MusicHomeSearchEmpty
            searchQuery={searchQuery}
            activeFilter={activeFilter}
            onClear={() => {
              setActiveFilter("all");
              setSearchQuery("");
            }}
            onSearchYoutubeMusic={onSearchYoutubeMusic}
          />
        ) : (
          <div className="flex flex-col gap-12 px-6 sm:px-8 lg:px-12 pt-8 pb-16 w-full min-w-0">
            {/* Quick picks — most listened or suggested */}
            {quickPicks.length > 0 && (
              <section className="w-full min-w-0">
                <div className="flex items-end justify-between mb-4">
                  <h2 className="text-2xl font-bold tracking-tight" style={{ color: "var(--music-text-primary)" }}>
                    Quick picks
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 w-full min-w-0">
                  {quickPicks.map((file) => (
                    <MusicQuickPickRow
                      key={file.path}
                      file={file}
                      onClick={() => onPlayFile(file, quickPicks, quickPicksSource)}
                      menuOpen={menu?.context.kind === "song" && menu.context.file.path === file.path}
                      onContextMenu={(e) => setMenu({
                        context: { kind: "song", file },
                        x: e.clientX,
                        y: e.clientY,
                        onPlay: () => onPlayFile(file, quickPicks, quickPicksSource),
                      })}
                    />
                  ))}
                </div>
              </section>
            )}

            <AnimatePresence initial={false}>
              {likedTracks.length > 0 && activeFilter === "all" && !searchQuery && (
                <motion.section
                  key="home-liked-songs"
                  className="w-full min-w-0"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="flex items-end justify-between mb-4 gap-4">
                    <h2 className="text-2xl font-bold tracking-tight" style={{ color: "var(--music-text-primary)" }}>
                      Liked Songs
                    </h2>
                    <button
                      type="button"
                      onClick={openMusicLiked}
                      className="text-xs font-medium shrink-0 hover:underline"
                      style={{ color: "var(--music-text-secondary)" }}
                    >
                      See all
                    </button>
                  </div>
                  <LikedSongsCard files={likedTracks} onClick={openMusicLiked} />
                </motion.section>
              )}
            </AnimatePresence>

            {/* Artists circular scroll shelf */}
            {artists.length > 0 && (
              <ScrollShelf title="Artists">
                {artists.map((a) => (
                  <ArtistPill
                    key={a.key}
                    artist={a.display}
                    trackCount={a.trackCount}
                    cover={a.cover}
                    onClick={() => onOpenArtist(a.key)}
                    onContextMenu={(e) => {
                      const artistTracks = filteredTracks.filter(
                        (t) => primaryArtist(t.artist ?? t.albumArtist ?? "").toLowerCase() === a.key,
                      );
                      setMenu({
                        context: { kind: "artist", artistKey: a.key, displayName: a.display },
                        x: e.clientX,
                        y: e.clientY,
                        onPlay: artistTracks.length > 0
                          ? () => onPlayFile(
                              artistTracks[0],
                              artistTracks,
                              searching ? searchSource : musicQueueSource("artist", a.display),
                            )
                          : undefined,
                      });
                    }}
                  />
                ))}
              </ScrollShelf>
            )}

            {/* Albums horizontal pageable scroll shelf */}
            {albums.length > 0 && (
              <MusicAlbumShelf
                title="Albums"
                gap={MUSIC_ALBUM_SHELF_GAP_HOME_PX}
                items={albums}
                keyFn={(a) => `${a.artistKey}::${a.albumKey}`}
                renderItem={(a) => (
                  <MusicAlbumCard
                    title={a.album}
                    subtitle={a.artist}
                    cover={a.cover}
                    coverFallback={a.coverFallback}
                    onClick={() => onOpenAlbum(a.artistKey, a.albumKey)}
                    onContextMenu={(e) => setMenu({
                      context: { kind: "album", artistKey: a.artistKey, albumKey: a.albumKey, displayName: a.album, artistName: a.artist },
                      x: e.clientX,
                      y: e.clientY,
                      onPlay: a.tracks.length > 0
                        ? () => onPlayFile(
                            a.tracks[0],
                            a.tracks,
                            searching ? searchSource : musicQueueSource("album", a.album),
                          )
                        : undefined,
                    })}
                  />
                )}
              />
            )}

            {activeFilter === "all" && !searchQuery && (
              <MusicHomeRecentSection
                tracks={filteredTracks}
                historyEntries={historyEntries}
                quickPicks={quickPicks}
                onPlayFile={onPlayFile}
                onOpenAlbum={onOpenAlbum}
                onPlayQuickPicks={() => {
                  if (quickPicks[0]) {
                    onPlayFile(quickPicks[0], quickPicks, musicQueueSource("quick_picks", "Quick picks"));
                  }
                }}
                setMenu={setMenu}
                menu={menu}
              />
            )}
          </div>
        )}
      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
