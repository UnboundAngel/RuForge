import type { MediaFile } from "@/types";
import { primaryArtist } from "./musicArtist";
import { musicTrackIdentityKey } from "./musicShelfDedup";

export type LikedTrackRecord = {
  identityKey: string;
  path: string;
  likedAt: number;
};

const LS_KEY = "ruforge-music-liked-tracks";

function trackKey(file: MediaFile): string {
  return musicTrackIdentityKey(file, primaryArtist);
}

function load(): LikedTrackRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LikedTrackRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(records: LikedTrackRecord[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(records));
  } catch {
    // storage unavailable
  }
}

export function loadLikedIdentityKeys(): string[] {
  return load().map((r) => r.identityKey);
}

export function isTrackLiked(file: MediaFile): boolean {
  const key = trackKey(file);
  return load().some((r) => r.identityKey === key);
}

/** Toggle like; returns true when liked after toggle. */
export function toggleTrackLike(file: MediaFile): boolean {
  const key = trackKey(file);
  const entries = load();
  const idx = entries.findIndex((r) => r.identityKey === key);
  if (idx >= 0) {
    entries.splice(idx, 1);
    save(entries);
    return false;
  }
  entries.unshift({ identityKey: key, path: file.path, likedAt: Date.now() });
  save(entries);
  return true;
}

/** Liked library files, newest like first. Drops records with no matching file. */
export function resolveLikedFiles(files: MediaFile[]): MediaFile[] {
  const records = load().sort((a, b) => b.likedAt - a.likedAt);
  const byKey = new Map<string, MediaFile>();
  const byPath = new Map<string, MediaFile>();
  for (const f of files) {
    byKey.set(trackKey(f), f);
    byPath.set(f.path, f);
  }
  const out: MediaFile[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    if (seen.has(r.identityKey)) continue;
    const file = byKey.get(r.identityKey) ?? byPath.get(r.path);
    if (!file) continue;
    seen.add(r.identityKey);
    out.push(file);
  }
  return out;
}
