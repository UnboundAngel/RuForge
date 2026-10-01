import { useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, X } from "lucide-react";
import type { YtdlpUpdateStatusPayload } from "../../types";

type YtdlpUpdateBannerProps = {
  status: YtdlpUpdateStatusPayload | null;
  percent: number | null | undefined;
  updating: boolean;
  done: boolean;
  invokeError: string | null | undefined;
  onUpdate: () => void;
  onDismiss: () => void;
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const POP_SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.8 } as const;
const DAY_MS = 86_400_000;
/** yt-dlp itself nags past this age, and that is when YouTube breakage starts. */
const STALE_DAYS = 90;

function ytdlpBuildAgeDays(version: string | null | undefined): number | null {
  const m = version?.trim().match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (!m) return null;
  const built = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const days = Math.floor((Date.now() - built) / DAY_MS);
  return days >= 0 ? days : null;
}

function ageFigure(days: number): { value: string; unit: string } {
  if (days < 60) return { value: String(days), unit: days === 1 ? "day" : "days" };
  const months = Math.floor(days / 30);
  return { value: String(months), unit: "months" };
}

export function YtdlpUpdateBanner({
  status,
  percent,
  updating,
  done,
  invokeError,
  onUpdate,
  onDismiss,
}: YtdlpUpdateBannerProps) {
  const reduceMotion = useReducedMotion();

  // The refreshed status already reports the new build as current once the update lands.
  const snapshotRef = useRef<{ from: string | null; to: string | null }>({ from: null, to: null });
  if (!done && !updating) {
    snapshotRef.current = {
      from: status?.activeVersion?.trim() || null,
      to: status?.latestVersion?.trim() || null,
    };
  }
  const { from, to } = snapshotRef.current;

  const lastPercentRef = useRef(0);
  if (!updating && !done) lastPercentRef.current = 0;
  if (typeof percent === "number") lastPercentRef.current = Math.min(100, Math.max(0, percent));
  const shownPercent = Math.round(lastPercentRef.current);
  const fill = done ? 1 : updating ? lastPercentRef.current / 100 : 0;

  const ageDays = ytdlpBuildAgeDays(from);
  const stale = ageDays != null && ageDays >= STALE_DAYS;
  const age = ageDays != null ? ageFigure(ageDays) : null;

  const phase = invokeError ? "error" : done ? "done" : updating ? "busy" : "idle";

  const title =
    phase === "error"
      ? "The update didn't go through"
      : phase === "done"
        ? "yt-dlp is up to date"
        : phase === "busy"
          ? "Updating yt-dlp"
          : stale && age
            ? `yt-dlp is ${age.value} ${age.unit} old`
            : "A newer yt-dlp is out";

  const detail =
    phase === "error"
      ? invokeError
      : phase === "done"
        ? to
          ? `Now on ${to}. Downloads are good to go.`
          : "Downloads are good to go."
        : phase === "busy"
          ? typeof percent === "number" || shownPercent === 0
            ? "Downloading the new build."
            : "Checking the new build."
          : stale
            ? "Older builds stop working on YouTube. Update to keep downloads running."
            : "It brings the latest fixes for YouTube and other sites.";
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, y: 14, scale: 0.94, transition: { duration: 0.24, ease: EASE_OUT } }
      }
      transition={reduceMotion ? { duration: 0 } : POP_SPRING}
      className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4 sm:bottom-8"
    >
      <div
        role="region"
        aria-label="yt-dlp update"
        className="pointer-events-auto relative w-full max-w-[30rem] overflow-hidden rounded-[20px] bg-[#261d18]"
      >
        <motion.div
          aria-hidden
          className="absolute inset-0 origin-left bg-[color-mix(in_srgb,var(--accent)_22%,#261d18)]"
          initial={false}
          animate={{ scaleX: fill }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: EASE_OUT }}
        />

        <div className="relative flex min-h-[64px] items-center gap-4 py-3 pl-5 pr-3">
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={phase}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -4, transition: { duration: 0.1 } }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
              >
                <p className="flex items-center gap-2 font-display text-[15px] font-bold text-stone-100">
                  {phase === "done" && (
                    <motion.span
                      initial={reduceMotion ? false : { scale: 0.3, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={reduceMotion ? { duration: 0 } : POP_SPRING}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)] text-[#1D1613]"
                    >
                      <Check size={13} strokeWidth={3.25} />
                    </motion.span>
                  )}
                  <span className="truncate">{title}</span>
                </p>
                <p
                  className={`mt-0.5 line-clamp-2 text-[11.5px] leading-snug ${
                    phase === "error" ? "text-amber-300/90" : "text-stone-400/80"
                  }`}
                >
                  {detail}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <AnimatePresence mode="popLayout" initial={false}>
            {phase === "busy" && (
              <motion.span
                key="percent"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -10, transition: { duration: 0.12 } }}
                transition={reduceMotion ? { duration: 0 } : POP_SPRING}
                className="shrink-0 pr-2 font-display text-[22px] font-extrabold tabular-nums text-[color:var(--accent)]"
              >
                {shownPercent}
                <span className="ml-px text-[12px] font-bold opacity-70">%</span>
              </motion.span>
            )}
            {(phase === "idle" || phase === "error") && (
              <motion.div
                key="actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                className="flex shrink-0 items-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={onUpdate}
                  className="h-9 rounded-[var(--radius-input)] bg-[color:var(--accent)] px-4 text-[12.5px] font-semibold text-[#1D1613] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97]"
                >
                  {phase === "error" ? "Try again" : "Update"}
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  aria-label="Remind me later"
                  data-tooltip="Remind me later"
                  className="flex h-9 w-8 items-center justify-center text-stone-600 transition-colors hover:text-stone-300"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
