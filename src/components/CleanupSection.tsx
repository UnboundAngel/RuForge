import { useLayoutEffect } from "react";
import { useStuckHeader } from "../hooks/useStuckHeader";
import { cn } from "../lib/utils";
import {
  CLEANUP_CATEGORY_LABEL,
  formatBytes,
  type CleanupCategory,
  type CleanupGroup,
} from "../cleanupCandidates";
import { CLEANUP_CATEGORY_STYLE } from "./cleanupCategoryStyle";
import { CLEANUP_HEADER_H, CleanupListRow } from "./CleanupListRow";

const CLEANUP_TAB_H = 32;

const SEAM_TOP_LEFT = "M16 0H0C8.83656 0 16 7.16344 16 16V0Z";
const SEAM_TOP_RIGHT = "M0 0V16C0 7.16344 7.16344 0 16 0H0Z";
function Seam({ d, className }: { d: string; className: string }) {
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 16 16" className={cn("absolute transition-opacity duration-150 ease-out motion-reduce:transition-none", className)}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

type Props = {
  group: CleanupGroup;
  selected: ReadonlySet<string>;
  busy: boolean;
  onToggle: (path: string) => void;
  onStuckChange: (category: CleanupCategory, stuck: boolean) => void;
};

/**
 * One category. Once pinned, its tab hangs from the column header like the title band tabs,
 * and the header takes the tab's color. Totals live in the tab's tooltip.
 */
export function CleanupSection({ group, selected, busy, onToggle, onStuckChange }: Props) {
  const { sentinelRef, stuck } = useStuckHeader(CLEANUP_HEADER_H);
  const { items, category } = group;
  const style = CLEANUP_CATEGORY_STYLE[category];

  // Layout effects so the header recolors in the same frame the tab pins, not one paint later.
  useLayoutEffect(() => {
    onStuckChange(category, stuck);
  }, [category, stuck, onStuckChange]);
  useLayoutEffect(() => () => onStuckChange(category, false), [category, onStuckChange]);
  const Icon = style.icon;
  const totalBytes = items.reduce((n, c) => n + c.sizeBytes, 0);
  const selectedCount = items.reduce((n, c) => (selected.has(c.file.path) ? n + 1 : n), 0);
  const meta = [
    `${items.length} ${style.noun[items.length === 1 ? 0 : 1]}`,
    formatBytes(totalBytes),
    selectedCount > 0 ? `${selectedCount} selected` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const seamState = stuck ? "opacity-100" : "opacity-0";

  return (
    <section className="relative pb-3">
      <div ref={sentinelRef} aria-hidden className="h-px -mb-px" />
      <div
        className="pointer-events-none sticky z-[9] mb-1.5 flex"
        style={{ top: CLEANUP_HEADER_H, height: CLEANUP_TAB_H }}
      >
        <div
          data-tooltip={meta}
          className={cn(
            "pointer-events-auto relative flex h-full items-center gap-2 pl-3 pr-4",
            style.bg,
            style.text,
            stuck ? "rounded-b-[14px] shadow-[0_8px_24px_rgba(0,0,0,0.5)]" : "rounded-[14px]",
          )}
        >
          <Icon size={15} strokeWidth={2.5} className="shrink-0" aria-hidden />
          <h3 className="text-[12px] font-black uppercase leading-none tracking-[0.16em] xl:text-[13px]">
            {CLEANUP_CATEGORY_LABEL[category]}
          </h3>
          <Seam d={SEAM_TOP_LEFT} className={cn("-left-3 top-0", style.seam, seamState)} />
          <Seam d={SEAM_TOP_RIGHT} className={cn("-right-3 top-0", style.seam, seamState)} />
        </div>
      </div>
      <div className="flex flex-col">
        {items.map((c, i) => (
          <CleanupListRow
            key={c.file.path}
            candidate={c}
            checked={selected.has(c.file.path)}
            joinTop={i > 0 && selected.has(items[i - 1].file.path)}
            joinBottom={i < items.length - 1 && selected.has(items[i + 1].file.path)}
            busy={busy}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}
