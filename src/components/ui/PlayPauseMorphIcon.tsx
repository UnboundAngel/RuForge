import { useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type Props = {
  playing: boolean;
  size?: number;
  className?: string;
};

const SHAPES = {
  pause: ["M25 20 L42 20 L42 80 L25 80 Z", "M58 20 L75 20 L75 80 L58 80 Z"],
  play: ["M30 20 L76 46 L78 50 L30 50 Z", "M30 50 L78 50 L76 54 L30 80 Z"],
} as const;

export function PlayPauseMorphIcon({ playing, size = 24, className }: Props) {
  const reduceMotion = useReducedMotion();
  const transition = `d ${reduceMotion ? "1ms" : "200ms"} cubic-bezier(0.16, 1, 0.3, 1)`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn("shrink-0 overflow-visible", className)}
      aria-hidden
    >
      {SHAPES[playing ? "pause" : "play"].map((d, i) => (
        <path
          key={i}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={6}
          strokeLinejoin="round"
          style={{ d: `path("${d}")`, transition } as CSSProperties}
        />
      ))}
    </svg>
  );
}