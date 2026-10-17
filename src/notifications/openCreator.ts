import { openCreatorPage } from "@/components/library/creatorPageStore";
import { setNotificationPopoverOpen } from "./notificationCenterStore";

/** A creator card's face: close the panel and show their page in the library. */
export function openCreatorFromNotifications(channelId: string, channel: string): void {
  setNotificationPopoverOpen(false);
  openCreatorPage(channelId, channel);
}
