import type { GalleryEntry, SingleMediaEntry } from "@/types";

/**
 * Every playable file as a media entry, with playlist members lifted out. Progress-based views
 * (Continue watching, In progress, Watched) judge files, so a video inside a playlist counts.
 * Saved playlists repeat files that already exist, so paths dedupe.
 */
export function flattenToMediaEntries(entries: GalleryEntry[]): SingleMediaEntry[] {
  const seen = new Set<string>();
  const out: SingleMediaEntry[] = [];
  for (const entry of entries) {
    const files = entry.kind === "media" ? [entry] : entry.items.map((f): SingleMediaEntry => ({ ...f, kind: "media" }));
    for (const file of files) {
      const key = file.path.replace(/\//g, "\\").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(file);
    }
  }
  return out;
}
