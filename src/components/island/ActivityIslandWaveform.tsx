import { memo } from "react";

import { ISLAND_WAVEFORM_BAR_COUNT } from "@/lib/islandWaveformLevels";

type Props = {
  levels: readonly number[];
  coverSrc?: string | null;
  accentColor: string;
  muted?: boolean;
  className?: string;
};

const TRACK_H = 16;
const MIN_BAR_H = 3;
const BAR_W_PX = 2.5;
const BAR_GAP_PX = 2.5;
const TRACK_W_PX =
  ISLAND_WAVEFORM_BAR_COUNT * BAR_W_PX + (ISLAND_WAVEFORM_BAR_COUNT - 1) * BAR_GAP_PX;

function barHeightPx(level: number): number {
  return MIN_BAR_H + level * (TRACK_H - MIN_BAR_H);
}

export const ActivityIslandWaveform = memo(function ActivityIslandWaveform({
  levels,
  coverSrc,
  accentColor,
  muted,
  className,
}: Props) {
  const useCoverArt = Boolean(coverSrc) && !muted;

  return (
    <div
      className={`flex h-4 shrink-0 items-center justify-center gap-[2.5px] ${className ?? ""}`}
      aria-hidden
    >
      {Array.from({ length: ISLAND_WAVEFORM_BAR_COUNT }, (_, i) => {
        const height = barHeightPx(levels[i] ?? 0);
        const sliceOffset = i * (BAR_W_PX + BAR_GAP_PX);

        return (
          <div
            key={i}
            className="flex h-full w-[2.5px] items-center justify-center overflow-hidden"
            style={{ contain: "strict" }}
          >
            <div
              className="w-full overflow-hidden rounded-full"
              style={{
                height: `${height}px`,
                transform: "translateZ(0)",
                willChange: "height",
              }}
            >
              {useCoverArt ? (
                <div
                  className="flex h-full w-full items-center justify-center overflow-hidden rounded-full"
                >
                  <div
                    className="rf-island-waveform-art-bg h-4 shrink-0"
                    style={{
                      width: TRACK_W_PX,
                      marginLeft: -sliceOffset,
                      backgroundImage: `url("${coverSrc}")`,
                      backgroundSize: `${TRACK_W_PX}px ${TRACK_H}px`,
                      backgroundPosition: "center center",
                      backgroundRepeat: "no-repeat",
                    }}
                  />
                </div>
              ) : (
                <div
                  className="h-full w-full rounded-full"
                  style={{
                    backgroundColor: muted ? "rgba(255,255,255,0.45)" : accentColor,
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
