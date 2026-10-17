import { useId, useMemo } from "react";

export type HeatmapPoint = { start: number; end: number; value: number };

type ScrubHeatmapProps = {
  points: HeatmapPoint[];
  percentForTime: (seconds: number) => number;
  playedPercent: number;
  visible: boolean;
};

const VIEW_W = 1000;
const VIEW_H = 100;
/** Keeps quiet stretches as a visible sliver instead of vanishing into the track. */
const FLOOR = 0.08;
/**
 * YouTube normalizes to the single biggest peak, which flattens everything else. Scaling against the 90th
 * percentile gives ordinary variation most of the height; anything above it is squeezed into the top band.
 */
const BODY_PERCENTILE = 0.9;
const BODY_HEIGHT = 0.72;

/** Replays pile up in the opening seconds from people just starting the video, so those never count as the peak. */
const PEAK_MIN_START_SEC = 10;
/** Neighbours this close to the top value join the peak, so a plateau is labelled as one stretch. */
const PEAK_SHARE = 0.85;

/** The stretch YouTube would label "Most replayed": the highest sample past the intro and its near-equal neighbours. */
export function mostReplayedRange(points: HeatmapPoint[]): { start: number; end: number } | null {
  let top = -1;
  for (let i = 0; i < points.length; i++) {
    if (points[i]!.start < PEAK_MIN_START_SEC) continue;
    if (top < 0 || points[i]!.value > points[top]!.value) top = i;
  }
  if (top < 0 || points[top]!.value <= 0) return null;
  const cut = points[top]!.value * PEAK_SHARE;
  let lo = top;
  let hi = top;
  while (lo > 0 && points[lo - 1]!.value >= cut && points[lo - 1]!.start >= PEAK_MIN_START_SEC) lo--;
  while (hi < points.length - 1 && points[hi + 1]!.value >= cut) hi++;
  return { start: points[lo]!.start, end: points[hi]!.end };
}

/** One pass of a [1 2 1] blur so single-sample jitter does not read as spikes, while real peaks survive. */
function smooth(values: number[]): number[] {
  return values.map((v, i) => {
    const prev = values[i - 1] ?? v;
    const next = values[i + 1] ?? v;
    return (prev + 2 * v + next) / 4;
  });
}

function shapeValues(raw: number[]): number[] {
  const s = smooth(raw);
  const sorted = [...s].sort((a, b) => a - b);
  const min = sorted[0]!;
  const ref = sorted[Math.floor((sorted.length - 1) * BODY_PERCENTILE)]!;
  const span = ref - min;
  return s.map((v) => {
    const n = span > 1e-6 ? (v - min) / span : 0;
    const shaped = n <= 1 ? n * BODY_HEIGHT : BODY_HEIGHT + (1 - BODY_HEIGHT) * (1 - Math.exp(-(n - 1) * 0.6));
    return FLOOR + (1 - FLOOR) * shaped;
  });
}

/** Catmull-Rom through the samples as cubic Beziers so the curve reads like YouTube's, not a bar chart. */
function smoothLinePath(xy: [number, number][]): string {
  const first = xy[0]!;
  let d = `M${first[0].toFixed(1)},${first[1].toFixed(1)}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] ?? xy[i]!;
    const p1 = xy[i]!;
    const p2 = xy[i + 1]!;
    const p3 = xy[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = Math.max(0, p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = Math.max(0, p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** YouTube's "most replayed" graph, risen over the scrubber while it is hovered. */
export function ScrubHeatmap({ points, percentForTime, playedPercent, visible }: ScrubHeatmapProps) {
  const uid = useId().replace(/:/g, "");
  const paths = useMemo(() => {
    if (points.length < 2) return null;
    const heights = shapeValues(points.map((p) => p.value));
    const xy: [number, number][] = points.map((p, i) => [
      (percentForTime((p.start + p.end) / 2) / 100) * VIEW_W,
      VIEW_H - heights[i]! * VIEW_H,
    ]);
    const startX = (percentForTime(points[0]!.start) / 100) * VIEW_W;
    const endX = (percentForTime(points[points.length - 1]!.end) / 100) * VIEW_W;
    const line = smoothLinePath([[startX, xy[0]![1]], ...xy, [endX, xy[xy.length - 1]![1]]]);
    return { line, area: `${line} L${endX.toFixed(1)},${VIEW_H} L${startX.toFixed(1)},${VIEW_H} Z` };
  }, [points, percentForTime]);

  if (!paths) return null;

  const played = Math.min(100, Math.max(0, playedPercent));
  const layer = (variant: "rest" | "played") => (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      style={{ clipPath: variant === "played" ? `inset(-2px ${100 - played}% 0 0)` : `inset(-2px 0 0 ${played}%)` }}
    >
      <defs>
        <linearGradient id={`${uid}-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className={`rf-scrub-heatmap__stop-top--${variant}`} />
          <stop offset="100%" className={`rf-scrub-heatmap__stop-bottom--${variant}`} />
        </linearGradient>
      </defs>
      <path d={paths.area} fill={`url(#${uid}-${variant})`} />
      <path d={paths.line} className={`rf-scrub-heatmap__line--${variant}`} vectorEffect="non-scaling-stroke" />
    </svg>
  );

  return (
    <div
      className="rf-scrub-heatmap pointer-events-none absolute inset-0 origin-bottom"
      data-visible={visible ? "true" : undefined}
      aria-hidden
    >
      {layer("rest")}
      {layer("played")}
    </div>
  );
}
