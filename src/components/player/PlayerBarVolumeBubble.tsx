import type { ReactNode } from "react";
import { Slider } from "@/components/ui/Slider";
import { playerBarChromeClass } from "./PlayerBarCluster";

type PlayerBarVolumeBubbleProps = {
  muted: boolean;
  volume: number;
  isDragging: boolean;
  onToggleMute: () => void;
  onVolume: (level: number) => void;
  onDragChange: (dragging: boolean) => void;
  icon: ReactNode;
  "aria-label"?: string;
};

export function PlayerBarVolumeBubble({
  muted,
  volume,
  isDragging,
  onToggleMute,
  onVolume,
  onDragChange,
  icon,
  "aria-label": ariaLabel,
}: PlayerBarVolumeBubbleProps) {
  const slotOpen = isDragging
    ? "ml-[3px] w-[84px] pl-1.5 opacity-100"
    : "w-0 opacity-0 group-hover/vol:ml-[3px] group-hover/vol:w-[84px] group-hover/vol:pl-1.5 group-hover/vol:opacity-100";

  return (
    <div
      className={`group/vol inline-flex h-9 shrink-0 items-center overflow-hidden rounded-full pl-[3px] pr-[3px] group-hover/vol:pr-0 ${playerBarChromeClass}`}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onToggleMute}
        className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-transparent text-white"
      >
        {icon}
      </button>
      <div
        className={`flex shrink-0 items-center overflow-hidden transition-[width,opacity] duration-200 ease-out ${slotOpen}`}
      >
        <Slider
          label="Volume"
          level={muted ? 0 : volume}
          onChange={onVolume}
          onDragChange={onDragChange}
          onMiddleClick={onToggleMute}
          thumbFill="#1c1917"
          className="w-[68px] shrink-0"
        />
      </div>
    </div>
  );
}
