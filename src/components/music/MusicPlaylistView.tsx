import { useMemo, useState } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { DEFAULT_MUSIC_PLAYLIST_TITLE, recordHasPath } from "@/virtualPlaylists";
import { askConfirm } from "@/components/ConfirmDialog";
import type { MediaFile } from "@/types";
import { buildSmartShuffleOrder } from "./musicSmartShuffle";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { musicQueueSource, type MusicQueueSource } from "./musicQueueSource";
import { resolveMusicPlaylistTracks } from "./musicPlaylists";
import { useMusicLibraryTracks, useMusicPlaylistRecords } from "./useMusicPlaylists";
import { MusicPlaylistHeader } from "./MusicPlaylistHeader";
import { MusicPlaylistTrackRow } from "./MusicPlaylistTrackRow";
import { MusicPlaylistFinder } from "./MusicPlaylistFinder";

type Props = {
  playlistId: string;
  onPlayFile: (
    file: MediaFile,
    playlist: MediaFile[],
    source: MusicQueueSource,
    opts?: { shuffle?: boolean },
  ) => void;
  onBack: () => void;
};

const UNTOUCHED_TITLE = new RegExp(`^${DEFAULT_MUSIC_PLAYLIST_TITLE} #\\d+$`);

export function MusicPlaylistView({ playlistId, onPlayFile, onBack }: Props) {
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);
  const renameVirtualPlaylist = useRuforgeStore((s) => s.renameVirtualPlaylist);
  const deleteVirtualPlaylist = useRuforgeStore((s) => s.deleteVirtualPlaylist);
  const addToVirtualPlaylist = useRuforgeStore((s) => s.addToVirtualPlaylist);
  const removePathsFromVirtualPlaylist = useRuforgeStore((s) => s.removePathsFromVirtualPlaylist);
  const reorderVirtualPlaylistByPath = useRuforgeStore((s) => s.reorderVirtualPlaylistByPath);
  const libraryTracks = useMusicLibraryTracks();
  const playlists = useMusicPlaylistRecords();
  const record = playlists.find((p) => p.id === playlistId) ?? null;
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropPath, setDropPath] = useState<string | null>(null);

  const { tracks, missingPaths } = useMemo(
    () => (record ? resolveMusicPlaylistTracks(record, libraryTracks) : { tracks: [], missingPaths: [] }),
    [record, libraryTracks],
  );
  const coverFile = useMemo(() => {
    const thumb = record?.thumbnailPath;
    return thumb ? tracks.find((t) => mediaPathsMatch(t.path, thumb)) ?? null : null;
  }, [record?.thumbnailPath, tracks]);

  if (!record) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[color:var(--music-text-muted)]">
        This playlist no longer exists.
      </div>
    );
  }

  const source = musicQueueSource("playlist", record.title);
  const untouched = record.items.length === 0 && UNTOUCHED_TITLE.test(record.title);
  const dragIndex = dragPath ? tracks.findIndex((t) => t.path === dragPath) : -1;

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    const shuffled = buildSmartShuffleOrder({
      pool: tracks,
      likedKeys: musicLikedKeys,
      seed: Date.now() & 0xffffffff,
    });
    onPlayFile(shuffled[0]!, tracks, source, { shuffle: true });
  };

  const handleDelete = async () => {
    const ok = await askConfirm({
      title: "Delete playlist?",
      message: `"${record.title}" will be removed. Your song files stay in the library.`,
      confirmLabel: "Delete",
    });
    if (ok) deleteVirtualPlaylist(record.id);
  };

  const endDrag = () => {
    setDragPath(null);
    setDropPath(null);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto rf-scrollbar">
      <MusicPlaylistHeader
        key={record.id}
        title={record.title}
        tracks={tracks}
        coverFile={coverFile}
        startEditing={untouched}
        onRename={(title) => renameVirtualPlaylist(record.id, title)}
        onPlay={() => tracks[0] && onPlayFile(tracks[0], tracks, source)}
        onShuffle={handleShuffle}
        onDelete={() => void handleDelete()}
        onBack={onBack}
      />

      {missingPaths.length > 0 && (
        <div className="mx-5 mb-2 flex items-center gap-3 rounded-xl bg-white/[0.05] px-4 py-2.5 text-xs text-[color:var(--music-text-secondary)]">
          <span className="flex-1">
            {missingPaths.length} {missingPaths.length === 1 ? "song is" : "songs are"} not in your library right now.
          </span>
          <button
            type="button"
            onClick={() => removePathsFromVirtualPlaylist(record.id, missingPaths)}
            className="font-semibold text-[color:var(--music-text-primary)] hover:underline"
          >
            Remove from playlist
          </button>
        </div>
      )}

      {tracks.length > 0 && (
        <section className="px-1">
          {tracks.map((file, i) => (
            <MusicPlaylistTrackRow
              key={file.path}
              file={file}
              index={i}
              isPlaying={playingFile?.path === file.path}
              menuOpen={menu?.context.kind === "song" && menu.context.file.path === file.path}
              dropIndicator={
                dropPath === file.path && dragPath && dragPath !== file.path
                  ? dragIndex < i ? "below" : "above"
                  : null
              }
              onClick={() => onPlayFile(file, tracks, source)}
              onContextMenu={(e) => setMenu({
                context: { kind: "song", file },
                x: e.clientX,
                y: e.clientY,
                onPlay: () => onPlayFile(file, tracks, source),
                playlistId: record.id,
              })}
              onReorderStart={() => setDragPath(file.path)}
              onReorderOver={(e) => {
                if (!dragPath) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dropPath !== file.path) setDropPath(file.path);
              }}
              onReorderDrop={() => {
                if (dragPath && dragPath !== file.path) {
                  reorderVirtualPlaylistByPath(record.id, dragPath, file.path);
                }
                endDrag();
              }}
              onReorderEnd={endDrag}
            />
          ))}
        </section>
      )}

      <MusicPlaylistFinder
        libraryTracks={libraryTracks}
        prominent={tracks.length === 0}
        autoFocus={tracks.length === 0 && !untouched}
        inPlaylist={(path) => recordHasPath(record, path)}
        onAdd={(file) => addToVirtualPlaylist(record.id, [file.path])}
      />

      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
