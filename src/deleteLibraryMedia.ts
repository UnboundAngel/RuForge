import { askConfirm } from "./components/ConfirmDialog";
import { clearPlaybackStateForDeletedPaths } from "./cleanupCandidates";
import { deleteMediaAtPath } from "./deleteMedia";
import { formatStorageSize } from "./formatStorageSize";
import { releasePlaybackBeforeDelete } from "./releasePlaybackBeforeDelete";
import { useRuforgeStore } from "./store/ruforgeStore";
import type { MediaFile } from "./types";
import { youtubeUrlsMatch } from "./youtubeUrl";

function deleteMediaErrorMessage(e: unknown, noun: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/os error 32|being used by another process/i.test(msg)) {
    return "This file is still in use. Close the player, wait a moment, then try again.";
  }
  return `Failed to delete ${noun}.`;
}

async function removeQueueJobsForSourceUrl(sourceUrl: string): Promise<void> {
  const { downloadJobs, removeDownloadJob } = useRuforgeStore.getState();
  const ids = downloadJobs.filter((j) => youtubeUrlsMatch(j.url, sourceUrl)).map((j) => j.id);
  for (const id of ids) {
    await removeDownloadJob(id);
  }
}

/**
 * Confirm, then move a library file to the Recycle Bin: frees it from playback, drops it from the
 * library right away (restored on failure), and clears matching download jobs.
 * Returns true when the user confirmed and the delete went through.
 */
export async function deleteLibraryMedia(
  file: MediaFile,
  opts: { noun?: "video" | "song"; preview?: string | null } = {},
): Promise<boolean> {
  const noun = opts.noun ?? "video";
  const approved = await askConfirm({
    title: noun === "song" ? "Delete song" : "Delete video",
    message:
      "Move this item to the system Recycle Bin? You can restore it from Recently Deleted while it stays in the bin.",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    itemPreview: opts.preview ?? file.thumbnailPath ?? file.ruforgePosterPath,
    itemMeta: `${formatStorageSize(file.size)} • ${file.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "")}`,
  });
  if (!approved) return false;

  const { notify, dismissNotification, removeGalleryEntryByPath, upsertGalleryMediaFile } =
    useRuforgeStore.getState();

  await releasePlaybackBeforeDelete([file.path]);
  const deletingId = notify("Deleting…", "progress");
  removeGalleryEntryByPath(file.path);

  try {
    const result = await deleteMediaAtPath(file.path);
    clearPlaybackStateForDeletedPaths([file.path]);
    const sourceUrl = file.sourceUrl?.trim();
    if (sourceUrl) {
      await removeQueueJobsForSourceUrl(sourceUrl);
    }
    if (result.alreadyMissing && !result.removed) {
      notify("Removed from library (file was already gone).");
    } else if (result.removed) {
      notify("Moved to Recycle Bin. Restore from Recently Deleted if needed.");
    } else {
      notify("Removed from library.");
    }
    return true;
  } catch (e) {
    console.error(e);
    upsertGalleryMediaFile(file);
    const message = deleteMediaErrorMessage(e, noun);
    notify(message, message.includes("still in use") ? "warning" : "error");
    return false;
  } finally {
    dismissNotification(deletingId);
  }
}
