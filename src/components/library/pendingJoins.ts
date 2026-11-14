import { invoke } from "@tauri-apps/api/core";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { fileVideoId } from "@/components/music/musicOutsideRecommend";
import { linkToDiskPlaylist } from "@/lib/diskPlaylistMeta";
import { prunePending, type PendingJoins } from "./pendingJoinsRules";


let pending: PendingJoins = {};
let loaded: Promise<void> | null = null;
let watching = false;
let writeChain: Promise<void> = Promise.resolve();

function persist(): void {
  const contents = JSON.stringify({ pending });
  writeChain = writeChain
    .then(() => invoke<void>("write_playlist_pending_joins", { contents }))
    .catch((e) => console.warn("pending playlist joins write failed", e));
}

function libraryFileForVideo(videoId: string): string | null {
  for (const e of useRuforgeStore.getState().entries) {
    const files = e.kind === "media" ? [e] : e.items;
    for (const f of files) if (fileVideoId(f) === videoId) return f.path;
  }
  return null;
}

export { libraryFileForVideo };

/** A folder playlist is waited on by its path; virtual playlists by a generated id. */
export const isFolderTarget = (id: string): boolean => /[\\/]/.test(id);

function settle(): void {
  const s = useRuforgeStore.getState();
  let changed = false;
  for (const [videoId, p] of Object.entries(pending)) {
    const path = libraryFileForVideo(videoId);
    if (!path) continue;
    delete pending[videoId];
    changed = true;
    const record = s.listVirtualPlaylistRecords().find((r) => r.id === p.recordId);
    if (record && !record.items.some((i) => mediaPathsMatch(i.path, path))) s.addToVirtualPlaylist(p.recordId, [path]);
    else if (!record && isFolderTarget(p.recordId)) void linkToDiskPlaylist(p.recordId, [path]).then(() => s.refreshVirtualPlaylists());
  }
  if (changed) persist();
}

function watch(): void {
  if (watching) return;
  watching = true;
  useRuforgeStore.subscribe((state, prev) => {
    if (Object.keys(pending).length > 0 && state.entries !== prev.entries) settle();
  });
}

/** Reads the saved waits once, drops stale ones and starts watching the library for the files. */
export function loadPendingJoins(): Promise<void> {
  loaded ??= (async () => {
    try {
      const raw = await invoke<string | null>("read_playlist_pending_joins");
      const parsed = raw ? (JSON.parse(raw) as { pending?: PendingJoins }) : null;
      const now = Date.now();
      const stored = prunePending(parsed?.pending ?? {}, now);
      // Waits added before the read finished are newer.
      pending = { ...stored, ...pending };
      if (Object.keys(pending).length !== Object.keys(parsed?.pending ?? {}).length) persist();
    } catch (e) {
      console.warn("pending playlist joins read failed", e);
    }
    watch();
    settle();
  })();
  return loaded;
}

export async function addPendingJoin(videoId: string, recordId: string): Promise<void> {
  await loadPendingJoins();
  pending[videoId] = { recordId, at: Date.now() };
  persist();
}

export function isPendingFor(videoId: string, recordId: string): boolean {
  return pending[videoId]?.recordId === recordId;
}
