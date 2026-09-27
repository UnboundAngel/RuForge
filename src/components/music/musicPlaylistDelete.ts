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
  const count = `${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`;
  return askConfirm({
    title: "Delete playlist?",
    message: "Your song files stay in the library.",
    confirmLabel: "Delete",
    itemPreview: art ? bestCoverPath(art) : null,
    itemMeta: `${count} • ${record.title}`,
    theme: "music",
  });
}
