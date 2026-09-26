import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Disc3,
  FolderOpen,
  Heart,
  Image,
  ListMinus,
  ListPlus,
  ListVideo,
  Music2,
  Play,
  User,
} from "lucide-react";
import { albumKeyFromFile, fileHasBrowsableAlbum, musicTrackIdentityKey } from "./musicShelfDedup";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { isAudioOnlyPath } from "@/mediaKind";
import type { MediaFile } from "@/types";
import { openInFileManager } from "@/openInFileManager";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { artistKeyFromFile, fileMatchesArtistKey, primaryArtist } from "./musicArtist";
import { MusicAddToPlaylistMenu } from "./MusicAddToPlaylistMenu";
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
  /** Set when the row lives inside a music playlist, enabling remove / set cover. */
  playlistId?: string;
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
  const removeFromVirtualPlaylist = useRuforgeStore((s) => s.removeFromVirtualPlaylist);
  const setVirtualPlaylistThumbnail = useRuforgeStore((s) => s.setVirtualPlaylistThumbnail);
  const [pickerPaths, setPickerPaths] = useState<string[] | null>(null);
  const entries = useRuforgeStore((s) => s.entries);
  const libraryTracks = useMemo(
    () => flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path)),
    [entries],
  );

  useEffect(() => {
    setPickerPaths(null);
  }, [menu]);

  if (!menu) return null;

  if (pickerPaths) {
    return (
      <MusicAddToPlaylistMenu
        paths={pickerPaths}
        x={menu.x}
        y={menu.y}
        onClose={() => {
          setPickerPaths(null);
          onClose();
        }}
      />
    );
  }

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

  const contextPaths =
    context.kind === "song"
      ? [context.file.path]
      : context.kind === "artist"
        ? libraryTracks.filter((f) => fileMatchesArtistKey(f, context.artistKey)).map((f) => f.path)
        : libraryTracks
            .filter(
              (f) =>
                artistKeyFromFile(f) === context.artistKey.trim().toLowerCase()
                && albumKeyFromFile(f) === context.albumKey.trim().toLowerCase(),
            )
            .map((f) => f.path);
  const { playlistId } = menu;

  const playlistSection = (
    <MusicMenuSection label="Playlist" tone={MUSIC_MENU_TONES.playlist}>
      <MusicMenuRow
        tone={MUSIC_MENU_TONES.playlist}
        label="Add to playlist"
        icon={<ListPlus size={icon} strokeWidth={2.25} />}
        onClick={contextPaths.length > 0 ? () => setPickerPaths(contextPaths) : undefined}
        trailing={<ChevronRight size={12} className="shrink-0 text-white/35" aria-hidden />}
      />
      {playlistId && context.kind === "song" && (
        <>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playlist}
            label="Remove from this playlist"
            icon={<ListMinus size={icon} strokeWidth={2.25} />}
            onClick={act(() => removeFromVirtualPlaylist(playlistId, context.file.path))}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playlist}
            label="Use as playlist cover"
            icon={<Image size={icon} strokeWidth={2.25} />}
            onClick={act(() => setVirtualPlaylistThumbnail(playlistId, context.file.path))}
          />
        </>
      )}
    </MusicMenuSection>
  );

  if (context.kind === "song") {
    const { file } = context;
    const artistKey = artistKeyFromFile(file);
    const albumKey = albumKeyFromFile(file);
    const hasArtist = !!artistKey;
    const hasAlbum = fileHasBrowsableAlbum(file, libraryTracks);
    const liked = musicLikedKeys.includes(musicTrackIdentityKey(file, primaryArtist));
    measureKey = `${file.path}:${liked}:${hasArtist}:${hasAlbum}:${menu.onPlay ? 1 : 0}:${playlistId ?? ""}`;

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

        {playlistSection}

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
        {playlistSection}
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
        {playlistSection}
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
