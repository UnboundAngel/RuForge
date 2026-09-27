import { useEffect, useMemo, useState } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { DEFAULT_MUSIC_PLAYLIST_TITLE, recordHasPath } from "@/virtualPlaylists";
import type { MediaFile } from "@/types";
import { MusicRowContextMenu, type MusicRowContextMenuState } from "./MusicRowContextMenu";
import { useQueueSourcePlayback } from "./useActiveQueueSource";
import { musicQueueSource, type MusicQueueSource } from "./musicQueueSource";
import { playlistCoverFile, resolveMusicPlaylistTracks } from "./musicPlaylists";
import { useMusicLibraryTracks, useMusicPlaylistRecords } from "./useMusicPlaylists";
import { MusicPlaylistHeader } from "./MusicPlaylistHeader";
import { MusicPlaylistColumnHeader, MusicPlaylistTrackRow } from "./MusicPlaylistTrackRow";
import { MusicPlaylistActionBar } from "./MusicPlaylistActionBar";
import { MusicPlaylistEditDetails } from "./MusicPlaylistEditDetails";
import { useExportPlaylistM3u8 } from "./useMusicPlaylistM3u8";
import { confirmDeleteMusicPlaylist } from "./musicPlaylistDelete";
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
  const renameVirtualPlaylist = useRuforgeStore((s) => s.renameVirtualPlaylist);
  const updateVirtualPlaylistDetails = useRuforgeStore((s) => s.updateVirtualPlaylistDetails);
  const exportM3u8 = useExportPlaylistM3u8();
  const deleteVirtualPlaylist = useRuforgeStore((s) => s.deleteVirtualPlaylist);
  const addToVirtualPlaylist = useRuforgeStore((s) => s.addToVirtualPlaylist);
  const removePathsFromVirtualPlaylist = useRuforgeStore((s) => s.removePathsFromVirtualPlaylist);
  const reorderVirtualPlaylistByPath = useRuforgeStore((s) => s.reorderVirtualPlaylistByPath);
  const enqueueManualQueue = useRuforgeStore((s) => s.enqueueManualQueue);
  const libraryTracks = useMusicLibraryTracks();
  const playlists = useMusicPlaylistRecords();
  const record = playlists.find((p) => p.id === playlistId) ?? null;
  const title = record?.title;
  const source = useMemo(() => (title != null ? musicQueueSource("playlist", title) : null), [title]);
  const [menu, setMenu] = useState<MusicRowContextMenuState | null>(null);
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropPath, setDropPath] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editFocus, setEditFocus] = useState<"title" | "description" | null>(null);
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
  const coverFile = useMemo(() => (record ? playlistCoverFile(record, tracks) : null), [record, tracks]);

  const shown = useMemo(
    () => (record ? filterPlaylistTracks(sortPlaylistTracks(tracks, record, prefs.sort, prefs.desc), query) : []),
    [tracks, record, prefs.sort, prefs.desc, query],
  );
  const sourcePlayback = useQueueSourcePlayback(source, shown, onPlayFile);

  if (!record || !source) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[color:var(--music-text-muted)]">
        This playlist no longer exists.
      </div>
    );
  }

  const untouched = record.items.length === 0 && UNTOUCHED_TITLE.test(record.title);
  const dragIndex = dragPath ? shown.findIndex((t) => t.path === dragPath) : -1;
  const reorderable = prefs.sort === "custom" && !prefs.desc && query.trim() === "";
  const playFrom = (file: MediaFile) => onPlayFile(file, shown, source);

  const handleDelete = async () => {
    if (await confirmDeleteMusicPlaylist(record, tracks, coverFile)) deleteVirtualPlaylist(record.id);
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
        description={record.description}
        onEditDescription={() => setEditFocus("description")}
        tracks={tracks}
        coverFile={coverFile}
        startEditing={untouched}
        onRename={(title) => renameVirtualPlaylist(record.id, title)}
        onBack={onBack}
      >
        <MusicPlaylistActionBar
          title={record.title}
          empty={tracks.length === 0}
          playing={sourcePlayback.playing}
          shuffleOn={sourcePlayback.shuffleOn}
          prefs={prefs}
          query={query}
          onPlay={sourcePlayback.play}
          onToggleShuffle={sourcePlayback.toggleShuffle}
          onAddToQueue={() => shown.forEach((t) => enqueueManualQueue(t.path))}
          onEditDetails={() => setEditFocus("title")}
          onExport={() => void exportM3u8(record.title, tracks)}
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
        playlistId={record.id}
        libraryTracks={libraryTracks}
        playlistTracks={tracks}
        prominent={tracks.length === 0}
        autoFocus={tracks.length === 0 && !untouched}
        inPlaylist={(path) => recordHasPath(record, path)}
        onAdd={(file) => addToVirtualPlaylist(record.id, [file.path])}
      />

      <MusicRowContextMenu menu={menu} onClose={() => setMenu(null)} />
      <MusicPlaylistEditDetails
        open={editFocus != null}
        focus={editFocus ?? "title"}
        title={record.title}
        description={record.description ?? ""}
        tracks={tracks}
        coverFile={coverFile}
        onSave={(details) => updateVirtualPlaylistDetails(record.id, details)}
        onClose={() => setEditFocus(null)}
      />
    </div>
  );
}
