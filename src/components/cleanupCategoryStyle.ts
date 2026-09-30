import { AudioLines, Film, Radio, type LucideIcon } from "lucide-react";
import { CLEANUP_CATEGORY_LABEL, formatBytes, type CleanupGroup, type CleanupCategory } from "../cleanupCandidates";

/** Only the icon and label carry the category color: Music is RuForge Music red, Videos the library sand gold. */
export const CLEANUP_CATEGORY_STYLE: Record<
  CleanupCategory,
  { icon: LucideIcon; noun: [string, string]; fg: string; bar: string }
> = {
  music: { icon: AudioLines, noun: ["track", "tracks"], fg: "text-[#ff0033]", bar: "bg-[#ff0033]" },
  videos: {
    icon: Film,
    noun: ["video", "videos"],
    fg: "text-[color:var(--accent)]",
    bar: "bg-[color:var(--accent)]",
  },
  livestreams: { icon: Radio, noun: ["stream", "streams"], fg: "text-violet-300", bar: "bg-violet-300" },
};

/** Name, count, size and selection for a category's hover tooltip. */
export function cleanupGroupMeta(group: CleanupGroup, selected: ReadonlySet<string>): string {
  const { items, category } = group;
  const { noun } = CLEANUP_CATEGORY_STYLE[category];
  let bytes = 0;
  let picked = 0;
  for (const c of items) {
    bytes += c.sizeBytes;
    if (selected.has(c.file.path)) picked++;
  }
  return [
    CLEANUP_CATEGORY_LABEL[category],
    `${items.length} ${noun[items.length === 1 ? 0 : 1]}`,
    formatBytes(bytes),
    picked > 0 ? `${picked} selected` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
