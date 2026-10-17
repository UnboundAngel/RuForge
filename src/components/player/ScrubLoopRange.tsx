import { useCallback } from "react";

export type SectionLoop = { start: number; end: number | null };

type ScrubLoopRangeProps = {
  loop: SectionLoop;
  percentForTime: (seconds: number) => number;
  timeForClientX: (clientX: number) => number;
  onChange: (next: SectionLoop) => void;
  formatTime: (seconds: number) => string;
  /** Whether the track under this time is grown for hover, so each marker stays centred on its stretch. */
  expandedAt: (seconds: number) => boolean;
};

/** Smallest section a loop can shrink to while dragging a handle. */
const MIN_LOOP_SEC = 0.5;
/** Track heights at rest and grown; markers overhang the track by the same amount above and below. */
const TRACK_H = 6;
const TRACK_H_EXPANDED = 12;
const MARKER_OVERHANG = 6;

function LoopHandle({
  percent,
  label,
  trackH,
  onDrag,
}: {
  percent: number;
  label: string;
  trackH: number;
  onDrag: (clientX: number) => void;
}) {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onDrag(ev.clientX);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  return (
    <div
      className="group/loop pointer-events-auto absolute flex w-3 -translate-x-1/2 cursor-ew-resize justify-center transition-[height] duration-150"
      style={{ left: `${percent}%`, bottom: -MARKER_OVERHANG, height: trackH + MARKER_OVERHANG * 2 }}
      onPointerDown={onPointerDown}
      onMouseDown={(e) => e.stopPropagation()}
      data-tooltip={label}
    >
      <div className="rf-scrub-loop-handle h-full w-1 rounded-full transition-transform duration-150 group-hover/loop:scale-x-150" />
    </div>
  );
}

/** Draggable start and end markers for a section loop. The tinted stretch is drawn inside the track so it scales with it. */
export function ScrubLoopRange({ loop, percentForTime, timeForClientX, onChange, formatTime, expandedAt }: ScrubLoopRangeProps) {
  const heightAt = (t: number) => (expandedAt(t) ? TRACK_H_EXPANDED : TRACK_H);

  const dragStart = useCallback(
    (clientX: number) => {
      const t = Math.max(0, timeForClientX(clientX));
      onChange({ start: loop.end != null ? Math.min(t, loop.end - MIN_LOOP_SEC) : t, end: loop.end });
    },
    [loop.end, onChange, timeForClientX],
  );
  const dragEnd = useCallback(
    (clientX: number) => {
      const t = timeForClientX(clientX);
      onChange({ start: loop.start, end: Math.max(t, loop.start + MIN_LOOP_SEC) });
    },
    [loop.start, onChange, timeForClientX],
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-0">
      <LoopHandle
        percent={percentForTime(loop.start)}
        label={`Loop start ${formatTime(loop.start)}`}
        trackH={heightAt(loop.start)}
        onDrag={dragStart}
      />
      {loop.end != null && (
        <LoopHandle
          percent={percentForTime(loop.end)}
          label={`Loop end ${formatTime(loop.end)}`}
          trackH={heightAt(loop.end)}
          onDrag={dragEnd}
        />
      )}
    </div>
  );
}
