import type { MediaFile } from "@/types";
import { primaryArtist } from "./musicArtist";
import { musicTrackIdentityKey } from "./musicShelfDedup";
import { pickSmartNextTrack } from "./musicSmartShuffle";

export const MUSIC_ENDLESS_LOOKAHEAD = 12;

export type MusicEndlessPoolArgs = {
  libraryAudio: MediaFile[];
  folderAudioPlaylist: MediaFile[];
  current: MediaFile;
  /** True after endless has extended the live playlist; blocks folder-as-pool. */
  endlessExtended: boolean;
};

export function selectMusicEndlessPool(args: MusicEndlessPoolArgs): MediaFile[] {
  const inFolder = args.folderAudioPlaylist.some((f) => f.path === args.current.path);
  if (
    !args.endlessExtended &&
    args.folderAudioPlaylist.length > 1 &&
    inFolder
  ) {
    return args.folderAudioPlaylist;
  }
  return args.libraryAudio;
}

export function remainingQueueCount(
  playlistIndex: number,
  playlistLength: number,
  manualQueueLength: number,
): number {
  const ahead =
    playlistIndex >= 0 ? Math.max(0, playlistLength - playlistIndex - 1) : 0;
  return ahead + Math.max(0, manualQueueLength);
}

export type MusicEndlessPickArgs = MusicEndlessPoolArgs & {
  likedKeys?: string[];
  sessionRecentKeys?: string[];
  seed?: number;
  effectivePlaylist: MediaFile[];
  endlessFromIndex?: number | null;
};

export type MusicEndlessPickResult = {
  next: MediaFile;
  folderAudioPlaylistAfter: MediaFile[];
  endlessExtended: true;
  endlessFromIndex: number;
};

function playlistBase(args: {
  current: MediaFile;
  folderAudioPlaylist: MediaFile[];
  effectivePlaylist: MediaFile[];
}): MediaFile[] {
  if (args.folderAudioPlaylist.some((f) => f.path === args.current.path)) {
    return [...args.folderAudioPlaylist];
  }
  if (args.effectivePlaylist.length > 0) {
    return [...args.effectivePlaylist];
  }
  return [...args.folderAudioPlaylist];
}

export function resolveMusicEndlessNext(
  args: MusicEndlessPickArgs,
): MusicEndlessPickResult | null {
  const inLibrary = args.libraryAudio.some((f) => f.path === args.current.path);
  const inFolder = args.folderAudioPlaylist.some((f) => f.path === args.current.path);
  if (!inLibrary && !inFolder) return null;

  const pool = selectMusicEndlessPool(args);
  if (pool.length === 0) return null;

  const next = pickSmartNextTrack({
    pool,
    current: args.current,
    likedKeys: args.likedKeys,
    sessionRecentKeys: args.sessionRecentKeys,
    seed: args.seed,
  });
  if (!next) return null;

  const base = playlistBase(args);
  const alreadyQueued = base.some((f) => f.path === next.path);
  const folderAudioPlaylistAfter = alreadyQueued ? [...base] : [...base, next];
  const endlessFromIndex = args.endlessFromIndex ?? base.length;

  return {
    next,
    folderAudioPlaylistAfter,
    endlessExtended: true,
    endlessFromIndex,
  };
}

export type MusicEndlessLookaheadArgs = MusicEndlessPoolArgs & {
  likedKeys?: string[];
  sessionRecentKeys?: string[];
  seed?: number;
  effectivePlaylist: MediaFile[];
  playlistIndex: number;
  manualQueueLength: number;
  endlessFromIndex: number | null;
  lookahead?: number;
};

export type MusicEndlessLookaheadResult = {
  folderAudioPlaylistAfter: MediaFile[];
  endlessExtended: true;
  endlessFromIndex: number;
};

export function ensureMusicEndlessLookahead(
  args: MusicEndlessLookaheadArgs,
): MusicEndlessLookaheadResult | null {
  const inLibrary = args.libraryAudio.some((f) => f.path === args.current.path);
  const inFolder = args.folderAudioPlaylist.some((f) => f.path === args.current.path);
  if (!inLibrary && !inFolder) return null;

  const lookahead = args.lookahead ?? MUSIC_ENDLESS_LOOKAHEAD;
  const playlist = playlistBase(args);
  const idx =
    args.playlistIndex >= 0
      ? args.playlistIndex
      : playlist.findIndex((f) => f.path === args.current.path);

  let remaining = remainingQueueCount(idx, playlist.length, args.manualQueueLength);
  if (remaining >= lookahead) return null;

  const startLen = playlist.length;
  let endlessFromIndex = args.endlessFromIndex;
  const recentKeys = [
    ...(args.sessionRecentKeys ?? []),
    ...playlist.map((f) => musicTrackIdentityKey(f, primaryArtist)),
  ];
  let seed = args.seed ?? (Date.now() & 0xffffffff);

  while (remaining < lookahead) {
    const tip = playlist[playlist.length - 1] ?? args.current;
    const pool = args.libraryAudio.filter(
      (f) => !playlist.some((p) => p.path === f.path),
    );
    if (pool.length === 0) break;

    const next = pickSmartNextTrack({
      pool,
      current: tip,
      likedKeys: args.likedKeys,
      sessionRecentKeys: recentKeys,
      seed: seed++,
    });
    if (!next) break;

    if (endlessFromIndex == null) endlessFromIndex = playlist.length;
    playlist.push(next);
    recentKeys.push(musicTrackIdentityKey(next, primaryArtist));
    remaining += 1;
  }

  if (playlist.length === startLen || endlessFromIndex == null) return null;

  return {
    folderAudioPlaylistAfter: playlist,
    endlessExtended: true,
    endlessFromIndex,
  };
}
