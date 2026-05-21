import { invoke } from "@tauri-apps/api/core";
import type { DuplicateDownloadChoice } from "./components/DuplicateDownloadDialog";
import { clearPlaybackStateForDeletedPaths } from "./cleanupCandidates";
import { findLibraryDuplicate } from "./duplicateDownload";
import { releasePlaybackBeforeDelete } from "./releasePlaybackBeforeDelete";
import { useRuforgeStore } from "./store/ruforgeStore";

/** Remove the library row matched by URL when the user chose Replace. */
export async function deleteLibraryFileForReplace(path: string): Promise<void> {
  await releasePlaybackBeforeDelete([path]);
  await invoke("delete_media", { videoPath: path });
  clearPlaybackStateForDeletedPaths([path]);
  await useRuforgeStore.getState().fetchEntries({ manageLoadingStart: false });
}

export async function applyReplaceBeforeDownload(
  targetUrl: string,
  choice: DuplicateDownloadChoice,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (choice !== "replace") {
    return { ok: true };
  }
  const dup = findLibraryDuplicate(
    targetUrl,
    useRuforgeStore.getState().entries,
  );
  if (!dup) {
    return { ok: true };
  }
  try {
    await deleteLibraryFileForReplace(dup.file.path);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/os error 32|being used by another process/i.test(msg)) {
      return {
        ok: false,
        reason:
          "Could not remove the existing file. Close the player and try again.",
      };
    }
    return { ok: false, reason: "Could not remove the existing file before replacing." };
  }
}
