import { useState } from "react";
import { FileDown, ListEnd, Pencil, Trash2 } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
} from "./musicMenuUi";
import { MusicPlaylistEditDetails } from "./MusicPlaylistEditDetails";
import { confirmDeleteMusicPlaylist } from "./musicPlaylistDelete";
import { useExportPlaylistM3u8 } from "./useMusicPlaylistM3u8";

export type MusicPlaylistNavMenuState = {
  record: VirtualPlaylistRecord;
  tracks: MediaFile[];
  coverFile: MediaFile | null;
  x: number;
  y: number;
};

/** Right-click menu for a playlist in the Your Library sidebar. */
export function MusicPlaylistNavMenu({
  menu,
  onClose,
}: {
  menu: MusicPlaylistNavMenuState | null;
  onClose: () => void;
}) {
  const enqueueManualQueue = useRuforgeStore((s) => s.enqueueManualQueue);
  const deleteVirtualPlaylist = useRuforgeStore((s) => s.deleteVirtualPlaylist);
  const updateVirtualPlaylistDetails = useRuforgeStore((s) => s.updateVirtualPlaylistDetails);
  const exportM3u8 = useExportPlaylistM3u8();
  const [editing, setEditing] = useState<MusicPlaylistNavMenuState | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const icon = MUSIC_MENU_ICON_SIZE;
  const empty = !menu || menu.tracks.length === 0;
  const pick = (fn: (m: MusicPlaylistNavMenuState) => void) => () => {
    if (!menu) return;
    fn(menu);
    onClose();
  };

  return (
    <>
      <MusicFloatingMenu
        open={menu != null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={onClose}
        ariaLabel={menu ? `${menu.record.title} options` : "Playlist options"}
        measureKey={menu?.record.id}
      >
        <MusicMenuSection label="Playlist" tone={MUSIC_MENU_TONES.playlist}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.queue}
            icon={<ListEnd size={icon} />}
            label="Add to queue"
            onClick={empty ? undefined : pick((m) => m.tracks.forEach((t) => enqueueManualQueue(t.path)))}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playlist}
            icon={<Pencil size={icon} />}
            label="Edit details"
            onClick={pick((m) => {
              setEditing(m);
              setEditOpen(true);
            })}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.file}
            icon={<FileDown size={icon} />}
            label="Export as .m3u8"
            onClick={empty ? undefined : pick((m) => void exportM3u8(m.record.title, m.tracks))}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playlist}
            icon={<Trash2 size={icon} />}
            label="Delete"
            variant="danger"
            onClick={pick((m) => {
              void confirmDeleteMusicPlaylist(m.record, m.tracks, m.coverFile).then((ok) => {
                if (ok) deleteVirtualPlaylist(m.record.id);
              });
            })}
          />
        </MusicMenuSection>
      </MusicFloatingMenu>
      {editing && (
        <MusicPlaylistEditDetails
          key={editing.record.id}
          open={editOpen}
          focus="title"
          title={editing.record.title}
          description={editing.record.description ?? ""}
          tracks={editing.tracks}
          coverFile={editing.coverFile}
          onSave={(details) => updateVirtualPlaylistDetails(editing.record.id, details)}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
