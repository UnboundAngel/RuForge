import { motion, useReducedMotion } from "motion/react";

type Props = {
  active: boolean;
  onChange: (next: boolean) => void;
  label: string;
};

/** Smaller Settings `ToggleSlot` on popover tokens, so it follows the Music palette too. */
export function MiniToggle({ active, onChange, label }: Props) {
  const reduceMotion = useReducedMotion();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      data-tooltip={label}
      onClick={() => onChange(!active)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 active:scale-[0.97] ${
        active ? "bg-[color-mix(in_srgb,var(--accent),transparent_78%)]" : "bg-white/[0.07]"
      }`}
    >
      <motion.span
        animate={{ x: active ? 18 : 3 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 35 }}
        className={`pointer-events-none absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-colors duration-200 ${
          active ? "bg-[color:var(--accent)]" : "bg-stone-600"
        }`}
      />
    </button>
  );
}
