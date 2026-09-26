import { useMemo, useState } from "react";
import { Check, Minus, Plus, Search } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import type { MediaFile } from "@/types";
import { cn } from "@/lib/utils";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
} from "./musicMenuUi";
import { MusicPlaylistCover } from "./MusicPlaylistCover";
import {
  pathsMissingFromRecord,
  playlistMembership,
  resolveMusicPlaylistTracks,
  type PlaylistMembership,
} from "./musicPlaylists";
import { useMusicLibraryTracks, useMusicPlaylistRecords } from "./useMusicPlaylists";

type Props = {
  paths: string[];
  x: number;
  y: number;
  onClose: () => void;
};

const tone = MUSIC_MENU_TONES.playlist;

/**
 * Spotify-style picker: search, New playlist, then a checkbox per playlist. Toggling keeps the
 * menu open so one song can land in several playlists in one pass.
 */
export function MusicAddToPlaylistMenu({ paths, x, y, onClose }: Props) {
  const notify = useRuforgeStore((s) => s.notify);
  const createMusicPlaylist = useRuforgeStore((s) => s.createMusicPlaylist);
  const addToVirtualPlaylist = useRuforgeStore((s) => s.addToVirtualPlaylist);
  const removePathsFromVirtualPlaylist = useRuforgeStore((s) => s.removePathsFromVirtualPlaylist);
  const openMusicPlaylist = useRuforgeStore((s) => s.openMusicPlaylist);
  const playlists = useMusicPlaylistRecords();
  const libraryTracks = useMusicLibraryTracks();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? playlists.filter((p) => p.title.toLowerCase().includes(q)) : playlists;
  }, [playlists, query]);

  const handleNew = () => {
    const id = createMusicPlaylist(paths);
    onClose();
    openMusicPlaylist(id);
  };

  const handleToggle = (record: VirtualPlaylistRecord, membership: PlaylistMembership) => {
    if (membership === "all") {
      removePathsFromVirtualPlaylist(record.id, paths);
      notify(`Removed from ${record.title}`);
      return;
    }
    const missing = pathsMissingFromRecord(record, paths);
    addToVirtualPlaylist(record.id, missing);
    const skipped = paths.length - missing.length;
    notify(
      skipped > 0
        ? `Added ${missing.length} to ${record.title}, ${skipped} already there`
        : `Added to ${record.title}`,
    );
  };

  return (
    <MusicFloatingMenu
      open
      x={x}
      y={y}
      onClose={onClose}
      ariaLabel="Add to playlist"
      measureKey={`${visible.length}:${playlists.length}`}
    >
      <label className="flex items-center gap-2 h-8 px-2 rounded-lg bg-white/[0.06] text-[12px] text-white/60 focus-within:bg-white/[0.09]">
        <Search size={MUSIC_MENU_ICON_SIZE} className="shrink-0" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a playlist"
          className="min-w-0 flex-1 bg-transparent border-0 outline-none text-white placeholder:text-white/35"
          aria-label="Find a playlist"
        />
      </label>

      <MusicMenuSection label="Add to playlist" tone={tone}>
        <MusicMenuRow
          tone={tone}
          label="New playlist"
          icon={<Plus size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
          onClick={handleNew}
        />
        {visible.map((record) => (
          <PlaylistPickRow
            key={record.id}
            record={record}
            libraryTracks={libraryTracks}
            membership={playlistMembership(record, paths)}
            onToggle={handleToggle}
          />
        ))}
        {playlists.length > 0 && visible.length === 0 && (
          <p className="px-1.5 py-2 text-[11px] text-white/40">No playlist matches</p>
        )}
      </MusicMenuSection>
    </MusicFloatingMenu>
  );
}

function PlaylistPickRow({
  record,
  libraryTracks,
  membership,
  onToggle,
}: {
  record: VirtualPlaylistRecord;
  libraryTracks: MediaFile[];
  membership: PlaylistMembership;
  onToggle: (record: VirtualPlaylistRecord, membership: PlaylistMembership) => void;
}) {
  const tracks = useMemo(
    () => resolveMusicPlaylistTracks(record, libraryTracks).tracks,
    [record, libraryTracks],
  );
  const checked = membership !== "none";

  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={membership === "all" ? true : membership === "some" ? "mixed" : false}
      onClick={() => onToggle(record, membership)}
      className="flex items-center gap-2 w-full px-1.5 h-9 rounded-lg text-[12px] text-[#cfcfcf] hover:text-white hover:bg-white/[0.07] border-0 outline-none text-left cursor-pointer transition-colors duration-100"
    >
      <MusicPlaylistCover files={tracks} className="w-6 h-6 shrink-0" iconSize={12} radius="6px" />
      <span className="min-w-0 flex-1 truncate">{record.title}</span>
      <span
        className={cn(
          "shrink-0 w-4 h-4 rounded-full flex items-center justify-center border",
          checked ? "border-transparent" : "border-white/30",
        )}
        style={checked ? { background: "var(--music-accent)" } : undefined}
        aria-hidden
      >
        {membership === "all" && <Check size={10} strokeWidth={3} color="#fff" />}
        {membership === "some" && <Minus size={10} strokeWidth={3} color="#fff" />}
      </span>
    </button>
  );
}
