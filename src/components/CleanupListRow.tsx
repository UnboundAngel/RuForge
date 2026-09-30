import { memo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Check, ChevronDown, ChevronUp, Minus, Video } from "lucide-react";
import { HoverMarqueeText } from "./music/HoverMarqueeText";
import { cn } from "../lib/utils";
import { useStuckHeader } from "../hooks/useStuckHeader";
import { CLEANUP_CATEGORY_STYLE } from "./cleanupCategoryStyle";
import {
  CLEANUP_CATEGORY_LABEL,
  formatBytes,
  type CleanupCandidate,
  type CleanupCategory,
  type CleanupSort,
  type CleanupSortKey,
} from "../cleanupCandidates";

/** Shared by the header and each row so the columns line up. */
export const CLEANUP_COLS =
  "grid grid-cols-[18px_56px_minmax(0,1fr)_88px_76px_64px] items-center gap-3 xl:grid-cols-[20px_88px_minmax(0,1fr)_108px_100px_76px] xl:gap-4 2xl:grid-cols-[22px_112px_minmax(0,1fr)_120px_112px_88px]";

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

export const CLEANUP_HEADER_H = 32;

/**
 * Sticky, sortable column header: a line at rest, a raised fill once rows scroll under it.
 * The checkbox column holds select all; the thumbnail column names the category currently under it.
 */
export function CleanupListHeader({
  sort,
  onSort,
  current,
  selectAll,
  busy,
  onToggleAll,
}: {
  sort: CleanupSort | null;
  onSort: (key: CleanupSortKey) => void;
  current: { category: CleanupCategory; meta: string } | null;
  selectAll: "none" | "some" | "all";
  busy: boolean;
  onToggleAll: () => void;
}) {
  const { sentinelRef, stuck } = useStuckHeader();
  const currentStyle = current ? CLEANUP_CATEGORY_STYLE[current.category] : null;
  const CurrentIcon = currentStyle?.icon;
  const cell = (key: CleanupSortKey, label: string, align: "left" | "center" | "right" = "left") => {
    const active = sort?.key === key;
    return (
      <button
        type="button"
        onClick={() => onSort(key)}
        className={cn(
          "flex w-full min-w-0 items-center gap-1 transition-colors hover:text-stone-100",
          active ? "text-stone-100" : "text-stone-500",
          align === "right"
            ? "justify-end text-right"
            : align === "center"
              ? "justify-center text-center"
              : "justify-start text-left",
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
      <div className="sticky top-0 z-10 -mx-6 bg-[#1D1613] px-6">
        {/* Raised fill crossfades on opacity, not background-color, so it stays in step with the scroll. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 bg-[#271C18] transition-opacity duration-200 motion-reduce:transition-none",
            stuck ? "opacity-100" : "opacity-0",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-6 bottom-0 h-px bg-white/10 transition-opacity duration-200 motion-reduce:transition-none",
            stuck ? "opacity-0" : "opacity-100",
          )}
        />
        <div
          className={cn(CLEANUP_COLS, "relative px-2 text-[12px] xl:text-[13px]")}
          style={{ height: CLEANUP_HEADER_H }}
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={selectAll === "all" ? true : selectAll === "some" ? "mixed" : false}
            aria-label={selectAll === "all" ? "Deselect all" : "Select all"}
            data-tooltip={selectAll === "all" ? "Deselect all" : "Select all"}
            disabled={busy}
            onClick={onToggleAll}
            className={cn(
              "flex h-[18px] w-[18px] items-center justify-center rounded-md transition-colors duration-150 disabled:cursor-wait xl:h-5 xl:w-5 2xl:h-[22px] 2xl:w-[22px]",
              selectAll === "none" ? "bg-[#322620] text-transparent hover:bg-[#3e2f27]" : "bg-red-500/90 text-stone-100",
            )}
          >
            {selectAll === "some" ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
          </button>
          <span className="flex min-w-0">
            {current && currentStyle && CurrentIcon ? (
              <span
                data-tooltip={current.meta}
                className={cn("flex min-w-0 items-center gap-1.5 font-semibold", currentStyle.fg)}
              >
                <CurrentIcon size={14} strokeWidth={2.5} className="shrink-0" aria-hidden />
                <span className="truncate">{CLEANUP_CATEGORY_LABEL[current.category]}</span>
              </span>
            ) : null}
          </span>
          {cell("title", "Title")}
          {cell("added", "Added")}
          {cell("watched", "Watched", "center")}
          {cell("size", "Size", "right")}
        </div>
      </div>
    </>
  );
}

export const CleanupListRow = memo(function CleanupListRow({ candidate: c, checked, joinTop, joinBottom, busy, onToggle }: Props) {
  const thumb = c.file.thumbnailPath || c.file.ruforgePosterPath;
  const title = c.file.name.replace(/\.[^/.]+$/, "");
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={busy}
      onClick={() => onToggle(c.file.path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        CLEANUP_COLS,
        "w-full rounded-lg px-2 py-1.5 text-left transition-[background-color,border-radius] duration-150 disabled:cursor-wait xl:rounded-xl xl:py-2 2xl:py-2.5",
        checked ? "bg-red-500/[0.08] hover:bg-red-500/[0.12]" : "hover:bg-white/[0.04]",
        checked && joinTop && "rounded-t-none xl:rounded-t-none",
        checked && joinBottom && "rounded-b-none xl:rounded-b-none",
      )}
    >
      <span
        className={cn(
          "flex h-[18px] w-[18px] items-center justify-center rounded-md transition-colors duration-150 xl:h-5 xl:w-5 2xl:h-[22px] 2xl:w-[22px]",
          checked ? "bg-red-500/90 text-stone-100" : "bg-[#322620] text-transparent",
        )}
        aria-hidden
      >
        <Check size={12} strokeWidth={3} />
      </span>
      <span className="relative aspect-video w-14 overflow-hidden rounded bg-[#261d18] xl:w-[88px] xl:rounded-md 2xl:w-28 2xl:rounded-lg">
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
      <HoverMarqueeText text={title} active={hovered} className="text-[13px] font-medium text-stone-100 xl:text-[14px] 2xl:text-[15px]" />
      <span className="truncate text-[12px] tabular-nums text-stone-500 xl:text-[13px]">{addedLabel(c.created)}</span>
      <span className="flex items-center justify-center gap-2 self-center leading-none">
        <span className="h-1 w-8 shrink-0 overflow-hidden rounded-full bg-[#322620] xl:w-12 2xl:w-14">
          <span
            className="block h-full origin-left bg-[color:var(--accent)]"
            style={{ transform: `scaleX(${c.watchProgressPct / 100})` }}
          />
        </span>
        <span className="text-[12px] leading-none tabular-nums text-stone-500 xl:text-[13px]">{c.watchProgressPct}%</span>
      </span>
      <span
        className={cn(
          "text-right text-[12px] font-semibold tabular-nums transition-colors xl:text-[13px]",
          checked ? "text-red-300" : "text-stone-200",
        )}
      >
        {formatBytes(c.sizeBytes)}
      </span>
    </button>
  );
});
