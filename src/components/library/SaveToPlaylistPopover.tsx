import { useState } from "react";
import { X } from "lucide-react";
import { MusicFloatingMenu, type MenuAt } from "@/components/music/musicMenuUi";
import { VideoPlaylistPicker } from "./VideoPlaylistPicker";

/** Anchored "Save to playlist" popover, for saving a selection of videos at once. */
export function SaveToPlaylistPopover({
  paths,
  at,
  onClose,
}: {
  paths: string[];
  at: MenuAt | null;
  onClose: () => void;
}) {
  const [measureKey, setMeasureKey] = useState("");

  return (
    <MusicFloatingMenu
      open={at != null}
      x={at?.x ?? 0}
      y={at?.y ?? 0}
      placement={at?.placement}
      theme="library"
      onClose={onClose}
      ariaLabel="Save to playlist"
      measureKey={measureKey}
    >
      <div className="flex items-center justify-between gap-2 px-1.5 pt-0.5">
        <span className="text-[13px] font-semibold text-stone-100">Save to playlist</span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-stone-500 transition-colors hover:text-stone-200"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
      <VideoPlaylistPicker paths={paths} onClose={onClose} onLayoutChange={setMeasureKey} />
    </MusicFloatingMenu>
  );
}
