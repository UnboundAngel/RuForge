import { useMemo } from "react";
import {
  Pause,
  Play,
  Heart,
  SkipBack,
  SkipForward,
  ListVideo,
  Music2,
  User,
  Disc3,
  Minimize2,
  FolderOpen,
} from "lucide-react";
import { albumKeyFromFile, fileHasBrowsableAlbum, musicTrackIdentityKey } from "./musicShelfDedup";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { isAudioOnlyPath } from "@/mediaKind";
import type { MediaFile } from "@/types";
import { openInFileManager } from "@/openInFileManager";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { artistKeyFromFile, primaryArtist } from "./musicArtist";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
} from "./musicMenuUi";

export type MusicExpandedContextMenuState = {
  x: number;
  y: number;
};

type Props = {
  menu: MusicExpandedContextMenuState | null;
  file: MediaFile | null;
  paused: boolean;
  currentTime: number;
  hasPrevInQueue: boolean;
  hasNextInQueue: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onSkipPrev: () => void;
  onSkipNext: () => void;
  onOpenQueue: () => void;
  onCollapse: () => void;
};

export function MusicExpandedContextMenu({
  menu,
  file,
  paused,
  currentTime,
  hasPrevInQueue,
  hasNextInQueue,
  onClose,
  onTogglePlay,
  onSkipPrev,
  onSkipNext,
  onOpenQueue,
  onCollapse,
}: Props) {
  const toggleMusicLike = useRuforgeStore((s) => s.toggleMusicLike);
  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);
  const openMusicAlbum = useRuforgeStore((s) => s.openMusicAlbum);
  const openMusicSong = useRuforgeStore((s) => s.openMusicSong);
  const entries = useRuforgeStore((s) => s.entries);
  const libraryTracks = useMemo(
    () => flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path)),
    [entries],
  );

  if (!menu || !file) return null;

  const artistKey = artistKeyFromFile(file);
  const albumKey = albumKeyFromFile(file);
  const hasArtistKey = !!artistKey;
  const hasAlbumKey = fileHasBrowsableAlbum(file, libraryTracks);
  const liked = musicLikedKeys.includes(musicTrackIdentityKey(file, primaryArtist));
  const canSkipPrev = hasPrevInQueue || currentTime > 3;
  const canSkipNext = hasNextInQueue;
  const icon = MUSIC_MENU_ICON_SIZE;

  function act(fn: () => void) {
    return () => {
      fn();
      onClose();
    };
  }

  return (
    <MusicFloatingMenu
      open
      x={menu.x}
      y={menu.y}
      onClose={onClose}
      ariaLabel={`Now playing actions for ${file.name}`}
      measureKey={`${file.path}:${paused}:${liked}:${hasArtistKey}:${hasAlbumKey}:${canSkipPrev}:${canSkipNext}`}
    >
      <MusicMenuSection label="Playback" tone={MUSIC_MENU_TONES.playback}>
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.playback}
          label={paused ? "Resume" : "Pause"}
          icon={paused ? <Play size={icon} strokeWidth={2.25} /> : <Pause size={icon} strokeWidth={2.25} />}
          onClick={act(onTogglePlay)}
        />
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.playback}
          label={liked ? "Unlike" : "Like"}
          active={liked}
          icon={
            <Heart
              size={icon}
              strokeWidth={2.25}
              fill={liked ? "currentColor" : "none"}
            />
          }
          onClick={act(() => toggleMusicLike(file))}
        />
      </MusicMenuSection>

      <MusicMenuSection label="Skip" tone={MUSIC_MENU_TONES.transport}>
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.transport}
          label="Previous"
          icon={<SkipBack size={icon} strokeWidth={2.25} />}
          disabled={!canSkipPrev}
          onClick={canSkipPrev ? act(onSkipPrev) : undefined}
        />
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.transport}
          label="Next"
          icon={<SkipForward size={icon} strokeWidth={2.25} />}
          disabled={!canSkipNext}
          onClick={canSkipNext ? act(onSkipNext) : undefined}
        />
      </MusicMenuSection>

      <MusicMenuSection label="Player" tone={MUSIC_MENU_TONES.player}>
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.player}
          label="Open queue"
          icon={<ListVideo size={icon} strokeWidth={2.25} />}
          onClick={act(onOpenQueue)}
        />
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.player}
          label="Collapse"
          icon={<Minimize2 size={icon} strokeWidth={2.25} />}
          onClick={act(onCollapse)}
        />
      </MusicMenuSection>

      <MusicMenuSection label="Go to" tone={MUSIC_MENU_TONES.navigate}>
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.navigate}
          label="Song"
          icon={<Music2 size={icon} strokeWidth={2.25} />}
          onClick={act(() => openMusicSong(file.path))}
        />
        {hasArtistKey && (
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.navigate}
            label="Artist"
            icon={<User size={icon} strokeWidth={2.25} />}
            onClick={act(() => openMusicArtist(artistKey))}
          />
        )}
        {hasAlbumKey && (
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.navigate}
            label="Album"
            icon={<Disc3 size={icon} strokeWidth={2.25} />}
            onClick={act(() => openMusicAlbum(artistKey, albumKey))}
          />
        )}
      </MusicMenuSection>

      <MusicMenuSection label="File" tone={MUSIC_MENU_TONES.file}>
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.file}
          label="Show in folder"
          icon={<FolderOpen size={icon} strokeWidth={2.25} />}
          onClick={act(() => void openInFileManager(file.path))}
        />
      </MusicMenuSection>
    </MusicFloatingMenu>
  );
}
