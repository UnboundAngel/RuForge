import type { MediaFile } from "@/types";
import { collectLikedCoverPaths } from "@/components/music/LikedSongsCover";
import { primaryArtist } from "@/components/music/musicArtist";
import {
  buildMultiTrackAlbumGroups,
  musicTrackIdentityKey,
  type AlbumGroup,
} from "@/components/music/musicShelfDedup";

export function playlistFolderKey(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  const match = normalized.match(/\/Playlists\/([^/]+)\//i);
  return match ? match[1]!.toLowerCase() : null;
}

export function playlistDisplayTitle(folderKey: string, samplePath: string): string {
  const normalized = samplePath.replace(/\\/g, "/");
  const match = normalized.match(/\/Playlists\/([^/]+)\//i);
  const raw = match ? match[1]! : folderKey;
  const title = raw.replace(/_/g, " ").trim();
  return title || folderKey;
}

export type RecentPlaylistGroup = {
  folderKey: string;
  title: string;
  tracks: MediaFile[];
  newestCreated: number;
  coverPaths: string[];
};

export type RecentAddedGroups = {
  playlists: RecentPlaylistGroup[];
  songs: MediaFile[];
  albums: AlbumGroup[];
};

/** Chronological home feed: multi-track playlists + singles, newest first. */
export type RecentFeedItem =
  | { kind: "playlist"; group: RecentPlaylistGroup }
  | { kind: "song"; file: MediaFile };

export type BuildRecentAddedOptions = {
  playlistLimit?: number;
  songLimit?: number;
  albumLimit?: number;
  /** Max items in the interleaved recently-added feed. */
  feedLimit?: number;
};

function sortTracksForPlaylist(tracks: MediaFile[]): MediaFile[] {
  return [...tracks].sort((a, b) => {
    const ia = a.playlistIndex ?? 9999;
    const ib = b.playlistIndex ?? 9999;
    if (ia !== ib) return ia - ib;
    return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" });
  });
}

export function groupPlaylistDownloads(tracks: MediaFile[]): RecentPlaylistGroup[] {
  const map = new Map<string, MediaFile[]>();
  for (const t of tracks) {
    const key = playlistFolderKey(t.path);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }

  const out: RecentPlaylistGroup[] = [];
  for (const [folderKey, rawTracks] of map) {
    const sorted = sortTracksForPlaylist(rawTracks);
    const newestCreated = Math.max(...sorted.map((t) => t.created));
    out.push({
      folderKey,
      title: playlistDisplayTitle(folderKey, sorted[0]!.path),
      tracks: sorted,
      newestCreated,
      coverPaths: collectLikedCoverPaths(sorted, 4),
    });
  }
  return out.sort((a, b) => b.newestCreated - a.newestCreated);
}

export function buildRecentAddedGroups(
  tracks: MediaFile[],
  opts: BuildRecentAddedOptions = {},
): RecentAddedGroups {
  const playlistLimit = opts.playlistLimit ?? 6;
  const songLimit = opts.songLimit ?? 12;
  const albumLimit = opts.albumLimit ?? 6;

  const allPlaylistGroups = groupPlaylistDownloads(tracks);
  // One-track "playlist" folders are singles that landed under Playlists/.
  const playlists = allPlaylistGroups
    .filter((g) => g.tracks.length > 1)
    .slice(0, playlistLimit);
  const singletonPlaylistTracks = allPlaylistGroups
    .filter((g) => g.tracks.length === 1)
    .map((g) => g.tracks[0]!);

  const playlistPaths = new Set<string>();
  for (const p of playlists) {
    for (const t of p.tracks) playlistPaths.add(t.path);
  }

  const albums = buildMultiTrackAlbumGroups(tracks, primaryArtist)
    .map((g) => ({
      group: g,
      newestCreated: Math.max(...g.tracks.map((t) => t.created)),
    }))
    .sort((a, b) => b.newestCreated - a.newestCreated)
    .slice(0, albumLimit)
    .map((x) => x.group);

  const albumPaths = new Set<string>();
  for (const g of albums) {
    for (const t of g.tracks) albumPaths.add(t.path);
  }

  const seen = new Set<string>();
  const songs: MediaFile[] = [];
  const songPool = [...singletonPlaylistTracks, ...tracks].sort(
    (a, b) => b.created - a.created,
  );
  for (const t of songPool) {
    if (playlistPaths.has(t.path) || albumPaths.has(t.path)) continue;
    const key = musicTrackIdentityKey(t, primaryArtist);
    if (seen.has(key)) continue;
    seen.add(key);
    songs.push(t);
    if (songs.length >= songLimit) break;
  }

  return { playlists, songs, albums };
}

export function buildRecentAddedFeed(
  groups: RecentAddedGroups,
  feedLimit = 12,
): RecentFeedItem[] {
  const items: { at: number; item: RecentFeedItem }[] = [
    ...groups.playlists.map((group) => ({
      at: group.newestCreated,
      item: { kind: "playlist" as const, group },
    })),
    ...groups.songs.map((file) => ({
      at: file.created,
      item: { kind: "song" as const, file },
    })),
  ];
  return items
    .sort((a, b) => b.at - a.at)
    .slice(0, feedLimit)
    .map((x) => x.item);
}
