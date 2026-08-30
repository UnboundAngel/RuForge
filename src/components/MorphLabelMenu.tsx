import { useEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import {
  MORPH_MENU_SHELL,
  MORPH_SPRING,
  useMeasuredSize,
  type MorphMenuItem,
} from "./ui/Morph";
import { cn } from "../lib/utils";

/**
 * Labeled chip that morphs into a downward menu (same Finch Morph spring).
 * Used for playlist sort — not the square icon MorphMenu.
 */
export function MorphLabelMenu({
  label,
  items,
  open,
  onOpenChange,
  ariaLabel = "Open menu",
}: {
  label: string;
  items: MorphMenuItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ariaLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const spring = reduceMotion ? { duration: 0 } : MORPH_SPRING;

  const depsKey = `${label}:${items.map((i) => `${i.id}:${i.active ? 1 : 0}`).join("\0")}`;
  const [chipMeasureRef, chipSize] = useMeasuredSize(true, label);
  const [menuMeasureRef, menuSize] = useMeasuredSize(true, depsKey);

  const restW = Math.max(72, chipSize?.w ?? 72);
  const restH = Math.max(30, chipSize?.h ?? 30);
  const openW = Math.max(restW, menuSize?.w ?? restW);
  const openH = Math.max(restH, menuSize?.h ?? restH);

  const target = open ? { w: openW, h: openH } : { w: restW, h: restH };
  const radius = open ? 14 : 10;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (event.target instanceof Node && el.contains(event.target)) return;
      onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const rowClass = (item: MorphMenuItem) =>
    cn(
      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold whitespace-nowrap transition-colors",
      item.active
        ? "bg-white/10 text-white"
        : "text-stone-400 hover:bg-white/[0.04] hover:text-white",
    );

  return (
    <div
      ref={rootRef}
      className={cn("relative shrink-0", open && "z-[100]")}
      style={{ width: restW, height: restH }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Measure chip + menu offscreen */}
      <div className="pointer-events-none absolute left-0 top-0 -z-10 opacity-0" aria-hidden>
        <div
          ref={chipMeasureRef}
          className="inline-flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em]"
        >
          {label}
          <ChevronDown size={12} />
        </div>
        <div ref={menuMeasureRef} className="w-fit">
          <div className="flex flex-col p-1">
            {items.map((item) => (
              <div key={item.id} className={rowClass(item)}>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <motion.div
        role={open ? "menu" : undefined}
        aria-label={open ? ariaLabel : undefined}
        className={cn(
          "absolute left-0 top-0 overflow-hidden",
          MORPH_MENU_SHELL,
        )}
        initial={false}
        animate={{
          width: target.w,
          height: target.h,
          borderRadius: radius,
        }}
        transition={spring}
      >
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "absolute inset-0 flex items-center gap-2 px-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-stone-400 outline-none hover:text-stone-200",
            open && "pointer-events-none opacity-0",
          )}
          onClick={() => onOpenChange(true)}
        >
          <span className="truncate">{label}</span>
          <ChevronDown size={12} className="shrink-0" />
        </button>

        <div
          className={cn(
            "absolute left-0 top-0 flex w-full flex-col p-1",
            !open && "pointer-events-none opacity-0",
          )}
          aria-hidden={!open}
        >
          {open
            ? items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={rowClass(item)}
                  onClick={() => {
                    item.onSelect?.();
                    onOpenChange(false);
                  }}
                >
                  {item.label}
                </button>
              ))
            : null}
        </div>
      </motion.div>
    </div>
  );
}

export function usePlaylistSortItems(
  sortMode: string,
  setSortMode: (mode: "manual" | "added-newest" | "added-oldest") => void,
): MorphMenuItem[] {
  return useMemo(
    () => [
      {
        id: "manual",
        label: "Manual",
        active: sortMode === "manual",
        onSelect: () => setSortMode("manual"),
      },
      {
        id: "added-newest",
        label: "Date added (newest)",
        active: sortMode === "added-newest",
        onSelect: () => setSortMode("added-newest"),
      },
      {
        id: "added-oldest",
        label: "Date added (oldest)",
        active: sortMode === "added-oldest",
        onSelect: () => setSortMode("added-oldest"),
      },
    ],
    [sortMode, setSortMode],
  );
}
