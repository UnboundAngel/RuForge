import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { MusicPlaylistPage } from "@/lib/musicExploreTracks";
import { throttleMusicExplorePageFetch } from "@/lib/ytdlpPageFetchThrottle";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";
import { fileVideoId, type OutsideTrack } from "@/components/music/musicOutsideRecommend";
import { downloadOutsideTrackIntoPlaylist } from "@/components/music/useMusicOutsideRecommendations";
import { libraryTracksFor } from "@/components/music/useMusicPlaylists";
import { findMusicPlaylistByTitle, loadVirtualPlaylistRecords, recordHasPath } from "@/virtualPlaylists";
import {
  IMPORT_SESSION_KEY,
  type SavedImportSession,
  hasPendingSearches,
  restoreImportSession,
  serializeImportSession,
} from "./importPersist";
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

function readSaved(): SavedImportSession | null {
  try {
    return restoreImportSession(localStorage.getItem(IMPORT_SESSION_KEY));
  } catch {
    return null;
  }
}

const saved = readSaved();

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
  ...saved,
}));

/** Row results land every few seconds; a short debounce keeps a 1000-row list from rewriting per row. */
const PERSIST_DEBOUNCE_MS = 500;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistNow(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  try {
    const raw = serializeImportSession(useImportSession.getState());
    if (raw) localStorage.setItem(IMPORT_SESSION_KEY, raw);
    else localStorage.removeItem(IMPORT_SESSION_KEY);
  } catch {
    /* quota or no storage: the session still works, it just won't survive a refresh */
  }
}

useImportSession.subscribe((s, prev) => {
  if (s.rows === prev.rows && s.draft === prev.draft && s.name === prev.name && s.phase === prev.phase && s.stopped === prev.stopped) {
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
});

if (typeof window !== "undefined") window.addEventListener("pagehide", persistNow);

/** runId of the matching loop currently running, so reopening doesn't start a second one. */
let activeRun: number | null = null;

export function openPlaylistImport(): void {
  const s = useImportSession.getState();
  // Reopening mid-review keeps the list; a finished or empty session starts over.
  if (s.phase !== "review" || !s.rows.length) {
    useImportSession.setState({ open: true, phase: "paste" });
    return;
  }
  useImportSession.setState({ open: true });
  // After a refresh the list comes back from storage with its unsearched rows still waiting.
  if (activeRun !== s.runId && !s.stopped && hasPendingSearches(s.rows)) void runMatching(s.runId);
}

/** A saved review the Create menu offers to resume. */
export function useHasImportInProgress(): boolean {
  return useImportSession((s) => s.phase === "review" && s.rows.length > 0);
}

export function closePlaylistImport(): void {
  useImportSession.setState({ open: false });
}

/** Puts failed searches back in the queue and searches them again; finished rows are untouched. */
export function retryPlaylistImport(): void {
  const s = useImportSession.getState();
  if (!s.rows.some((r) => r.state === "failed")) return;
  useImportSession.setState({
    stopped: null,
    rows: s.rows.map((r) => (r.state === "failed" ? { ...r, state: "waiting" } : r)),
  });
  if (activeRun !== s.runId) void runMatching(s.runId);
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
  await runMatching(runId);
}

function libraryByVideoId(): Map<string, MediaFile> {
  const byVideoId = new Map<string, MediaFile>();
  for (const f of libraryTracksFor(useRuforgeStore.getState().entries)) {
    const id = fileVideoId(f);
    if (id) byVideoId.set(id, f);
  }
  return byVideoId;
}

/** Searches every waiting row in order. Also resumes a list restored after a refresh. */
async function runMatching(runId: number): Promise<void> {
  activeRun = runId;
  try {
    await matchWaitingRows(runId);
  } finally {
    if (activeRun === runId) activeRun = null;
  }
}

async function matchWaitingRows(runId: number): Promise<void> {
  let failures = 0;
  for (let i = 0; ; i++) {
    const s = useImportSession.getState();
    if (s.runId !== runId || i >= s.rows.length) return;
    const source = s.rows[i].source;
    if (s.rows[i].state !== "waiting") continue;
    patchRow(runId, i, { state: "searching" });
    try {
      const ranked = await searchRow(source);
      failures = 0;
      const best = ranked[0];
      const owned = best ? libraryByVideoId().get(best.track.id) : undefined;
      const bucket = bucketFor(source, best);
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

/** The existing playlist an import named `name` would add to, if any. Unnamed imports never merge. */
export function importMergeTarget(name: string): { id: string; title: string } | null {
  const hit = findMusicPlaylistByTitle(loadVirtualPlaylistRecords(), name);
  return hit ? { id: hit.id, title: hit.title } : null;
}

/**
 * Creates the playlist, or adds to the one that already has this name, puts songs already in the
 * library in right away, and queues the rest to join it as their downloads land.
 */
export function savePlaylistImport(): {
  playlistId: string;
  merged: boolean;
  added: number;
  alreadyIn: number;
  queued: number;
} | null {
  const { rows, name } = useImportSession.getState();
  const picked = rows.filter(importRowSaveable);
  if (!picked.length) return null;
  const store = useRuforgeStore.getState();
  const seeds = picked.flatMap((r) => (r.library ? [r.library.path] : []));
  const target = findMusicPlaylistByTitle(loadVirtualPlaylistRecords(), name);
  let playlistId: string;
  let alreadyIn = 0;
  if (target) {
    playlistId = target.id;
    alreadyIn = seeds.filter((p) => recordHasPath(target, p)).length;
    store.addToVirtualPlaylist(playlistId, seeds);
  } else {
    playlistId = store.createMusicPlaylist(seeds, name.trim() || DEFAULT_IMPORT_NAME);
  }
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
  return { playlistId, merged: !!target, added: seeds.length - alreadyIn, alreadyIn, queued };
}
