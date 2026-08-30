import { invoke } from "@tauri-apps/api/core";

export interface LyricsSidecar {
  schemaVersion: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  fetchedAt: string;
  matchedTrackName?: string | null;
  matchedArtistName?: string | null;
  source: string;
}

export interface LyricsEnsureResult {
  sidecar: LyricsSidecar;
  fromCache: boolean;
  matchStep: string;
  durationSecs?: number | null;
  durationSource: string;
  matchedDuration?: number | null;
  candidateIndex?: number | null;
}

export type LyricsLine = {
  time: number;
  text: string;
};

export type LyricsPayload =
  | { kind: "synced"; lines: LyricsLine[] }
  | { kind: "plain"; text: string }
  | { kind: "empty"; sidecar: LyricsSidecar | null };

const LRC_LINE =
  /^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/;

export function parseSyncedLyrics(raw: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  for (const row of raw.split(/\r?\n/)) {
    const trimmed = row.trim();
    if (!trimmed) continue;
    const m = LRC_LINE.exec(trimmed);
    if (!m) continue;
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const frac = m[3] ?? "0";
    const fracSec =
      frac.length === 1
        ? Number(frac) / 10
        : frac.length === 2
          ? Number(frac) / 100
          : Number(frac.padEnd(3, "0").slice(0, 3)) / 1000;
    const text = (m[4] ?? "").trim();
    if (!text) continue;
    lines.push({ time: min * 60 + sec + fracSec, text });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

export function payloadFromSidecar(sidecar: LyricsSidecar | null): LyricsPayload {
  if (!sidecar) return { kind: "empty", sidecar: null };
  const synced = sidecar.syncedLyrics?.trim();
  if (synced) {
    const lines = parseSyncedLyrics(synced);
    if (lines.length > 0) return { kind: "synced", lines };
  }
  const plain = sidecar.plainLyrics?.trim();
  if (plain) return { kind: "plain", text: plain };
  return { kind: "empty", sidecar };
}

export function sidecarHasLyrics(sidecar: LyricsSidecar | null): boolean {
  return payloadFromSidecar(sidecar).kind !== "empty";
}

export function readLyrics(mediaPath: string): Promise<LyricsSidecar | null> {
  return invoke<LyricsSidecar | null>("read_lyrics", { mediaPath });
}

export function ensureLyrics(
  mediaPath: string,
  force?: boolean,
): Promise<LyricsEnsureResult | null> {
  return invoke<LyricsEnsureResult | null>("ensure_lyrics", {
    mediaPath,
    force: force ?? false,
  });
}

/** Largest index with line.time <= t, or -1 before the first stamp. */
export function activeLineIndex(lines: LyricsLine[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.time <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
