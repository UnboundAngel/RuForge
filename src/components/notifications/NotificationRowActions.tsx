import type { ReactNode } from "react";
import { Icon as Iconify } from "@iconify/react";
import { Check, Download, FolderOpen, HardDrive, Play, RotateCcw } from "lucide-react";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";

const ACTION_META: Record<NotificationActionId, { tooltip: string; icon: ReactNode }> = {
  queue: { tooltip: "Add to download queue", icon: <Download size={15} /> },
  "open-explorer": {
    tooltip: "Open in Explorer",
    icon: <Iconify icon="tabler:brand-youtube" width={16} height={16} />,
  },
  play: { tooltip: "Play", icon: <Play size={15} /> },
  "show-in-folder": { tooltip: "Show in folder", icon: <FolderOpen size={15} /> },
  retry: { tooltip: "Retry download", icon: <RotateCcw size={15} /> },
  "open-storage-settings": { tooltip: "Open storage settings", icon: <HardDrive size={15} /> },
};

const actionSlotClass = "flex h-7 w-7 items-center justify-center rounded-full";
const actionButtonClass = `${actionSlotClass} text-stone-400 transition-colors duration-150 hover:bg-[color:var(--rf-popover-raised)] hover:text-[color:var(--accent)] active:scale-[0.97]`;

type Props = {
  item: NotificationItem;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
};

export function NotificationRowActions({ item, onAction, onMarkRead }: Props) {
  // Upcoming premieres keep a visible but disabled Queue so the row explains why it cannot download yet.
  const queueHeld = item.source === "watchlist" && !item.actions.includes("queue");

  return (
    <div className="-ml-1.5 mt-1 flex items-center gap-0.5">
      {queueHeld ? (
        <button
          type="button"
          aria-disabled="true"
          aria-label="Available after the premiere"
          data-tooltip="Available after the premiere"
          className={`${actionSlotClass} cursor-default text-stone-600`}
        >
          <Download size={15} />
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
          <Check size={15} />
        </button>
      ) : null}
    </div>
  );
}
