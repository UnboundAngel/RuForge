import { EyeOff, ListPlus, User, UserX } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { artistKeyFromFile } from "./musicArtist";
import { shelfItemArtist } from "./musicHiddenRecommendations";
import { MusicAddToPlaylistFlyoutRow } from "./MusicAddToPlaylistFlyout";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
} from "./musicMenuUi";
import { type ShelfItem, shelfKey } from "./musicShelfFollowUps";

export type RecommendationMenuState = { item: ShelfItem; x: number; y: number };

type Props = {
  menu: RecommendationMenuState | null;
  onClose: () => void;
  onHide: (item: ShelfItem, scope: "song" | "artist") => void;
  /** YouTube Music cards can only land in this playlist, since adding means downloading. */
  onAddOutside: (item: ShelfItem) => void;
};

/** Right-click menu for a Recommended card, in the song menu's style. */
export function MusicRecommendationMenu({ menu, onClose, onHide, onAddOutside }: Props) {
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);

  if (!menu) return null;
  const { item } = menu;

  const icon = MUSIC_MENU_ICON_SIZE;
  const title = item.kind === "local" ? item.file.name : item.track.title;
  const artistKey = item.kind === "local" ? artistKeyFromFile(item.file) : "";
  const hasArtist = shelfItemArtist(item) !== null;
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <MusicFloatingMenu
      open
      x={menu.x}
      y={menu.y}
      onClose={onClose}
      ariaLabel={`Actions for ${title}`}
      measureKey={shelfKey(item)}
      placement="cursor"
    >
      <MusicMenuSection label="Playlist" tone={MUSIC_MENU_TONES.playlist}>
        {item.kind === "local" ? (
          <MusicAddToPlaylistFlyoutRow key={shelfKey(item)} paths={[item.file.path]} onClose={onClose} />
        ) : (
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playlist}
            label="Download and add"
            icon={<ListPlus size={icon} strokeWidth={2.25} />}
            onClick={act(() => onAddOutside(item))}
          />
        )}
      </MusicMenuSection>

      {artistKey && (
        <MusicMenuSection label="Go to" tone={MUSIC_MENU_TONES.navigate}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.navigate}
            label="Artist"
            icon={<User size={icon} strokeWidth={2.25} />}
            onClick={act(() => openMusicArtist(artistKey))}
          />
        </MusicMenuSection>
      )}

      <MusicMenuSection label="Hide" tone={MUSIC_MENU_TONES.file}>
        <MusicMenuRow
          tone={MUSIC_MENU_TONES.file}
          label="Hide this song"
          variant="danger"
          icon={<EyeOff size={icon} strokeWidth={2.25} />}
          onClick={act(() => onHide(item, "song"))}
        />
        {hasArtist && (
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.file}
            label="Hide songs by this artist"
            variant="danger"
            icon={<UserX size={icon} strokeWidth={2.25} />}
            onClick={act(() => onHide(item, "artist"))}
          />
        )}
      </MusicMenuSection>
    </MusicFloatingMenu>
  );
}
