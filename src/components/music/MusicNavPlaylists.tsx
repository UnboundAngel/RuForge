import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Check, List, Mic2, Pin, Search, Volume2, X } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import type { MediaFile } from "@/types";
import { cn } from "@/lib/utils";
import { HoverMarqueeText } from "./HoverMarqueeText";
import { LikedSongsCover } from "./LikedSongsCover";
import { MusicPlaylistCover } from "./MusicPlaylistCover";
import { resolveLikedFiles } from "./musicLikedTracks";
import {
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
const FILTERS: { id: Exclude<LibraryFilter, null>; label: string }[] = [
  { id: "playlists", label: "Playlists" },
  { id: "artists", label: "Artists" },
];

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

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-2 px-4 pb-2 shrink-0">
        {filter && (
          <button
            type="button"
            onClick={() => setFilter(null)}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-white/[0.07] text-white/80 transition-colors hover:bg-white/[0.12] hover:text-white"
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
              "h-8 px-3 shrink-0 rounded-full text-sm transition-colors",
              filter === f.id ? "bg-white text-black" : "bg-white/[0.07] text-white hover:bg-white/[0.12]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 pl-2 pr-4 pb-1 shrink-0">
        {searchOpen || query ? (
          <div className="flex items-center gap-2 h-8 flex-1 min-w-0 rounded-md bg-white/[0.1] px-2 text-white/70">
            <Search size={16} className="shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => {
                if (!query) setSearchOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  setSearchOpen(false);
                }
              }}
              placeholder="Search in Your Library"
              aria-label="Search in Your Library"
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/50 outline-none"
            />
            {query && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuery("")}
                className="shrink-0 text-white/60 hover:text-white"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="rf-music-tooltip-anchor w-8 h-8 mr-auto flex items-center justify-center rounded-full text-white/60 transition-colors hover:text-white hover:bg-white/[0.07]"
            aria-label="Search in Your Library"
            data-tooltip="Search in Your Library"
          >
            <Search size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setSortAt(sortAt ? null : { x: r.right - MUSIC_MENU_WIDTH, y: r.bottom + 6 });
          }}
          className={cn(
            "shrink-0 flex items-center gap-1.5 h-8 pl-2 text-sm text-white/70 transition-colors hover:text-white",
            sortAt && "text-white",
          )}
          aria-label={`Sort by ${LIBRARY_SORT_LABELS[sort]}`}
        >
          {LIBRARY_SORT_LABELS[sort]}
          <List size={16} />
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
        <MusicMenuSection label="Sort by" tone={MUSIC_MENU_TONES.navigate}>
          {SORTS.map((key) => (
            <MusicMenuRow
              key={key}
              tone={MUSIC_MENU_TONES.navigate}
              icon={<span className="block w-[13px]" />}
              label={LIBRARY_SORT_LABELS[key]}
              active={key === sort}
              onClick={() => setSort(key)}
              trailing={key === sort ? <Check size={14} className="shrink-0 text-[color:var(--music-accent)]" /> : undefined}
            />
          ))}
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
        active ? "bg-white/[0.1] hover:bg-white/[0.14]" : "hover:bg-white/[0.07]",
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
        ? "bg-white/[0.1] hover:bg-white/[0.14]"
        : "hover:bg-white/[0.07]",
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
