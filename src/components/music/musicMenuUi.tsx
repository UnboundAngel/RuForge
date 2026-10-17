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
import { HoverMarqueeText } from "./HoverMarqueeText";

export type MusicMenuTone = {
  panel: string;
  label: string;
  icon: string;
};

export type MusicMenuRowVariant = "default" | "danger";

/** One menu kit for every mode; the theme only swaps the palette (Music red on black, Library sand gold on brown). */
export type MenuTheme = "music" | "library";

const MENU_ACCENT = "var(--rf-menu-accent,var(--music-accent))";

const ROW_HOVER: Record<MusicMenuRowVariant, string> = {
  default: "hover:text-white hover:bg-white/[0.07]",
  danger:
    "hover:text-[color:var(--rf-menu-danger,var(--music-accent))] hover:bg-[color-mix(in_srgb,var(--rf-menu-danger,var(--music-accent))_14%,transparent)] [&:hover_.rf-menu-row-icon]:!text-[color:var(--rf-menu-danger,var(--music-accent))]",
};

export const MUSIC_MENU_WIDTH = 208;
export const MUSIC_MENU_ICON_SIZE = 13;
const MUSIC_MENU_EDGE_PAD = 10;

/** Red and black: sections share one near-black panel with a red label; Playback keeps a faint red wash as the primary group. */
const NEUTRAL_TONE: MusicMenuTone = {
  panel: "rgb(255 255 255 / 0.035)",
  label: `color-mix(in srgb, ${MENU_ACCENT} 70%, white)`,
  icon: "var(--rf-menu-icon,#b3b3b3)",
};

export const MUSIC_MENU_TONES = {
  playback: {
    panel: `color-mix(in srgb, ${MENU_ACCENT} 10%, transparent)`,
    label: `color-mix(in srgb, ${MENU_ACCENT} 70%, white)`,
    icon: MENU_ACCENT,
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

/** Where an open menu sits: under its trigger (`anchor`) or at the right-click point (`cursor`). */
export type MenuAt = { x: number; y: number; placement: MusicMenuPlacement };

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

const PANEL_BASE =
  "border rounded-[16px] shadow-2xl overflow-y-auto overflow-x-hidden rf-scrollbar p-1.5 flex flex-col gap-1";

/**
 * Floating menus portal to body, outside `[data-music-mode]`, so `music` redeclares its palette.
 * `library` reads the mode tokens, so a panel rendered in place (notification center) follows the mode it sits in.
 */
const PANEL_THEME: Record<MenuTheme, string> = {
  music: "[--music-accent:#ff0033] bg-[#0f0f0f] border-white/[0.1]",
  library:
    "[--rf-menu-accent:var(--accent)] [--rf-menu-danger:#f87171] [--rf-menu-icon:#a8a29e] bg-[color:var(--rf-popover-bg)] border-white/[0.06]",
};

function panelClass(theme: MenuTheme) {
  return cn(PANEL_BASE, PANEL_THEME[theme]);
}

export function MusicMenuPanel({
  className,
  children,
  theme = "music",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { theme?: MenuTheme }) {
  return (
    <div className={cn(panelClass(theme), className)} {...rest}>
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
  const iconColor = active ? MENU_ACCENT : tone.icon;

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
      <span className="min-w-0 flex-1">
        <HoverMarqueeText text={label} slow />
      </span>
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
  theme?: MenuTheme;
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
  theme = "music",
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
        className={panelClass(theme)}
        aria-label={ariaLabel}
        {...{ [PANEL_ATTR]: theme }}
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
function MusicMenuFlyout({
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
  const [theme, setTheme] = useState<MenuTheme>("music");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const panel = anchor.closest(`[${PANEL_ATTR}]`)?.getBoundingClientRect() ?? anchor.getBoundingClientRect();
    const owner = anchor.closest(`[${PANEL_ATTR}]`)?.getAttribute(PANEL_ATTR);
    setTheme(owner === "library" ? "library" : "music");
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
      className={panelClass(theme)}
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

const FLYOUT_OPEN_DELAY_MS = 120;
/** Grace for cutting diagonally across a neighbouring row on the way into the flyout. */
const FLYOUT_CLOSE_DELAY_MS = 250;

/** Row that opens a submenu beside the menu on hover (or click), like Spotify's submenus. */
export function MusicMenuFlyoutRow({
  icon,
  label,
  tone,
  ariaLabel,
  disabled = false,
  renderFlyout,
}: {
  icon: ReactNode;
  label: string;
  tone: MusicMenuTone;
  ariaLabel: string;
  disabled?: boolean;
  /** `openedByClick` lets the flyout focus its first control only when the user clicked in. */
  renderFlyout: (openedByClick: boolean) => ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [openedByClick, setOpenedByClick] = useState(false);
  const rowRef = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const later = (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };
  const cancel = () => window.clearTimeout(timer.current);

  const open = anchor != null;
  useEffect(() => {
    // Always on, so brushing past the row also cancels a pending open.
    const onMove = (e: MouseEvent) => {
      if (!isPointerOnSiblingMenuRow(e.target, rowRef.current)) return;
      if (open) later(() => setAnchor(null), FLYOUT_CLOSE_DELAY_MS);
      else cancel();
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <>
      <MusicMenuRow
        tone={tone}
        label={label}
        icon={icon}
        expanded={disabled ? undefined : open}
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          rowRef.current = el;
          if (anchor) cancel();
          else later(() => setAnchor(el), FLYOUT_OPEN_DELAY_MS);
        }}
        onClick={
          disabled
            ? undefined
            : () => {
                cancel();
                setOpenedByClick(true);
                if (rowRef.current) setAnchor(rowRef.current);
              }
        }
        trailing={<ChevronRight size={12} className="shrink-0 text-white/35" aria-hidden />}
      />
      {anchor && !disabled && (
        <MusicMenuFlyout anchor={anchor} ariaLabel={ariaLabel} onMouseEnter={cancel}>
          {renderFlyout(openedByClick)}
        </MusicMenuFlyout>
      )}
    </>
  );
}

/** Where a menu hanging off `el` should open: under it, right edges aligned for `end`. */
export function menuAnchorPoint(el: HTMLElement, align: "start" | "end" = "end"): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: align === "end" ? r.right - MUSIC_MENU_WIDTH : r.left, y: r.bottom + 6 };
}

/** Pointer over the owning menu but off this row and its flyout: the flyout should close. */
function isPointerOnSiblingMenuRow(target: EventTarget | null, row: HTMLElement | null): boolean {
  const el = target as Element | null;
  if (!el?.closest || !row) return false;
  if (row.contains(el) || el.closest(`[${FLYOUT_ATTR}]`)) return false;
  return el.closest(`[${PANEL_ATTR}]`) === row.closest(`[${PANEL_ATTR}]`);
}
