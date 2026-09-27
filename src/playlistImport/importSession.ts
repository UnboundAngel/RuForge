import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { MusicPlaylistPage } from "@/lib/musicExploreTracks";
import { throttleMusicExplorePageFetch } from "@/lib/ytdlpPageFetchThrottle";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";
import { fileVideoId, type OutsideTrack } from "@/components/music/musicOutsideRecommend";
import { downloadOutsideTrackIntoPlaylist } from "@/components/music/useMusicOutsideRecommendations";
import { findInLibrary } from "./libraryMatch";
import type { ImportTrack, ParsedImport } from "./parseImport";
import { type MatchBucket, type ScoredCandidate, bucketFor, rankCandidates, searchQueryFor } from "./scoreMatches";

/** Results fetched per row; the review dropdown shows the best few. */
const SEARCH_LIMIT = 8;
export const ALTERNATIVES_SHOWN = 5;
/** This many failed searches in a row means yt-dlp itself is broken, not the songs. */
const FAILURE_STREAK_STOP = 3;

export const DEFAULT_IMPORT_NAME = "Imported playlist";

export type ImportRowState = "waiting" | "searching" | "done" | "failed";

export type ImportRow = {
  source: ImportTrack;
  state: ImportRowState;
  /** Already downloaded; saved by path, no download. */
  library: MediaFile | null;
  candidates: ScoredCandidate[];
  /** Index into `candidates`; ignored when `library` is set. */
  choice: number;
  bucket: MatchBucket | "library";
  include: boolean;
};

type ImportSession = {
  open: boolean;
  phase: "paste" | "review";
  name: string;
  rows: ImportRow[];
  /** Summary of what the parser dropped or merged, shown above the list. */
  notes: string[];
  /** Matching stopped early (yt-dlp failing); remaining rows stay unmatched. */
  stopped: string | null;
  runId: number;
  /** The paste box, kept here so closing the modal doesn't lose a long reply. */
  draft: string;
  draftError: string | null;
};

export const useImportSession = create<ImportSession>(() => ({
  open: false,
  phase: "paste",
  name: "",
  rows: [],
  notes: [],
  stopped: null,
  runId: 0,
  draft: "",
  draftError: null,
}));

export function openPlaylistImport(): void {
  const s = useImportSession.getState();
  // Reopening mid-review keeps the list; a finished or empty session starts over.
  useImportSession.setState(s.phase === "review" && s.rows.length ? { open: true } : { open: true, phase: "paste" });
}

export function closePlaylistImport(): void {
  useImportSession.setState({ open: false });
}

/** Stops matching and returns to the paste box. */
export function resetPlaylistImport(): void {
  useImportSession.setState((s) => ({ phase: "paste", rows: [], notes: [], stopped: null, runId: s.runId + 1 }));
}

function patchRow(runId: number, index: number, patch: Partial<ImportRow>): void {
  useImportSession.setState((s) => {
    if (s.runId !== runId) return s;
    const rows = s.rows.slice();
    rows[index] = { ...rows[index], ...patch };
    return { rows };
  });
}

function parseNotes(parsed: ParsedImport): string[] {
  const notes: string[] = [];
  if (parsed.duplicatesRemoved) {
    notes.push(`${parsed.duplicatesRemoved} overlapping ${parsed.duplicatesRemoved === 1 ? "row" : "rows"} merged`);
  }
  if (parsed.rowErrors.length) {
    const shown = parsed.rowErrors.slice(0, 3).join(", ");
    const more = parsed.rowErrors.length > 3 ? ` and ${parsed.rowErrors.length - 3} more` : "";
    notes.push(`Skipped ${shown}${more}`);
  }
  if (parsed.truncated) notes.push(`Only the first 1000 songs were kept (${parsed.truncated} left out)`);
  return notes;
}

/** Candidate row for a MusicTrackInfo, in the shape the preview and download helpers take. */
export function outsideTrackFor(c: ScoredCandidate): OutsideTrack {
  const t = c.track;
  return { videoId: t.id, title: t.title, artist: t.artist ?? "", thumbnail: t.thumbnail, duration: t.duration, url: t.url };
}

async function searchRow(source: ImportTrack) {
  const { settings } = useRuforgeStore.getState();
  await throttleMusicExplorePageFetch();
  const page = await invoke<MusicPlaylistPage>("get_playlist_items_page", {
    url: `ytsearch${SEARCH_LIMIT}:${searchQueryFor(source)}`,
    offset: 0,
    limit: SEARCH_LIMIT,
    browserCookies: settings.browserContext || null,
    cookieFile: settings.cookieFile || null,
  });
  return rankCandidates(source, page.items);
}

/**
 * Parsed list in, review screen out. Library hits resolve instantly; the rest are searched one
 * at a time (yt-dlp is serialized anyway) and fill in while the user reviews.
 */
export async function startPlaylistImport(parsed: ParsedImport, library: MediaFile[]): Promise<void> {
  const runId = useImportSession.getState().runId + 1;
  const byVideoId = new Map<string, MediaFile>();
  for (const f of library) {
    const id = fileVideoId(f);
    if (id) byVideoId.set(id, f);
  }
  const rows: ImportRow[] = parsed.tracks.map((source) => {
    const hit = findInLibrary(source, library);
    return hit
      ? { source, state: "done", library: hit, candidates: [], choice: -1, bucket: "library", include: true }
      : { source, state: "waiting", library: null, candidates: [], choice: -1, bucket: "missing", include: false };
  });
  useImportSession.setState({
    phase: "review",
    name: parsed.name ?? DEFAULT_IMPORT_NAME,
    rows,
    notes: parseNotes(parsed),
    stopped: null,
    runId,
  });

  let failures = 0;
  for (let i = 0; i < rows.length; i++) {
    if (useImportSession.getState().runId !== runId) return;
    if (rows[i].state === "done") continue;
    patchRow(runId, i, { state: "searching" });
    try {
      const ranked = await searchRow(rows[i].source);
      failures = 0;
      const best = ranked[0];
      const owned = best ? byVideoId.get(best.track.id) : undefined;
      const bucket = bucketFor(rows[i].source, best);
      patchRow(runId, i, {
        state: "done",
        candidates: ranked.slice(0, ALTERNATIVES_SHOWN),
        choice: best ? 0 : -1,
        library: owned && bucket === "matched" ? owned : null,
        bucket: owned && bucket === "matched" ? "library" : bucket,
        // Only confident matches are ticked; "check" rows wait for the user.
        include: bucket === "matched",
      });
    } catch (e) {
      failures++;
      patchRow(runId, i, { state: "failed", bucket: "missing", include: false });
      if (failures >= FAILURE_STREAK_STOP) {
        const why = String(e).split("\n")[0].slice(0, 160);
        useImportSession.setState((s) => {
          if (s.runId !== runId) return s;
          return {
            stopped: `Searching stopped after ${FAILURE_STREAK_STOP} failures in a row: ${why}`,
            rows: s.rows.map((r) => (r.state === "waiting" ? { ...r, state: "failed" } : r)),
          };
        });
        return;
      }
    }
  }
}

export function setImportRow(index: number, patch: Partial<ImportRow>): void {
  patchRow(useImportSession.getState().runId, index, patch);
}

/** Picks another search result; picking one means the user vouches for it. */
export function chooseImportCandidate(index: number, choice: number): void {
  setImportRow(index, { choice, include: true, bucket: "matched" });
}

export function importRowSaveable(r: ImportRow): boolean {
  return r.include && (!!r.library || (r.choice >= 0 && !!r.candidates[r.choice]));
}

/**
 * Creates the playlist, adds songs already in the library right away, and queues the rest to
 * join it as their downloads land. Returns the new playlist id.
 */
export function savePlaylistImport(): { playlistId: string; added: number; queued: number } | null {
  const { rows, name } = useImportSession.getState();
  const picked = rows.filter(importRowSaveable);
  if (!picked.length) return null;
  const store = useRuforgeStore.getState();
  const seeds = picked.flatMap((r) => (r.library ? [r.library.path] : []));
  const playlistId = store.createMusicPlaylist(seeds, name.trim() || DEFAULT_IMPORT_NAME);
  let queued = 0;
  for (const r of picked) {
    if (r.library) continue;
    downloadOutsideTrackIntoPlaylist(outsideTrackFor(r.candidates[r.choice]), playlistId);
    queued++;
  }
  useImportSession.setState((s) => ({
    open: false,
    phase: "paste",
    rows: [],
    notes: [],
    stopped: null,
    runId: s.runId + 1,
    draft: "",
    draftError: null,
  }));
  return { playlistId, added: seeds.length, queued };
}
