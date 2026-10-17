import { askConfirm } from "@/components/ConfirmDialog";
import { bestCoverPath } from "@/mediaKind";
import type { MediaFile } from "@/types";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";

export function confirmDeleteMusicPlaylist(
  record: VirtualPlaylistRecord,
  tracks: MediaFile[],
  coverFile: MediaFile | null,
): Promise<boolean> {
  const art = coverFile ?? tracks[0] ?? null;
  return askConfirm({
    title: "Delete playlist?",
    message: "Your song files stay in the library.",
    confirmLabel: "Delete",
    item: {
      preview: art ? bestCoverPath(art) : null,
      title: record.title,
      detail: `${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`,
    },
    theme: "music",
  });
}
