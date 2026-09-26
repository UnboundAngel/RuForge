import type { CSSProperties, ReactNode } from "react";
import { Library, Maximize2, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { cn } from "@/lib/utils";

import type { MusicView } from "@/store/types";

export type { MusicView };

/** Black shell frame: flush with window edge and bottom bar. */
export const musicFrameStyle: CSSProperties = {
  background: "var(--music-bg)",
};

/** Gray inner content island. */
export const musicContentStyle: CSSProperties = {
  background: "var(--music-surface)",
  borderRadius: "var(--music-panel-radius)",
};

/** @deprecated use musicFrameStyle or musicContentStyle */
export const musicPanelStyle = musicContentStyle;

/** @deprecated use musicFrameStyle */
export const musicSidebarGlassStyle = musicFrameStyle;

type Props = {
  activeView: MusicView;
  onSelect: (view: MusicView) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Library list, or the Explore download panel while it is open. */
  panelSlot?: ReactNode;
  /** Rendered above Back button (e.g. minimized download dock chip). */
  footerSlot?: ReactNode;
};

const ICON_BTN =
  "rf-music-tooltip-anchor rf-music-press shrink-0 flex items-center justify-center rounded-full text-white/60 hover:text-white";

const RED_HOVER = "hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,#1f1f1f)]";

/** Library icon that turns into the panel open/close icon on hover, like Spotify's. */
function PanelToggleIcon({ open, size }: { open: boolean; size: number }) {
  const Panel = open ? PanelLeftOpen : PanelLeftClose;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden>
      <Library
        size={size}
        className="absolute inset-0 transition-[opacity,scale] duration-200 group-hover/toggle:opacity-0 group-hover/toggle:scale-75"
      />
      <Panel
        size={size}
        className="absolute inset-0 opacity-0 scale-75 text-[color:var(--music-accent)] transition-[opacity,scale] duration-200 group-hover/toggle:opacity-100 group-hover/toggle:scale-100"
      />
    </span>
  );
}

/**
 * Spotify's "Your Library" panel. Home and YouTube Music search live in the top bar
 * (MusicTopBar), so the sidebar is only the library: header, filters, and playlists.
 */
export function MusicNav({ activeView, onSelect, collapsed, onToggleCollapse, panelSlot, footerSlot }: Props) {
  const createMusicPlaylist = useRuforgeStore((s) => s.createMusicPlaylist);
  const openMusicPlaylist = useRuforgeStore((s) => s.openMusicPlaylist);
  const create = () => openMusicPlaylist(createMusicPlaylist());
  const libraryActive = activeView === "library";

  if (collapsed) {
    return (
      <nav className="flex flex-col h-full w-full overflow-hidden">
        <div className="flex flex-col items-center gap-2 pt-4 pb-2 shrink-0">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(ICON_BTN, "group/toggle w-10 h-10", RED_HOVER)}
            aria-label="Open Your Library (Ctrl+B)"
            data-tooltip="Open Your Library (Ctrl+B)"
          >
            <PanelToggleIcon open size={24} />
          </button>
          <button
            type="button"
            onClick={create}
            className={cn(ICON_BTN, "w-10 h-10 bg-white/[0.07]", RED_HOVER)}
            aria-label="Create playlist (Ctrl+N)"
            data-tooltip="Create playlist (Ctrl+N)"
          >
            <Plus size={20} />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">{panelSlot}</div>
        {footerSlot ? <div className="shrink-0 pb-2 px-1.5 flex justify-center">{footerSlot}</div> : null}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex items-center gap-2 shrink-0 h-14 pl-4 pr-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="group/toggle rf-music-tooltip-anchor rf-music-press-soft flex items-center gap-2.5 min-w-0 mr-auto text-base font-bold text-white/80 hover:text-white"
          aria-label="Collapse Your Library (Ctrl+B)"
          data-tooltip="Collapse Your Library (Ctrl+B)"
        >
          <PanelToggleIcon open={false} size={22} />
          <span className="truncate">Your Library</span>
        </button>
        <button
          type="button"
          onClick={create}
          className={cn(ICON_BTN, "w-8 h-8 bg-white/[0.07]", RED_HOVER)}
          aria-label="Create playlist (Ctrl+N)"
          data-tooltip="Create playlist (Ctrl+N)"
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          onClick={() => onSelect("library")}
          className={cn(
            ICON_BTN,
            "w-8 h-8",
            RED_HOVER,
            libraryActive && "text-[color:var(--music-accent)] hover:text-[color:var(--music-accent)]",
          )}
          aria-label="Show full library (Alt+3)"
          data-tooltip="Show full library (Alt+3)"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{panelSlot}</div>

      {footerSlot ? <div className="shrink-0 pb-2 mt-auto px-2 w-full">{footerSlot}</div> : null}
    </nav>
  );
}
