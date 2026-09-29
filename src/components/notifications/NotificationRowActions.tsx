import type { ReactNode } from "react";
import { Icon as Iconify } from "@iconify/react";
import { Check, Download, FolderOpen, HardDrive, Play, RotateCcw } from "lucide-react";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";

const ACTION_META: Record<NotificationActionId, { tooltip: string; icon: ReactNode }> = {
  queue: { tooltip: "Add to download queue", icon: <Download size={18} /> },
  "open-explorer": {
    tooltip: "Open in Explorer",
    icon: <Iconify icon="tabler:brand-youtube" width={19} height={19} />,
  },
  play: { tooltip: "Play", icon: <Play size={18} /> },
  "show-in-folder": { tooltip: "Show in folder", icon: <FolderOpen size={18} /> },
  retry: { tooltip: "Retry download", icon: <RotateCcw size={18} /> },
  "open-storage-settings": { tooltip: "Open storage settings", icon: <HardDrive size={18} /> },
};

const actionSlotClass = "flex h-7 w-7 items-center justify-center rounded-full";
const actionButtonClass = `${actionSlotClass} text-stone-100 transition-colors duration-150 hover:bg-white/15 hover:text-[color:var(--accent)] focus-visible:bg-white/15 focus-visible:outline-none`;

type Props = {
  item: NotificationItem;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
};

export function NotificationRowActions({ item, onAction, onMarkRead }: Props) {
  // Upcoming premieres keep a visible but disabled Queue so the row explains why it cannot download yet.
  const queueHeld = item.source === "watchlist" && !item.actions.includes("queue");

  return (
    <>
      {queueHeld ? (
        <button
          type="button"
          aria-disabled="true"
          aria-label="Available after the premiere"
          data-tooltip="Available after the premiere"
          className={`${actionSlotClass} cursor-default text-stone-500`}
        >
          <Download size={18} />
        </button>
      ) : null}
      {item.actions.map((action) => (
        <button
          key={action}
          type="button"
          aria-label={ACTION_META[action].tooltip}
          data-tooltip={ACTION_META[action].tooltip}
          onClick={() => onAction(item, action)}
          className={actionButtonClass}
        >
          {ACTION_META[action].icon}
        </button>
      ))}
      {!item.read ? (
        <button
          type="button"
          aria-label="Mark read"
          data-tooltip="Mark read"
          onClick={() => onMarkRead(item)}
          className={actionButtonClass}
        >
          <Check size={18} />
        </button>
      ) : null}
    </>
  );
}
