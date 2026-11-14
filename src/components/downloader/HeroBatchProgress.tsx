import { motion } from "motion/react";
import { ProgressBarStreak } from "./ProgressBarStreak";
import type { ImmersiveDownloadPhase } from "./ImmersiveDownloadHero";

type Props = {
  phase: ImmersiveDownloadPhase;
  pct: number;
  speedLabel: string | null;
};

/** Progress bar and status line under the batch carousel. */
export function HeroBatchProgress({ phase, pct, speedLabel }: Props) {
  return (
    <div className="w-full max-w-sm">
      <div
        className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={phase === "downloading" ? Math.round(pct) : undefined}
        aria-busy={phase !== "downloading"}
      >
        {phase === "downloading" ? (
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--accent)]"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
          />
        ) : null}
        {phase === "downloading" && pct >= 2 ? <ProgressBarStreak pct={pct} /> : null}
        {phase !== "downloading" ? (
          <div
            className={
              phase === "finishing"
                ? "rf-download-progress-pulse absolute inset-y-0 left-0 right-0 rounded-full bg-[color:var(--accent)]"
                : "rf-download-progress-indeterminate absolute inset-y-0 rounded-full bg-[color:var(--accent)]"
            }
          />
        ) : null}
      </div>
      <p className="mt-3 text-center text-sm font-medium text-stone-500">
        {phase === "preparing"
          ? "Connecting and starting the transfer. This can take a moment."
          : phase === "finishing"
            ? "Merging and writing the file. Progress may sit near the end."
            : speedLabel
              ? `${Math.round(pct)}% · ${speedLabel}`
              : `${Math.round(pct)}%`}
      </p>
    </div>
  );
}
