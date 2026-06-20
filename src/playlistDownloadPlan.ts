import { normalizeDurationSeconds } from "./components/downloader/downloaderFormat";
import {
  findLibraryMatchForPlaylistItem,
  type DuplicateMatch,
} from "./duplicateDownload";
import type { DownloadJobMediaSnapshot } from "./downloadQueue";
import { snapshotWithResolvedFileSize } from "./downloadJobFileSizes";
import type { GalleryEntry, PlaylistItem } from "./types";
import {
  extractYouTubePlaylistId,
  normalizeYouTubeUrlForCompare,
  playlistItemWatchUrl,
} from "./youtubeUrl";

export type PlaylistEnqueueItem = {
  url: string;
  title: string;
  audioOnly: boolean;
  index: number;
  itemKey: string;
};

export type PlaylistDuplicateItem = {
  url: string;
  title: string;
  index: number;
  match: DuplicateMatch;
};

export type PlaylistEnqueuePlan = {
  toDownload: PlaylistEnqueueItem[];
  duplicates: PlaylistDuplicateItem[];
  totalResolved: number;
};

export function playlistItemKey(item: PlaylistItem, index: number): string {
  const watch = playlistItemWatchUrl(item);
  if (watch) return normalizeYouTubeUrlForCompare(watch);
  const id = item.id?.trim();
  if (id) return `youtube:${id}`;
  return `playlist-row:${index}`;
}

export function resolveAudioOnlyForPlaylistItem(
  itemKey: string,
  overrides: Record<string, boolean>,
  defaultAudioOnly: boolean,
): boolean {
  if (Object.prototype.hasOwnProperty.call(overrides, itemKey)) {
    return overrides[itemKey] === true;
  }
  return defaultAudioOnly;
}

export function buildPlaylistEnqueuePlan(
  playlistItems: PlaylistItem[],
  entries: GalleryEntry[],
  overrides: Record<string, boolean>,
  defaultAudioOnly: boolean,
  skipDuplicatesAutomatically: boolean,
): PlaylistEnqueuePlan {
  const toDownload: PlaylistEnqueueItem[] = [];
  const duplicates: PlaylistDuplicateItem[] = [];
  const seen = new Set<string>();
  let index = 0;

  for (const item of playlistItems) {
    index += 1;
    const url = playlistItemWatchUrl(item);
    if (!url) continue;
    const k = normalizeYouTubeUrlForCompare(url);
    if (seen.has(k)) continue;
    seen.add(k);

    const itemKey = playlistItemKey(item, index);
    const audioOnly = resolveAudioOnlyForPlaylistItem(
      itemKey,
      overrides,
      defaultAudioOnly,
    );
    const title = item.title?.trim() || "Unknown";
    const duplicate = findLibraryMatchForPlaylistItem(item, entries);
    if (duplicate) {
      duplicates.push({ url, title, index, match: duplicate });
      if (skipDuplicatesAutomatically) continue;
      toDownload.push({ url, title, audioOnly, index, itemKey });
      continue;
    }
    toDownload.push({ url, title, audioOnly, index, itemKey });
  }

  return {
    toDownload,
    duplicates,
    totalResolved: seen.size,
  };
}

/** Sum display bytes for playlist hero from per-row estimates and audio mode. */
export function sumPlaylistDisplayBytes(
  items: PlaylistItem[],
  overrides: Record<string, boolean>,
  defaultAudioOnly: boolean,
): number | null {
  let sum = 0;
  let any = false;
  items.forEach((item, i) => {
    const key = playlistItemKey(item, i + 1);
    const audio = resolveAudioOnlyForPlaylistItem(key, overrides, defaultAudioOnly);
    const audioB =
      typeof item.fileSizeBytesAudio === "number" && item.fileSizeBytesAudio > 0
        ? item.fileSizeBytesAudio
        : null;
    const videoB =
      typeof item.fileSizeBytesVideo === "number" && item.fileSizeBytesVideo > 0
        ? item.fileSizeBytesVideo
        : null;
    const legacy =
      typeof item.fileSizeBytes === "number" && item.fileSizeBytes > 0
        ? item.fileSizeBytes
        : null;
    const pick = audio
      ? (audioB ?? legacy)
      : (videoB ?? legacy);
    if (typeof pick === "number" && pick > 0) {
      sum += pick;
      any = true;
    }
  });
  return any ? sum : null;
}

export function isPlaylistDownloaderUrl(url: string): boolean {
  return extractYouTubePlaylistId(url) !== null;
}

function findPlaylistItemForWatchUrl(
  watchUrl: string,
  items: PlaylistItem[],
): PlaylistItem | null {
  const key = normalizeYouTubeUrlForCompare(watchUrl);
  for (const item of items) {
    const itemUrl = playlistItemWatchUrl(item);
    if (!itemUrl) continue;
    if (normalizeYouTubeUrlForCompare(itemUrl) === key) return item;
  }
  return null;
}

function snapshotFromPlaylistItem(
  item: PlaylistItem,
  audioOnly: boolean,
): DownloadJobMediaSnapshot | null {
  const thumbnail = item.thumbnail?.trim() ?? "";
  if (!thumbnail) return null;

  const audio =
    typeof item.fileSizeBytesAudio === "number" && item.fileSizeBytesAudio > 0
      ? item.fileSizeBytesAudio
      : null;
  const video =
    typeof item.fileSizeBytesVideo === "number" && item.fileSizeBytesVideo > 0
      ? item.fileSizeBytesVideo
      : null;
  const legacy =
    typeof item.fileSizeBytes === "number" && item.fileSizeBytes > 0
      ? item.fileSizeBytes
      : null;
  const fileSizeBytesAudio = audio ?? (audioOnly ? legacy : null);
  const fileSizeBytesVideo = video ?? (!audioOnly ? legacy : null);
  const fileSizeBytes = audioOnly
    ? (fileSizeBytesAudio ?? legacy)
    : (fileSizeBytesVideo ?? legacy);

  const snap: DownloadJobMediaSnapshot = {
    title: item.title?.trim() || "Unknown",
    thumbnail,
    duration: normalizeDurationSeconds(item.duration),
    fileSizeBytes,
    fileSizeBytesAudio,
    fileSizeBytesVideo,
    isPlaylist: false,
  };
  return snapshotWithResolvedFileSize(snap, audioOnly);
}

/** Hero playlist row metadata for queue enqueue; same URL keying as `buildPlaylistEnqueuePlan`. */
export function downloadJobSnapshotFromPlaylistItems(
  watchUrl: string,
  items: PlaylistItem[],
  audioOnly: boolean,
): DownloadJobMediaSnapshot | null {
  const item = findPlaylistItemForWatchUrl(watchUrl, items);
  if (!item) return null;
  return snapshotFromPlaylistItem(item, audioOnly);
}
