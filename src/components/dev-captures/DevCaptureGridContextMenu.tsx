import { ClipboardCopy, Pencil, Trash2, X } from "lucide-react";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
} from "@/components/music/musicMenuUi";

export type DevCaptureGridContextMenuState = {
  x: number;
  y: number;
};

type Props = {
  menu: DevCaptureGridContextMenuState | null;
  selectedCount: number;
  onAnnotate: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
  onClose: () => void;
};

export function DevCaptureGridContextMenu({
  menu,
  selectedCount,
  onAnnotate,
  onCopy,
  onDelete,
  onClearSelection,
  onClose,
}: Props) {
  const multi = selectedCount > 1;
  const icon = MUSIC_MENU_ICON_SIZE;
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <MusicFloatingMenu
      open={menu != null}
      x={menu?.x ?? 0}
      y={menu?.y ?? 0}
      placement="cursor"
      theme="library"
      measureKey={selectedCount}
      ariaLabel="Capture options"
      onClose={onClose}
    >
      {multi ? (
        <MusicMenuSection label="Selection" tone={MUSIC_MENU_TONES.navigate}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.navigate}
            icon={<X size={icon} strokeWidth={2.25} />}
            label="Clear selection"
            onClick={act(onClearSelection)}
          />
        </MusicMenuSection>
      ) : (
        <MusicMenuSection label="Capture" tone={MUSIC_MENU_TONES.playback}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playback}
            icon={<Pencil size={icon} strokeWidth={2.25} />}
            label="Annotate"
            onClick={act(onAnnotate)}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playback}
            icon={<ClipboardCopy size={icon} strokeWidth={2.25} />}
            label="Copy image"
            onClick={act(onCopy)}
          />
        </MusicMenuSection>
      )}
      <MusicMenuSection label="File" tone={MUSIC_MENU_TONES.file}>
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.file}
          variant="danger"
          icon={<Trash2 size={icon} strokeWidth={2.25} />}
          label={multi ? `Delete ${selectedCount} captures` : "Delete"}
          onClick={act(onDelete)}
        />
      </MusicMenuSection>
    </MusicFloatingMenu>
  );
}
