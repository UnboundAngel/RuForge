import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";

const CIRCLE = 56;
const LABEL_LEFT = 50;
const LABEL_RIGHT = 24;

export const MUSIC_SOURCE_ICON_BTN =
  "rf-music-press w-10 h-10 flex items-center justify-center rounded-full text-white/60 hover:text-white disabled:opacity-40 disabled:hover:text-white/60";

type Props = {
  title: string;
  playing: boolean;
  shuffleOn: boolean;
  disabled?: boolean;
  onPlay: () => void;
  onToggleShuffle: () => void;
  trailing?: ReactNode;
};

export function MusicSourcePlayControls({
  title,
  playing,
  shuffleOn,
  disabled = false,
  onPlay,
  onToggleShuffle,
  trailing,
}: Props) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [labelWidth, setLabelWidth] = useState(0);

  useLayoutEffect(() => {
    if (labelRef.current) setLabelWidth(labelRef.current.offsetWidth);
  }, [disabled]);

  const width = playing && labelWidth ? LABEL_LEFT + labelWidth + LABEL_RIGHT : CIRCLE;

  return (
    <>
      {!disabled && (
        <>
          <button
            type="button"
            onClick={onPlay}
            style={{ width }}
            className={cn(
              "relative h-14 shrink-0 overflow-hidden rounded-full bg-[var(--music-accent)] text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
              "transition-[width,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.03] active:scale-95",
              "motion-reduce:transition-none",
            )}
            aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          >
            {/* Pinned to the circle so the icon never drifts while the pill grows. */}
            <span className="absolute inset-y-0 left-0 flex w-14 items-center justify-center">
              {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
            </span>
            <span
              ref={labelRef}
              aria-hidden
              style={{ left: LABEL_LEFT }}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-base font-bold",
                playing
                  ? "opacity-100 transition-opacity duration-150 delay-100"
                  : "opacity-0 transition-opacity duration-75",
              )}
            >
              Pause
            </span>
          </button>
          <button
            type="button"
            onClick={onToggleShuffle}
            className={cn(
              MUSIC_SOURCE_ICON_BTN,
              "rf-music-tooltip-anchor relative",
              shuffleOn && "text-[color:var(--music-accent)] hover:text-[color:var(--music-accent)]",
            )}
            aria-label={shuffleOn ? "Disable shuffle" : "Enable shuffle"}
            aria-pressed={shuffleOn}
            data-tooltip={shuffleOn ? "Disable shuffle" : "Enable shuffle"}
          >
            <Shuffle size={26} />
            {shuffleOn && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--music-accent)]" />
            )}
          </button>
        </>
      )}
      {trailing}
    </>
  );
}
