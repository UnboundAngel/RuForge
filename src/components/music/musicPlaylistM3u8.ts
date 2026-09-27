import type { MediaFile } from "@/types";
import { primaryArtist, rawArtistFromFile } from "./musicArtist";
import { trackTitle as sortTitle } from "./musicPlaylistSort";

export type M3u8Entry = {
  /** Absolute path (relative lines are resolved against the playlist file's folder). */
  path: string;
  /** Seconds from `#EXTINF`, or null when absent or -1. */
  duration: number | null;
  artist: string | null;
  title: string | null;
};

export type ParsedM3u8 = { name: string | null; entries: M3u8Entry[] };

function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}

function trackArtist(file: MediaFile): string {
  return rawArtistFromFile(file);
}

function trackTitle(file: MediaFile): string {
  return sortTitle(file)?.trim() || stemOf(file.path);
}

/** Extended M3U with absolute paths and `#EXTINF:<secs>,Artist - Title`, CRLF for Windows players. */
export function serializeM3u8(tracks: MediaFile[], playlistTitle: string): string {
  const lines = ["#EXTM3U", `#PLAYLIST:${oneLine(playlistTitle)}`];
  for (const t of tracks) {
    const secs = t.duration && t.duration > 0 ? Math.round(t.duration) : -1;
    const artist = oneLine(trackArtist(t));
    const title = oneLine(trackTitle(t));
    lines.push(`#EXTINF:${secs},${artist ? `${artist} - ${title}` : title}`);
    lines.push(t.path);
  }
  return `${lines.join("\r\n")}\r\n`;
}

function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(0, i) : "";
}

function stemOf(path: string): string {
  const base = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function isAbsolute(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\\\");
}

function fromFileUrl(line: string): string {
  let rest = line.replace(/^file:\/\//i, "");
  // file:///C:/x -> C:/x ; file:///home/x -> /home/x
  if (/^\/[a-zA-Z]:[\\/]/.test(rest)) rest = rest.slice(1);
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

function resolvePath(line: string, baseDir: string): string {
  const raw = /^file:\/\//i.test(line) ? fromFileUrl(line) : line;
  if (isAbsolute(raw) || !baseDir) return raw;
  const sep = baseDir.includes("\\") ? "\\" : "/";
  const parts = baseDir.split(/[\\/]/);
  for (const seg of raw.split(/[\\/]/)) {
    if (seg === "..") {
      if (parts.length > 1) parts.pop();
    } else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join(sep);
}

function parseExtinf(rest: string): Omit<M3u8Entry, "path"> {
  const comma = rest.indexOf(",");
  const head = comma >= 0 ? rest.slice(0, comma) : rest;
  const label = comma >= 0 ? rest.slice(comma + 1).trim() : "";
  // The duration may be followed by attributes (tvg-id="..."), so read only the leading number.
  const secs = Number.parseFloat(head.trim());
  const duration = Number.isFinite(secs) && secs > 0 ? secs : null;
  const dash = label.indexOf(" - ");
  if (dash > 0) {
    return { duration, artist: label.slice(0, dash).trim() || null, title: label.slice(dash + 3).trim() || null };
  }
  return { duration, artist: null, title: label || null };
}

/** Lenient: accepts plain M3U, a BOM, CRLF, `file://` URLs, and paths relative to `m3uPath`. */
export function parseM3u8(text: string, m3uPath = ""): ParsedM3u8 {
  const baseDir = dirOf(m3uPath);
  let name: string | null = null;
  let info: Omit<M3u8Entry, "path"> | null = null;
  const entries: M3u8Entry[] = [];
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      if (/^#PLAYLIST:/i.test(line)) name = line.slice(10).trim() || null;
      else if (/^#EXTINF:/i.test(line)) info = parseExtinf(line.slice(8));
      continue;
    }
    if (/^https?:\/\//i.test(line)) {
      info = null;
      continue;
    }
    entries.push({ path: resolvePath(line, baseDir), ...(info ?? { duration: null, artist: null, title: null }) });
    info = null;
  }
  return { name, entries };
}

export function playlistNameFromPath(path: string): string {
  return stemOf(path).trim() || "Imported playlist";
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function pathKey(path: string): string {
  return path.replace(/\//g, "\\").toLowerCase();
}

/** Songs keyed the way `musicTrackIdentityKey` spells artist+title matches, minus the id prefixes. */
function songKey(artist: string | null | undefined, title: string | null | undefined): string {
  return `${norm(primaryArtist(artist ?? "") || artist)}|${norm(title)}`;
}

export function importSummary(title: string, matched: number, unmatched: number): string {
  const songs = `${matched} ${matched === 1 ? "song" : "songs"}`;
  if (unmatched === 0) return `Imported ${songs} into ${title}`;
  const miss = `${unmatched} ${unmatched === 1 ? "line" : "lines"} not in your library`;
  return `Imported ${songs} into ${title}. ${miss}.`;
}

export type M3u8MatchResult = { paths: string[]; unmatched: number };

/**
 * Path first (the playlist came from this machine), then artist+title, then filename stem
 * (a copy in another folder), then a title that names exactly one library song.
 */
export function matchM3u8Entries(entries: M3u8Entry[], library: MediaFile[]): M3u8MatchResult {
  const byPath = new Map<string, MediaFile>();
  const bySong = new Map<string, MediaFile>();
  const byStem = new Map<string, MediaFile>();
  const byTitle = new Map<string, MediaFile | null>();
  for (const f of library) {
    byPath.set(pathKey(f.path), f);
    const title = trackTitle(f);
    const sk = songKey(rawArtistFromFile(f), title);
    if (!bySong.has(sk)) bySong.set(sk, f);
    const stem = norm(stemOf(f.path));
    if (stem && !byStem.has(stem)) byStem.set(stem, f);
    const tk = norm(title);
    if (tk) byTitle.set(tk, byTitle.has(tk) ? null : f);
  }

  const paths: string[] = [];
  const seen = new Set<string>();
  let unmatched = 0;
  for (const e of entries) {
    const stem = norm(stemOf(e.path));
    const hit =
      byPath.get(pathKey(e.path)) ??
      (e.title && e.artist ? bySong.get(songKey(e.artist, e.title)) : undefined) ??
      (stem ? byStem.get(stem) : undefined) ??
      (e.title ? byTitle.get(norm(e.title)) ?? undefined : undefined);
    if (!hit) {
      unmatched += 1;
      continue;
    }
    const k = pathKey(hit.path);
    if (seen.has(k)) continue;
    seen.add(k);
    paths.push(hit.path);
  }
  return { paths, unmatched };
}
