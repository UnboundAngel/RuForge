import type { ReactNode } from "react";
import { playerBarChromeClass } from "./PlayerBarCluster";

const TRAIL_GAP_PX = 10;
const THUMB_PX = 10;
const THUMB_INSET = THUMB_PX / 2;
const TRACK_W_PX = Math.round(52 * 1.3);
/** Full expanded slot: lead pad + track + trail. */
const SLOT_W_PX = 6 + TRACK_W_PX + TRAIL_GAP_PX;

type PlayerBarVolumeBubbleProps = {
  muted: boolean;
  volume: number;
  volumeRef: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  onToggleMute: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  icon: ReactNode;
};

export function PlayerBarVolumeBubble({
  muted,
  volume,
  volumeRef,
  isDragging,
  onToggleMute,
  onMouseDown,
  icon,
}: PlayerBarVolumeBubbleProps) {
  const level = muted ? 0 : volume;
  const slotOpen = isDragging
    ? "w-[84px] opacity-100"
    : "w-0 opacity-0 group-hover/vol:w-[84px] group-hover/vol:opacity-100";

  return (
    <div
      className={`group/vol inline-flex h-9 shrink-0 items-center overflow-hidden rounded-full pl-[3px] pr-[3px] group-hover/vol:pr-0 ${playerBarChromeClass}`}
    >
      <button
        type="button"
        onClick={onToggleMute}
        className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-transparent text-white"
      >
        {icon}
      </button>
      <div
        className={`ml-[3px] shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-out ${slotOpen}`}
      >
        <VolumeTrack
          volumeRef={volumeRef}
          level={level}
          onMouseDown={onMouseDown}
        />
      </div>
    </div>
  );
}

function VolumeTrack({
  volumeRef,
  level,
  onMouseDown,
}: {
  volumeRef: React.RefObject<HTMLDivElement | null>;
  level: number;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="flex h-[10px] items-center"
      style={{
        width: SLOT_W_PX,
        paddingLeft: 6,
        paddingRight: TRAIL_GAP_PX,
      }}
    >
      <div
        ref={volumeRef}
        className="relative cursor-pointer"
        style={{ width: TRACK_W_PX, height: THUMB_PX }}
        onMouseDown={onMouseDown}
      >
        <div className="absolute top-1/2 right-[5px] left-[5px] h-[3px] -translate-y-1/2 rounded-full bg-white/20" />
        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white"
          style={{
            left: THUMB_INSET,
            width:
              level <= 0
                ? 0
                : `calc((100% - ${THUMB_PX}px) * ${level})`,
          }}
        />
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{
            left: `calc(${THUMB_INSET}px + (100% - ${THUMB_PX}px) * ${level})`,
          }}
        />
      </div>
    </div>
  );
}
