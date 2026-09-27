import { useEffect, useRef, useState } from "react";
import { ChevronRight, ListPlus } from "lucide-react";
import { MusicAddToPlaylistPicker } from "./MusicAddToPlaylistMenu";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicMenuFlyout,
  MusicMenuRow,
  isPointerOnSiblingMenuRow,
} from "./musicMenuUi";

const OPEN_DELAY_MS = 120;
/** Grace for cutting diagonally across a neighbouring row on the way into the flyout. */
const CLOSE_DELAY_MS = 250;

/** "Add to playlist" row that opens the picker beside the menu on hover, like Spotify's submenus. */
export function MusicAddToPlaylistFlyoutRow({ paths, onClose }: { paths: string[]; onClose: () => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [focusSearch, setFocusSearch] = useState(false);
  const rowRef = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const later = (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };
  const cancel = () => window.clearTimeout(timer.current);

  const open = anchor != null;
  useEffect(() => {
    // Always on, so brushing past the row also cancels a pending open.
    const onMove = (e: MouseEvent) => {
      if (!isPointerOnSiblingMenuRow(e.target, rowRef.current)) return;
      if (open) later(() => setAnchor(null), CLOSE_DELAY_MS);
      else cancel();
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const enabled = paths.length > 0;
  return (
    <>
      <MusicMenuRow
        tone={MUSIC_MENU_TONES.playlist}
        label="Add to playlist"
        icon={<ListPlus size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
        expanded={enabled ? anchor != null : undefined}
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          rowRef.current = el;
          if (anchor) cancel();
          else later(() => setAnchor(el), OPEN_DELAY_MS);
        }}
        onClick={
          enabled
            ? () => {
                cancel();
                setFocusSearch(true);
                if (rowRef.current) setAnchor(rowRef.current);
              }
            : undefined
        }
        trailing={<ChevronRight size={12} className="shrink-0 text-white/35" aria-hidden />}
      />
      {anchor && enabled && (
        <MusicMenuFlyout anchor={anchor} ariaLabel="Add to playlist" onMouseEnter={cancel}>
          <MusicAddToPlaylistPicker key={String(focusSearch)} paths={paths} onClose={onClose} autoFocus={focusSearch} />
        </MusicMenuFlyout>
      )}
    </>
  );
}
