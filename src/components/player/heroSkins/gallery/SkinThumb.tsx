import { cn } from "@/lib/utils";
import type { GalleryEntry } from "./galleryEntries";
import { SkinPreview } from "./SkinPreview";

export function SkinThumb({
  entry,
  known,
  selected,
  wearing,
  coverSrc,
  onSelect,
}: {
  entry: GalleryEntry;
  known: boolean;
  selected: boolean;
  wearing: boolean;
  coverSrc: string | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={known ? entry.label : "Locked skin"}
      className={cn(
        "group flex w-[clamp(130px,11vw,210px)] shrink-0 flex-col items-center gap-2 outline-none transition-[opacity,transform] duration-300 ease-out",
        selected ? "-translate-y-1 opacity-100" : "opacity-40 hover:opacity-75 focus-visible:opacity-75",
      )}
    >
      <div className="relative w-full flex-1">
        <SkinPreview skin={entry.skin} coverSrc={coverSrc} locked={!known} bare />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <span className={cn("flex items-center gap-1.5 text-[12px] font-semibold", known ? "text-white" : "text-white/50")}>
          {known ? entry.label : "???"}
          {wearing && <span className="size-1 rounded-full bg-[color:var(--accent)]" />}
        </span>
        <span
          className={cn(
            "h-0.5 rounded-full bg-[color:var(--accent)] transition-[width,opacity] duration-300 ease-out",
            selected ? "w-5 opacity-100" : "w-0 opacity-0",
          )}
        />
      </div>
    </button>
  );
}
