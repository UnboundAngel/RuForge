import { CLEANUP_CATEGORY_LABEL, formatBytes, type CleanupGroup } from "../cleanupCandidates";
import { cn } from "../lib/utils";
import { CLEANUP_CATEGORY_STYLE } from "./cleanupCategoryStyle";

type Props = {
  groups: CleanupGroup[];
  selected: ReadonlySet<string>;
};

/**
 * Library space split by category. Each segment is sized by its share of bytes and drawn dim;
 * the selected part fills in from its left edge at full color, so picks read over the bar without hiding it.
 */
export function CleanupUsageBar({ groups, selected }: Props) {
  const segments = groups
    .map((g) => {
      let bytes = 0;
      let picked = 0;
      for (const c of g.items) {
        bytes += c.sizeBytes;
        if (selected.has(c.file.path)) picked += c.sizeBytes;
      }
      return { category: g.category, bytes, picked };
    })
    .filter((s) => s.bytes > 0);

  if (segments.length === 0) return <div className="h-1.5 min-w-0 flex-1 rounded-full bg-[#261d18]" />;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-[3px]">
      {segments.map(({ category, bytes, picked }) => {
        const style = CLEANUP_CATEGORY_STYLE[category];
        const tip = [CLEANUP_CATEGORY_LABEL[category], formatBytes(bytes), picked > 0 ? `${formatBytes(picked)} selected` : null]
          .filter(Boolean)
          .join(" · ");
        return (
          <div
            key={category}
            data-tooltip={tip}
            className="flex h-3 min-w-[8px] items-center"
            style={{ flexGrow: bytes, flexBasis: 0 }}
          >
            <div className="relative h-1.5 w-full overflow-hidden rounded-full">
              <span aria-hidden className={cn("absolute inset-0 opacity-25", style.bar)} />
              <span
                aria-hidden
                className={cn(
                  "absolute inset-0 origin-left transition-transform duration-200 ease-out motion-reduce:transition-none",
                  style.bar,
                )}
                style={{ transform: `scaleX(${Math.min(1, picked / bytes)})` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
