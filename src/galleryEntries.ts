import { downloadJobDisplayFileSizeBytes } from "./downloadJobFileSizes";
import type { DownloadJob } from "./downloadQueue";
import { mediaPathsMatch } from "./lib/mediaPathMatch";
import type { GalleryEntry, MediaFile, PlaylistCollection, SingleMediaEntry } from "./types";
import { extractYouTubeVideoId } from "./youtubeUrl";

function pathBasename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function removePathFromGalleryEntries(
  entries: GalleryEntry[],
  path: string,
): GalleryEntry[] {
  const next: GalleryEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "media") {
      if (!mediaPathsMatch(entry.path, path)) next.push(entry);
      continue;
    }
    const items = entry.items.filter((item) => !mediaPathsMatch(item.path, path));
    if (items.length === 0) continue;
    if (items.length === entry.items.length) {
      next.push(entry);
      continue;
    }
    const combinedDuration = items.reduce((sum, item) => sum + (item.duration || 0), 0);
    const stackThumbnailPath =
      entry.stackThumbnailPath &&
      items.some(
        (item) =>
          item.thumbnailPath === entry.stackThumbnailPath ||
          item.ruforgePosterPath === entry.stackThumbnailPath,
      )
        ? entry.stackThumbnailPath
        : (items[0]?.ruforgePosterPath ?? items[0]?.thumbnailPath ?? null);
    next.push({
      ...entry,
      items,
      itemCount: items.length,
      combinedDuration,
      stackThumbnailPath,
    } satisfies PlaylistCollection);
  }
  return next;
}

export function upsertMediaIntoGalleryEntries(
  entries: GalleryEntry[],
  file: MediaFile,
): GalleryEntry[] {
  let replaced = false;
  const next = entries.map((entry) => {
    if (entry.kind === "media") {
      if (!mediaPathsMatch(entry.path, file.path)) return entry;
      replaced = true;
      return { ...file, kind: "media" as const } satisfies SingleMediaEntry;
    }
    let itemReplaced = false;
    const items = entry.items.map((item) => {
      if (!mediaPathsMatch(item.path, file.path)) return item;
      itemReplaced = true;
      replaced = true;
      return file;
    });
    if (!itemReplaced) return entry;
    const combinedDuration = items.reduce((sum, item) => sum + (item.duration || 0), 0);
    return {
      ...entry,
      items,
      itemCount: items.length,
      combinedDuration,
    } satisfies PlaylistCollection;
  });
  if (replaced) return next;
  return [{ ...file, kind: "media" as const }, ...next];
}

/** Build a gallery row from a finished download when `outputPath` is known. */
export function mediaFileFromDownloadFinish(
  outputPath: string | undefined,
  job: DownloadJob | undefined,
  sourceUrl: string | undefined,
): MediaFile | null {
  const path = outputPath?.trim();
  if (!path) return null;

  const url = (sourceUrl ?? job?.url ?? "").trim() || null;
  const meta = job?.metadata;
  const title = (job?.title ?? meta?.title ?? "").trim();
  const base = pathBasename(path);
  const audioOnly = job?.options?.audioOnly === true;
  const size =
    (meta ? downloadJobDisplayFileSizeBytes(meta, audioOnly) : null) ??
    meta?.fileSizeBytes ??
    0;

  return {
    name: title || base,
    path,
    size: typeof size === "number" && size > 0 ? size : 0,
    created: Math.floor(Date.now() / 1000),
    duration: typeof meta?.duration === "number" ? meta.duration : 0,
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: url,
    sourceId: url ? extractYouTubeVideoId(url) : null,
    playlistIndex: job?.options?.playlistIndex ?? null,
    artist: meta?.uploader ?? meta?.channel ?? null,
    album: null,
    albumArtist: null,
    trackNo: null,
    embeddedCoverPath: null,
  };
}
