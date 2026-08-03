import { SkipForward, SkipBack, Shuffle, Repeat, Repeat1 } from "lucide-react";
import type { LoopMode } from "@/playbackLoopStorage";
import { loopModeAriaLabel } from "@/playbackLoopStorage";
import { cn } from "@/lib/utils";
import { PlayPauseMorphIcon } from "@/components/ui/PlayPauseMorphIcon";

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
        <PlayPauseMorphIcon playing={isPlaying} size={24} className={isPlaying ? undefined : "ml-0.5"} />
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
