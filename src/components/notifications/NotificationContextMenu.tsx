import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { BellOff, Check, ClipboardCopy, Link } from "lucide-react";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MUSIC_MENU_WIDTH,
  MusicMenuPanel,
  MusicMenuRow,
  MusicMenuSection,
} from "@/components/music/musicMenuUi";
import { muteKeyForKind, muteLabel } from "@/notifications/muteModel";
import type { NotificationActionId, NotificationItem, NotificationMuteKey } from "@/notifications/types";
import { ACTION_META } from "./NotificationRowActions";

export type NotificationMenuState = { item: NotificationItem; x: number; y: number };

const EDGE_PAD = 8;

async function copyText(text: string): Promise<void> {
  try {
    await writeText(text);
  } catch {
    await navigator.clipboard.writeText(text).catch(() => undefined);
  }
}

type Props = {
  menu: NotificationMenuState;
  /** The menu stays inside the panel so every host treats clicks on it as inside the popover. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Extra panel height the menu needs below the click point; hosts grow to it up to their cap. */
  onReserve: (px: number) => void;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
  onMute: (key: NotificationMuteKey, muted: boolean) => void;
  onClose: () => void;
};

/** Music menu kit visuals, but positioned inside the panel instead of portaled to the page. */
export function NotificationContextMenu({ menu, containerRef, onReserve, onAction, onMarkRead, onMute, onClose }: Props) {
  const { item } = menu;
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const height = ref.current?.offsetHeight ?? 0;
    if (!container) return;
    onReserve(Math.max(0, menu.y + height + EDGE_PAD - container.offsetHeight));
    const place = () => {
      const left = Math.max(EDGE_PAD, Math.min(menu.x, container.offsetWidth - MUSIC_MENU_WIDTH - EDGE_PAD));
      const top = Math.max(EDGE_PAD, Math.min(menu.y, container.offsetHeight - height - EDGE_PAD));
      setPos({ left, top });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(container);
    return () => {
      observer.disconnect();
      onReserve(0);
    };
  }, [menu, containerRef, onReserve]);

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
  const icon = MUSIC_MENU_ICON_SIZE;
  const link = item.ref.url;
  const ownFailure = item.kind === "download-failed" || item.kind === "download-timed-out";
  const error = item.ref.error ?? (ownFailure ? item.subtitle : null);
  const errorLabel = ownFailure ? "Copy error" : "Copy failed attempt's error";
  const hasActions = item.actions.length > 0 || !item.read;
  const muteKey = muteKeyForKind(item.kind);

  return (
    <motion.div
      ref={ref}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={pos ? { opacity: 1, scale: 1 } : undefined}
      transition={{ duration: 0.1, ease: "easeOut" }}
      style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, width: MUSIC_MENU_WIDTH }}
      className="absolute z-50 origin-top-left"
      onContextMenu={(e) => e.preventDefault()}
    >
      <MusicMenuPanel theme="library" role="menu" aria-label="Notification options">
        {hasActions ? (
          <MusicMenuSection label="Actions" tone={MUSIC_MENU_TONES.playback}>
            {item.actions.map((action) => (
              <MusicMenuRow
                key={action}
                tone={MUSIC_MENU_TONES.playback}
                icon={ACTION_META[action].icon(icon)}
                label={ACTION_META[action].tooltip}
                onClick={select(() => onAction(item, action))}
              />
            ))}
            {!item.read ? (
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.playback}
                icon={<Check size={icon} strokeWidth={2.25} />}
                label="Mark read"
                onClick={select(() => onMarkRead(item))}
              />
            ) : null}
          </MusicMenuSection>
        ) : null}
        {error || link ? (
          <MusicMenuSection label="Copy" tone={MUSIC_MENU_TONES.file}>
            {error ? (
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.file}
                icon={<ClipboardCopy size={icon} strokeWidth={2.25} />}
                label={errorLabel}
                onClick={select(() => void copyText(error))}
              />
            ) : null}
            {link ? (
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.file}
                icon={<Link size={icon} strokeWidth={2.25} />}
                label="Copy link"
                onClick={select(() => void copyText(link))}
              />
            ) : null}
          </MusicMenuSection>
        ) : null}
        <MusicMenuSection label="Notifications" tone={MUSIC_MENU_TONES.file}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.file}
            icon={<BellOff size={icon} strokeWidth={2.25} />}
            label={`Mute ${muteLabel(muteKey).toLowerCase()}`}
            onClick={select(() => onMute(muteKey, true))}
          />
        </MusicMenuSection>
      </MusicMenuPanel>
    </motion.div>
  );
}
