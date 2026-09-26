import type { MediaFile } from "@/types";
import { artistKeyFromFile } from "./musicArtist";

/** Small stable string hash so ties shuffle per refresh round without Math.random. */
function hash(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Library songs to suggest under a playlist, like Spotify's "Recommended":
 * songs by the playlist's artists rank first, then its albums, then the newest downloads.
 * Each refresh `round` shows the next page of the ranking.
 */
export function recommendForPlaylist(
  library: MediaFile[],
  playlistTracks: MediaFile[],
  round = 0,
  count = 10,
): MediaFile[] {
  const inPlaylist = new Set(playlistTracks.map((t) => t.path));
  const artistWeight = new Map<string, number>();
  const albums = new Set<string>();
  for (const t of playlistTracks) {
    const key = artistKeyFromFile(t);
    if (key) artistWeight.set(key, (artistWeight.get(key) ?? 0) + 1);
    if (t.album?.trim()) albums.add(t.album.trim().toLowerCase());
  }

  const scored = library
    .filter((t) => !inPlaylist.has(t.path))
    .map((t) => {
      const artist = artistWeight.get(artistKeyFromFile(t)) ?? 0;
      const album = t.album?.trim() && albums.has(t.album.trim().toLowerCase()) ? 1 : 0;
      return { t, score: artist * 3 + album * 2, created: t.created || 0, tie: hash(`${round}:${t.path}`) };
    });
  // Related songs keep their rank; the rest rotate by round so Refresh brings new ones.
  scored.sort((a, b) => b.score - a.score || b.created - a.created || a.tie - b.tie);

  const related = scored.filter((s) => s.score > 0);
  const rest = scored.filter((s) => s.score === 0);
  const ranked = [...related, ...rest];
  if (ranked.length <= count) return ranked.map((s) => s.t);
  const start = (round * count) % ranked.length;
  const page: MediaFile[] = [];
  for (let i = 0; i < count; i++) page.push(ranked[(start + i) % ranked.length].t);
  return page;
}
