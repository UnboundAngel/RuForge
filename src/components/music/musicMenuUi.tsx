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

export const MUSIC_MENU_WIDTH = 208;
export const MUSIC_MENU_ICON_SIZE = 13;
export const MUSIC_MENU_EDGE_PAD = 10;

export const MUSIC_MENU_TONES = {
  playback: {
    panel: "color-mix(in srgb, var(--music-accent) 10%, transparent)",
    label: "color-mix(in srgb, var(--music-accent) 70%, white)",
    icon: "var(--music-accent)",
  },
  transport: {
    panel: "color-mix(in srgb, #38bdf8 10%, transparent)",
    label: "color-mix(in srgb, #7dd3fc 70%, white)",
    icon: "#7dd3fc",
  },
  player: {
    panel: "color-mix(in srgb, #a78bfa 10%, transparent)",
    label: "color-mix(in srgb, #c4b5fd 70%, white)",
    icon: "#c4b5fd",
  },
  navigate: {
    panel: "color-mix(in srgb, #34d399 10%, transparent)",
    label: "color-mix(in srgb, #6ee7b7 70%, white)",
    icon: "#6ee7b7",
  },
  queue: {
    panel: "color-mix(in srgb, #60a5fa 10%, transparent)",
    label: "color-mix(in srgb, #93c5fd 70%, white)",
    icon: "#93c5fd",
  },
  file: {
    panel: "color-mix(in srgb, #fbbf24 10%, transparent)",
    label: "color-mix(in srgb, #fcd34d 70%, white)",
    icon: "#fcd34d",
  },
} satisfies Record<string, MusicMenuTone>;

export function placeMusicFloatingMenu(
  x: number,
  y: number,
  width: number,
  height: number,
): { left: number; top: number } {
  let left = x;
  let top = y;
  if (left + width > window.innerWidth - MUSIC_MENU_EDGE_PAD) {
    left = Math.max(MUSIC_MENU_EDGE_PAD, window.innerWidth - width - MUSIC_MENU_EDGE_PAD);
  }
  if (left < MUSIC_MENU_EDGE_PAD) left = MUSIC_MENU_EDGE_PAD;
  if (top + height > window.innerHeight - MUSIC_MENU_EDGE_PAD) {
    top = Math.max(MUSIC_MENU_EDGE_PAD, y - height);
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

const PANEL_CLASS =
  "bg-[#0f0f0f] border border-white/[0.1] rounded-[16px] shadow-2xl overflow-y-auto overflow-x-hidden rf-scrollbar p-1.5 flex flex-col gap-1";

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
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tone: MusicMenuTone;
  active?: boolean;
  trailing?: ReactNode;
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
        "hover:text-white hover:bg-white/[0.07] border-0 outline-none text-left cursor-pointer transition-colors duration-100",
        active && "text-white",
      )}
      onClick={onClick}
    >
      <span className="shrink-0" style={{ color: iconColor }}>
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
  children: ReactNode;
};

export function MusicFloatingMenu({
  open,
  x,
  y,
  onClose,
  ariaLabel,
  measureKey,
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
    const rect = menuRef.current.getBoundingClientRect();
    setPos(placeMusicFloatingMenu(x, y, rect.width, rect.height));
    setPlaced(true);
  }, [open, x, y, measureKey]);

  useMusicMenuEscape(open, onClose);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </>,
    document.body,
  );
}
