import { ListPlus } from "lucide-react";
import { MUSIC_MENU_ICON_SIZE, MUSIC_MENU_TONES, MusicMenuFlyoutRow } from "@/components/music/musicMenuUi";
import { VideoPlaylistPicker } from "./VideoPlaylistPicker";

/** Card menu "Save to playlist" row: the picker opens beside the menu, as in Music. */
export function SaveToPlaylistFlyoutRow({ paths, onClose }: { paths: string[]; onClose: () => void }) {
  return (
    <MusicMenuFlyoutRow
      tone={MUSIC_MENU_TONES.playlist}
      label="Save to playlist"
      ariaLabel="Save to playlist"
      icon={<ListPlus size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
      disabled={paths.length === 0}
      renderFlyout={(openedByClick) => (
        <VideoPlaylistPicker key={String(openedByClick)} paths={paths} onClose={onClose} autoFocus={openedByClick} />
      )}
    />
  );
}
