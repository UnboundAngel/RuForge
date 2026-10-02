import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

export type SkipFlashState = { side: "left" | "right"; amount: number; id: number };

const SKIP_FLASH_MS = 600;

/** Repeated presses on the same side within the window add up (+15s, +30s...), like YouTube. */
export function useSkipFlash() {
  const [flash, setFlash] = useState<SkipFlashState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSkip = useCallback((seconds: number) => {
    const side = seconds > 0 ? "right" : "left";
    setFlash((prev) =>
      prev && prev.side === side
        ? { side, amount: prev.amount + Math.abs(seconds), id: prev.id }
        : { side, amount: Math.abs(seconds), id: Date.now() },
    );
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setFlash(null), SKIP_FLASH_MS);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return { flash, showSkip };
}

export function PlayerSkipFlash({ flash, compact = false }: { flash: SkipFlashState | null; compact?: boolean }) {
  return (
    <AnimatePresence mode="popLayout">
      {flash && (
        <motion.div
          key={`${flash.side}-${flash.id}`}
          initial={{ opacity: 0, x: flash.side === "left" ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: flash.side === "left" ? -40 : 40 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={cn(
            "pointer-events-none absolute top-1/2 z-[100] -translate-y-1/2",
            flash.side === "left" ? "left-[15%]" : "right-[15%]",
          )}
        >
          <span
            className={cn(
              "whitespace-nowrap font-black uppercase text-white",
              compact
                ? "rounded-full bg-black/60 px-2.5 py-0.5 text-[13px] tabular-nums tracking-[0.08em]"
                : "text-[clamp(1.25rem,4vw,2.5rem)] tracking-[0.2em] opacity-40",
            )}
          >
            {flash.side === "left" ? "−" : "+"}
            {flash.amount}s
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
