import {
  checkChannelsNow,
  followFromPanel,
  setChannelAutoDownload,
  unfollowFromPanel,
} from "@/watchlist/channelManage";
import { setNotificationMuted } from "@/notifications/mute";
import { changeCheckInterval, setWatchlistAlerts } from "@/watchlist/watchlistSettings";
import type { ChannelHandlers } from "./channels/ChannelsPanel";
import type { PrefsHandlers } from "./NotificationPrefsView";

export const mainChannelHandlers: ChannelHandlers = {
  onFollowInput: (input) => void followFromPanel(input),
  onAutoDownload: setChannelAutoDownload,
  onUnfollow: unfollowFromPanel,
  onCheckNow: () => void checkChannelsNow(),
};

export const mainPrefsHandlers: PrefsHandlers = {
  onAlerts: setWatchlistAlerts,
  onCheckInterval: changeCheckInterval,
  onMute: setNotificationMuted,
};
