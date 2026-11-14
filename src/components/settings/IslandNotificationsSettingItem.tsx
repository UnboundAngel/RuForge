import { motion } from "motion/react";

import { useRuforgeStore } from "@/store/ruforgeStore";
import type { IslandMode } from "@/store/types";
import { Switch } from "../ui/Switch";
import { SettingItem } from "./settingsChrome";

const ISLAND_MODES: { id: IslandMode; label: string }[] = [
  { id: "always", label: "ALWAYS" },
  { id: "active", label: "WHEN ACTIVE" },
  { id: "off", label: "OFF" },
];

export function IslandNotificationsSettingItem() {
  const on = useRuforgeStore((s) => s.settings.notificationsInIsland === true);
  const mode = useRuforgeStore((s) => s.settings.islandMode);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  return (
    <>
      <SettingItem
        title="Dynamic Island over other apps"
        description="When active shows it only for playback, downloads and new uploads. Off keeps the top of your screen clear."
        keywords="dynamic island overlay always hide off other apps top of screen"
        control={
          <div className="flex p-1.5 bg-[color:var(--rf-set-well)] rounded-2xl shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)] border border-white/5">
            {ISLAND_MODES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => updateSetting("islandMode", id)}
                className={`relative px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-colors duration-300 ${
                  mode === id ? "text-[color:var(--rf-set-on-accent)]" : "text-stone-600 hover:text-stone-400"
                }`}
              >
                {mode === id && (
                  <motion.div
                    layoutId="activeIslandMode"
                    className="absolute inset-0 bg-[color:var(--accent)] rounded-xl z-0"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </button>
            ))}
          </div>
        }
      />
      <SettingItem
        title="Notifications in island"
        description="The bell opens notifications inside the Dynamic Island. Tapping the empty island opens them too."
        keywords="bell dynamic island"
        active={on}
        control={<Switch checked={on} onChange={() => updateSetting("notificationsInIsland", !on)} />}
      />
    </>
  );
}
