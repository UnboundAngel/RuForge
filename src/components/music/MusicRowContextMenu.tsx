import { useMemo } from "react";
import { ListVideo, FolderOpen, User, Disc3, Play, Music2, Heart } from "lucide-react";
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

export type MusicMenuContext =
  | { kind: "song"; file: MediaFile }
  | { kind: "artist"; artistKey: string; displayName: string }
  | { kind: "album"; artistKey: string; albumKey: string; displayName: string; artistName?: string };

export type MusicRowContextMenuState = {
  context: MusicMenuContext;
  x: number;
  y: number;
  /** Caller-provided play action: play this song / play all by artist / play album. */
  onPlay?: () => void;
};

type Props = {
  menu: MusicRowContextMenuState | null;
  onClose: () => void;
};

export function MusicRowContextMenu({ menu, onClose }: Props) {
  const enqueueManualQueue = useRuforgeStore((s) => s.enqueueManualQueue);
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

  if (!menu) return null;

  const { context } = menu;
  const icon = MUSIC_MENU_ICON_SIZE;
  const menuAriaLabel =
    context.kind === "song"
      ? `Actions for ${context.file.name}`
      : `Actions for ${context.displayName}`;

  function act(fn: () => void) {
    return () => {
      fn();
      onClose();
    };
  }

  let measureKey = String(menu.x);
  let body: React.ReactNode;

  if (context.kind === "song") {
    const { file } = context;
    const artistKey = artistKeyFromFile(file);
    const albumKey = albumKeyFromFile(file);
    const hasArtist = !!artistKey;
    const hasAlbum = fileHasBrowsableAlbum(file, libraryTracks);
    const liked = musicLikedKeys.includes(musicTrackIdentityKey(file, primaryArtist));
    measureKey = `${file.path}:${liked}:${hasArtist}:${hasAlbum}:${menu.onPlay ? 1 : 0}`;

    body = (
      <>
        <MusicMenuSection label="Playback" tone={MUSIC_MENU_TONES.playback}>
          {menu.onPlay && (
            <MusicMenuRow
              tone={MUSIC_MENU_TONES.playback}
              label="Play"
              icon={<Play size={icon} strokeWidth={2.25} />}
              onClick={act(menu.onPlay)}
            />
          )}
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

        <MusicMenuSection label="Queue" tone={MUSIC_MENU_TONES.queue}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.queue}
            label="Add to queue"
            icon={<ListVideo size={icon} strokeWidth={2.25} />}
            onClick={act(() => enqueueManualQueue(file.path))}
          />
        </MusicMenuSection>

        <MusicMenuSection label="Go to" tone={MUSIC_MENU_TONES.navigate}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.navigate}
            label="Song"
            icon={<Music2 size={icon} strokeWidth={2.25} />}
            onClick={act(() => openMusicSong(file.path))}
          />
          {hasArtist && (
            <MusicMenuRow
              tone={MUSIC_MENU_TONES.navigate}
              label="Artist"
              icon={<User size={icon} strokeWidth={2.25} />}
              onClick={act(() => openMusicArtist(artistKey))}
            />
          )}
          {hasAlbum && (
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
      </>
    );
  } else if (context.kind === "artist") {
    measureKey = `${context.artistKey}:${menu.onPlay ? 1 : 0}`;
    body = (
      <>
        <MusicMenuSection label="Playback" tone={MUSIC_MENU_TONES.playback}>
          {menu.onPlay && (
            <MusicMenuRow
              tone={MUSIC_MENU_TONES.playback}
              label="Play all"
              icon={<Play size={icon} strokeWidth={2.25} />}
              onClick={act(menu.onPlay)}
            />
          )}
        </MusicMenuSection>
        <MusicMenuSection label="Go to" tone={MUSIC_MENU_TONES.navigate}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.navigate}
            label="Artist"
            icon={<User size={icon} strokeWidth={2.25} />}
            onClick={act(() => openMusicArtist(context.artistKey))}
          />
        </MusicMenuSection>
      </>
    );
  } else {
    measureKey = `${context.albumKey}:${context.artistKey}:${menu.onPlay ? 1 : 0}`;
    body = (
      <>
        <MusicMenuSection label="Playback" tone={MUSIC_MENU_TONES.playback}>
          {menu.onPlay && (
            <MusicMenuRow
              tone={MUSIC_MENU_TONES.playback}
              label="Play album"
              icon={<Play size={icon} strokeWidth={2.25} />}
              onClick={act(menu.onPlay)}
            />
          )}
        </MusicMenuSection>
        <MusicMenuSection label="Go to" tone={MUSIC_MENU_TONES.navigate}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.navigate}
            label="Album"
            icon={<Disc3 size={icon} strokeWidth={2.25} />}
            onClick={act(() => openMusicAlbum(context.artistKey, context.albumKey))}
          />
          {context.artistKey && (
            <MusicMenuRow
              tone={MUSIC_MENU_TONES.navigate}
              label="Artist"
              icon={<User size={icon} strokeWidth={2.25} />}
              onClick={act(() => openMusicArtist(context.artistKey))}
            />
          )}
        </MusicMenuSection>
      </>
    );
  }

  return (
    <MusicFloatingMenu
      open
      x={menu.x}
      y={menu.y}
      onClose={onClose}
      ariaLabel={menuAriaLabel}
      measureKey={measureKey}
    >
      {body}
    </MusicFloatingMenu>
  );
}
