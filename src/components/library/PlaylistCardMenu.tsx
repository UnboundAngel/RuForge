import { FolderOpen, FolderOutput, Layers, Play, RotateCcw, Shuffle, Trash2 } from "lucide-react";
import type { PlaylistCollection } from "@/types";
import { openInFileManager } from "@/openInFileManager";
import { usePlaylistSession, playlistResume, playlistShuffle, playlistStartOver } from "@/lib/playlistSession";
import { isVirtualPlaylistPath } from "@/virtualPlaylists";
import { useRuforgeStore } from "@/store/ruforgeStore";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
} from "@/components/music/musicMenuUi";
import { canDeletePlaylist, deletePlaylistWithConfirm } from "./deletePlaylist";

/** Right-click menu of a playlist card. Playback goes through the season API so progress is tracked. */
export function PlaylistCardMenu({
  playlist,
  x,
  y,
  onClose,
  onOpen,
}: {
  playlist: PlaylistCollection;
  x: number;
  y: number;
  onClose: () => void;
  onOpen: (playlist: PlaylistCollection) => void;
}) {
  const openExportPanel = useRuforgeStore((s) => s.openExportPanel);
  const session = usePlaylistSession(playlist.path);
  const virtual = isVirtualPlaylistPath(playlist.path);
  const icon = MUSIC_MENU_ICON_SIZE;
  const empty = playlist.items.length === 0;
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <MusicFloatingMenu
      open
      x={x}
      y={y}
      placement="cursor"
      theme="library"
      onClose={onClose}
      ariaLabel={`Actions for ${playlist.title}`}
      measureKey={`${playlist.path}:${session.started}`}
    >
      <MusicMenuSection label="Playback" tone={MUSIC_MENU_TONES.playback}>
        {session.started ? (
          <>
            <MusicMenuRow
              tone={MUSIC_MENU_TONES.playback}
              label="Resume where you left off"
              disabled={empty}
              icon={<Play size={icon} strokeWidth={2.25} />}
              onClick={act(() => playlistResume(playlist.path))}
            />
            <MusicMenuRow
              tone={MUSIC_MENU_TONES.playback}
              label="Start over"
              disabled={empty}
              icon={<RotateCcw size={icon} strokeWidth={2.25} />}
              onClick={act(() => playlistStartOver(playlist.path))}
            />
          </>
        ) : (
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playback}
            label="Play all"
            disabled={empty}
            icon={<Play size={icon} strokeWidth={2.25} />}
            onClick={act(() => playlistStartOver(playlist.path))}
          />
        )}
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.playback}
          label="Shuffle"
          disabled={empty}
          icon={<Shuffle size={icon} strokeWidth={2.25} />}
          onClick={act(() => playlistShuffle(playlist.path))}
        />
      </MusicMenuSection>
      <MusicMenuSection label="Go to" tone={MUSIC_MENU_TONES.navigate}>
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.navigate}
          label="Open playlist"
          icon={<Layers size={icon} strokeWidth={2.25} />}
          onClick={act(() => onOpen(playlist))}
        />
      </MusicMenuSection>
      <MusicMenuSection label="File" tone={MUSIC_MENU_TONES.file}>
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.file}
          label="Export"
          icon={<FolderOutput size={icon} strokeWidth={2.25} />}
          onClick={act(() => openExportPanel({ paths: playlist.items.map((i) => i.path), label: playlist.title }))}
        />
        {!virtual && (
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.file}
            label="Open folder"
            icon={<FolderOpen size={icon} strokeWidth={2.25} />}
            onClick={act(() => void openInFileManager(playlist.path))}
          />
        )}
        {canDeletePlaylist(playlist) && (
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.file}
            label="Delete playlist"
            variant="danger"
            icon={<Trash2 size={icon} strokeWidth={2.25} />}
            onClick={act(() => void deletePlaylistWithConfirm(playlist))}
          />
        )}
      </MusicMenuSection>
    </MusicFloatingMenu>
  );
}
