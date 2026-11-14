import { ArrowDown, RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BrandIcon, type BrandName } from "@/components/icons/BrandIcon";
import { RadialNavIcon } from "@/components/navigation/RadialNavIcon";
import { motionDuration, overlayFadeTransition } from "@/lib/overlayMotion";
import {
  toolsRailLabel,
  useToolsInstallStore,
  type ToolsInstallTool,
} from "@/store/toolsInstallStore";

const SIZE = 34;
const STROKE = 2;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const SEGMENTS = 20;
const SEGMENT_GAP = 0.09;

// yt-dlp has no mark of its own; the Settings row uses the YouTube one.
const TOOL_BRAND: Record<ToolsInstallTool, BrandName> = {
  ffmpeg: "ffmpeg",
  "yt-dlp": "youtube",
  deno: "deno",
};

/** Tooltip for the downloader rail button while tools install or after a failed install. */
export function useToolsRailTooltip(): string | null {
  return useToolsInstallStore(toolsRailLabel);
}

function segmentPath(i: number): string {
  const step = (Math.PI * 2) / SEGMENTS;
  const a0 = i * step + step * SEGMENT_GAP;
  const a1 = (i + 1) * step - step * SEGMENT_GAP;
  const pt = (a: number) => `${SIZE / 2 + R * Math.cos(a)} ${SIZE / 2 + R * Math.sin(a)}`;
  return `M ${pt(a0)} A ${R} ${R} 0 0 1 ${pt(a1)}`;
}

const SEGMENT_PATHS = Array.from({ length: SEGMENTS }, (_, i) => segmentPath(i));

/** Download icon that swaps to the brand mark of the tool being fetched, crossfading with the ring. */
export function ToolsRailIcon() {
  const phase = useToolsInstallStore((s) => s.phase);
  const tool = useToolsInstallStore((s) => s.tool);
  const reduce = useReducedMotion();
  const brand = (phase === "installing" || phase === "done") && tool ? tool : null;

  return (
    <span className="relative flex h-5 w-5 items-center justify-center">
      <AnimatePresence initial={false}>
        <motion.span
          key={brand ?? "arrow"}
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionDuration(reduce, overlayFadeTransition)}
        >
          {brand ? (
            <BrandIcon name={TOOL_BRAND[brand]} size={16} />
          ) : (
            <RadialNavIcon id="download" size={20} />
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * Progress ring around the rail download icon. A first-time download is a solid ring with a down-arrow
 * badge; an update of an installed tool is a segmented ring with a refresh badge. A red dot marks a failed install.
 */
export function ToolsInstallRing() {
  const phase = useToolsInstallStore((s) => s.phase);
  const kind = useToolsInstallStore((s) => s.kind);
  const fraction = Math.min(1, Math.max(0, useToolsInstallStore((s) => s.fraction)));
  const reduce = useReducedMotion();
  const ringShown = phase === "installing" || phase === "done";
  const fade = motionDuration(reduce, overlayFadeTransition);
  const Badge = kind === "update" ? RefreshCw : ArrowDown;

  return (
    <>
      <AnimatePresence>
        {ringShown ? (
          <motion.span
            key="ring"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
          >
            <svg width={SIZE} height={SIZE} className="-rotate-90">
              {kind === "update" ? (
                SEGMENT_PATHS.map((d, i) => (
                  <path
                    key={d}
                    d={d}
                    fill="none"
                    strokeWidth={STROKE}
                    strokeLinecap="butt"
                    className="transition-[stroke] duration-200"
                    style={{
                      stroke:
                        (i + 0.5) / SEGMENTS <= fraction ? "var(--accent)" : "rgb(255 255 255 / 0.1)",
                    }}
                  />
                ))
              ) : (
                <>
                  <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    fill="none"
                    stroke="rgb(255 255 255 / 0.1)"
                    strokeWidth={STROKE}
                  />
                  <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    className="transition-[stroke-dasharray] duration-200 ease-out"
                    style={{ strokeDasharray: `${fraction * C} ${C}` }}
                  />
                </>
              )}
            </svg>
            <span className="absolute bottom-[2px] right-[2px] flex h-3 w-3 items-center justify-center rounded-full bg-[color:var(--rf-surface-deep)] text-[color:var(--accent)]">
              <Badge size={8} strokeWidth={3} />
            </span>
          </motion.span>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {phase === "error" ? (
          <motion.span
            key="dot"
            className="pointer-events-none absolute right-[9px] top-[9px] h-1.5 w-1.5 rounded-full bg-red-500"
            aria-hidden
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
