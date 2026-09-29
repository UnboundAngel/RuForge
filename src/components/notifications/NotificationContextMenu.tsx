import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, ClipboardCopy, Link } from "lucide-react";
import { GalleryMenuTitle } from "@/components/library/LibraryVideoCard";
import { MORPH_CONTENT_EASE, MORPH_MENU_SHELL } from "@/components/ui/Morph";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";
import { ACTION_META } from "./NotificationRowActions";

export type NotificationMenuState = { item: NotificationItem; x: number; y: number };

const MENU_WIDTH = 176;
const EDGE_PAD = 8;

async function copyText(text: string): Promise<void> {
  try {
    await writeText(text);
  } catch {
    await navigator.clipboard.writeText(text).catch(() => undefined);
  }
}

/** Same row as the library ⋮ menu (`MorphMenu`): the primary action sits in an accent chip. */
function MenuRow({
  icon,
  label,
  primary = false,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  primary?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold text-stone-300 outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:bg-white/5 focus-visible:text-white"
    >
      {primary ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent),transparent_88%)] text-[color:var(--accent)]">
          {icon}
        </span>
      ) : (
        <span className="ml-1.5 flex shrink-0">{icon}</span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

type Props = {
  menu: NotificationMenuState;
  /** Panel size: the menu stays inside it so both hosts treat clicks on it as inside the popover. */
  bounds: { width: number; height: number };
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
  onClose: () => void;
};

export function NotificationContextMenu({ menu, bounds, onAction, onMarkRead, onClose }: Props) {
  const { item } = menu;
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    const left = Math.max(EDGE_PAD, Math.min(menu.x, bounds.width - MENU_WIDTH - EDGE_PAD));
    const top = menu.y + height > bounds.height - EDGE_PAD ? Math.max(EDGE_PAD, bounds.height - height - EDGE_PAD) : menu.y;
    setPos({ left, top });
  }, [menu, bounds]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // Capture and stop so Escape closes only the menu, not the popover under it.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  const select = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const link = item.ref.url;
  const ownFailure = item.kind === "download-failed" || item.kind === "download-timed-out";
  const error = item.ref.error ?? (ownFailure ? item.subtitle : null);
  const errorLabel = ownFailure ? "Copy error" : "Copy failed attempt's error";

  return (
    <motion.div
      ref={ref}
      role="menu"
      aria-label="Notification options"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={pos ? { opacity: 1, scale: 1 } : undefined}
      transition={MORPH_CONTENT_EASE}
      style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, width: MENU_WIDTH }}
      className={`absolute z-50 flex origin-top-left flex-col rounded-2xl p-1 ${MORPH_MENU_SHELL}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mb-0.5 px-2.5 py-2">
        <GalleryMenuTitle text={item.title} />
      </div>
      {item.actions.map((action, i) => (
        <MenuRow
          key={action}
          primary={i === 0}
          icon={ACTION_META[action].icon(i === 0 ? 13 : 14)}
          label={ACTION_META[action].tooltip}
          onSelect={select(() => onAction(item, action))}
        />
      ))}
      {!item.read ? (
        <MenuRow icon={<Check size={14} strokeWidth={2.5} />} label="Mark read" onSelect={select(() => onMarkRead(item))} />
      ) : null}
      {error ? (
        <MenuRow icon={<ClipboardCopy size={14} />} label={errorLabel} onSelect={select(() => void copyText(error))} />
      ) : null}
      {link ? (
        <MenuRow icon={<Link size={14} />} label="Copy link" onSelect={select(() => void copyText(link))} />
      ) : null}
    </motion.div>
  );
}
