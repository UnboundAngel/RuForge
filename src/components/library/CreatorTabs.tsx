import { motion, useReducedMotion } from "framer-motion";
import type { CreatorTab } from "./creatorSections";

const LABELS: Record<CreatorTab, string> = {
  home: "Home",
  videos: "Videos",
  downloaded: "Downloaded",
  playlists: "Playlists",
};

export function CreatorTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: CreatorTab[];
  active: CreatorTab;
  onChange: (tab: CreatorTab) => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div role="tablist" aria-label="Creator sections" className="flex items-center gap-1">
      {tabs.map((tab) => {
        const on = tab === active;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab)}
            className={`relative h-9 rounded-full px-4 text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-150 ${
              on ? "text-[color:var(--accent)]" : "text-stone-500 hover:text-stone-300"
            }`}
          >
            {on ? (
              <motion.span
                layoutId="creatorTabHighlight"
                className="absolute inset-0 rounded-full bg-white/[0.07]"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.45 }}
              />
            ) : null}
            <span className="relative">{LABELS[tab]}</span>
          </button>
        );
      })}
    </div>
  );
}
