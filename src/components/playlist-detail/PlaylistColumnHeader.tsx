import { ChevronDown, ChevronUp, Clock3 } from "lucide-react";
import { useStuckHeader } from "@/hooks/useStuckHeader";
import { cn } from "@/lib/utils";
import { COL_ADDED, COL_UPLOADED, COL_VIEWS, PLAYLIST_GRID } from "./playlistGrid";
import type { PlaylistSortMode } from "./playlistRows";

type Props = {
  mode: PlaylistSortMode;
  onChange: (mode: PlaylistSortMode) => void;
};

/**
 * The sort lives on the columns, like Music's table: pick a column to sort by it, pick it again
 * to go back to playlist order. The line under it hands off to a raised fill once rows scroll under.
 */
export function PlaylistColumnHeader({ mode, onChange }: Props) {
  const { sentinelRef, stuck } = useStuckHeader();
  const pick = (next: PlaylistSortMode) => onChange(mode === next ? "order" : next);
  const cell = (key: PlaylistSortMode, label: string, className?: string) => {
    const active = mode === key;
    const Arrow = key === "title" ? ChevronUp : ChevronDown;
    return (
      <button
        type="button"
        onClick={() => pick(key)}
        className={cn(
          "flex min-w-0 items-center gap-1 text-left transition-colors hover:text-stone-100",
          active && "text-[color:var(--accent)] hover:text-[color:var(--accent)]",
          className,
        )}
      >
        <span className="truncate">{label}</span>
        {active ? <Arrow size={14} className="shrink-0" /> : null}
      </button>
    );
  };

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="-mb-px h-px" />
      <div className="sticky top-0 z-20 -mx-4 bg-[color:var(--rf-well)] px-4 min-[900px]:-mx-8 min-[900px]:px-8">
        {/* Same header as the storage cleanup dialog: the raised fill crossfades on opacity and the line hands off to it. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 bg-[color:var(--rf-well-raised)] transition-opacity duration-200 motion-reduce:transition-none",
            stuck ? "opacity-100" : "opacity-0",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-4 bottom-0 h-px bg-white/10 transition-opacity duration-200 motion-reduce:transition-none min-[900px]:inset-x-8",
            stuck ? "opacity-0" : "opacity-100",
          )}
        />
        <div className={cn(PLAYLIST_GRID, "relative h-10 px-2 text-xs font-semibold text-stone-400")}>
          <button
            type="button"
            aria-label="Playlist order"
            data-tooltip="Playlist order"
            onClick={() => onChange("order")}
            className={cn("text-center transition-colors hover:text-stone-100", mode === "order" && "text-[color:var(--accent)]")}
          >
            #
          </button>
          {cell("title", "Title")}
          <span className={COL_VIEWS}>Views</span>
          {cell("uploaded", "Uploaded", COL_UPLOADED)}
          {cell("added", "Added", COL_ADDED)}
          <button
            type="button"
            aria-label="Duration"
            data-tooltip="Duration"
            onClick={() => pick("duration")}
            className={cn(
              "flex items-center justify-end gap-1 transition-colors hover:text-stone-100",
              mode === "duration" && "text-[color:var(--accent)] hover:text-[color:var(--accent)]",
            )}
          >
            {mode === "duration" ? <ChevronDown size={14} /> : null}
            <Clock3 size={16} />
          </button>
          <span aria-hidden />
        </div>
      </div>
      <div aria-hidden className="h-2" />
    </>
  );
}
