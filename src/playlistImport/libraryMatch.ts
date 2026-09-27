import type { MediaFile } from "@/types";
import { rawArtistFromFile } from "@/components/music/musicArtist";
import { normalizeText } from "./normalize";
import type { ImportTrack } from "./parseImport";
import { coreTitle } from "./scoreMatches";

function fileTitle(file: MediaFile): string {
  return file.canonicalTitle ?? file.name.replace(/\.[^.]+$/, "");
}

/**
 * A library song that is clearly this row: same core title, an artist in common, and a
 * length within 5 s when the row has one. Exact matches only; anything fuzzier goes to search.
 */
export function findInLibrary(source: ImportTrack, library: MediaFile[]): MediaFile | null {
  const title = normalizeText(coreTitle(source.title));
  if (!title) return null;
  const artists = source.artists.map(normalizeText).filter(Boolean);
  // Title alone is too loose to claim a library file; search plus the video id check covers these rows.
  if (!artists.length) return null;
  for (const f of library) {
    const ft = normalizeText(coreTitle(fileTitle(f)));
    const bare = ft.startsWith(`${artists[0]} `) ? ft.slice(artists[0].length + 1) : ft;
    if (ft !== title && bare !== title) continue;
    const credit = ` ${normalizeText(rawArtistFromFile(f))} `;
    if (!artists.some((a) => credit.includes(` ${a} `))) continue;
    if (source.durationSec != null && f.duration > 0 && Math.abs(f.duration - source.durationSec) > 5) continue;
    return f;
  }
  return null;
}
