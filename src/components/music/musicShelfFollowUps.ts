import type { MediaFile } from "@/types";
import { artistKeyFromFile } from "./musicArtist";
import type { OutsideTrack } from "./musicOutsideRecommend";

/**
 * Spotify's Recommended shelf: adding a card slips two similar songs in right behind it.
 * The shelf is one ordered list mixing library songs and YouTube Music songs.
 */
export type ShelfItem = { kind: "local"; file: MediaFile } | { kind: "outside"; track: OutsideTrack };

/** How many similar songs one add brings in. */
export const FOLLOW_UP_COUNT = 2;

export function shelfKey(item: ShelfItem): string {
  return item.kind === "local" ? item.file.path : `yt:${item.track.videoId}`;
}

/**
 * Library songs like `added`: same artist first, then same album, newest download breaking ties.
 * Songs with nothing in common are left out; the caller tops up from YouTube Music instead.
 */
export function similarLibrarySongs(
  added: MediaFile,
  library: MediaFile[],
  exclude: (key: string) => boolean,
  count = FOLLOW_UP_COUNT,
): MediaFile[] {
  const artist = artistKeyFromFile(added);
  const album = added.album?.trim().toLowerCase() || "";
  return library
    .filter((t) => t.path !== added.path && !exclude(t.path))
    .map((t) => {
      const sameArtist = artist !== "" && artistKeyFromFile(t) === artist ? 3 : 0;
      const sameAlbum = album !== "" && t.album?.trim().toLowerCase() === album ? 2 : 0;
      return { t, score: sameArtist + sameAlbum };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (b.t.created || 0) - (a.t.created || 0))
    .slice(0, count)
    .map((s) => s.t);
}

/**
 * The shelf in display order: each base card, then (depth first) whatever its add brought in.
 * Follow-ups wait until their card is `gone` (added, downloaded, done loading) and then take its slot,
 * so a download in progress never has songs piling up beside it.
 */
export function layoutShelf(
  base: ShelfItem[],
  followUps: ReadonlyMap<string, ShelfItem[]>,
  gone: (item: ShelfItem) => boolean,
): ShelfItem[] {
  const out: ShelfItem[] = [];
  const seen = new Set<string>();
  const place = (item: ShelfItem) => {
    const key = shelfKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    if (!gone(item)) {
      out.push(item);
      return;
    }
    for (const next of followUps.get(key) ?? []) place(next);
  };
  base.forEach(place);
  return out;
}

/** Every key the shelf holds, shown or gone, so follow-ups never repeat a card. */
export function shelfKeys(base: ShelfItem[], followUps: ReadonlyMap<string, ShelfItem[]>): Set<string> {
  const keys = new Set(base.map(shelfKey));
  for (const items of followUps.values()) for (const item of items) keys.add(shelfKey(item));
  return keys;
}
