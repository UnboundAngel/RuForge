import { PlayPauseMorphIcon } from "@/components/ui/PlayPauseMorphIcon";

type Props = {
  indexLabel: string | number;
  isPlaying: boolean;
  showPause?: boolean;
  iconSize?: number;
  className?: string;
  labelClassName?: string;
};

/** Track index that fades to a centered play/pause icon on row hover. */
export function MusicTrackIndexPlay({
  indexLabel,
  isPlaying,
  showPause = false,
  iconSize = 14,
  className = "",
  labelClassName = "text-sm",
}: Props) {
  return (
    <div
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center ${className}`}
      style={{ color: isPlaying ? "var(--music-accent)" : "var(--music-text-muted)" }}
    >
      <span className={`tabular-nums transition-opacity duration-150 group-hover/row:opacity-0 ${labelClassName}`}>
        {isPlaying ? "♪" : indexLabel}
      </span>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover/row:opacity-100">
        <PlayPauseMorphIcon playing={showPause} size={iconSize} />
      </span>
    </div>
  );
}
