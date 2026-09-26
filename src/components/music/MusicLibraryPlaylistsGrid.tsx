import { useMemo } from "react";
import { Plus } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import type { MediaFile } from "@/types";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { MusicPlaylistCover } from "./MusicPlaylistCover";
import { resolveMusicPlaylistTracks } from "./musicPlaylists";
import { useMusicLibraryTracks, useMusicPlaylistRecords } from "./useMusicPlaylists";

export function MusicLibraryPlaylistsGrid() {
  const createMusicPlaylist = useRuforgeStore((s) => s.createMusicPlaylist);
  const openMusicPlaylist = useRuforgeStore((s) => s.openMusicPlaylist);
  const playlists = useMusicPlaylistRecords();
  const libraryTracks = useMusicLibraryTracks();

  return (
    <div className="px-4 sm:px-6 pr-12 sm:pr-14 pb-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => openMusicPlaylist(createMusicPlaylist())}
          className="group/tile flex flex-col gap-2 p-2 rounded-xl text-left hover:bg-[var(--music-surface-raised)] transition-colors"
        >
          <div className="aspect-square w-full flex items-center justify-center rounded-[var(--music-card-radius)] bg-white/[0.06] text-[color:var(--music-text-secondary)] group-hover/tile:text-[color:var(--music-text-primary)] transition-colors">
            <Plus size={36} strokeWidth={1.75} />
          </div>
          <div className="text-sm font-bold text-[color:var(--music-text-primary)]">New playlist</div>
        </button>
        {playlists.map((record) => (
          <PlaylistTile
            key={record.id}
            record={record}
            libraryTracks={libraryTracks}
            onOpen={() => openMusicPlaylist(record.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PlaylistTile({
  record,
  libraryTracks,
  onOpen,
}: {
  record: VirtualPlaylistRecord;
  libraryTracks: MediaFile[];
  onOpen: () => void;
}) {
  const tracks = useMemo(
    () => resolveMusicPlaylistTracks(record, libraryTracks).tracks,
    [record, libraryTracks],
  );
  const coverFile = record.thumbnailPath
    ? tracks.find((t) => mediaPathsMatch(t.path, record.thumbnailPath!)) ?? null
    : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-2 p-2 rounded-xl text-left hover:bg-[var(--music-surface-raised)] transition-colors"
    >
      <MusicPlaylistCover files={tracks} coverFile={coverFile} className="aspect-square w-full" />
      <div className="min-w-0">
        <div className="text-sm font-bold truncate text-[color:var(--music-text-primary)]">
          {record.title}
        </div>
        <div className="text-xs mt-0.5 text-[color:var(--music-text-secondary)]">
          Playlist · {tracks.length} {tracks.length === 1 ? "song" : "songs"}
        </div>
      </div>
    </button>
  );
}
