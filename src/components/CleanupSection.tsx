import { useLayoutEffect } from "react";
import { useStuckHeader } from "../hooks/useStuckHeader";
import { CLEANUP_CATEGORY_LABEL, type CleanupCategory, type CleanupGroup } from "../cleanupCandidates";
import { cn } from "../lib/utils";
import { CLEANUP_CATEGORY_STYLE, cleanupGroupMeta } from "./cleanupCategoryStyle";
import { CLEANUP_HEADER_H, CleanupListRow } from "./CleanupListRow";

type Props = {
  group: CleanupGroup;
  selected: ReadonlySet<string>;
  busy: boolean;
  onToggle: (path: string) => void;
  onStuckChange: (category: CleanupCategory, stuck: boolean) => void;
};

/**
 * One category, opened by a plain colored label. Once the label scrolls under the column
 * header, the header's corner switches to this category.
 */
export function CleanupSection({ group, selected, busy, onToggle, onStuckChange }: Props) {
  const { sentinelRef, stuck } = useStuckHeader(CLEANUP_HEADER_H);
  const { items, category } = group;
  const style = CLEANUP_CATEGORY_STYLE[category];
  const Icon = style.icon;

  // Layout effects so the header corner swaps in the same frame, not one paint later.
  useLayoutEffect(() => {
    onStuckChange(category, stuck);
  }, [category, stuck, onStuckChange]);
  useLayoutEffect(() => () => onStuckChange(category, false), [category, onStuckChange]);

  return (
    <section className="relative pb-3">
      <div ref={sentinelRef} aria-hidden className="h-px -mb-px" />
      <div className="flex h-8 items-center px-2">
        <div
          data-tooltip={cleanupGroupMeta(group, selected)}
          className={cn("flex items-center gap-1.5", style.fg)}
        >
          <Icon size={14} strokeWidth={2.5} className="shrink-0" aria-hidden />
          <h3 className="text-[12px] font-semibold xl:text-[13px]">{CLEANUP_CATEGORY_LABEL[category]}</h3>
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
