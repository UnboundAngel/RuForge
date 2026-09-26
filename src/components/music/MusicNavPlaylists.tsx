import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import type { MediaFile } from "@/types";
import { cn } from "@/lib/utils";
import { HoverMarqueeText } from "./HoverMarqueeText";
import { LikedSongsCover } from "./LikedSongsCover";
import { MusicPlaylistCover } from "./MusicPlaylistCover";
import { resolveLikedFiles } from "./musicLikedTracks";
import {
  hasMusicTrackDrag,
  pathsMissingFromRecord,
  readMusicTrackDragData,
  resolveMusicPlaylistTracks,
} from "./musicPlaylists";
import { useMusicLibraryTracks, useMusicPlaylistRecords } from "./useMusicPlaylists";

/** Sidebar library: Liked Songs pinned, then music playlists as jump links and drop targets. */
export function MusicNavPlaylists() {
  const musicDetail = useRuforgeStore((s) => s.musicDetail);
  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);
  const openMusicLiked = useRuforgeStore((s) => s.openMusicLiked);
  const openMusicPlaylist = useRuforgeStore((s) => s.openMusicPlaylist);
  const createMusicPlaylist = useRuforgeStore((s) => s.createMusicPlaylist);
  const addToVirtualPlaylist = useRuforgeStore((s) => s.addToVirtualPlaylist);
  const notify = useRuforgeStore((s) => s.notify);
  const libraryTracks = useMusicLibraryTracks();
  const playlists = useMusicPlaylistRecords();
  const likedTracks = useMemo(() => resolveLikedFiles(libraryTracks), [libraryTracks, musicLikedKeys]);

  const handleDrop = (record: VirtualPlaylistRecord, paths: string[]) => {
    const missing = pathsMissingFromRecord(record, paths);
    if (missing.length === 0) {
      notify(`Already in ${record.title}`);
      return;
    }
    addToVirtualPlaylist(record.id, missing);
    notify(`Added to ${record.title}`);
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 pt-3">
      <div className="flex items-center justify-between px-4 pb-1.5 shrink-0">
        <span className="text-xs font-semibold text-[color:var(--music-text-secondary)]">Playlists</span>
        <button
          type="button"
          onClick={() => openMusicPlaylist(createMusicPlaylist())}
          className="rf-music-tooltip-anchor w-7 h-7 flex items-center justify-center rounded-full text-[color:var(--music-text-secondary)] hover:text-[color:var(--music-text-primary)] hover:bg-white/10 transition-colors"
          aria-label="Create playlist (Ctrl+N)"
          data-tooltip="Create playlist (Ctrl+N)"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto rf-scrollbar px-2 pb-2 flex flex-col gap-0.5">
        <NavPlaylistRow
          title="Liked Songs"
          subtitle={`${likedTracks.length} ${likedTracks.length === 1 ? "song" : "songs"}`}
          active={musicDetail?.kind === "liked"}
          cover={<LikedSongsCover files={likedTracks} className="w-9 h-9" radius="8px" />}
          onClick={() => openMusicLiked()}
        />
        {playlists.map((record) => (
          <PlaylistNavItem
            key={record.id}
            record={record}
            libraryTracks={libraryTracks}
            active={musicDetail?.kind === "playlist" && musicDetail.id === record.id}
            onOpen={() => openMusicPlaylist(record.id)}
            onDropPaths={(paths) => handleDrop(record, paths)}
          />
        ))}
        {playlists.length === 0 && (
          <p className="px-2 pt-2 text-xs leading-relaxed text-[color:var(--music-text-muted)]">
            no playlists yet. hit + or right-click any song.
          </p>
        )}
      </div>
    </div>
  );
}

function PlaylistNavItem({
  record,
  libraryTracks,
  active,
  onOpen,
  onDropPaths,
}: {
  record: VirtualPlaylistRecord;
  libraryTracks: MediaFile[];
  active: boolean;
  onOpen: () => void;
  onDropPaths: (paths: string[]) => void;
}) {
  const [dropping, setDropping] = useState(false);
  const { tracks } = useMemo(
    () => resolveMusicPlaylistTracks(record, libraryTracks),
    [record, libraryTracks],
  );

  return (
    <NavPlaylistRow
      title={record.title}
      subtitle={`${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`}
      active={active}
      dropping={dropping}
      cover={<MusicPlaylistCover files={tracks} className="w-9 h-9" iconSize={16} radius="8px" />}
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

function NavPlaylistRow({
  title,
  subtitle,
  active,
  dropping = false,
  cover,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  dropping?: boolean;
  cover: React.ReactNode;
  onClick: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-left transition-colors",
        active ? "bg-white/[0.09]" : "hover:bg-white/[0.05]",
        dropping && "bg-[color-mix(in_srgb,var(--music-accent)_18%,transparent)]",
      )}
    >
      <span className="shrink-0 overflow-hidden rounded-lg">{cover}</span>
      <span className="min-w-0 flex-1">
        <HoverMarqueeText
          text={title}
          active={hovered}
          className={cn(
            "text-sm font-medium",
            active ? "text-[color:var(--music-accent)]" : "text-[color:var(--music-text-primary)]",
          )}
        />
        <span className="block text-[11px] truncate text-[color:var(--music-text-muted)]">
          Playlist · {subtitle}
        </span>
      </span>
    </button>
  );
}
