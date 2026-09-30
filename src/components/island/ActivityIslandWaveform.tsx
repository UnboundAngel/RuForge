import { memo } from "react";

import { ISLAND_WAVEFORM_BAR_COUNT } from "@/lib/islandWaveformLevels";

type Props = {
  levels: readonly number[];
  coverSrc?: string | null;
  accentColor: string;
  muted?: boolean;
  className?: string;
};

const W = 28;
const H = 16;
const MID = H / 2;
/** Half-thickness at rest, so silence reads as a thin ribbon rather than nothing. */
const MIN_AMP = 1;
/** Keeps the band crests off the tapered tips. */
const END_INSET = 3.5;

type Pt = [number, number];

/** Catmull-Rom through the points as cubic Beziers, continuing an existing path. */
function smoothThrough(pts: Pt[]): string {
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/** Mirrored lens: the top edge crests per band and the bottom edge mirrors it, tapering to points at both ends. */
function lensPath(levels: readonly number[]): string {
  const n = ISLAND_WAVEFORM_BAR_COUNT;
  const step = (W - END_INSET * 2) / (n - 1);
  const top: Pt[] = [[0, MID]];
  for (let i = 0; i < n; i++) {
    const level = Math.min(1, Math.max(0, levels[i] ?? 0));
    top.push([END_INSET + i * step, MID - (MIN_AMP + level * (MID - MIN_AMP))]);
  }
  top.push([W, MID]);
  const bottom = [...top].reverse().map(([x, y]): Pt => [x, H - y]);
  return `M0 ${MID}${smoothThrough(top)}${smoothThrough(bottom)} Z`;
}

export const ActivityIslandWaveform = memo(function ActivityIslandWaveform({
  levels,
  coverSrc,
  accentColor,
  muted,
  className,
}: Props) {
  const useCoverArt = Boolean(coverSrc) && !muted;
  const clip = `path("${lensPath(levels)}")`;

  return (
    <div
      className={`relative shrink-0 overflow-hidden ${className ?? ""}`}
      style={{ width: W, height: H, clipPath: clip, WebkitClipPath: clip, transform: "translateZ(0)" }}
      aria-hidden
    >
      {useCoverArt ? (
        <div
          className="rf-island-waveform-art-bg absolute inset-0"
          style={{
            backgroundImage: `url("${coverSrc}")`,
            backgroundSize: "cover",
            backgroundPosition: "center center",
            backgroundRepeat: "no-repeat",
          }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: muted ? "rgba(255,255,255,0.45)" : accentColor }}
        />
      )}
      <div className="rf-island-waveform-sheen absolute inset-0" />
    </div>
  );
});
