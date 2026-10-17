import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

type Size = "md" | "sm";

const SIZES: Record<Size, { track: string; knob: string; off: number; on: number }> = {
  md: { track: "h-6 w-12", knob: "h-4 w-4", off: 4, on: 28 },
  sm: { track: "h-5 w-9", knob: "h-3.5 w-3.5", off: 3, on: 19 },
};

const SPRING = { type: "spring", stiffness: 600, damping: 35 } as const;

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  size?: Size;
  disabled?: boolean;
  /** Preference is stored but has no effect in the current mode. */
  muted?: boolean;
  tooltip?: string;
};

export function Switch({
  checked,
  onChange,
  label,
  size = "md",
  disabled = false,
  muted = false,
  tooltip,
}: Props) {
  const reduceMotion = useReducedMotion();
  const s = SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-tooltip={tooltip}
      data-checked={checked ? "true" : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "rf-switch relative shrink-0 cursor-pointer rounded-full disabled:pointer-events-none disabled:opacity-50",
        s.track,
        muted && !disabled && "opacity-45",
      )}
    >
      <motion.span
        initial={false}
        animate={{ x: checked ? s.on : s.off }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
        className={cn("rf-switch-knob pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 rounded-full", s.knob)}
      />
    </button>
  );
}
