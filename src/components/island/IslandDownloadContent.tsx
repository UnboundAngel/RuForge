import { motion } from "motion/react";
import { useRef, useState, type SVGProps } from "react";
import { ArrowDown, Loader2, Pause, Play } from "lucide-react";
import { MarqueeText } from "@/components/downloader/DownloadJobQueuePanel";
import {
  easeInOutCubic,
  easeInOutCubicSlope,
  useProgressStreak,
  type StreakTiming,
} from "@/hooks/useProgressStreak";

export type IslandDownloadJob = {
  key: string;
  title: string;
  thumbnail: string | null;
  /** 0-100 once bytes flow; null while connecting, queued, or paused. */
  pct: number | null;
  status: "downloading" | "queued" | "paused";
};

export type IslandDownload = {
  /** Active job id; keys the thumbnail swap between queued songs. */
  key: string;
  title: string;
  thumbnail: string | null;
  /** 0-100 once bytes flow; null while connecting, queued, or paused. */
  pct: number | null;
  /** Lead job is paused or held until the user starts it. */
  waiting: boolean;
  /** Songs still queued behind the active one. */
  remaining: number;
  /** Active job first, for the expanded list. */
  jobs: IslandDownloadJob[];
};

/**
 * Music and download pills trade places by squeezing the shell to the idle pill and springing back
 * out: the old content shrinks with it, the new content grows once the squeeze lets go.
 */
export const ISLAND_SWAP_SQUEEZE_MS = 150;
const SWAP_SCALE = 0.55;
const SWAP_DELAY = ISLAND_SWAP_SQUEEZE_MS / 1000;
export const ISLAND_SWAP_CONTENT = {
  initial: { opacity: 0, scale: SWAP_SCALE },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      scale: { type: "spring" as const, stiffness: 350, damping: 27, mass: 0.8, delay: SWAP_DELAY },
      opacity: { duration: 0.08, delay: SWAP_DELAY },
    },
  },
  exit: {
    opacity: 0,
    scale: SWAP_SCALE,
    transition: { duration: SWAP_DELAY, ease: [0.4, 0, 1, 1] as const },
  },
};

export const DOWNLOAD_ISLAND_WIDTH = 220;
const DOWNLOAD_ISLAND_MIN_WIDTH = 140;
/** pl-1.5 + thumb + gap, then gap + pr-3.5 around the status slot. */
const DOWNLOAD_ISLAND_CHROME_W = 6 + 24 + 10 + 10 + 14;

let measureCtx: CanvasRenderingContext2D | null = null;
function titleTextWidth(text: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 6.6;
  measureCtx.font = `500 12px ${getComputedStyle(document.body).fontFamily || "Inter, sans-serif"}`;
  return measureCtx.measureText(text).width;
}

/** Hugs the title, capped at the music pill's resting width; past that the title marquees. */
export function downloadIslandWidth(download: IslandDownload): number {
  const status = download.waiting ? 24 : download.pct != null ? 30 : 12;
  const extra = download.remaining > 0 ? 6 + 7 * (String(download.remaining).length + 1) : 0;
  const natural = DOWNLOAD_ISLAND_CHROME_W + Math.ceil(titleTextWidth(download.title)) + status + extra;
  return Math.min(DOWNLOAD_ISLAND_WIDTH, Math.max(DOWNLOAD_ISLAND_MIN_WIDTH, natural));
}

export function IslandDownloadContent({
  download,
  onStart,
}: {
  download: IslandDownload;
  onStart?: (jobId: string) => void;
}) {
  // The overlay window is only pill-tall, so a tooltip would clip; the title slot carries the hint.
  const [startHover, setStartHover] = useState(false);
  const startHint = startHover && download.waiting && onStart != null;
  return (
    <motion.div
      {...ISLAND_SWAP_CONTENT}
      className="pointer-events-none absolute inset-0 flex items-center gap-2.5 pl-1.5 pr-3.5"
      role="status"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-stone-300">
        {download.thumbnail ? (
          <img key={download.key} src={download.thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <ArrowDown size={13} strokeWidth={2.5} />
        )}
      </span>
      <MarqueeText
        text={startHint ? "Start download" : download.title}
        layoutKey={startHint ? "start-hint" : download.key}
        fadeLeadingEdge
        marqueeClassName="animate-marquee-slow"
        className={`min-w-0 flex-1 text-[12px] font-medium transition-colors ${
          startHint ? "text-[color:var(--accent)]" : "text-stone-100"
        }`}
      />
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold tabular-nums text-stone-400">
        {download.waiting && onStart ? (
          <button
            type="button"
            aria-label="Start download"
            onPointerEnter={() => setStartHover(true)}
            onPointerLeave={() => setStartHover(false)}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onStart(download.key);
            }}
            className="group pointer-events-auto -my-1 -mr-1 flex h-6 w-6 items-center justify-center rounded-full text-stone-300 transition-colors hover:bg-white/10 hover:text-[color:var(--accent)]"
          >
            <Pause size={12} strokeWidth={2.75} fill="currentColor" className="group-hover:hidden" />
            <Play size={12} strokeWidth={2.75} fill="currentColor" className="hidden translate-x-px group-hover:block" />
          </button>
        ) : download.pct != null ? (
          `${Math.round(download.pct)}%`
        ) : (
          <Loader2 size={12} className="animate-spin" />
        )}
        {download.remaining > 0 ? <span className="text-stone-500">+{download.remaining}</span> : null}
      </span>
    </motion.div>
  );
}

/** Slices that make up the streak; each is dimmer than the one ahead, so the tail fades out. */
const PULSE_SLICES = 12;
const SLICE_OPACITY = Array.from({ length: PULSE_SLICES }, (_, i) => (1 - i / PULSE_SLICES) ** 1.3);
const RING_STREAK: StreakTiming = {
  travel: (end) => 0.3 + 0.5 * end,
  ease: easeInOutCubic,
  slope: easeInOutCubicSlope,
  lenPerSpeed: 0.12,
  minLen: 0.012,
  maxLen: 0.34,
  fadeInS: 0.06,
  fadeOutS: 0.22,
  restS: 0.7,
};

/**
 * A streak that shoots from the start of the filled ring to the progress head. SVG strokes cannot
 * carry a gradient along the path, so the fading tail is stacked dash slices. Written on the dash
 * attributes: CSS cannot interpolate a var-fed stroke-dashoffset.
 */
function RingPulse({
  rect,
  pct,
  color,
}: {
  rect: SVGProps<SVGRectElement>;
  pct: number;
  color: string;
}) {
  const groupRef = useRef<SVGGElement>(null);
  const sliceRefs = useRef<(SVGRectElement | null)[]>([]);
  const running = useProgressStreak(pct, RING_STREAK, ({ x, len, opacity }) => {
    const slice = Math.max(len, RING_STREAK.minLen) / PULSE_SLICES;
    const dash = `${slice} 2`;
    sliceRefs.current.forEach((el, i) => {
      if (!el) return;
      el.setAttribute("stroke-dasharray", dash);
      el.setAttribute("stroke-dashoffset", String((i + 1) * slice - x));
    });
    groupRef.current?.setAttribute("opacity", String(opacity));
  });

  if (!running) return null;
  return (
    <g
      ref={groupRef}
      opacity={0}
      style={{ filter: `drop-shadow(0 0 2px rgb(255 255 255 / 0.9)) drop-shadow(0 0 4px ${color})` }}
    >
      {SLICE_OPACITY.map((sliceOpacity, i) => (
        <rect
          key={i}
          ref={(el) => {
            sliceRefs.current[i] = el;
          }}
          {...rect}
          stroke="white"
          strokeOpacity={sliceOpacity}
          strokeWidth={i === 0 ? 3 : 2.25}
          strokeLinecap={i === 0 ? "round" : "butt"}
          strokeDasharray="0 2"
        />
      ))}
    </g>
  );
}

/**
 * Download progress traced around the pill edge. Geometry is CSS so it follows the shell's
 * spring width without re-measuring.
 */
export function IslandProgressRing({
  pct,
  radius,
  color,
  pulse = false,
}: {
  pct: number | null;
  radius: number;
  color: string;
  /** Bytes are flowing: run the glint along the filled part. */
  pulse?: boolean;
}) {
  const rect = {
    x: 1,
    y: 1,
    rx: Math.max(0, radius - 1),
    ry: Math.max(0, radius - 1),
    fill: "none",
    strokeWidth: 2,
    pathLength: 1,
    style: { width: "calc(100% - 2px)", height: "calc(100% - 2px)" },
  };
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <rect {...rect} stroke="rgb(255 255 255 / 0.1)" />
      {pct != null ? (
        <rect
          {...rect}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray="1"
          strokeDashoffset={1 - Math.min(100, Math.max(0, pct)) / 100}
          style={{ ...rect.style, transition: "stroke-dashoffset 300ms linear" }}
        />
      ) : null}
      {pct != null && pulse && pct >= 4 ? <RingPulse rect={rect} pct={pct} color={color} /> : null}
      {pct == null ? (
        <rect {...rect} stroke={color} strokeLinecap="round" className="rf-island-ring-indeterminate" />
      ) : null}
    </svg>
  );
}
