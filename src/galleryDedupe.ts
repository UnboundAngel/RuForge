import type { GalleryEntry } from "./types";

/** Match Rust `strip_ytdlp_stream_suffix` (`Title.f399` → `Title`). */
export function stripYtdlpStreamSuffix(stem: string): string {
  const dotF = stem.lastIndexOf(".f");
  if (dotF < 0) return stem;
  const tail = stem.slice(dotF + 2);
  if (!tail) return stem;
  if (/^[\d.\-]+$/.test(tail)) return stem.slice(0, dotF);
  return stem;
}

function normalizeGroupTitle(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Same grouping as Rust `media_library_group_key` for cross-folder library merge. */
export function galleryEntryGroupKey(entry: GalleryEntry): string | null {
  if (entry.kind !== "media") return null;
  const f = entry;
  const id = f.sourceId?.trim();
  if (id) return `id:${id}`;
  const url = f.sourceUrl?.trim();
  if (url) return `url:${url}`;

  const path = (f.path ?? "").replace(/\\/g, "/");
  const slash = path.lastIndexOf("/");
  const parent = slash >= 0 ? path.slice(0, slash) : "";
  const file = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = file.lastIndexOf(".");
  const stem = dot >= 0 ? file.slice(0, dot) : file;
  const base = stripYtdlpStreamSuffix(stem);
  const title = normalizeGroupTitle(
    f.name?.trim() && f.name.trim() !== stem ? f.name : base,
  );
  return `stem:${parent}|${title}`;
}

export function galleryEntryKeepScore(entry: GalleryEntry): number {
  if (entry.kind !== "media") return 0;
  const f = entry;
  const path = (f.path ?? "").replace(/\\/g, "/");
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
  let score = 0;
  if (ext === "mp4" || ext === "mkv" || ext === "webm") score += 2_000_000_000;
  else if (ext) score += 500_000_000;
  if (Number.isFinite(f.duration) && f.duration > 0) {
    score += Math.min(Math.floor(f.duration), 50_000_000);
  }
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  const stem = dot >= 0 ? file.slice(0, dot) : file;
  if (stripYtdlpStreamSuffix(stem) !== stem) score -= 1_500_000_000;
  score += Math.min(f.size ?? 0, 1_000_000_000);
  return score;
}

/** Collapse duplicate cards when internal + external dirs both contain the same video. */
export function dedupeGalleryEntriesCombined(entries: GalleryEntry[]): GalleryEntry[] {
  const bestByKey = new Map<string, { entry: GalleryEntry; score: number }>();
  const keyOrder: string[] = [];
  const passthrough: GalleryEntry[] = [];

  for (const entry of entries) {
    const key = galleryEntryGroupKey(entry);
    if (!key) {
      passthrough.push(entry);
      continue;
    }
    const score = galleryEntryKeepScore(entry);
    const prev = bestByKey.get(key);
    if (!prev) {
      keyOrder.push(key);
      bestByKey.set(key, { entry, score });
      continue;
    }
    if (score > prev.score) {
      bestByKey.set(key, { entry, score });
    }
  }

  const out: GalleryEntry[] = [...passthrough];
  for (const key of keyOrder) {
    const row = bestByKey.get(key);
    if (row) out.push(row.entry);
  }
  return out;
}
