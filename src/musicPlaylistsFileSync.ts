import { invoke } from "@tauri-apps/api/core";
import {
  classifyFileRead,
  planMusicPlaylistsHydration,
  readLocalSavedAt,
  serializeMusicPlaylistsFile,
  writeLocalSavedAt,
  type FileReadResult,
} from "./musicPlaylistsFile";
import {
  loadVirtualPlaylistRecords,
  setVirtualPlaylistsPersistHook,
  virtualPlaylistsLocalIsCurrent,
  writeVirtualPlaylistsLocal,
  type VirtualPlaylistRecord,
} from "./virtualPlaylists";

let started = false;
let hydrated = false;
let editedBeforeHydration = false;
let writing = false;
let pending: string | null = null;

/** One write at a time, and only the newest snapshot, so a slow disk never reorders saves. */
async function drainWrites(): Promise<void> {
  if (writing) return;
  writing = true;
  try {
    while (pending != null) {
      const contents = pending;
      pending = null;
      try {
        await invoke("write_music_playlists_file", { contents });
      } catch (e) {
        console.warn("music playlists file write failed; localStorage still has them", e);
      }
    }
  } finally {
    writing = false;
  }
}

function queueFileWrite(records: VirtualPlaylistRecord[]): void {
  const savedAt = Date.now();
  writeLocalSavedAt(savedAt, virtualPlaylistsLocalIsCurrent());
  pending = serializeMusicPlaylistsFile(records, savedAt);
  void drainWrites();
}

function persist(records: VirtualPlaylistRecord[]): void {
  if (!hydrated) {
    // The file is not read yet; writing now could clobber it with a wiped localStorage.
    editedBeforeHydration = true;
    return;
  }
  queueFileWrite(records);
}

/**
 * Main window only. Reads `app_data/music-playlists.json`, migrates from localStorage on first
 * run, then mirrors every save to both. Calls `onRestored` when the file replaced local records.
 */
export async function startMusicPlaylistsFileSync(onRestored: () => void): Promise<void> {
  if (started) return;
  started = true;
  setVirtualPlaylistsPersistHook(persist);

  let read: FileReadResult;
  try {
    read = classifyFileRead(await invoke<string | null>("read_music_playlists_file"));
  } catch {
    read = classifyFileRead(null, true);
  }
  const localSavedAt = editedBeforeHydration ? Date.now() : readLocalSavedAt();
  const plan = planMusicPlaylistsHydration(loadVirtualPlaylistRecords(), localSavedAt, read);
  hydrated = true;

  if (plan.writeLocal && read.kind === "ok") {
    writeVirtualPlaylistsLocal(plan.records);
    writeLocalSavedAt(read.file.savedAt, virtualPlaylistsLocalIsCurrent());
  }
  if (plan.writeFile || editedBeforeHydration) queueFileWrite(plan.records);
  if (plan.source === "file") onRestored();
}
