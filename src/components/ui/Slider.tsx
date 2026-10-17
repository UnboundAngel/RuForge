import { useRef } from "react";
import { cn } from "@/lib/utils";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * The one slider (Music player bar look): 4px track, white fill, 12px square thumb with a
 * 2px white ring. `thumbFill` is the surface behind it, so the thumb reads as a hollow ring.
 */
export function Slider({
  level,
  onChange,
  label,
  valueText,
  step = 0.05,
  onDragChange,
  onMiddleClick,
  thumbFill,
  className,
}: {
  /** 0 to 1; pass 0 while muted. */
  level: number;
  onChange: (level: number) => void;
  label: string;
  /** Read out instead of the percentage, e.g. "5 seconds". */
  valueText?: string;
  /** Arrow-key increment, 0 to 1. */
  step?: number;
  onDragChange?: (dragging: boolean) => void;
  onMiddleClick?: () => void;
  thumbFill: string;
  /** Sizes the hit area; the track is centered in it. */
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = clamp01(level) * 100;

  const levelAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? clamp01((clientX - rect.left) / rect.width) : level;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 && onMiddleClick) {
      e.preventDefault();
      e.stopPropagation();
      onMiddleClick();
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onDragChange?.(true);
    onChange(levelAt(e.clientX));
    const onMove = (ev: MouseEvent) => onChange(levelAt(ev.clientX));
    const onUp = (ev: MouseEvent) => {
      onChange(levelAt(ev.clientX));
      onDragChange?.(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? level + step
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? level - step
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? 1
              : null;
    if (next == null) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(clamp01(next));
  };

  return (
    <div
      ref={trackRef}
      className={cn("relative h-4 cursor-pointer outline-none", className)}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={valueText}
      aria-label={label}
    >
      <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-sm bg-white/[0.18]" />
      <div
        className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-sm bg-white"
        style={{ width: `${pct}%` }}
      />
      <div
        className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white"
        style={{ left: `${pct}%`, background: thumbFill }}
      />
    </div>
  );
}
