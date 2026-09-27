import { bestCoverPath } from "@/mediaKind";
import type { MediaFile } from "@/types";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import { primaryArtist } from "./musicArtist";
import { playlistCoverFile } from "./musicPlaylists";
import { buildMultiTrackAlbumGroups } from "./musicShelfDedup";

export type LibraryHit =
  | { kind: "song"; key: string; score: number; file: MediaFile; title: string; artist: string; thumb: string | null }
  | { kind: "playlist"; key: string; score: number; id: string; title: string; count: number; thumb: string | null }
  | { kind: "album"; key: string; score: number; artistKey: string; albumKey: string; title: string; artist: string; thumb: string | null }
  | { kind: "artist"; key: string; score: number; artistKey: string; title: string; thumb: string | null };

const LIMITS = { song: 4, playlist: 3, album: 3, artist: 3 } as const;
/** Ties go to the broader target: typing an artist's exact name means the artist, not one of their songs. */
const KIND_ORDER = { playlist: 0, artist: 1, album: 2, song: 3 } as const;

const stripExt = (name: string) => name.replace(/\.[^/.]+$/, "");

/** 0 = no match. Exact beats prefix beats word start beats substring. */
export function matchScore(text: string, needle: string): number {
  const t = text.toLowerCase();
  if (!needle || !t.includes(needle)) return 0;
  if (t === needle) return 4;
  if (t.startsWith(needle)) return 3;
  if (t.includes(` ${needle}`)) return 2;
  return 1;
}

export function searchMusicLibrary(
  query: string,
  tracks: MediaFile[],
  playlists: VirtualPlaylistRecord[],
): LibraryHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const pathKey = (p: string) => p.replace(/\//g, "\\").toLowerCase();
  const byPath = new Map(tracks.map((t) => [pathKey(t.path), t]));

  const songs: LibraryHit[] = [];
  const artists = new Map<string, LibraryHit>();
  for (const t of tracks) {
    const title = stripExt(t.name);
    const artist = primaryArtist(t.artist ?? t.albumArtist ?? "");
    const songScore = Math.max(matchScore(title, needle), matchScore(artist, needle) * 0.5);
    if (songScore > 0) {
      songs.push({ kind: "song", key: `song:${t.path}`, score: songScore, file: t, title, artist, thumb: bestCoverPath(t) });
    }
    const artistKey = artist.toLowerCase();
    if (artist && !artists.has(artistKey)) {
      const s = matchScore(artist, needle);
      if (s > 0) {
        artists.set(artistKey, { kind: "artist", key: `artist:${artistKey}`, score: s, artistKey, title: artist, thumb: bestCoverPath(t) });
      }
    }
  }

  const albums: LibraryHit[] = [];
  for (const g of buildMultiTrackAlbumGroups(tracks, primaryArtist)) {
    const s = matchScore(g.album, needle);
    if (s === 0) continue;
    albums.push({
      kind: "album",
      key: `album:${g.artistKey}::${g.albumKey}`,
      score: s,
      artistKey: g.artistKey,
      albumKey: g.albumKey,
      title: g.album,
      artist: g.artist,
      thumb: g.tracks[0] ? bestCoverPath(g.tracks[0]) : null,
    });
  }

  const lists: LibraryHit[] = [];
  for (const p of playlists) {
    const s = matchScore(p.title, needle);
    if (s === 0) continue;
    const listTracks = p.items.flatMap((i) => byPath.get(pathKey(i.path)) ?? []);
    const cover = playlistCoverFile(p, listTracks) ?? listTracks[0];
    lists.push({
      kind: "playlist",
      key: `playlist:${p.id}`,
      score: s,
      id: p.id,
      title: p.title,
      count: p.items.length,
      thumb: cover ? bestCoverPath(cover) : null,
    });
  }

  const rank = (a: LibraryHit, b: LibraryHit) => b.score - a.score || KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  const top = (hits: LibraryHit[], n: number) => hits.sort(rank).slice(0, n);
  return [
    ...top(songs, LIMITS.song),
    ...top(lists, LIMITS.playlist),
    ...top(albums, LIMITS.album),
    ...top([...artists.values()], LIMITS.artist),
  ].sort(rank);
}
