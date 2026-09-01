import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";

export type PlayerCenterFeedbackState =
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "volume"; level: number; muted: boolean }
  | { kind: "cc"; enabled: boolean }
  | { kind: "cc-unavailable" };

const ICON_CLASS = "w-7 h-7 text-white";
const MUTE_ICON_CLASS = "w-7 h-7 text-red-500";

function VolumeIcon({ level, muted }: { level: number; muted: boolean }) {
  if (muted || level <= 0) {
    return <VolumeX className={muted ? MUTE_ICON_CLASS : ICON_CLASS} />;
  }
  if (level <= 0.5) return <Volume1 className={ICON_CLASS} />;
  return <Volume2 className={ICON_CLASS} />;
}

function CcIcon({ enabled, unavailable }: { enabled?: boolean; unavailable?: boolean }) {
  const colorClass = unavailable
    ? "text-white"
    : enabled
      ? "text-white"
      : "text-white/55";

  return (
    <span className={`relative text-[13px] font-black leading-none ${colorClass}`}>
      <span className="inline-flex items-center justify-center rounded-[3px] border-2 border-current px-[3px] py-[2px]">
        CC
      </span>
      {unavailable && (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <span className="block h-[2px] w-[130%] -rotate-45 rounded-full bg-red-500" />
        </span>
      )}
    </span>
  );
}

function feedbackKey(feedback: PlayerCenterFeedbackState): string {
  switch (feedback.kind) {
    case "volume":
      return `volume-${feedback.muted}-${Math.round(feedback.level * 100)}`;
    case "cc":
      return `cc-${feedback.enabled}`;
    default:
      return feedback.kind;
  }
}

export function PlayerCenterFeedback({
  feedback,
}: {
  feedback: PlayerCenterFeedbackState | null;
}) {
  return (
    <AnimatePresence>
      {feedback && (
        <motion.div
          key={feedbackKey(feedback)}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none"
        >
          <div className="flex flex-col items-center gap-2">
            {feedback.kind === "volume" && (
              <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[17px] font-medium tabular-nums text-white">
                {feedback.muted ? 0 : Math.round(feedback.level * 100)}%
              </span>
            )}
            {feedback.kind === "cc-unavailable" && (
              <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[13px] font-medium text-white/90">
                None
              </span>
            )}
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-black/60">
              {feedback.kind === "play" && (
                <Play className={`${ICON_CLASS} fill-white ml-0.5`} />
              )}
              {feedback.kind === "pause" && (
                <Pause className={`${ICON_CLASS} fill-white`} />
              )}
              {feedback.kind === "volume" && (
                <VolumeIcon level={feedback.level} muted={feedback.muted} />
              )}
              {feedback.kind === "cc" && <CcIcon enabled={feedback.enabled} />}
              {feedback.kind === "cc-unavailable" && <CcIcon unavailable />}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const PLAYER_CENTER_FEEDBACK_MS = 700;

export function usePlayerCenterFeedback() {
  const [feedback, setFeedback] = useState<PlayerCenterFeedbackState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((next: PlayerCenterFeedbackState) => {
    setFeedback(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setFeedback(null), PLAYER_CENTER_FEEDBACK_MS);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return { feedback, showFeedback };
}
