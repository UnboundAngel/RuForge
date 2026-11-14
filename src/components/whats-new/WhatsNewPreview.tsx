import { ArrowLeft } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { WhatsNewTile } from "@/lib/whatsNew";
import type { Area } from "./areas";

type Props = {
  tile: WhatsNewTile;
  area: Area;
  onBack: () => void;
  onGo: (go: () => void) => void;
  /** Keeps the dialog from jumping when the grid it replaces was taller. */
  minHeight?: number;
};

/** Looping clip for one area with its text and, when the area has a destination, a primary button. */
export function WhatsNewPreview({ tile, area, onBack, onGo, minHeight }: Props) {
  const reduced = useReducedMotion();
  const { Icon, go, cta, clip } = area;
  return (
    <div className="flex flex-col" style={minHeight ? { minHeight } : undefined}>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex w-fit items-center gap-1.5 text-[12px] font-semibold text-stone-500 transition-colors hover:text-stone-200 focus-visible:text-stone-200 focus-visible:outline-none"
      >
        <ArrowLeft size={13} strokeWidth={2.5} aria-hidden />
        Back
      </button>
      {clip ? (
        <div className="aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-input)] bg-[color:var(--rf-field)]">
          {reduced ? (
            <img src={clip.poster} alt={tile.label} className="h-full w-full object-cover" draggable={false} />
          ) : (
            <video
              src={clip.src}
              poster={clip.poster}
              muted
              autoPlay
              loop
              playsInline
              preload="auto"
              tabIndex={-1}
              disablePictureInPicture
              disableRemotePlayback
              className="h-full w-full object-cover"
            />
          )}
        </div>
      ) : null}
      <div className="mt-3.5 flex items-start gap-3 px-0.5">
        <Icon size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-[color:var(--accent)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-stone-50">{tile.label}</div>
          <p className="mt-1 text-[12px] leading-relaxed text-stone-400">{tile.text}</p>
        </div>
        {go ? (
          <button
            type="button"
            onClick={() => onGo(go)}
            className="shrink-0 rounded-[var(--radius-input)] bg-[color:var(--accent)] px-4 py-1.5 text-[11px] font-bold text-[color:var(--rf-on-accent)] transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
          >
            {cta ?? "Open"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
