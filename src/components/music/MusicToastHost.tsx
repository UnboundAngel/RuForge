import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CircleCheck, CircleX } from "lucide-react";
import { useMusicToasts } from "./musicToast";

const ICONS = { info: CircleCheck, warning: AlertTriangle, error: CircleX } as const;

/** Bottom-center pills above the player bar, like Spotify's. */
export function MusicToastHost() {
  const toasts = useMusicToasts((s) => s.toasts);
  return (
    <div
      data-music-mode="true"
      className="pointer-events-none fixed inset-x-0 bottom-28 z-[90] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-w-[min(100%,32rem)] items-center gap-2.5 rounded-lg bg-[#2a2a2a] px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
            >
              <Icon
                size={16}
                className={`shrink-0 ${t.tone === "warning" ? "text-amber-300" : "text-[color:var(--music-accent)]"}`}
              />
              <span>{t.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
