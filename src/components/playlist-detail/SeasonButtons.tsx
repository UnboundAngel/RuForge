import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown, Play, RotateCcw, Shuffle } from "lucide-react";
import { playlistResume, playlistShuffle, playlistStartOver } from "@/lib/playlistSession";
import { overlayFadeTransition, overlayPanelTransition, motionDuration } from "@/lib/overlayMotion";

type Props = {
  sessionId: string;
  started: boolean;
  disabled: boolean;
  /** Extra control docked at the end of the row (the options button). */
  trailing?: ReactNode;
};

const SEG_BASE = "inline-flex h-12 items-center justify-center gap-2 text-sm font-bold disabled:pointer-events-none disabled:opacity-40";
const SEG = `${SEG_BASE} transition-[filter] hover:brightness-110`;
// Segments of the split pill do not own the gold (the pill does), so they lighten it with an overlay instead of a filter.
const SEG_IN = `${SEG_BASE} outline-none transition-colors hover:bg-white/[0.16] focus-visible:bg-white/[0.16]`;
const PILL = "overflow-hidden rounded-xl bg-[color:var(--accent)] text-[color:var(--rf-on-accent)]";

/**
 * Not started: Play all. Started: one gold pill. Resume where you left off is the main segment,
 * a divided chevron segment grows the same pill downward to reveal Start over. Shuffle sits beside.
 */
export function SeasonButtons({ sessionId, started, disabled, trailing }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!started) setOpen(false);
  }, [started]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="mt-5 flex h-12 items-start gap-2.5">
      {started ? (
        <div ref={rootRef} className={`${PILL} flex min-w-0 flex-col`}>
          <div className="flex items-stretch">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                playlistResume(sessionId);
              }}
              className={`${SEG_IN} min-w-0 px-6`}
            >
              <Play size={15} fill="currentColor" />
              Resume where you left off
            </button>
            <span className="my-2.5 w-px bg-[color:var(--rf-on-accent)] opacity-25" aria-hidden />
            <button
              type="button"
              disabled={disabled}
              aria-label="More ways to start"
              aria-expanded={open}
              data-tooltip="More ways to start"
              onClick={() => setOpen((v) => !v)}
              className={`${SEG_IN} w-12`}
            >
              <motion.span
                animate={{ rotate: open ? 180 : 0 }}
                transition={motionDuration(reduce, overlayFadeTransition)}
                className="inline-flex"
              >
                <ChevronDown size={16} />
              </motion.span>
            </button>
          </div>
          <motion.div
            initial={false}
            animate={{ height: open ? "auto" : 0 }}
            transition={motionDuration(reduce, overlayPanelTransition)}
            className="overflow-hidden"
            aria-hidden={!open}
            inert={!open}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                playlistStartOver(sessionId);
              }}
              className={`${SEG_IN} w-full px-6`}
            >
              <RotateCcw size={15} />
              Start over
            </button>
          </motion.div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => playlistStartOver(sessionId)}
          className={`${PILL} ${SEG} min-w-0 px-7`}
        >
          <Play size={15} fill="currentColor" />
          Play all
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => playlistShuffle(sessionId)}
        aria-label="Shuffle"
        data-tooltip="Shuffle"
        className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.06] text-stone-200 transition-colors hover:bg-white/[0.1] disabled:pointer-events-none disabled:opacity-40"
      >
        <Shuffle size={16} />
      </button>
      {trailing}
    </div>
  );
}
