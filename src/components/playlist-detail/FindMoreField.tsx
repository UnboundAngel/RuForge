import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { overlayPanelTransition } from "@/lib/overlayMotion";

const CLOSED_W = 76;
const OPEN_W = 300;

type Props = {
  open: boolean;
  query: string;
  loading: boolean;
  onOpen: () => void;
  onClose: () => void;
  onQuery: (q: string) => void;
};

/** "Find more" that widens into the YouTube search field in place, like Music's text action. */
export function FindMoreField({ open, query, loading, onOpen, onClose, onQuery }: Props) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  // Blur alone misses a click when the field never held focus, so an outside press folds an empty field too.
  useEffect(() => {
    if (!open || query) return;
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [open, query, onClose]);
  const fade = { duration: reduce ? 0 : 0.15, ease: "easeOut" } as const;
  return (
    <motion.div
      ref={box}
      initial={false}
      animate={{ width: open ? OPEN_W : CLOSED_W }}
      transition={reduce ? { duration: 0 } : overlayPanelTransition}
      className={cn(
        "relative h-8 shrink-0 overflow-hidden rounded-md transition-[background-color,box-shadow] duration-200",
        open && "bg-white/[0.07] focus-within:bg-white/[0.1] focus-within:ring-2 focus-within:ring-[color:var(--accent)]",
      )}
    >
      <motion.button
        type="button"
        onClick={onOpen}
        tabIndex={open ? -1 : 0}
        initial={false}
        animate={{ opacity: open ? 0 : 1 }}
        transition={fade}
        style={{ pointerEvents: open ? "none" : "auto" }}
        className="rf-music-press-soft absolute inset-0 flex items-center justify-end whitespace-nowrap px-1 text-sm font-bold text-white/60 transition-colors hover:text-white"
      >
        Find more
      </motion.button>
      <motion.label
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={fade}
        style={{ pointerEvents: open ? "auto" : "none", width: OPEN_W }}
        onBlur={(e) => {
          // Leaving an empty field folds it back; text keeps it open.
          if (!query && !e.currentTarget.contains(e.relatedTarget as Node | null)) onClose();
        }}
        className="absolute right-0 top-0 flex h-8 items-center gap-2 px-3 text-white/50"
      >
        <Search size={16} className="shrink-0" aria-hidden />
        {open ? (
          <input
            autoFocus
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
              }
            }}
            placeholder="Search YouTube"
            aria-label="Search YouTube"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-white/50 caret-[color:var(--accent)]"
          />
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className={cn("shrink-0 text-white/60 hover:text-white", loading && "animate-pulse")}
        >
          <X size={16} />
        </button>
      </motion.label>
    </motion.div>
  );
}
