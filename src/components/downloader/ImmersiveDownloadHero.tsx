import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type ImmersiveDownloadPhase = "preparing" | "downloading" | "finishing";

export function resolveImmersiveDownloadPhase(opts: {
  transferStarted: boolean;
  progressStatus?: string | null;
  percentage: number;
  /** False when yt-dlp is not reporting a live transfer rate. */
  hasLiveSpeed?: boolean;
}): ImmersiveDownloadPhase {
  if (opts.progressStatus === "processing") return "finishing";
  if (!opts.transferStarted) return "preparing";
  // Video+audio mux often sits at 100% with no speed before `processing` lands.
  if (
    opts.percentage >= 100 &&
    opts.progressStatus === "downloading" &&
    !opts.hasLiveSpeed
  ) {
    return "finishing";
  }
  return "downloading";
}

const PHASE_LABEL: Record<ImmersiveDownloadPhase, string> = {
  preparing: "Preparing download",
  downloading: "Downloading",
  finishing: "Finishing up",
};

const PHASE_HINT: Record<ImmersiveDownloadPhase, string> = {
  preparing: "Connecting and starting the transfer. This can take a moment.",
  downloading: "",
  finishing: "Merging and writing the file. Progress may sit near the end.",
};

type ImmersiveDownloadHeroProps = {
  title: string;
  thumbnail?: string;
  percentage: number;
  speedLabel: string | null;
  eta?: string | null;
  phase: ImmersiveDownloadPhase;
};

export function ImmersiveDownloadHero({
  title,
  thumbnail,
  percentage,
  speedLabel,
  eta,
  phase,
}: ImmersiveDownloadHeroProps) {
  const pct = Number.isFinite(percentage)
    ? Math.min(100, Math.max(0, percentage))
    : 0;
  const showDeterminate = phase === "downloading";
  const hint = PHASE_HINT[phase];
  const etaClean = (eta ?? "").trim();
  const showEta =
    showDeterminate &&
    etaClean.length > 0 &&
    etaClean !== "???" &&
    !/^unknown$/i.test(etaClean);

  const metaBits: string[] = [];
  if (showDeterminate) {
    metaBits.push(`${Math.round(pct)}%`);
  }
  if (showDeterminate && speedLabel) {
    metaBits.push(speedLabel);
  }
  if (showEta) {
    metaBits.push(`ETA ${etaClean}`);
  }

  return (
    <motion.div
      className="relative flex h-full w-full flex-col items-center justify-center px-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="flex w-full max-w-lg flex-col items-stretch gap-6">
        {thumbnail?.trim() ? (
          <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-[20px] bg-[#241c18] aspect-video">
            <img
              src={thumbnail.trim()}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1D1613]/55 via-transparent to-transparent" />
          </div>
        ) : null}

        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--accent)]">
            {PHASE_LABEL[phase]}
          </p>
          <h3 className="max-w-xl text-balance text-2xl font-bold leading-tight tracking-tight text-stone-50 sm:text-3xl line-clamp-3">
            {title}
          </h3>
          {hint ? (
            <p className="max-w-md text-sm font-medium text-stone-500">{hint}</p>
          ) : null}
        </div>

        <div className="w-full">
          <div
            className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={showDeterminate ? Math.round(pct) : undefined}
            aria-valuetext={PHASE_LABEL[phase]}
            aria-busy={phase !== "downloading"}
          >
            {showDeterminate ? (
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--accent)]"
                initial={false}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              />
            ) : (
              <div
                className={cn(
                  "absolute inset-y-0 rounded-full bg-[color:var(--accent)]",
                  phase === "finishing"
                    ? "rf-download-progress-pulse left-0 right-0"
                    : "rf-download-progress-indeterminate",
                )}
              />
            )}
          </div>

          {metaBits.length > 0 ? (
            <p className="mt-3 text-center text-sm font-semibold tabular-nums tracking-tight text-stone-300">
              {metaBits.join(" · ")}
            </p>
          ) : (
            <p className="mt-3 text-center text-sm font-medium text-stone-500">
              {phase === "preparing" ? "Waiting for first bytes…" : "Almost done…"}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
