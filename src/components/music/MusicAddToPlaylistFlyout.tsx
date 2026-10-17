import { ListPlus } from "lucide-react";
import { MusicAddToPlaylistPicker } from "./MusicAddToPlaylistMenu";
import { MUSIC_MENU_ICON_SIZE, MUSIC_MENU_TONES, MusicMenuFlyoutRow } from "./musicMenuUi";

/** "Add to playlist" row that opens the picker beside the menu on hover, like Spotify's submenus. */
export function MusicAddToPlaylistFlyoutRow({ paths, onClose }: { paths: string[]; onClose: () => void }) {
  return (
    <MusicMenuFlyoutRow
      tone={MUSIC_MENU_TONES.playlist}
      label="Add to playlist"
      ariaLabel="Add to playlist"
      icon={<ListPlus size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
      disabled={paths.length === 0}
      renderFlyout={(openedByClick) => (
        <MusicAddToPlaylistPicker
          key={String(openedByClick)}
          paths={paths}
          onClose={onClose}
          autoFocus={openedByClick}
        />
      )}
    />
  );
}
