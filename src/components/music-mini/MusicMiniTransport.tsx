import { Play, SkipForward, SkipBack, Shuffle, Repeat, Repeat1 } from "lucide-react";
import type { LoopMode } from "@/playbackLoopStorage";
import { loopModeAriaLabel } from "@/playbackLoopStorage";
import { cn } from "@/lib/utils";

type Props = {
  isPlaying: boolean;
  shuffled: boolean;
  loopMode: LoopMode;
  hasPrev: boolean;
  hasNext: boolean;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onShuffle: () => void;
  onLoop: () => void;
};

export function MusicMiniTransport({
  isPlaying,
  shuffled,
  loopMode,
  hasPrev,
  hasNext,
  onToggle,
  onNext,
  onPrev,
  onShuffle,
  onLoop,
}: Props) {
  return (
    <div className="w-full flex items-center justify-center gap-6 px-6 mt-8 mb-4">
      <button
        type="button"
        className={cn(
          "transition-colors duration-200",
          shuffled ? "rf-mm-control-active" : "text-gray-500 hover:text-white",
        )}
        onClick={onShuffle}
        aria-label="Shuffle"
      >
        <Shuffle size={18} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className="text-gray-400 hover:text-white transition-colors duration-200 disabled:opacity-30"
        onClick={onPrev}
        disabled={!hasPrev}
        aria-label="Previous"
      >
        <SkipBack size={20} fill="currentColor" />
      </button>
      <button
        type="button"
        className="relative w-16 h-16 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform duration-[220ms] overflow-hidden rf-mm-play-btn"
        onClick={onToggle}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        <Play
          size={24}
          fill="currentColor"
          className={cn(
            "transition-all duration-300 ml-1",
            isPlaying ? "opacity-0 scale-50 rotate-45 pointer-events-none" : "opacity-100 scale-100 rotate-0",
          )}
        />
        <div
          className={cn(
            "absolute bg-white transition-all duration-300",
            isPlaying ? "w-[18px] h-[18px] opacity-100 scale-100 rf-mm-play-pulse" : "opacity-0 scale-50 pointer-events-none",
          )}
        />
      </button>
      <button
        type="button"
        className="text-gray-400 hover:text-white transition-colors duration-200 disabled:opacity-30"
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Next"
      >
        <SkipForward size={20} fill="currentColor" />
      </button>
      <button
        type="button"
        className={cn(
          "transition-colors duration-200",
          loopMode !== "off" ? "rf-mm-control-active" : "text-gray-500 hover:text-white",
        )}
        onClick={onLoop}
        aria-label={loopModeAriaLabel(loopMode)}
      >
        {loopMode === "one" ? (
          <Repeat1 size={18} strokeWidth={2.5} />
        ) : (
          <Repeat size={18} strokeWidth={2.5} />
        )}
      </button>
    </div>
  );
}
