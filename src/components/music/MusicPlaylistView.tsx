import { useEffect, useMemo, useState } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { useOptionalMainAudioPlayback } from "@/playback/mainAudioPlaybackContext";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { DEFAULT_MUSIC_PLAYLIST_TITLE, recordHasPath } from "@/virtualPlaylists";
import { askConfirm } from "@/components/ConfirmDialog";
import type { MediaFile } from "@/types";
import { buildSmartShuffleOrder } from "./musicSmartShuffle";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { useActiveQueueSource } from "./useActiveQueueSource";
import { musicQueueSource, type MusicQueueSource } from "./musicQueueSource";
import { resolveMusicPlaylistTracks } from "./musicPlaylists";
import { useMusicLibraryTracks, useMusicPlaylistRecords } from "./useMusicPlaylists";
import { MusicPlaylistHeader } from "./MusicPlaylistHeader";
import { MusicPlaylistColumnHeader, MusicPlaylistTrackRow } from "./MusicPlaylistTrackRow";
import { MusicPlaylistActionBar } from "./MusicPlaylistActionBar";
import {
  addedAtFor,
  filterPlaylistTracks,
  nextSortOnHeaderClick,
  readPlaylistViewPrefs,
  sortPlaylistTracks,
  writePlaylistViewPrefs,
  type PlaylistViewPrefs,
} from "./musicPlaylistSort";
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
  const enqueueManualQueue = useRuforgeStore((s) => s.enqueueManualQueue);
  const musicShuffleOn = useRuforgeStore((s) => s.musicShuffleOn);
  const toggleMusicShuffle = useRuforgeStore((s) => s.toggleMusicShuffle);
  const queueSource = useActiveQueueSource();
  const playback = useOptionalMainAudioPlayback();
  const libraryTracks = useMusicLibraryTracks();
  const playlists = useMusicPlaylistRecords();
  const record = playlists.find((p) => p.id === playlistId) ?? null;
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropPath, setDropPath] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [renameSignal, setRenameSignal] = useState(0);
  const [prefs, setPrefsState] = useState<PlaylistViewPrefs>(() => readPlaylistViewPrefs(playlistId));

  useEffect(() => {
    setPrefsState(readPlaylistViewPrefs(playlistId));
    setQuery("");
    setSelectedPath(null);
  }, [playlistId]);

  const setPrefs = (next: PlaylistViewPrefs) => {
    setPrefsState(next);
    writePlaylistViewPrefs(playlistId, next);
  };

  const { tracks, missingPaths } = useMemo(
    () => (record ? resolveMusicPlaylistTracks(record, libraryTracks) : { tracks: [], missingPaths: [] }),
    [record, libraryTracks],
  );
  const coverFile = useMemo(() => {
    const thumb = record?.thumbnailPath;
    return thumb ? tracks.find((t) => mediaPathsMatch(t.path, thumb)) ?? null : null;
  }, [record?.thumbnailPath, tracks]);

  const shown = useMemo(
    () => (record ? filterPlaylistTracks(sortPlaylistTracks(tracks, record, prefs.sort, prefs.desc), query) : []),
    [tracks, record, prefs.sort, prefs.desc, query],
  );

  if (!record) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[color:var(--music-text-muted)]">
        This playlist no longer exists.
      </div>
    );
  }

  const source = musicQueueSource("playlist", record.title);
  const untouched = record.items.length === 0 && UNTOUCHED_TITLE.test(record.title);
  const dragIndex = dragPath ? shown.findIndex((t) => t.path === dragPath) : -1;
  const reorderable = prefs.sort === "custom" && !prefs.desc && query.trim() === "";
  const thisSourceActive =
    queueSource?.kind === "playlist" && queueSource.label === record.title;
  const playingHere = thisSourceActive && playback != null && !playback.paused;

  const playFrom = (file: MediaFile) => onPlayFile(file, shown, source);

  const handlePlay = () => {
    if (thisSourceActive && playback) {
      playback.togglePlay();
      return;
    }
    if (shown.length === 0) return;
    if (!musicShuffleOn) {
      playFrom(shown[0]!);
      return;
    }
    const shuffled = buildSmartShuffleOrder({
      pool: shown,
      likedKeys: musicLikedKeys,
      seed: Date.now() & 0xffffffff,
    });
    onPlayFile(shuffled[0]!, shown, source, { shuffle: true });
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
        renameSignal={renameSignal}
        onRename={(title) => renameVirtualPlaylist(record.id, title)}
        onBack={onBack}
      >
        <MusicPlaylistActionBar
          title={record.title}
          empty={tracks.length === 0}
          playing={playingHere}
          shuffleOn={musicShuffleOn}
          prefs={prefs}
          query={query}
          onPlay={handlePlay}
          onToggleShuffle={toggleMusicShuffle}
          onAddToQueue={() => shown.forEach((t) => enqueueManualQueue(t.path))}
          onRename={() => setRenameSignal((n) => n + 1)}
          onDelete={() => void handleDelete()}
          onPrefsChange={setPrefs}
          onQueryChange={setQuery}
        />
      </MusicPlaylistHeader>

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
        <div className="@container">
          <MusicPlaylistColumnHeader prefs={prefs} onSort={(key) => setPrefs(nextSortOnHeaderClick(prefs, key))} />
          <section className="px-6 pt-2">
            {shown.map((file, i) => (
              <MusicPlaylistTrackRow
                key={file.path}
                file={file}
                index={i}
                view={prefs.view}
                addedAt={addedAtFor(record, file.path)}
                isPlaying={playingFile?.path === file.path}
                selected={selectedPath === file.path}
                menuOpen={menu?.context.kind === "song" && menu.context.file.path === file.path}
                reorderable={reorderable}
                dragging={dragPath === file.path}
                dropIndicator={
                  dropPath === file.path && dragPath && dragPath !== file.path
                    ? dragIndex < i ? "below" : "above"
                    : null
                }
                onSelect={() => setSelectedPath(file.path)}
                onPlay={() => playFrom(file)}
                onContextMenu={(e) => setMenu({
                  context: { kind: "song", file },
                  x: e.clientX,
                  y: e.clientY,
                  onPlay: () => playFrom(file),
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
            {shown.length === 0 && (
              <p className="py-10 text-center text-sm text-white/60">
                Nothing in this playlist matches &ldquo;{query.trim()}&rdquo;.
              </p>
            )}
          </section>
        </div>
      )}

      <MusicPlaylistFinder
        libraryTracks={libraryTracks}
        playlistTracks={tracks}
        prominent={tracks.length === 0}
        autoFocus={tracks.length === 0 && !untouched}
        inPlaylist={(path) => recordHasPath(record, path)}
        onAdd={(file) => addToVirtualPlaylist(record.id, [file.path])}
      />

      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
