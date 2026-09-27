import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type MusicMenuTone = {
  panel: string;
  label: string;
  icon: string;
};

export type MusicMenuRowVariant = "default" | "danger";

const ROW_HOVER: Record<MusicMenuRowVariant, string> = {
  default: "hover:text-white hover:bg-white/[0.07]",
  danger:
    "hover:text-[color:var(--music-accent)] hover:bg-[color-mix(in_srgb,var(--music-accent)_14%,transparent)] [&:hover_.rf-menu-row-icon]:!text-[color:var(--music-accent)]",
};

export const MUSIC_MENU_WIDTH = 208;
export const MUSIC_MENU_ICON_SIZE = 13;
export const MUSIC_MENU_EDGE_PAD = 10;

/** Red and black: sections share one near-black panel with a red label; Playback keeps a faint red wash as the primary group. */
const NEUTRAL_TONE: MusicMenuTone = {
  panel: "rgb(255 255 255 / 0.035)",
  label: "color-mix(in srgb, var(--music-accent) 70%, white)",
  icon: "#b3b3b3",
};

export const MUSIC_MENU_TONES = {
  playback: {
    panel: "color-mix(in srgb, var(--music-accent) 10%, transparent)",
    label: "color-mix(in srgb, var(--music-accent) 70%, white)",
    icon: "var(--music-accent)",
  },
  transport: NEUTRAL_TONE,
  player: NEUTRAL_TONE,
  navigate: NEUTRAL_TONE,
  queue: NEUTRAL_TONE,
  playlist: NEUTRAL_TONE,
  file: NEUTRAL_TONE,
} satisfies Record<string, MusicMenuTone>;

/**
 * `anchor` flips above when there is no room below, so a menu hanging off a button never covers it.
 * `cursor` slides up just enough to fit, like Spotify's right-click menu, so it stays beside the pointer.
 */
export type MusicMenuPlacement = "anchor" | "cursor";

export function placeMusicFloatingMenu(
  x: number,
  y: number,
  width: number,
  height: number,
  placement: MusicMenuPlacement = "anchor",
): { left: number; top: number } {
  let left = x;
  let top = y;
  if (left + width > window.innerWidth - MUSIC_MENU_EDGE_PAD) {
    left = Math.max(MUSIC_MENU_EDGE_PAD, window.innerWidth - width - MUSIC_MENU_EDGE_PAD);
  }
  if (left < MUSIC_MENU_EDGE_PAD) left = MUSIC_MENU_EDGE_PAD;
  if (top + height > window.innerHeight - MUSIC_MENU_EDGE_PAD) {
    top =
      placement === "cursor"
        ? Math.max(MUSIC_MENU_EDGE_PAD, window.innerHeight - height - MUSIC_MENU_EDGE_PAD)
        : Math.max(MUSIC_MENU_EDGE_PAD, y - height);
  }
  if (top < MUSIC_MENU_EDGE_PAD) top = MUSIC_MENU_EDGE_PAD;
  return { left, top };
}

export function dismissMusicMenuPointer(e: React.MouseEvent | MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

export function useMusicMenuEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);
}

export function useMusicMenuOutsideDismiss(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts?: { capture?: boolean; preventDefault?: boolean },
) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (opts?.preventDefault !== false) dismissMusicMenuPointer(e);
        onClose();
      }
    };
    document.addEventListener("mousedown", handle, { capture: opts?.capture ?? true });
    return () => document.removeEventListener("mousedown", handle, { capture: opts?.capture ?? true });
  }, [open, onClose, containerRef, opts?.capture, opts?.preventDefault]);
}

/** Menus portal to body, outside `[data-music-mode]`, so the accent var must be redeclared here. */
const PANEL_CLASS =
  "[--music-accent:#ff0033] bg-[#0f0f0f] border border-white/[0.1] rounded-[16px] shadow-2xl overflow-y-auto overflow-x-hidden rf-scrollbar p-1.5 flex flex-col gap-1";

export function MusicMenuPanel({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(PANEL_CLASS, className)} {...rest}>
      {children}
    </div>
  );
}

export function MusicMenuSection({
  label,
  tone,
  children,
}: {
  label: string;
  tone: MusicMenuTone;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-[11px] px-1 py-1"
      style={{ background: tone.panel }}
    >
      <div
        className="px-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: tone.label }}
      >
        {label}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export function MusicMenuRow({
  icon,
  label,
  onClick,
  disabled = false,
  tone,
  active = false,
  trailing,
  variant = "default",
  onMouseEnter,
  expanded,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tone: MusicMenuTone;
  active?: boolean;
  trailing?: ReactNode;
  /** `danger` turns hover red for destructive actions like delete. */
  variant?: MusicMenuRowVariant;
  onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Keeps the hover look while this row's flyout is open. */
  expanded?: boolean;
}) {
  const iconColor = active ? "var(--music-accent)" : tone.icon;

  if (disabled || !onClick) {
    return (
      <div
        className="flex items-center gap-2 w-full px-1.5 h-8 rounded-lg text-[12px] text-white/28 cursor-default"
        aria-disabled="true"
      >
        <span className="shrink-0" style={{ color: iconColor, opacity: 0.45 }}>
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {trailing}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2 w-full px-1.5 h-8 rounded-lg text-[12px] text-[#cfcfcf]",
        "border-0 outline-none text-left cursor-pointer transition-colors duration-100",
        ROW_HOVER[variant],
        (active || expanded) && "text-white",
        expanded && "bg-white/[0.07]",
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      aria-haspopup={expanded === undefined ? undefined : "menu"}
      aria-expanded={expanded}
    >
      <span className="rf-menu-row-icon shrink-0 transition-colors duration-100" style={{ color: iconColor }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

export function MusicMenuSubmenuRow({
  icon,
  label,
  value,
  onClick,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onClick: () => void;
  tone: MusicMenuTone;
}) {
  return (
    <MusicMenuRow
      tone={tone}
      label={label}
      icon={icon}
      onClick={onClick}
      trailing={(
        <>
          <span className="shrink-0 tabular-nums text-[11px] text-white/45">{value}</span>
          <ChevronRight size={12} className="shrink-0 text-white/35" aria-hidden />
        </>
      )}
    />
  );
}

type FloatingMenuProps = {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  ariaLabel: string;
  measureKey?: string | number | boolean;
  placement?: MusicMenuPlacement;
  children: ReactNode;
};

const FLYOUT_ATTR = "data-music-menu-flyout";
const PANEL_ATTR = "data-music-menu-panel";
const FLYOUT_GAP = 4;

export function MusicFloatingMenu({
  open,
  x,
  y,
  onClose,
  ariaLabel,
  measureKey,
  placement = "anchor",
  children,
}: FloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [placed, setPlaced] = useState(false);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) {
      setPlaced(false);
      return;
    }
    // offset sizes ignore the entrance scale; the bounding rect would read the menu ~4% short.
    const { offsetWidth, offsetHeight } = menuRef.current;
    setPos(placeMusicFloatingMenu(x, y, offsetWidth, offsetHeight, placement));
    setPlaced(true);
  }, [open, x, y, measureKey, placement]);

  useMusicMenuEscape(open, onClose);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Element | null;
      // Flyouts portal separately, so clicks inside them are not "outside" this menu.
      if (target?.closest?.(`[${FLYOUT_ATTR}]`)) return;
      if (menuRef.current && !menuRef.current.contains(target as Node)) {
        dismissMusicMenuPointer(e);
        onClose();
      }
    };
    document.addEventListener("mousedown", handle, { capture: true });
    return () => document.removeEventListener("mousedown", handle, { capture: true });
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998]"
        aria-hidden
        onMouseDown={(e) => {
          dismissMusicMenuPointer(e);
          onClose();
        }}
      />
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: placed ? 1 : 0, scale: placed ? 1 : 0.96 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.1, ease: "easeOut" }}
        style={{
          position: "fixed",
          left: pos.left,
          top: pos.top,
          zIndex: 9999,
          width: MUSIC_MENU_WIDTH,
          maxHeight: `calc(100vh - ${MUSIC_MENU_EDGE_PAD * 2}px)`,
        }}
        className={PANEL_CLASS}
        aria-label={ariaLabel}
        {...{ [PANEL_ATTR]: "" }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </>,
    document.body,
  );
}

/**
 * Submenu beside the menu that owns `anchor` (a row): opens to the right, flips left when there
 * is no room, top-aligned with the row and slid up to stay on screen.
 */
export function MusicMenuFlyout({
  anchor,
  ariaLabel,
  measureKey,
  onMouseEnter,
  children,
}: {
  anchor: HTMLElement;
  ariaLabel: string;
  measureKey?: string | number;
  onMouseEnter?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const panel = anchor.closest(`[${PANEL_ATTR}]`)?.getBoundingClientRect() ?? anchor.getBoundingClientRect();
    const row = anchor.getBoundingClientRect();
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    let left = panel.right + FLYOUT_GAP;
    if (left + width > window.innerWidth - MUSIC_MENU_EDGE_PAD) left = panel.left - width - FLYOUT_GAP;
    left = Math.max(MUSIC_MENU_EDGE_PAD, left);
    // Offset by the panel's own padding so the flyout's first row lines up with this one.
    let top = row.top - 6;
    top = Math.min(top, window.innerHeight - height - MUSIC_MENU_EDGE_PAD);
    top = Math.max(MUSIC_MENU_EDGE_PAD, top);
    setPos({ left, top });
  }, [anchor, measureKey]);

  return createPortal(
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: pos ? 1 : 0 }}
      transition={{ duration: 0.1, ease: "easeOut" }}
      style={{
        position: "fixed",
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        zIndex: 10000,
        width: MUSIC_MENU_WIDTH,
        maxHeight: `calc(100vh - ${MUSIC_MENU_EDGE_PAD * 2}px)`,
      }}
      className={PANEL_CLASS}
      role="menu"
      aria-label={ariaLabel}
      {...{ [FLYOUT_ATTR]: "" }}
      onMouseEnter={onMouseEnter}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </motion.div>,
    document.body,
  );
}

/** Pointer over the owning menu but off this row and its flyout: the flyout should close. */
export function isPointerOnSiblingMenuRow(target: EventTarget | null, row: HTMLElement | null): boolean {
  const el = target as Element | null;
  if (!el?.closest || !row) return false;
  if (row.contains(el) || el.closest(`[${FLYOUT_ATTR}]`)) return false;
  return el.closest(`[${PANEL_ATTR}]`) === row.closest(`[${PANEL_ATTR}]`);
}
