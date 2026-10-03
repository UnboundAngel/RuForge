import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CircleCheck, CircleX, Loader2, X } from "lucide-react";
import { useRuforgeStore, type RuforgeNotification } from "@/store/ruforgeStore";

const ICONS: Record<
  NonNullable<RuforgeNotification["type"]>,
  { Icon: typeof CircleCheck; className: string }
> = {
  info: { Icon: CircleCheck, className: "text-[color:var(--accent)]" },
  progress: { Icon: Loader2, className: "animate-spin text-[color:var(--accent)]" },
  warning: { Icon: AlertTriangle, className: "text-amber-300" },
  error: { Icon: CircleX, className: "text-red-400" },
};

/**
 * Default-mode toasts: bottom-center pills, same shape as `MusicToastHost` in the Default palette.
 * Above the downloader and Settings overlays (z-300), under fullscreen and confirm dialogs.
 */
export function AppToastHost({ clearPlayerDock }: { clearPlayerDock: boolean }) {
  const notifications = useRuforgeStore((s) => s.notifications);
  const dismiss = useRuforgeStore((s) => s.dismissNotification);

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-[350] flex flex-col items-center gap-2 px-4 ${
        clearPlayerDock ? "bottom-28" : "bottom-12"
      }`}
      aria-live="polite"
    >
      <AnimatePresence>
        {notifications.slice(-3).map((n) => {
          const t = n.type ?? "info";
          const { Icon, className } = ICONS[t];
          const sticky = t === "error" || t === "progress";
          return (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              role={t === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-fit max-w-[min(100%,30rem)] items-center gap-2.5 rounded-xl bg-[#33271f] py-2.5 pl-4 pr-3 text-sm font-medium text-stone-100 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
            >
              <Icon size={16} className={`shrink-0 ${className}`} />
              <span className="line-clamp-2 min-w-0">{n.message}</span>
              {n.action && (
                <button
                  type="button"
                  onClick={() => {
                    n.action?.run();
                    dismiss(n.id);
                  }}
                  className="-my-1 ml-1 shrink-0 rounded-lg bg-[color-mix(in_srgb,var(--accent)_16%,#33271f)] px-3 py-1 text-[13px] font-semibold text-[color:var(--accent)] transition-[filter,transform] duration-150 hover:brightness-125 active:scale-[0.97]"
                >
                  {n.action.label}
                </button>
              )}
              {sticky && (
                <button
                  type="button"
                  onClick={() => dismiss(n.id)}
                  aria-label="Dismiss"
                  className="-my-1 ml-1 flex h-6 w-6 shrink-0 items-center justify-center text-stone-500 transition-colors hover:text-stone-200"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
