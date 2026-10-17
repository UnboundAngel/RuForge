import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import type { GalleryEntry, MediaFile } from "@/types";

/**
 * YouTube pages in the Explorer webviews can emit any app event, so a path arriving on one is
 * untrusted. UNC and device paths would make the backend touch a remote share (NTLM leak).
 */
export function isLocalAbsoluteMediaPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 4096) return false;
  if (path.includes("\0")) return false;
  if (/^[\\/]{2}/.test(path)) return false;
  if (/^[A-Za-z]:[\\/]/.test(path)) return true;
  return path.startsWith("/");
}

function optionalLocalPath(path: unknown): boolean {
  return path == null || isLocalAbsoluteMediaPath(path);
}

/** For windows without the library loaded: every path the player may hand to the backend must be local. */
export function isLocalMediaFilePayload(file: unknown): file is MediaFile {
  if (!file || typeof file !== "object") return false;
  const f = file as Partial<Record<keyof MediaFile, unknown>>;
  return (
    isLocalAbsoluteMediaPath(f.path) &&
    optionalLocalPath(f.thumbnailPath) &&
    optionalLocalPath(f.ruforgePosterPath) &&
    optionalLocalPath(f.subtitlePath) &&
    optionalLocalPath(f.embeddedCoverPath) &&
    (f.scrubSpritePaths == null ||
      (Array.isArray(f.scrubSpritePaths) && f.scrubSpritePaths.every(isLocalAbsoluteMediaPath)))
  );
}

export type KnownMediaSources = {
  entries: GalleryEntry[];
  files: Array<MediaFile | null | undefined>;
};

export function findKnownMediaFile(path: unknown, sources: KnownMediaSources): MediaFile | null {
  if (!isLocalAbsoluteMediaPath(path)) return null;
  for (const entry of sources.entries) {
    if (entry.kind === "media") {
      if (mediaPathsMatch(entry.path, path)) return entry;
      continue;
    }
    const hit = entry.items.find((item) => mediaPathsMatch(item.path, path));
    if (hit) return hit;
  }
  for (const file of sources.files) {
    if (file && mediaPathsMatch(file.path, path)) return file;
  }
  return null;
}

/** Explorer reload only ever goes to YouTube over https; anything else came from a page. */
export function isTrustedExplorerUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "youtube.com" || host.endsWith(".youtube.com");
  } catch {
    return false;
  }
}
