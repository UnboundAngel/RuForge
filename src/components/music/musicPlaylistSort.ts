import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import type { MediaFile } from "@/types";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";

export type PlaylistSortKey = "custom" | "title" | "artist" | "album" | "added" | "duration";
export type PlaylistViewMode = "list" | "compact";

export type PlaylistViewPrefs = {
  sort: PlaylistSortKey;
  desc: boolean;
  view: PlaylistViewMode;
};

export const DEFAULT_PLAYLIST_VIEW_PREFS: PlaylistViewPrefs = { sort: "custom", desc: false, view: "list" };

export const PLAYLIST_SORT_LABELS: Record<PlaylistSortKey, string> = {
  custom: "Custom order",
  title: "Title",
  artist: "Artist",
  album: "Album",
  added: "Date added",
  duration: "Duration",
};

const PREFS_KEY = "ruforge-music-playlist-view";

export function trackTitle(file: MediaFile): string {
  return file.canonicalTitle ?? file.name;
}

export function trackAlbum(file: MediaFile): string {
  return file.canonicalAlbum ?? file.album ?? "";
}

/** Full artist credit for playlist rows ("A, B"), unlike the primary-artist label used for grouping. */
export function trackArtistCredit(file: MediaFile): string {
  return file.canonicalArtist ?? file.artist ?? file.albumArtist ?? "";
}

export function addedAtFor(record: VirtualPlaylistRecord, path: string): number {
  return record.items.find((i) => mediaPathsMatch(i.path, path))?.addedAt ?? 0;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Custom order is the record order; every other key is a stable sort over it. */
export function sortPlaylistTracks(
  tracks: MediaFile[],
  record: VirtualPlaylistRecord,
  sort: PlaylistSortKey,
  desc: boolean,
): MediaFile[] {
  if (sort === "custom") return desc ? [...tracks].reverse() : tracks;
  const compare = (a: MediaFile, b: MediaFile): number => {
    switch (sort) {
      case "title":
        return collator.compare(trackTitle(a), trackTitle(b));
      case "artist":
        return collator.compare(trackArtistCredit(a), trackArtistCredit(b));
      case "album":
        return collator.compare(trackAlbum(a), trackAlbum(b));
      case "added":
        return addedAtFor(record, a.path) - addedAtFor(record, b.path);
      case "duration":
        return (a.duration || 0) - (b.duration || 0);
    }
  };
  return tracks
    .map((t, i) => ({ t, i }))
    .sort((x, y) => (desc ? -compare(x.t, y.t) : compare(x.t, y.t)) || x.i - y.i)
    .map(({ t }) => t);
}

/** Column header clicks cycle ascending, descending, then back to custom order (Spotify behavior). */
export function nextSortOnHeaderClick(prefs: PlaylistViewPrefs, key: PlaylistSortKey): PlaylistViewPrefs {
  if (prefs.sort !== key) return { ...prefs, sort: key, desc: false };
  if (!prefs.desc) return { ...prefs, desc: true };
  return { ...prefs, sort: "custom", desc: false };
}

export function readPlaylistViewPrefs(id: string): PlaylistViewPrefs {
  try {
    const all = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Record<string, Partial<PlaylistViewPrefs>>;
    const raw = all[id];
    if (!raw) return DEFAULT_PLAYLIST_VIEW_PREFS;
    return {
      sort: raw.sort && raw.sort in PLAYLIST_SORT_LABELS ? raw.sort : "custom",
      desc: raw.desc === true,
      view: raw.view === "compact" ? "compact" : "list",
    };
  } catch {
    return DEFAULT_PLAYLIST_VIEW_PREFS;
  }
}

export function writePlaylistViewPrefs(id: string, prefs: PlaylistViewPrefs): void {
  try {
    const all = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Record<string, PlaylistViewPrefs>;
    all[id] = prefs;
    localStorage.setItem(PREFS_KEY, JSON.stringify(all));
  } catch {
    /* view prefs are a convenience */
  }
}

/** Case-insensitive filter over title, artist, and album for "Search in playlist". */
export function filterPlaylistTracks(tracks: MediaFile[], query: string): MediaFile[] {
  const q = query.trim().toLowerCase();
  if (!q) return tracks;
  return tracks.filter((t) =>
    [trackTitle(t), t.name, trackArtistCredit(t), trackAlbum(t)].join(" ").toLowerCase().includes(q),
  );
}

/** Spotify's "Date added" cell: relative for the last month, then "Mar 21, 2025". */
export function formatDateAdded(ts: number, now = Date.now()): string {
  if (!ts) return "";
  const mins = Math.floor((now - ts) / 60_000);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (mins < 1) return "just now";
  if (mins < 60) return plural(mins, "minute");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return plural(hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return plural(days, "day");
  if (days < 28) return plural(Math.floor(days / 7), "week");
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
