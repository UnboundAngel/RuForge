import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Finch Morph — the same surface changes size. Never animate to `auto`,
 * never use Framer `layout`. Pixel targets only.
 */
export const MORPH_SPRING = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.85,
};

export const MORPH_CONTENT_EASE = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1] as const,
};

export type MorphSize = { w: number; h: number };

export function useMeasuredSize(
  enabled: boolean,
  depsKey: string,
): [RefObject<HTMLDivElement | null>, MorphSize | null] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<MorphSize | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const next = { w: Math.ceil(el.offsetWidth), h: Math.ceil(el.offsetHeight) };
    setSize((prev) =>
      prev && prev.w === next.w && prev.h === next.h ? prev : next,
    );
  }, [enabled, depsKey]);

  return [ref, size];
}

export type MorphMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  submenu?: ReactNode;
};

type MorphMenuProps = {
  trigger: ReactNode;
  items: MorphMenuItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  shellClassName?: string;
  itemClassName?: string;
  activeItemClassName?: string;
  triggerSize?: number;
  /** `start` grows to the right of the chip (RuForge ⋯). */
  align?: "start" | "end";
  "aria-label"?: string;
  header?: ReactNode;
  footer?: ReactNode;
  onSubmenuChange?: (id: string | null) => void;
};

const MENU_WIDTH = 176;

/**
 * Pattern B — chip grows into the menu from the same origin.
 */
export function MorphMenu({
  trigger,
  items,
  open,
  onOpenChange,
  className,
  shellClassName,
  itemClassName,
  activeItemClassName,
  triggerSize = 32,
  align = "start",
  "aria-label": ariaLabel = "Open menu",
  header,
  footer,
  onSubmenuChange,
}: MorphMenuProps) {
  const reduceMotion = useReducedMotion();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuLayerRef = useRef<HTMLDivElement>(null);
  const [submenuId, setSubmenuId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const wasOpenRef = useRef(open);
  const spring = reduceMotion ? { duration: 0 } : MORPH_SPRING;

  useLayoutEffect(() => {
    if (open) {
      setClosing(false);
      wasOpenRef.current = true;
      if (menuLayerRef.current) {
        menuLayerRef.current.style.opacity = "1";
        menuLayerRef.current.style.visibility = "visible";
      }
      return;
    }
    if (menuLayerRef.current) {
      menuLayerRef.current.style.opacity = "0";
      menuLayerRef.current.style.visibility = "hidden";
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    if (reduceMotion) {
      setClosing(false);
      return;
    }
    setClosing(true);
    const timer = window.setTimeout(() => setClosing(false), 420);
    return () => window.clearTimeout(timer);
  }, [open, reduceMotion]);

  const [menuMeasureRef, menuSize] = useMeasuredSize(
    true,
    `${items.length}:${items.map((i) => i.label).join("\0")}:${submenuId ?? ""}:${header ? "1" : "0"}`,
  );

  const openHeight = Math.max(triggerSize, menuSize?.h ?? triggerSize);
  const target = open
    ? { w: MENU_WIDTH, h: openHeight }
    : { w: triggerSize, h: triggerSize };

  const radius = open
    ? 16
    : Math.min(999, Math.floor(Math.min(target.w, target.h) / 2));

  const setSubmenu = useCallback(
    (id: string | null) => {
      setSubmenuId(id);
      onSubmenuChange?.(id);
    },
    [onSubmenuChange],
  );

  const close = useCallback(() => {
    if (menuLayerRef.current) {
      menuLayerRef.current.style.opacity = "0";
      menuLayerRef.current.style.visibility = "hidden";
    }
    setSubmenu(null);
    if (!reduceMotion) setClosing(true);
    onOpenChange(false);
  }, [onOpenChange, reduceMotion, setSubmenu]);

  useEffect(() => {
    if (!open) {
      setSubmenu(null);
      return;
    }
    const onPointer = (event: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (event.target instanceof Node && el.contains(event.target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (submenuId) setSubmenu(null);
        else close();
      }
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, submenuId, setSubmenu]);

  const activeSubmenu = items.find((item) => item.id === submenuId)?.submenu;

  const rowClass = (item: MorphMenuItem) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold",
      item.danger
        ? "text-stone-300 hover:bg-red-500/10 hover:text-red-400"
        : "text-stone-300 hover:bg-white/5 hover:text-white",
      item.active && activeItemClassName,
      itemClassName,
    );

  const menuBody = (
    <>
      {header ? <div className="mb-0.5 px-2.5 py-2">{header}</div> : null}
      {items.map((item) => (
        <div key={item.id} className={rowClass(item)}>
          {item.icon}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.trailing}
        </div>
      ))}
      {submenuId ? activeSubmenu : null}
      {footer}
    </>
  );

  return (
    <div
      ref={rootRef}
      className={cn("relative shrink-0", className)}
      style={{ width: triggerSize, height: triggerSize }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 -z-10 opacity-0"
      >
        <div ref={menuMeasureRef} className="w-fit">
          <div className="flex w-44 flex-col p-1">{menuBody}</div>
        </div>
      </div>

      <motion.div
        role={open ? "menu" : undefined}
        id={panelId}
        aria-label={open ? ariaLabel : undefined}
        className={cn(
          "absolute bottom-0 z-[60] overflow-hidden border border-white/10",
          "bg-[#1D1613]/80 backdrop-blur-2xl shadow-2xl shadow-black/40",
          align === "start" ? "left-0" : "right-0",
          shellClassName,
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
          aria-controls={panelId}
          tabIndex={open ? -1 : 0}
          className={cn(
            "absolute inset-0 flex items-center justify-start text-stone-500 outline-none",
            "hover:text-stone-200",
            "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/20",
            "[&_svg]:block",
            open && "pointer-events-none",
          )}
          style={{
            opacity: open ? 0 : 1,
            transition: reduceMotion
              ? undefined
              : open
                ? "opacity 0ms"
                : closing
                  ? "opacity 120ms ease-out 60ms"
                  : "opacity 100ms ease-out",
          }}
          onClick={() => onOpenChange(true)}
        >
          <span className="grid aspect-square h-full shrink-0 place-items-center leading-none">
            {trigger}
          </span>
        </button>

        <div
          ref={menuLayerRef}
          className={cn(
            "absolute bottom-0 flex w-44 flex-col p-1",
            align === "start" ? "left-0" : "right-0",
            !open && "pointer-events-none",
          )}
          style={{
            opacity: open ? 1 : 0,
            visibility: open ? "visible" : "hidden",
          }}
          aria-hidden={!open}
        >
          {open ? (
            <>
              {header ? <div className="mb-0.5 px-2.5 py-2">{header}</div> : null}
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  tabIndex={0}
                  className={cn(
                    rowClass(item),
                    "outline-none transition-colors",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                  onClick={() => {
                    if (item.submenu) {
                      setSubmenu(submenuId === item.id ? null : item.id);
                      return;
                    }
                    item.onSelect?.();
                    close();
                  }}
                >
                  {item.icon}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.trailing}
                </button>
              ))}
              <AnimatePresence>
                {open && activeSubmenu ? (
                  <motion.div
                    key="morph-submenu"
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={reduceMotion ? { duration: 0 } : MORPH_CONTENT_EASE}
                    className="relative px-1.5 pb-1.5"
                  >
                    {activeSubmenu}
                  </motion.div>
                ) : null}
              </AnimatePresence>
              {footer}
            </>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

/** @deprecated alias — use MorphMenu */
export const MorphCardMenu = MorphMenu;
