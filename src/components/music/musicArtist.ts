import type { MediaFile } from "@/types";

/** First credited artist from a multi-artist tag string. */
export function primaryArtist(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.split(/,|&|\s+feat\.?\s+|\s+ft\.?\s+|\s+x\s+/i)[0]?.trim() ?? trimmed;
}

function artistFromPathOrStem(stem: string): string {
  if (stem.includes(" - ")) return stem.split(" - ")[0].trim();
  return "";
}

/** Artist string resolved via canonical sidecar first, then tags, then filename heuristic. */
export function rawArtistFromFile(file: MediaFile): string {
  if (file.canonicalArtist?.trim()) return file.canonicalArtist.trim();
  if (file.albumArtist?.trim()) return file.albumArtist.trim();
  if (file.artist?.trim()) return file.artist.trim();
  const fromName = artistFromPathOrStem(file.name);
  if (fromName) return fromName;
  const path = file.path.replace(/\\/g, "/");
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const stem = fileName.replace(/\.[^.]+$/, "");
  return artistFromPathOrStem(stem);
}

/** Canonical key used by Home shelves and artist detail matching. */
export function artistKeyFromFile(file: MediaFile): string {
  const raw = rawArtistFromFile(file);
  return raw ? primaryArtist(raw).toLowerCase() : "";
}

export function fileMatchesArtistKey(file: MediaFile, artistKey: string): boolean {
  const key = artistKey.trim().toLowerCase();
  if (!key) return false;
  const raw = rawArtistFromFile(file);
  if (!raw) return false;
  return primaryArtist(raw).toLowerCase() === key;
}
