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
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${
        active ? "bg-[color-mix(in_srgb,var(--accent),transparent_78%)]" : "bg-white/[0.1]"
      }`}
    >
      <motion.span
        initial={false}
        animate={{ x: active ? 20 : 4 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }}
        className={`pointer-events-none absolute left-0 top-1 h-4 w-4 rounded-full transition-colors duration-200 ${
          active ? "bg-[color:var(--accent)]" : "bg-stone-500"
        }`}
      />
    </button>
  );
}
