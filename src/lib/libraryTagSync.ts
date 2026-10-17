import { useRuforgeStore } from "../store/ruforgeStore";
import type { MediaFile } from "../types";
import type { GameRecord } from "./gamesSettings";
import { allTags, reconcileGames, tagCountLabel } from "./libraryTags";
import {
  commitLibraryTags,
  runTagRules,
  startLibraryTagsFileSync,
  tagTargetFromFile,
  useLibraryTags,
} from "./libraryTagsStore";

/** Every media file once, loose downloads and playlist items alike. */
export function libraryMediaFiles(): MediaFile[] {
  const seen = new Set<string>();
  const out: MediaFile[] = [];
  for (const entry of useRuforgeStore.getState().entries) {
    for (const file of entry.kind === "media" ? [entry] : entry.items) {
      const key = file.path.replace(/\//g, "\\").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(file);
    }
  }
  return out;
}

function whenLibraryLoaded(): Promise<void> {
  if (useRuforgeStore.getState().galleryDesktopReady) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useRuforgeStore.subscribe((s) => {
      if (!s.galleryDesktopReady) return;
      unsub();
      resolve();
    });
  });
}

let chain: Promise<void> = Promise.resolve();

/**
 * Runs every rule over the whole library, one run at a time. `announce` toasts the count for
 * those tags; `quietWhenNone` skips the toast when nothing matched.
 */
export function runTagRulesOnLibrary(opts?: { announce?: string[]; quietWhenNone?: boolean }): Promise<void> {
  chain = chain
    .then(async () => {
      await whenLibraryLoaded();
      const { settings, notify } = useRuforgeStore.getState();
      const games = settings.games;
      const added = await runTagRules(
        libraryMediaFiles().map((f) => tagTargetFromFile(f)),
        games,
      );
      if (!opts?.announce?.length) return;
      const names = new Map(allTags(useLibraryTags.getState(), games).map((t) => [t.id, t.name]));
      for (const tagId of new Set(opts.announce)) {
        const name = names.get(tagId);
        const count = added.get(tagId) ?? 0;
        if (!name || (count === 0 && opts.quietWhenNone)) continue;
        notify(tagCountLabel(count, name));
      }
    })
    .catch((e) => console.error("tag rules run failed", e));
  return chain;
}

function reconcile(games: readonly GameRecord[]): void {
  // Built-in games always exist, so an empty list means settings did not load; pruning then would erase every game tag.
  if (games.length === 0) return;
  const { state, seeded } = reconcileGames(useLibraryTags.getState(), games);
  commitLibraryTags(state);
  if (seeded.length) {
    void runTagRulesOnLibrary({ announce: seeded.map((r) => r.tagId), quietWhenNone: true });
  }
}

let started = false;

/** Main window only: hydrate from the app-data file, then keep game tags in step with Settings > Games. */
export async function startLibraryTags(): Promise<void> {
  if (started) return;
  started = true;
  await startLibraryTagsFileSync();
  let games = useRuforgeStore.getState().settings.games;
  reconcile(games);
  useRuforgeStore.subscribe((s) => {
    if (s.settings.games === games) return;
    games = s.settings.games;
    reconcile(games);
  });
}
