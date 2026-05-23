import { normalizeChapters } from "./chapters";
import { normalizeDurationSeconds } from "./components/downloader/downloaderFormat";
import type { MediaFile } from "./types";

/**
 * Converts one JSON object from `scan_gallery` into our `MediaFile` shape (camelCase, matching Rust serde).
 */
export function mediaFileFromGalleryJson(o: Record<string, unknown>): MediaFile {
  const thumb = o.thumbnailPath ?? o.thumbnail_path;
  const poster = o.ruforgePosterPath ?? o.ruforge_poster_path;
  const sub = o.subtitlePath ?? o.subtitle_path;
  const hint = o.downloadMetadataHint ?? o.download_metadata_hint;

  const file: MediaFile = {
    name: String(o.name ?? ""),
    path: String(o.path ?? ""),
    size: Number(o.size ?? 0),
    created: Number(o.created ?? 0),
    duration: normalizeDurationSeconds(Number(o.duration ?? 0)),
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: typeof o.sourceUrl === "string" ? o.sourceUrl : null,
    sourceId:
      typeof o.sourceId === "string"
        ? o.sourceId
        : typeof o.source_id === "string"
          ? o.source_id
          : null,
    playlistIndex:
      typeof o.playlistIndex === "number"
        ? o.playlistIndex
        : typeof o.playlist_index === "number"
          ? o.playlist_index
          : null,
  };

  if (thumb != null && String(thumb) !== "") file.thumbnailPath = String(thumb);
  if (poster != null && String(poster) !== "") file.ruforgePosterPath = String(poster);
  if (sub != null && String(sub) !== "") file.subtitlePath = String(sub);
  if (hint != null && String(hint) !== "") file.downloadMetadataHint = String(hint);

  const rawChapters = Array.isArray(o.chapters) ? (o.chapters as MediaFile["chapters"]) : null;
  file.chapters =
    file.duration > 0
      ? normalizeChapters(rawChapters, file.duration)
      : rawChapters && rawChapters.length >= 2
        ? rawChapters
        : null;

  return file;
}

/**
 * `scan_gallery` returns `GalleryEntry[]`: `{ kind: "media", ...MediaFile }` or `{ kind: "playlist", items: [...] }`.
 */
export function flattenGalleryScanToMediaFiles(raw: unknown): MediaFile[] {
  if (!Array.isArray(raw)) return [];

  const out: MediaFile[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const kind = o.kind;

    if (kind === "media") {
      out.push(mediaFileFromGalleryJson(o));
    } else if (kind === "playlist") {
      const items = o.items;
      if (Array.isArray(items)) {
        for (const it of items) {
          if (it && typeof it === "object") {
            out.push(mediaFileFromGalleryJson(it as Record<string, unknown>));
          }
        }
      }
    } else if (kind === undefined && typeof o.path === "string") {
      // Legacy: flat rows without `kind` (treat as a single media row).
      out.push(mediaFileFromGalleryJson(o));
    }
  }
  return out;
}
