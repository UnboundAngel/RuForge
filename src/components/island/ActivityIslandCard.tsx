import { Icon } from "@iconify/react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import type { CurrentActivity } from "@/lib/activityTypes";
import { ActivityIslandWaveform } from "./ActivityIslandWaveform";

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export type ActivityIslandCardProps = {
  activity: CurrentActivity;
  accentColor: string;
  title: string;
  subtitle: string | null;
  showSkip: boolean;
  hasPrevInQueue: boolean;
  hasNextInQueue: boolean;
  onPlayPause: () => void;
  onSkipPrev?: () => void;
  onSkipNext?: () => void;
  onClose: () => void;
};

export function ActivityIslandCard({
  activity,
  accentColor,
  title,
  subtitle,
  showSkip,
  hasPrevInQueue,
  hasNextInQueue,
  onPlayPause,
  onSkipPrev,
  onSkipNext,
  onClose,
}: ActivityIslandCardProps) {
  const progress =
    activity.duration > 0
      ? Math.min(100, (activity.currentTime / activity.duration) * 100)
      : 0;

  return (
    <div
      className="pointer-events-auto w-[min(380px,calc(100vw-32px))] rounded-[32px] bg-black p-5 shadow-2xl shadow-black/50 ring-1 ring-white/5"
      role="dialog"
      aria-label="Now playing"
    >
      <button type="button" onClick={onClose} className="sr-only" aria-label="Collapse">
        Close
      </button>

      <div className="flex items-center gap-4">
        <div className="h-[60px] w-[60px] shrink-0 overflow-hidden rounded-[14px] bg-white/10">
          {activity.coverSrc ? (
            <img src={activity.coverSrc} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <p className="truncate text-[15px] font-semibold leading-tight text-white">{title}</p>
          {subtitle ? (
            <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.15em] text-white/50">
              {subtitle}
            </p>
          ) : null}
          {activity.isStub && activity.stubLabel ? (
            <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wider text-white/50">
              {activity.stubLabel}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-center pl-2">
          <ActivityIslandWaveform paused={activity.paused} accentColor={accentColor} muted={activity.isStub} />
        </div>
      </div>

      {!activity.isStub ? (
        <>
          <div className="mt-5 flex items-center gap-3 text-[11px] font-medium tabular-nums text-white/40">
            <span>{formatClock(activity.currentTime)}</span>
            <div className="relative h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/85"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span>
              {activity.duration > 0
                ? `-${formatClock(Math.max(0, activity.duration - activity.currentTime))}`
                : "0:00"}
            </span>
          </div>

          <div className="relative mt-5 flex items-center justify-center gap-8 text-white">
            {showSkip ? (
              <button
                type="button"
                disabled={!hasPrevInQueue}
                onClick={onSkipPrev}
                className="p-1 transition-opacity hover:opacity-75 disabled:opacity-30 active:scale-90"
                aria-label="Previous"
              >
                <SkipBack size={24} fill="currentColor" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onPlayPause}
              className="p-1 transition-opacity hover:opacity-75 active:scale-90"
              aria-label={activity.paused ? "Play" : "Pause"}
            >
              {activity.paused ? <Play size={34} fill="currentColor" /> : <Pause size={34} fill="currentColor" />}
            </button>
            {showSkip ? (
              <button
                type="button"
                disabled={!hasNextInQueue}
                onClick={onSkipNext}
                className="p-1 transition-opacity hover:opacity-75 disabled:opacity-30 active:scale-90"
                aria-label="Next"
              >
                <SkipForward size={24} fill="currentColor" />
              </button>
            ) : null}
            <button
              type="button"
              className="absolute right-0 p-1 text-white/30 transition-colors hover:text-white/80"
              aria-label="AirPlay"
            >
              <Icon icon="lucide:airplay" width={20} />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
