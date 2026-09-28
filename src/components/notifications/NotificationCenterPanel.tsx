import { useMemo } from "react";
import { filterNotificationItems } from "@/notifications/panelModel";
import type {
  NotificationActionId,
  NotificationCenterFilter,
  NotificationCenterTab,
  NotificationItem,
} from "@/notifications/types";
import type { WatchedChannel } from "@/watchlist/types";
import { NotificationCenterHeader } from "./NotificationCenterHeader";
import { NotificationEmpty } from "./NotificationEmpty";
import { NotificationRow } from "./NotificationRow";

export type NotificationCenterPanelProps = {
  items: NotificationItem[];
  channels: WatchedChannel[];
  tab: NotificationCenterTab;
  filter: NotificationCenterFilter;
  onAction: (item: NotificationItem, action: NotificationActionId) => void;
  onMarkRead: (item: NotificationItem) => void;
  onMarkAllRead: () => void;
  onTab: (tab: NotificationCenterTab) => void;
  onFilter: (filter: NotificationCenterFilter) => void;
  onClose: () => void;
};

/** Props only, so the in-page popover and the overlay webview render the same panel. */
export function NotificationCenterPanel({
  items,
  channels,
  tab,
  filter,
  onAction,
  onMarkRead,
  onMarkAllRead,
  onTab,
  onFilter,
  onClose,
}: NotificationCenterPanelProps) {
  const unread = useMemo(() => items.reduce((n, i) => (i.read ? n : n + 1), 0), [items]);
  const shown = useMemo(() => filterNotificationItems(items, filter), [items, filter]);

  return (
    <div className="flex max-h-full min-h-0 flex-col">
      <NotificationCenterHeader
        tab={tab}
        filter={filter}
        unread={unread}
        onTab={onTab}
        onFilter={onFilter}
        onMarkAllRead={onMarkAllRead}
        onClose={onClose}
      />
      <div className="rf-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {tab === "channels" ? (
          <p className="px-4 py-10 text-center text-[12px] text-stone-500">
            {channels.length === 0
              ? "Not following anyone yet."
              : `Following ${channels.length} ${channels.length === 1 ? "channel" : "channels"}.`}
          </p>
        ) : shown.length === 0 ? (
          <NotificationEmpty onFollowChannel={() => onTab("channels")} />
        ) : (
          <ul className="space-y-1">
            {shown.map((item) => (
              <NotificationRow key={item.id} item={item} onAction={onAction} onMarkRead={onMarkRead} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
