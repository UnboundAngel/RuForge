import { useMemo } from "react";

import { mainChannelHandlers, mainPrefsHandlers } from "@/components/notifications/mainPanelHandlers";
import type { NotificationCenterPanelProps } from "@/components/notifications/NotificationCenterPanel";
import { useNotificationPrefs } from "@/components/notifications/useNotificationPrefs";
import { setNotificationTab, useNotificationCenterStore } from "@/notifications/notificationCenterStore";
import {
  closeNotificationPopover,
  markEveryNotificationRead,
  markOneNotificationRead,
  runNotificationAction,
} from "@/notifications/popoverActions";
import { useNotificationItems } from "@/notifications/selectors";
import { useChannelsUiStore } from "@/watchlist/channelManage";
import type { WatchedChannel } from "@/watchlist/types";
import { openNotificationSettings } from "@/watchlist/watchlistSettings";
import { useWatchlistStore } from "@/watchlist/watchlistStore";

const NO_CHANNELS: WatchedChannel[] = [];

/** Panel props while the notification center is open inside the island, else null. */
export function useIslandNotifications(enabled: boolean): NotificationCenterPanelProps | null {
  const open = useNotificationCenterStore((s) => s.popoverOpen);
  const tab = useNotificationCenterStore((s) => s.tab);
  const items = useNotificationItems();
  const channels = useWatchlistStore((s) => s.snapshot?.channels ?? NO_CHANNELS);
  const channelsUi = useChannelsUiStore();
  const prefs = useNotificationPrefs();

  return useMemo(
    () =>
      enabled && open
        ? {
            items,
            channels,
            channelsUi,
            channelHandlers: mainChannelHandlers,
            prefs,
            prefsHandlers: mainPrefsHandlers,
            tab,
            onAction: (item, action) => void runNotificationAction(item, action),
            onMarkRead: markOneNotificationRead,
            onMarkAllRead: markEveryNotificationRead,
            onTab: setNotificationTab,
            onOpenSettings: openNotificationSettings,
            onClose: closeNotificationPopover,
          }
        : null,
    [enabled, open, items, channels, channelsUi, prefs, tab],
  );
}
