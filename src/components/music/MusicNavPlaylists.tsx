import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ArrowDownAZ, Check, Clock, List, ListOrdered, Mic2, Pin, Search, Volume2, X, type LucideIcon } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import type { MediaFile } from "@/types";
import { cn } from "@/lib/utils";
import { HoverMarqueeText } from "./HoverMarqueeText";
import { LikedSongsCover } from "./LikedSongsCover";
import { MusicPlaylistCover } from "./MusicPlaylistCover";
import { resolveLikedFiles } from "./musicLikedTracks";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MUSIC_MENU_WIDTH,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
} from "./musicMenuUi";
import {
  LIBRARY_SORT_LABELS,
  readLibrarySort,
  sidebarArtists,
  sidebarPlaylists,
  writeLibrarySort,
  type LibraryFilter,
  type LibrarySort,
  type SidebarArtist,
} from "./musicLibrarySidebar";
import {
  hasMusicTrackDrag,
  pathsMissingFromRecord,
  readMusicTrackDragData,
  resolveMusicPlaylistTracks,
} from "./musicPlaylists";
import { useMusicLibraryTracks, useMusicPlaylistRecords } from "./useMusicPlaylists";

const SORTS: LibrarySort[] = ["recents", "alphabetical", "custom"];
const SORT_ICONS: Record<LibrarySort, LucideIcon> = {
  recents: Clock,
  alphabetical: ArrowDownAZ,
  custom: ListOrdered,
};

const RED_HOVER = "hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,#1f1f1f)]";
const CHIP = cn(
  "rf-music-press-soft h-8 shrink-0 flex items-center rounded-full text-sm text-white bg-white/[0.07]",
  RED_HOVER,
);
const FILTERS: { id: Exclude<LibraryFilter, null>; label: string }[] = [
  { id: "playlists", label: "Playlists" },
  { id: "artists", label: "Artists" },
];

const ROW_HOVER = "hover:bg-[color-mix(in_srgb,var(--music-accent)_9%,rgba(255,255,255,0.04))]";
const ROW_ACTIVE =
  "bg-[color-mix(in_srgb,var(--music-accent)_16%,transparent)] hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,transparent)]";

const songs = (n: number) => `${n} ${n === 1 ? "song" : "songs"}`;

/**
 * Spotify's "Your Library" list: filter chips, search and sort, then Liked Songs pinned
 * above playlists (drop targets for dragged tracks). Collapsed, it is a rail of covers.
 */
export function MusicNavPlaylists({ collapsed = false }: { collapsed?: boolean }) {
  const musicDetail = useRuforgeStore((s) => s.musicDetail);
  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);
  const queueSource = useRuforgeStore((s) => s.musicQueueSource);
  const openMusicLiked = useRuforgeStore((s) => s.openMusicLiked);
  const openMusicPlaylist = useRuforgeStore((s) => s.openMusicPlaylist);
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);
  const addToVirtualPlaylist = useRuforgeStore((s) => s.addToVirtualPlaylist);
  const notify = useRuforgeStore((s) => s.notify);
  const libraryTracks = useMusicLibraryTracks();
  const records = useMusicPlaylistRecords();
  const likedTracks = useMemo(() => resolveLikedFiles(libraryTracks), [libraryTracks, musicLikedKeys]);

  const [filter, setFilter] = useState<LibraryFilter>(null);
  const [sort, setSortState] = useState<LibrarySort>(readLibrarySort);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortAt, setSortAt] = useState<{ x: number; y: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const listQuery = collapsed ? "" : query;
  const showArtists = filter === "artists" && !collapsed;
  const playlists = useMemo(() => sidebarPlaylists(records, sort, listQuery), [records, sort, listQuery]);
  const artists = useMemo(
    () => (showArtists ? sidebarArtists(libraryTracks, sort, listQuery) : []),
    [showArtists, libraryTracks, sort, listQuery],
  );
  const showLiked = !showArtists && (!listQuery.trim() || "liked songs".includes(listQuery.trim().toLowerCase()));
  const playingPlaylist = queueSource?.kind === "playlist" ? queueSource.label : null;

  const setSort = (next: LibrarySort) => {
    setSortState(next);
    writeLibrarySort(next);
    setSortAt(null);
  };

  const handleDrop = (record: VirtualPlaylistRecord, paths: string[]) => {
    const missing = pathsMissingFromRecord(record, paths);
    if (missing.length === 0) {
      notify(`Already in ${record.title}`);
      return;
    }
    addToVirtualPlaylist(record.id, missing);
    notify(`Added to ${record.title}`);
  };

  const likedRow = showLiked && (
    <LibraryRow
      collapsed={collapsed}
      title="Liked Songs"
      subtitle={songs(likedTracks.length)}
      pinned
      active={musicDetail?.kind === "liked"}
      playing={queueSource?.kind === "liked"}
      cover={<LikedSongsCover files={likedTracks} className="w-12 h-12" radius="6px" />}
      onClick={() => openMusicLiked()}
    />
  );

  const list = (
    <div
      className={cn(
        "flex-1 min-h-0 overflow-y-auto rf-scrollbar pb-2 flex flex-col",
        collapsed ? "items-center px-1 gap-1" : "px-2",
      )}
    >
      {showArtists ? (
        artists.map((artist) => (
          <ArtistRow
            key={artist.key}
            artist={artist}
            active={musicDetail?.kind === "artist" && musicDetail.key === artist.key}
            onClick={() => openMusicArtist(artist.key)}
          />
        ))
      ) : (
        <>
          {likedRow}
          {playlists.map((record) => (
            <PlaylistItem
              key={record.id}
              collapsed={collapsed}
              record={record}
              libraryTracks={libraryTracks}
              active={musicDetail?.kind === "playlist" && musicDetail.id === record.id}
              playing={playingPlaylist === record.title}
              onOpen={() => openMusicPlaylist(record.id)}
              onDropPaths={(paths) => handleDrop(record, paths)}
            />
          ))}
        </>
      )}
      {!collapsed && listQuery.trim() && !showLiked && playlists.length === 0 && artists.length === 0 && (
        <p className="px-2 pt-3 text-sm text-white/60">Couldn't find "{listQuery.trim()}"</p>
      )}
      {!collapsed && !listQuery.trim() && !showArtists && records.length === 0 && (
        <div className="mx-2 mt-2 rounded-lg bg-white/[0.05] p-4">
          <p className="text-sm font-bold text-white">Create your first playlist</p>
          <p className="mt-1 text-sm text-white/70">It's easy, press Create or right-click any song.</p>
        </div>
      )}
    </div>
  );

  if (collapsed) return list;

  const searching = searchOpen || Boolean(query);
  const closeSearch = () => {
    setQuery("");
    setSearchOpen(false);
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-2 px-4 pb-2 shrink-0">
        {filter && (
          <button
            type="button"
            onClick={() => setFilter(null)}
            className={cn(CHIP, "w-8 px-0 justify-center text-white/80 hover:text-white")}
            aria-label="Clear filters"
          >
            <X size={16} />
          </button>
        )}
        {FILTERS.filter((f) => !filter || f.id === filter).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(filter === f.id ? null : f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              CHIP,
              "px-3",
              filter === f.id && "bg-[color:var(--music-accent)] text-white hover:bg-[color:var(--music-accent-hover)]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 pl-2 pr-4 pb-1 shrink-0">
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "flex items-center h-8 rounded-md overflow-hidden transition-[width,background-color] duration-300 ease-out",
              searching ? "w-full bg-white/[0.08]" : "w-8 bg-transparent",
            )}
          >
            <button
              type="button"
              onClick={() => (searching ? searchRef.current?.focus() : setSearchOpen(true))}
              className={cn(
                "rf-music-tooltip-anchor rf-music-press w-8 h-8 shrink-0 flex items-center justify-center rounded-full",
                searching ? "text-white/70" : cn("text-white/60 hover:text-white", RED_HOVER),
              )}
              aria-label="Search in Your Library"
              data-tooltip={searching ? undefined : "Search in Your Library"}
              tabIndex={searching ? -1 : 0}
            >
              <Search size={16} />
            </button>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => {
                if (!query) setSearchOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeSearch();
              }}
              placeholder="Search in Your Library"
              aria-label="Search in Your Library"
              tabIndex={searching ? 0 : -1}
              className={cn(
                "min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/50 outline-none caret-[color:var(--music-accent)] transition-opacity duration-200",
                searching ? "opacity-100 delay-100" : "opacity-0 pointer-events-none",
              )}
            />
            {query && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                className="rf-music-press w-7 h-7 mr-0.5 shrink-0 flex items-center justify-center rounded-full text-white/60 hover:text-white"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setSortAt(sortAt ? null : { x: r.right - MUSIC_MENU_WIDTH, y: r.bottom + 6 });
          }}
          className={cn(
            "rf-music-tooltip-anchor rf-music-press-soft shrink-0 flex items-center h-8 pl-2 text-sm text-white/70 hover:text-white",
            sortAt && "text-[color:var(--music-accent)] hover:text-[color:var(--music-accent)]",
          )}
          aria-label={`Sort by ${LIBRARY_SORT_LABELS[sort]}`}
          data-tooltip={searching ? `Sort by ${LIBRARY_SORT_LABELS[sort]}` : undefined}
        >
          <span
            className={cn(
              "overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-out",
              searching ? "max-w-0 opacity-0 mr-0" : "max-w-[120px] opacity-100 mr-1.5",
            )}
          >
            {LIBRARY_SORT_LABELS[sort]}
          </span>
          <List size={16} className="shrink-0" />
        </button>
      </div>

      {list}

      <MusicFloatingMenu
        open={sortAt != null}
        x={sortAt?.x ?? 0}
        y={sortAt?.y ?? 0}
        onClose={() => setSortAt(null)}
        ariaLabel="Sort Your Library"
      >
        <MusicMenuSection label="Sort by" tone={MUSIC_MENU_TONES.playback}>
          {SORTS.map((key) => {
            const SortIcon = SORT_ICONS[key];
            return (
              <MusicMenuRow
                key={key}
                tone={MUSIC_MENU_TONES.playback}
                icon={<SortIcon size={MUSIC_MENU_ICON_SIZE} />}
                label={LIBRARY_SORT_LABELS[key]}
                active={key === sort}
                onClick={() => setSort(key)}
                trailing={key === sort ? <Check size={14} className="shrink-0 text-[color:var(--music-accent)]" /> : undefined}
              />
            );
          })}
        </MusicMenuSection>
      </MusicFloatingMenu>
    </div>
  );
}

function PlaylistItem({
  collapsed,
  record,
  libraryTracks,
  active,
  playing,
  onOpen,
  onDropPaths,
}: {
  collapsed: boolean;
  record: VirtualPlaylistRecord;
  libraryTracks: MediaFile[];
  active: boolean;
  playing: boolean;
  onOpen: () => void;
  onDropPaths: (paths: string[]) => void;
}) {
  const [dropping, setDropping] = useState(false);
  const { tracks } = useMemo(
    () => resolveMusicPlaylistTracks(record, libraryTracks),
    [record, libraryTracks],
  );

  return (
    <LibraryRow
      collapsed={collapsed}
      title={record.title}
      subtitle={songs(tracks.length)}
      active={active}
      playing={playing}
      dropping={dropping}
      cover={<MusicPlaylistCover files={tracks} className="w-12 h-12" iconSize={20} radius="6px" />}
      onClick={onOpen}
      onDragOver={(e) => {
        if (!hasMusicTrackDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!dropping) setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const paths = readMusicTrackDragData(e);
        if (paths.length > 0) onDropPaths(paths);
      }}
    />
  );
}

function ArtistRow({ artist, active, onClick }: { artist: SidebarArtist; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "flex items-center gap-3 w-full p-2 rounded-md text-left transition-colors",
        active ? ROW_ACTIVE : ROW_HOVER,
      )}
    >
      {artist.cover ? (
        <img
          src={convertFileSrc(artist.cover)}
          alt=""
          loading="lazy"
          draggable={false}
          className="w-12 h-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full bg-white/[0.08] text-white/40">
          <Mic2 size={20} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <HoverMarqueeText text={artist.name} active={hovered} className="text-base text-white" />
        <span className="block truncate text-sm text-white/60">Artist · {songs(artist.trackCount)}</span>
      </span>
    </button>
  );
}

function LibraryRow({
  collapsed,
  title,
  subtitle,
  pinned = false,
  active,
  playing,
  dropping = false,
  cover,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  collapsed: boolean;
  title: string;
  subtitle: string;
  pinned?: boolean;
  active: boolean;
  playing: boolean;
  dropping?: boolean;
  cover: React.ReactNode;
  onClick: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const surface = cn(
    "rounded-md transition-colors",
    dropping
      ? "bg-[color-mix(in_srgb,var(--music-accent)_22%,transparent)]"
      : active
        ? ROW_ACTIVE
        : ROW_HOVER,
  );
  const dropProps = { onDragOver, onDragLeave, onDrop };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        {...dropProps}
        className={cn("rf-music-tooltip-anchor p-1.5 shrink-0", surface)}
        aria-label={title}
        data-tooltip={`${title} · Playlist · ${subtitle}`}
      >
        <span className="block overflow-hidden rounded-md">{cover}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      {...dropProps}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn("flex items-center gap-3 w-full p-2 text-left", surface)}
    >
      <span className="shrink-0 overflow-hidden rounded-md">{cover}</span>
      <span className="min-w-0 flex-1">
        <HoverMarqueeText
          text={title}
          active={hovered}
          className={cn("text-base", playing ? "text-[color:var(--music-accent)]" : "text-white")}
        />
        <span className="flex items-center gap-1.5 min-w-0 text-sm text-white/60">
          {pinned && <Pin size={13} className="shrink-0 rotate-45 fill-current text-[color:var(--music-accent)]" />}
          <span className="truncate">Playlist · {subtitle}</span>
        </span>
      </span>
      {playing && <Volume2 size={16} className="shrink-0 text-[color:var(--music-accent)]" aria-label="Now playing" />}
    </button>
  );
}
