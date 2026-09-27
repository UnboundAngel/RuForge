import { memo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Check, ChevronDown, ChevronUp, Video } from "lucide-react";
import { HoverMarqueeText } from "./music/HoverMarqueeText";
import { cn } from "../lib/utils";
import { useStuckHeader } from "../hooks/useStuckHeader";
import {
  formatBytes,
  type CleanupCandidate,
  type CleanupSort,
  type CleanupSortKey,
} from "../cleanupCandidates";

/** Shared by the header and each row so the columns line up. */
export const CLEANUP_COLS = "grid grid-cols-[18px_56px_minmax(0,1fr)_88px_76px_64px] items-center gap-3";

const addedLabel = (created: number) =>
  created > 0
    ? new Date(created * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Unknown";

type Props = {
  candidate: CleanupCandidate;
  checked: boolean;
  /** Neighbour selection, so a run of checked rows reads as one block. */
  joinTop: boolean;
  joinBottom: boolean;
  busy: boolean;
  onToggle: (path: string) => void;
};

/** Sticky, sortable column header in the playlist style: a line at rest, a raised fill once rows scroll under it. */
export function CleanupListHeader({
  sort,
  onSort,
}: {
  sort: CleanupSort | null;
  onSort: (key: CleanupSortKey) => void;
}) {
  const { sentinelRef, stuck } = useStuckHeader();
  const cell = (key: CleanupSortKey, label: string, right = false) => {
    const active = sort?.key === key;
    return (
      <button
        type="button"
        onClick={() => onSort(key)}
        className={cn(
          "flex w-full min-w-0 items-center gap-1 transition-colors hover:text-stone-100",
          right ? "justify-end text-right" : "justify-start text-left",
          active && "text-stone-100",
        )}
      >
        <span className="truncate">{label}</span>
        {active && (sort.desc ? <ChevronDown size={13} className="shrink-0" /> : <ChevronUp size={13} className="shrink-0" />)}
      </button>
    );
  };

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px -mb-px" />
      <div
        className={cn(
          "sticky top-0 z-10 -mx-6 px-6 transition-colors duration-200",
          stuck ? "bg-[#261d18]" : "bg-[#1D1613]",
        )}
      >
        <div
          className={cn(
            CLEANUP_COLS,
            "h-9 border-b px-2 text-[12px] text-stone-500 transition-colors duration-200",
            stuck ? "border-transparent" : "border-white/10",
          )}
        >
          <span />
          <span />
          {cell("title", "Title")}
          {cell("added", "Added")}
          {cell("watched", "Watched")}
          {cell("size", "Size", true)}
        </div>
      </div>
    </>
  );
}

export const CleanupListRow = memo(function CleanupListRow({ candidate: c, checked, joinTop, joinBottom, busy, onToggle }: Props) {
  const thumb = c.file.thumbnailPath || c.file.ruforgePosterPath;
  const title = c.file.name.replace(/\.[^/.]+$/, "");

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={busy}
      onClick={() => onToggle(c.file.path)}
      className={cn(
        CLEANUP_COLS,
        "w-full rounded-lg px-2 py-1.5 text-left transition-[background-color,border-radius] duration-150 disabled:cursor-wait",
        checked ? "bg-red-500/[0.08] hover:bg-red-500/[0.12]" : "hover:bg-white/[0.04]",
        checked && joinTop && "rounded-t-none",
        checked && joinBottom && "rounded-b-none",
      )}
    >
      <span
        className={cn(
          "flex h-[18px] w-[18px] items-center justify-center rounded-md transition-colors duration-150",
          checked ? "bg-red-500/90 text-stone-100" : "bg-[#322620] text-transparent",
        )}
        aria-hidden
      >
        <Check size={12} strokeWidth={3} />
      </span>
      <span className="relative aspect-video w-14 overflow-hidden rounded bg-[#261d18]">
        {thumb ? (
          <img
            src={convertFileSrc(thumb)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className={cn("h-full w-full object-cover transition-opacity duration-150", checked && "opacity-50")}
          />
        ) : (
          <Video size={14} className="absolute inset-0 m-auto text-stone-600" aria-hidden />
        )}
      </span>
      <HoverMarqueeText text={title} className="text-[13px] font-medium text-stone-100" />
      <span className="truncate text-[12px] tabular-nums text-stone-500">{addedLabel(c.created)}</span>
      <span className="flex items-center gap-2">
        <span className="h-1 w-8 shrink-0 overflow-hidden rounded-full bg-[#322620]">
          <span
            className="block h-full origin-left bg-[color:var(--accent)]"
            style={{ transform: `scaleX(${c.watchProgressPct / 100})` }}
          />
        </span>
        <span className="text-[12px] tabular-nums text-stone-500">{c.watchProgressPct}%</span>
      </span>
      <span
        className={cn(
          "text-right text-[12px] font-semibold tabular-nums transition-colors",
          checked ? "text-red-300" : "text-stone-200",
        )}
      >
        {formatBytes(c.sizeBytes)}
      </span>
    </button>
  );
});
