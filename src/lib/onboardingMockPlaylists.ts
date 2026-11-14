import type { GalleryEntry, MediaFile, PlaylistCollection } from "@/types";
import { isAudioOnlyPath } from "@/mediaKind";
import { moveInList } from "@/components/playlist-detail/playlistRows";
import { DEMO_PLAYLIST_PATH } from "@/lib/demoPlaylistPath";
import { videoItemKey } from "@/lib/playlistSession/itemKey";

/** Demo content for the video-playlists tour. Pure builders only; nothing here touches storage. */

export { DEMO_PLAYLIST_PATH, isDemoPlaylistPath } from "@/lib/demoPlaylistPath";
export const DEMO_PLAYLIST_TITLE = "Starter mix";

/** Videos on disk before the demo borrows the user's own files instead of placeholders. */
export const DEMO_MIN_REAL_VIDEOS = 4;
const DEMO_REAL_COUNT = 5;
/** A playlist this size already shows the reorder and Suggested parts of the tour. */
export const DEMO_REAL_PLAYLIST_MIN_VIDEOS = 3;

function isVideoPlaylist(entry: GalleryEntry): entry is PlaylistCollection {
  return (
    entry.kind === "playlist" &&
    entry.items.filter((f) => !isAudioOnlyPath(f.path)).length >= DEMO_REAL_PLAYLIST_MIN_VIDEOS
  );
}

/** The demo stands in only when the user has nothing to try the tour on, or the debug preview forces it. */
export function shouldShowDemoPlaylist(
  mock: { kind: string | null; forced: boolean },
  entries: readonly GalleryEntry[],
): boolean {
  if (mock.kind !== "video-playlists") return false;
  return mock.forced || !entries.some(isVideoPlaylist);
}

const PLACEHOLDERS: ReadonlyArray<readonly [string, number]> = [
  ["Why this tiny engine keeps winning", 612],
  ["A week of slow travel in Japan", 1485],
  ["Building a desk from scratch", 933],
  ["Ten minute ambient set", 604],
  ["How the northern lights form", 758],
];

function placeholderItems(now: number): MediaFile[] {
  return PLACEHOLDERS.map(([title, duration], i) => ({
    name: `${title}.mp4`,
    path: `ruforge-demo://clip-${i + 1}.mp4`,
    size: 0,
    created: now - i * 86_400,
    duration,
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    // No sourceId or url: a made-up id would send the Suggested shelf looking up videos that do not exist.
    sourceUrl: null,
    sourceId: null,
  }));
}

/** The user's newest downloads when there are enough, else placeholders. */
export function pickDemoItems(library: readonly MediaFile[], nowSeconds = Math.floor(Date.now() / 1000)): MediaFile[] {
  const videos = library.filter((f) => !isAudioOnlyPath(f.path) && f.duration > 0);
  if (videos.length < DEMO_MIN_REAL_VIDEOS) return placeholderItems(nowSeconds);
  return [...videos].sort((a, b) => b.created - a.created).slice(0, DEMO_REAL_COUNT);
}

export function buildDemoPlaylist(items: readonly MediaFile[]): PlaylistCollection {
  const first = items[0];
  return {
    kind: "playlist",
    title: DEMO_PLAYLIST_TITLE,
    path: DEMO_PLAYLIST_PATH,
    itemCount: items.length,
    combinedDuration: items.reduce((sum, f) => sum + f.duration, 0),
    stackThumbnailPath: first?.thumbnailPath || first?.ruforgePosterPath || null,
    items: [...items],
  };
}

/** Moves the row `fromKey` into the slot of `toKey`, like the real reorder. */
export function reorderDemoItems(items: readonly MediaFile[], fromKey: string, toKey: string): MediaFile[] {
  const from = items.findIndex((f) => videoItemKey(f) === fromKey);
  const to = items.findIndex((f) => videoItemKey(f) === toKey);
  if (from < 0 || to < 0) return [...items];
  return moveInList([...items], from, to);
}
