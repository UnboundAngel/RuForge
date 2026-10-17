import { itemMediaType, type ArtistSort, type CompanionItem } from "./types";

export type GroupKind = "album" | "artist" | "collection";

export type Group = {
  key: string;
  kind: GroupKind;
  title: string;
  subtitle: string;
  items: CompanionItem[];
  cover: CompanionItem | null;
  year?: number | null;
};

const LONG_MIX_SECS = 20 * 60;

export const isAudio = (i: CompanionItem) => itemMediaType(i) === "audio";
export const isVideo = (i: CompanionItem) => itemMediaType(i) === "video";

/** First credited artist from a multi-artist tag; same split as desktop `primaryArtist`. */
export function primaryArtist(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.split(/,|&|\s+feat\.?\s+|\s+ft\.?\s+|\s+x\s+/i)[0]?.trim() ?? trimmed;
}

export function artistKeyOf(item: CompanionItem): string {
  return item.artist ? primaryArtist(item.artist).toLowerCase() : "";
}

/** Collapses "(Deluxe)" / "(Remastered)" variants like desktop `normalizeAlbumShelfKey`. */
function albumKeyOf(album: string): string {
  let s = album.trim();
  while (/\s*\([^)]*\)\s*$/.test(s)) s = s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return s.toLowerCase().replace(/[^a-z0-9\s]+/gi, " ").replace(/\s+/g, " ").trim();
}

export function byRecent(items: CompanionItem[]): CompanionItem[] {
  return [...items].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0) || a.title.localeCompare(b.title));
}

export function byTitle(items: CompanionItem[]): CompanionItem[] {
  return [...items].sort((a, b) => a.title.localeCompare(b.title));
}

export function byArtist(items: CompanionItem[]): CompanionItem[] {
  return [...items].sort(
    (a, b) => (a.artist ?? "\uffff").localeCompare(b.artist ?? "\uffff") || a.title.localeCompare(b.title),
  );
}

function byTrackNo(items: CompanionItem[]): CompanionItem[] {
  return [...items].sort((a, b) => (a.trackNo ?? 9999) - (b.trackNo ?? 9999) || a.title.localeCompare(b.title));
}

function coverOf(items: CompanionItem[]): CompanionItem | null {
  return items.find((i) => i.hasThumb) ?? items[0] ?? null;
}

function yearOf(items: CompanionItem[]): number | null {
  return items.find((i) => i.year)?.year ?? null;
}

export function countLabel(items: CompanionItem[]): string {
  const songs = items.filter(isAudio).length;
  const videos = items.length - songs;
  const parts: string[] = [];
  if (songs) parts.push(`${songs} ${songs === 1 ? "song" : "songs"}`);
  if (videos) parts.push(`${videos} ${videos === 1 ? "video" : "videos"}`);
  return parts.join(", ");
}

export function totalLabel(items: CompanionItem[]): string {
  const secs = items.reduce((n, i) => n + (i.durationSecs ?? 0), 0);
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

export function artistGroups(audio: CompanionItem[]): Group[] {
  const map = new Map<string, { name: string; items: CompanionItem[] }>();
  for (const item of audio) {
    const key = artistKeyOf(item);
    if (!key) continue;
    const entry = map.get(key);
    if (entry) entry.items.push(item);
    else map.set(key, { name: primaryArtist(item.artist!), items: [item] });
  }
  return [...map.entries()]
    .map(([key, { name, items }]) => ({
      key: `artist:${key}`,
      kind: "artist" as const,
      title: name,
      subtitle: `${items.length} ${items.length === 1 ? "song" : "songs"}`,
      items: byRecent(items),
      cover: coverOf(items),
    }))
    .sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title));
}

/** Multi-track releases only; a lone tagged download stays a standalone song, as on desktop. */
export function albumGroups(audio: CompanionItem[]): Group[] {
  const map = new Map<string, CompanionItem[]>();
  for (const item of audio) {
    const album = item.album?.trim();
    const artist = artistKeyOf(item);
    if (!album || !artist) continue;
    const key = `${artist}::${albumKeyOf(album)}`;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()]
    .filter(([, items]) => items.length >= 2)
    .map(([key, items]) => {
      const ordered = byTrackNo(items);
      const first = ordered[0]!;
      return {
        key: `album:${key}`,
        kind: "album" as const,
        title: first.album!.trim(),
        subtitle: first.artist ? primaryArtist(first.artist) : "Album",
        items: ordered,
        cover: coverOf(ordered),
        year: yearOf(items),
        newest: Math.max(...items.map((i) => i.addedAt ?? 0)),
      };
    })
    .sort((a, b) => b.newest - a.newest)
    .map(({ newest: _n, ...g }) => g);
}

/** Oldest first, like the desktop artist page. */
export function albumsByYear(albums: Group[]): Group[] {
  return [...albums].sort((a, b) => {
    if (a.year && b.year) return a.year - b.year;
    if (a.year) return -1;
    if (b.year) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function sortArtistSongs(items: CompanionItem[], albums: Group[], sort: ArtistSort): CompanionItem[] {
  if (sort === "recent") return byRecent(items);
  if (sort === "title") return byTitle(items);
  const inAlbums = albumsByYear(albums).flatMap((g) => g.items);
  const seen = new Set(inAlbums.map((i) => i.id));
  return [...inAlbums, ...byRecent(items.filter((i) => !seen.has(i.id)))];
}

export function collection(key: string, title: string, items: CompanionItem[]): Group {
  return { key: `collection:${key}`, kind: "collection", title, subtitle: countLabel(items), items, cover: coverOf(items) };
}

export function longMixes(audio: CompanionItem[]): CompanionItem[] {
  return audio.filter((i) => (i.durationSecs ?? 0) >= LONG_MIX_SECS);
}

export function addedAgo(unixSecs: number | undefined): string | null {
  if (!unixSecs) return null;
  const days = Math.floor((Date.now() / 1000 - unixSecs) / 86400);
  if (days < 1) return "added today";
  if (days < 2) return "added yesterday";
  if (days < 30) return `added ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `added ${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(days / 365);
  return `added ${years} ${years === 1 ? "year" : "years"} ago`;
}
