import { useEffect, useState, type CSSProperties } from "react";
import { GHOST_HUD_SHOW_MS, type GhostEdgeLayout } from "@/lib/ghostHud";

type ReadoutProps = {
  text: string | null;
  /** Any change shows the readout again for `GHOST_HUD_SHOW_MS`. */
  flashKey: string;
  style?: CSSProperties;
};

/** Bare text over the ghosted video: no plate, so the game behind stays the main surface. */
export function GhostChapterReadout({ text, flashKey, style }: ReadoutProps) {
  const [shown, setShown] = useState(true);

  useEffect(() => {
    setShown(true);
    const id = window.setTimeout(() => setShown(false), GHOST_HUD_SHOW_MS);
    return () => window.clearTimeout(id);
  }, [flashKey]);

  if (!text) return null;
  return (
    <div
      className={`rf-ghost-readout pointer-events-none absolute z-[160] truncate whitespace-nowrap text-[11px] font-semibold tracking-wide text-white transition-opacity motion-reduce:transition-none ${shown ? "opacity-85 duration-200" : "opacity-0 duration-700"}`}
      style={style}
      aria-live="polite"
    >
      {text}
    </div>
  );
}

type EdgeProps = {
  layout: GhostEdgeLayout;
  visible: boolean;
  style?: CSSProperties;
};

export function GhostChapterEdge({ layout, visible, style }: EdgeProps) {
  const current = layout.segments.findIndex((s) => s.fill01 < 1);
  return (
    <div
      className={`rf-ghost-edge pointer-events-none absolute z-[160] grid h-[2px] transition-opacity duration-300 motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"}`}
      style={{
        ...style,
        gridTemplateColumns: layout.segments.map((s) => `minmax(0, ${s.fr}fr)`).join(" "),
        columnGap: layout.gapped ? 1 : 0,
      }}
      aria-hidden
    >
      {layout.segments.map((seg, i) => {
        const isCurrent = !layout.gapped || i === current;
        return (
          <div key={i} className="relative h-full overflow-hidden rounded-full bg-white/25">
            <div
              className={`rf-ghost-edge-fill absolute inset-0 origin-left rounded-full ${isCurrent ? "bg-[color:var(--accent)]/80" : "bg-[color:var(--accent)]/40"}`}
              style={{ transform: `scaleX(${seg.fill01})` }}
            />
          </div>
        );
      })}
    </div>
  );
}
