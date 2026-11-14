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
  indexWidth: number;
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
  excluded?: ReadonlySet<string>,
): PlaylistEnqueuePlan {
  const toDownload: PlaylistEnqueueItem[] = [];
  const duplicates: PlaylistDuplicateItem[] = [];
  const seen = new Set<string>();
  let index = 0;
  // Row position keys the per-row audio override (the preview list keys by row), so it stays
  // separate from `index`, which only counts items that can actually download.
  let row = 0;

  for (const item of playlistItems) {
    row += 1;
    const url = playlistItemWatchUrl(item);
    if (!url) continue;
    const itemKey = playlistItemKey(item, row);
    // Cancelled rows never reach numbering, so the kept videos stay contiguous.
    if (excluded?.has(itemKey)) continue;
    const k = normalizeYouTubeUrlForCompare(url);
    if (seen.has(k)) continue;
    seen.add(k);
    index += 1;

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
    indexWidth: playlistIndexWidth(seen.size),
  };
}

/** Digits of the playlist size, minimum 2, so "NN - title" file names sort at 100+ items. */
export function playlistIndexWidth(count: number): number {
  return Math.max(2, String(Math.max(0, Math.floor(count))).length);
}

function rowDisplayBytes(item: PlaylistItem, audio: boolean): number | null {
  const positive = (n: number | null | undefined) =>
    typeof n === "number" && n > 0 ? n : null;
  const legacy = positive(item.fileSizeBytes);
  return audio
    ? (positive(item.fileSizeBytesAudio) ?? legacy)
    : (positive(item.fileSizeBytesVideo) ?? legacy);
}

export type PlaylistSizeProgress = {
  /** Sum over the kept rows whose size is known so far. */
  bytes: number;
  known: number;
  /** Kept rows whose size could not be read. */
  failed: number;
  /** Kept rows in the list. */
  total: number;
};

/** Running size total over the kept rows; `known + failed < total` while sizes are still arriving. */
export function playlistSizeProgress(
  items: PlaylistItem[],
  overrides: Record<string, boolean>,
  defaultAudioOnly: boolean,
  excluded?: ReadonlySet<string>,
  failedIds?: ReadonlySet<string>,
): PlaylistSizeProgress {
  const out: PlaylistSizeProgress = { bytes: 0, known: 0, failed: 0, total: 0 };
  items.forEach((item, i) => {
    const key = playlistItemKey(item, i + 1);
    if (excluded?.has(key)) return;
    out.total += 1;
    const pick = rowDisplayBytes(
      item,
      resolveAudioOnlyForPlaylistItem(key, overrides, defaultAudioOnly),
    );
    if (pick != null) {
      out.bytes += pick;
      out.known += 1;
    } else if (item.id && failedIds?.has(item.id.trim())) {
      out.failed += 1;
    }
  });
  return out;
}

/** Total display bytes for the kept rows. Null until every kept row has one. */
export function sumPlaylistDisplayBytes(
  items: PlaylistItem[],
  overrides: Record<string, boolean>,
  defaultAudioOnly: boolean,
  excluded?: ReadonlySet<string>,
): number | null {
  const p = playlistSizeProgress(items, overrides, defaultAudioOnly, excluded);
  return p.total === 0 || p.known < p.total ? null : p.bytes;
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
