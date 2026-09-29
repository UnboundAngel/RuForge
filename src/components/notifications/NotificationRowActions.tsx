import type { ReactNode } from "react";
import { Icon as Iconify } from "@iconify/react";
import { Check, Download, FolderOpen, HardDrive, Play, RotateCcw } from "lucide-react";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";

const ACTION_META: Record<NotificationActionId, { tooltip: string; icon: (size: number) => ReactNode }> = {
  queue: { tooltip: "Add to download queue", icon: (s) => <Download size={s} strokeWidth={2.25} /> },
  "open-explorer": {
    tooltip: "Open in Explorer",
    icon: (s) => <Iconify icon="tabler:brand-youtube" width={s + 1} height={s + 1} />,
  },
  play: { tooltip: "Play", icon: (s) => <Play size={s} strokeWidth={2.25} className="fill-current" /> },
  "show-in-folder": { tooltip: "Show in folder", icon: (s) => <FolderOpen size={s} strokeWidth={2.25} /> },
  retry: { tooltip: "Retry download", icon: (s) => <RotateCcw size={s} strokeWidth={2.25} /> },
  "open-storage-settings": { tooltip: "Open storage settings", icon: (s) => <HardDrive size={s} strokeWidth={2.25} /> },
};

type Props = {
  item: NotificationItem;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
};

/** Upcoming premieres keep a visible but disabled Queue so the row explains why it cannot download yet. */
function queueHeld(item: NotificationItem): boolean {
  return item.source === "watchlist" && !item.actions.includes("queue");
}

/** The one action that lives on the art: the thing you most likely came to do. */
export function NotificationPrimaryAction({ item, onAction }: Omit<Props, "onMarkRead">) {
  const held = queueHeld(item);
  const action = held ? null : item.actions[0];
  if (!held && !action) return null;
  const label = held ? "Available after the premiere" : ACTION_META[action!].tooltip;
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={held || undefined}
      data-tooltip={label}
      onClick={held ? undefined : () => onAction(item, action!)}
      className={`absolute inset-0 flex items-center justify-center rounded-[10px] bg-black/45 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100 ${
        held ? "cursor-default text-stone-400" : "text-stone-50"
      }`}
    >
      {held ? <Download size={22} strokeWidth={2.25} /> : ACTION_META[action!].icon(22)}
    </button>
  );
}

const sideButtonClass =
  "flex h-7 w-7 items-center justify-center rounded-full text-stone-500 transition-colors duration-150 hover:bg-white/[0.07] hover:text-stone-100 focus-visible:bg-white/[0.07] focus-visible:text-stone-100 focus-visible:outline-none";

/** Everything else, in a slim column that fades in with the row's hover. */
export function NotificationSideActions({ item, onAction, onMarkRead }: Props) {
  const rest = queueHeld(item) ? item.actions : item.actions.slice(1);
  return (
    <div className="flex w-7 shrink-0 flex-col items-center gap-1 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
      {rest.map((action) => (
        <button
          key={action}
          type="button"
          aria-label={ACTION_META[action].tooltip}
          data-tooltip={ACTION_META[action].tooltip}
          onClick={() => onAction(item, action)}
          className={sideButtonClass}
        >
          {ACTION_META[action].icon(15)}
        </button>
      ))}
      {!item.read ? (
        <button
          type="button"
          aria-label="Mark read"
          data-tooltip="Mark read"
          onClick={() => onMarkRead(item)}
          className={sideButtonClass}
        >
          <Check size={15} strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}
