import type { DragEvent } from "react";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import type { MediaFile } from "@/types";
import {
  isMusicPlaylistRecord,
  recordHasPath,
  type VirtualPlaylistRecord,
} from "@/virtualPlaylists";
import { primaryArtist } from "./musicArtist";

export const MUSIC_TRACK_DRAG_MIME = "application/x-ruforge-music-paths";

/** Music playlists, most recently touched first (matches the sidebar order). */
export function musicPlaylistRecords(records: VirtualPlaylistRecord[]): VirtualPlaylistRecord[] {
  return records
    .filter(isMusicPlaylistRecord)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export type ResolvedMusicPlaylist = {
  tracks: MediaFile[];
  missingPaths: string[];
};

/** Record order, audio only. Paths not in the library are reported so the view can offer cleanup. */
export function resolveMusicPlaylistTracks(
  record: VirtualPlaylistRecord,
  libraryTracks: MediaFile[],
): ResolvedMusicPlaylist {
  const byKey = new Map<string, MediaFile>();
  for (const t of libraryTracks) byKey.set(normalizePathKey(t.path), t);
  const tracks: MediaFile[] = [];
  const missingPaths: string[] = [];
  for (const item of record.items) {
    const hit = byKey.get(normalizePathKey(item.path));
    if (hit) tracks.push(hit);
    else missingPaths.push(item.path);
  }
  return { tracks, missingPaths };
}

function normalizePathKey(path: string): string {
  return path.replace(/\//g, "\\").toLowerCase();
}

export type PlaylistMembership = "all" | "some" | "none";

export function playlistMembership(
  record: VirtualPlaylistRecord,
  paths: string[],
): PlaylistMembership {
  if (paths.length === 0) return "none";
  let hits = 0;
  for (const p of paths) if (recordHasPath(record, p)) hits += 1;
  if (hits === 0) return "none";
  return hits === paths.length ? "all" : "some";
}

export function pathsMissingFromRecord(record: VirtualPlaylistRecord, paths: string[]): string[] {
  return paths.filter((p) => !record.items.some((i) => mediaPathsMatch(i.path, p)));
}

/** Case-insensitive match on title, artist, and album for the playlist builder search. */
export function filterTracksByQuery(tracks: MediaFile[], query: string, limit = 30): MediaFile[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: MediaFile[] = [];
  for (const t of tracks) {
    const hay = [t.name, t.artist ?? "", t.albumArtist ?? "", t.album ?? ""]
      .join(" ")
      .toLowerCase();
    if (hay.includes(q)) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export function trackArtistLabel(file: MediaFile): string {
  const raw = file.artist ?? file.albumArtist ?? "";
  return raw ? primaryArtist(raw) || raw : "";
}

export function setMusicTrackDragData(e: DragEvent, paths: string[]): void {
  if (paths.length === 0) return;
  e.dataTransfer.setData(MUSIC_TRACK_DRAG_MIME, JSON.stringify(paths));
  e.dataTransfer.effectAllowed = "copyMove";
}

export function hasMusicTrackDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(MUSIC_TRACK_DRAG_MIME);
}

export function readMusicTrackDragData(e: DragEvent): string[] {
  try {
    const parsed: unknown = JSON.parse(e.dataTransfer.getData(MUSIC_TRACK_DRAG_MIME));
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** Spread onto any track row so it can be dropped on a sidebar playlist. */
export function musicTrackDragProps(paths: string[]) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => setMusicTrackDragData(e, paths),
  };
}
