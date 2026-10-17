import { Images, Pencil } from "lucide-react";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
} from "@/components/music/musicMenuUi";

export type DevCaptureTriggerContextMenuState = {
  x: number;
  y: number;
};

type Props = {
  menu: DevCaptureTriggerContextMenuState | null;
  hasLastCapture: boolean;
  onEditLast: () => void;
  onOpenLibrary: () => void;
  onClose: () => void;
};

export function DevCaptureTriggerContextMenu({
  menu,
  hasLastCapture,
  onEditLast,
  onOpenLibrary,
  onClose,
}: Props) {
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
      ariaLabel="Capture options"
      onClose={onClose}
    >
      <MusicMenuSection label="Captures" tone={MUSIC_MENU_TONES.playback}>
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.playback}
          icon={<Pencil size={icon} strokeWidth={2.25} />}
          label="Edit last"
          disabled={!hasLastCapture}
          onClick={act(onEditLast)}
        />
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.playback}
          icon={<Images size={icon} strokeWidth={2.25} />}
          label="Dev captures"
          onClick={act(onOpenLibrary)}
        />
      </MusicMenuSection>
    </MusicFloatingMenu>
  );
}
