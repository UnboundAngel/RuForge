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
  counts,
  onChange,
}: {
  tabs: CreatorTab[];
  active: CreatorTab;
  counts: Partial<Record<CreatorTab, number>>;
  onChange: (tab: CreatorTab) => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div role="tablist" aria-label="Creator sections" className="flex items-end gap-8">
      {tabs.map((tab) => {
        const on = tab === active;
        const count = counts[tab];
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab)}
            className={`group/ctab relative flex items-start gap-1 pb-3 text-[15px] font-bold tracking-tight transition-colors duration-150 ${
              on ? "text-stone-50" : "text-stone-500 hover:text-stone-300"
            }`}
          >
            {LABELS[tab]}
            {count ? (
              <span
                className={`text-[10px] font-semibold tabular-nums leading-none transition-colors duration-150 ${
                  on ? "text-[color:var(--accent)]" : "text-stone-600 group-hover/ctab:text-stone-400"
                }`}
              >
                {count}
              </span>
            ) : null}
            {on ? (
              <motion.span
                layoutId="creatorTabDot"
                aria-hidden
                className="absolute inset-x-0 bottom-0 mx-auto h-1 w-1 rounded-full bg-[color:var(--accent)]"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.25, duration: 0.45 }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
