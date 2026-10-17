import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { MediaFile } from "../types";
import type { GameRecord } from "./gamesSettings";
import { recordActivity } from "./activityLog";
import {
  EMPTY_LIBRARY_TAGS,
  addManualTag,
  allTags,
  applyRules,
  createPlainTag,
  parseLibraryTagsSnapshot,
  pickNewerSnapshot,
  removeVideoTag,
  serializeLibraryTags,
  videoKey,
  type LibraryTagsSnapshot,
  type LibraryTagsState,
  type PlainTag,
} from "./libraryTags";

export const LIBRARY_TAGS_LS_KEY = "ruforge-library-tags";

function readLocal(): LibraryTagsSnapshot | null {
  try {
    return parseLibraryTagsSnapshot(localStorage.getItem(LIBRARY_TAGS_LS_KEY));
  } catch {
    return null;
  }
}

/** localStorage is the synchronous cache; the main window mirrors it to `app_data/library-tags.json`. */
export const useLibraryTags = create<LibraryTagsState>(() => readLocal()?.state ?? EMPTY_LIBRARY_TAGS);

let fileSync = false;
let hydrated = false;
let writing = false;
let pending: string | null = null;

async function drainWrites(): Promise<void> {
  if (writing) return;
  writing = true;
  try {
    while (pending != null) {
      const contents = pending;
      pending = null;
      try {
        await invoke("write_library_tags_file", { contents });
      } catch (e) {
        console.warn("library tags file write failed; localStorage still has them", e);
      }
    }
  } finally {
    writing = false;
  }
}

function persist(state: LibraryTagsState): void {
  const text = serializeLibraryTags(state, Date.now());
  try {
    localStorage.setItem(LIBRARY_TAGS_LS_KEY, text);
  } catch {
    // storage unavailable; the file copy still holds it
  }
  // Before hydration the file could hold newer tags; this edit reaches it once hydration picks a side.
  if (fileSync && hydrated) {
    pending = text;
    void drainWrites();
  }
}

export function commitLibraryTags(next: LibraryTagsState): void {
  if (next === useLibraryTags.getState()) return;
  useLibraryTags.setState(next, true);
  persist(next);
}

export function updateLibraryTags(fn: (state: LibraryTagsState) => LibraryTagsState): void {
  commitLibraryTags(fn(useLibraryTags.getState()));
}

/** Main window only: one writer for the app-data file. Resolves once the newer copy is in place. */
export async function startLibraryTagsFileSync(): Promise<void> {
  if (fileSync) return;
  fileSync = true;
  let raw: string | null = null;
  let failed = false;
  try {
    raw = await invoke<string | null>("read_library_tags_file");
  } catch {
    failed = true;
  }
  const file = parseLibraryTagsSnapshot(raw);
  const local = readLocal();
  const pick = pickNewerSnapshot(local, file);
  hydrated = true;
  if (pick.source === "file" && pick.snapshot) {
    useLibraryTags.setState(pick.snapshot.state, true);
    try {
      localStorage.setItem(LIBRARY_TAGS_LS_KEY, serializeLibraryTags(pick.snapshot.state, pick.snapshot.savedAt));
    } catch {
      /* the file copy still holds it */
    }
    return;
  }
  // A damaged file is left for manual recovery; the next edit overwrites it.
  const fileMissing = !failed && raw == null;
  const localNewer = pick.source === "local" && file != null && (local?.savedAt ?? 0) > file.savedAt;
  if (local && (fileMissing || localNewer)) {
    pending = serializeLibraryTags(useLibraryTags.getState(), local.savedAt);
    void drainWrites();
  }
}

export function knownTagIds(state: LibraryTagsState, games: readonly GameRecord[]): Set<string> {
  return new Set(allTags(state, games).map((t) => t.id));
}

export type TagTarget = { path: string; key: string; title: string; channel: string | null };

export function mediaTitle(file: Pick<MediaFile, "name">): string {
  return file.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "");
}

export function tagTargetFromFile(file: MediaFile, channel?: string | null): TagTarget {
  return {
    path: file.path,
    key: videoKey(file),
    title: mediaTitle(file),
    channel: channel?.trim() || file.youtube?.channel?.trim() || null,
  };
}

/** Runs the rules over `targets`; descriptions are read from `.info.json` only when a rule needs them. */
export async function runTagRules(
  targets: readonly TagTarget[],
  games: readonly GameRecord[],
): Promise<Map<string, number>> {
  if (!targets.length) return new Map();
  const needsDescription = useLibraryTags
    .getState()
    .rules.some((r) => r.enabled && r.field === "description" && r.tagId && r.text.trim());
  let descriptions: (string | null)[] = [];
  if (needsDescription) {
    try {
      descriptions = await invoke<(string | null)[]>("library_info_descriptions", {
        paths: targets.map((t) => t.path),
      });
    } catch (e) {
      console.warn("reading descriptions for tag rules failed", e);
    }
  }
  const state = useLibraryTags.getState();
  const { state: next, added } = applyRules(
    state,
    targets.map((t, i) => ({
      key: t.key,
      input: { title: t.title, channel: t.channel, description: descriptions[i] ?? null },
    })),
    knownTagIds(state, games),
  );
  commitLibraryTags(next);
  return added;
}

export function tagVideo(file: MediaFile, tagId: string): void {
  updateLibraryTags((s) => addManualTag(s, videoKey(file), tagId));
}

export function untagVideo(file: MediaFile, tagId: string): void {
  updateLibraryTags((s) => removeVideoTag(s, videoKey(file), tagId));
}

export function createTag(name: string): PlainTag | null {
  const { state, tag } = createPlainTag(useLibraryTags.getState(), name);
  commitLibraryTags(state);
  if (tag) {
    recordActivity({ kind: "tag_created", tagId: tag.id });
  }
  return tag;
}
