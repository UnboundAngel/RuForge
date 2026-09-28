import { cn } from "@/lib/utils";
import type { GalleryEntry } from "./galleryEntries";

/** Caption strip overlaid along the bottom of the spotlight stage. */
export function SkinSpotlightInfo({
  entry,
  index,
  total,
  known,
  wearing,
  theme,
  onWear,
}: {
  entry: GalleryEntry;
  index: number;
  total: number;
  known: boolean;
  wearing: boolean;
  theme: "app" | "music";
  onWear: () => void;
}) {
  const onAccent = theme === "music" ? "text-white" : "text-black";
  return (
    <div className="flex items-end justify-between gap-8">
      <div className="min-w-0">
        <span className="font-mono text-[10px] tracking-[0.22em] text-white/40">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
        <h3 className={cn("mt-1 text-4xl font-black tracking-tight", known ? "text-white" : "text-white/25")}>
          {known ? entry.label : "???"}
        </h3>
        <p className="mt-1.5 text-[13px] text-white/55">
          {known ? entry.blurb : entry.hint}
          {known && entry.word && (
            <>
              <span className="mx-2 text-white/20">/</span>
              <span className="font-mono text-white/75">{entry.word}</span>
            </>
          )}
        </p>
      </div>

      <div className="shrink-0">
        {!known ? (
          <span className="text-[11px] font-black uppercase tracking-[0.22em] text-white/25">Locked</span>
        ) : wearing ? (
          <span className="text-[11px] font-black uppercase tracking-[0.22em] text-[color:var(--accent)]">Wearing</span>
        ) : (
          <button
            type="button"
            onClick={onWear}
            className={cn(
              "rounded-full bg-[color:var(--accent)] px-6 py-2.5 text-[11px] font-black uppercase tracking-[0.2em] transition-[filter,transform] hover:brightness-110 active:scale-[0.97]",
              onAccent,
            )}
          >
            Wear it
          </button>
        )}
      </div>
    </div>
  );
}
