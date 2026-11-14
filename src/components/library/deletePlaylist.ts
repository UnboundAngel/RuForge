import { askConfirm } from "@/components/ConfirmDialog";
import { clearPlaybackStateForDeletedPaths } from "@/cleanupCandidates";
import { deleteMediaAtPath } from "@/deleteMedia";
import { playlistDisplayTitle } from "@/lib/playlistDisplayTitle";
import { systemTrashName } from "@/platformPaths";
import { releasePlaybackBeforeDelete } from "@/releasePlaybackBeforeDelete";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { PlaylistCollection } from "@/types";
import { parseVirtualPlaylistId, WATCH_LATER_ID } from "@/virtualPlaylists";

/** Whether the card menu may offer Delete: Watch later is permanent, everything else can go. */
export function canDeletePlaylist(playlist: PlaylistCollection): boolean {
  return parseVirtualPlaylistId(playlist.path) !== WATCH_LATER_ID;
}

/**
 * Confirm, then delete. A saved playlist only forgets its list; a folder playlist moves its
 * video files to the system trash, so the dialog says so.
 */
export async function deletePlaylistWithConfirm(playlist: PlaylistCollection): Promise<boolean> {
  const virtualId = parseVirtualPlaylistId(playlist.path);
  const count = playlist.items.length;
  const noun = `${count} ${count === 1 ? "video" : "videos"}`;
  const approved = await askConfirm({
    title: virtualId ? "Delete playlist?" : "Delete playlist and its files?",
    message: virtualId
      ? "Your video files stay in the library."
      : `This moves the ${noun} in this folder to the system ${systemTrashName()}.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    item: {
      preview: playlist.stackThumbnailPath ?? playlist.items[0]?.thumbnailPath ?? null,
      title: playlistDisplayTitle(playlist.title),
      detail: noun,
    },
    theme: "app",
  });
  if (!approved) return false;

  const { notify, deleteVirtualPlaylist, removeGalleryEntryByPath } = useRuforgeStore.getState();
  if (virtualId) {
    if (deleteVirtualPlaylist(virtualId)) notify("Playlist deleted");
    return true;
  }

  const paths = playlist.items.map((i) => i.path);
  await releasePlaybackBeforeDelete(paths);
  const deleted: string[] = [];
  let failed = false;
  for (const path of paths) {
    try {
      await deleteMediaAtPath(path);
      deleted.push(path);
      removeGalleryEntryByPath(path);
    } catch (e) {
      console.error(e);
      failed = true;
    }
  }
  clearPlaybackStateForDeletedPaths(deleted);
  if (failed) {
    notify("Some files could not be deleted. They may still be in use.", "warning");
  } else {
    notify(`Playlist deleted. Files moved to ${systemTrashName()}.`);
  }
  return !failed;
}
