import { motion } from "motion/react";
import { Music, Video } from "lucide-react";

const OPTIONS = [
  { audio: false, label: "Video", Icon: Video },
  { audio: true, label: "Audio", Icon: Music },
] as const;

export function HeroFormatSwitch({ audioOnly, onToggle }: { audioOnly: boolean; onToggle: () => void }) {
  return (
    <div role="radiogroup" aria-label="Download format" className="flex h-10 items-center rounded-full bg-[color:var(--rf-well-raised)] p-1 sm:h-12">
      {OPTIONS.map(({ audio, label, Icon }) => {
        const active = audio === audioOnly;
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={active ? undefined : onToggle}
            className={`relative flex h-full items-center gap-2 rounded-full px-3 text-[9px] font-black uppercase tracking-[0.25em] transition-[color,transform] active:scale-[0.97] sm:px-4 sm:text-[10px] ${
              active ? "text-[color:var(--accent)]" : "text-stone-500 hover:text-stone-300"
            }`}
          >
            {active && (
              <motion.span
                layoutId="hero-format-switch-pill"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
                className="absolute inset-0 rounded-full bg-[#3e2f27]"
              />
            )}
            <Icon size={13} strokeWidth={2.5} className="relative" />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
