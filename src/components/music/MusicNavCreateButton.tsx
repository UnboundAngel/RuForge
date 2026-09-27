import { useState } from "react";
import { FileUp, ListMusic, Plus } from "lucide-react";
import { modKeyLabel } from "@/lib/shortcutLabels";
import { cn } from "@/lib/utils";
import { useRuforgeStore } from "@/store/ruforgeStore";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
} from "./musicMenuUi";
import { useImportPlaylistM3u8 } from "./useMusicPlaylistM3u8";

type Props = {
  className: string;
  iconSize: number;
};

/** Spotify's "Create" button: a small menu with a new playlist and, here, an .m3u8 import. */
export function MusicNavCreateButton({ className, iconSize }: Props) {
  const createMusicPlaylist = useRuforgeStore((s) => s.createMusicPlaylist);
  const openMusicPlaylist = useRuforgeStore((s) => s.openMusicPlaylist);
  const importM3u8 = useImportPlaylistM3u8();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  const pick = (fn: () => void) => () => {
    setAt(null);
    fn();
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { x: r.left, y: r.bottom + 6 });
        }}
        className={cn(className, at && "text-white rotate-45", "transition-transform")}
        aria-label="Create"
        aria-haspopup="menu"
        data-tooltip={at ? undefined : "Create playlist or import"}
      >
        <Plus size={iconSize} />
      </button>
      <MusicFloatingMenu open={at != null} x={at?.x ?? 0} y={at?.y ?? 0} onClose={() => setAt(null)} ariaLabel="Create">
        <MusicMenuSection label="Create" tone={MUSIC_MENU_TONES.playback}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playback}
            icon={<ListMusic size={MUSIC_MENU_ICON_SIZE} />}
            label="Playlist"
            trailing={<span className="text-[11px] text-white/40">{modKeyLabel()}+N</span>}
            onClick={pick(() => openMusicPlaylist(createMusicPlaylist()))}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playback}
            icon={<FileUp size={MUSIC_MENU_ICON_SIZE} />}
            label="Import .m3u8"
            onClick={pick(() => void importM3u8())}
          />
        </MusicMenuSection>
      </MusicFloatingMenu>
    </>
  );
}
