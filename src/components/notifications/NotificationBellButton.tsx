import { Icon } from "@iconify/react";
import { setNotificationPopoverOpen, useNotificationCenterStore } from "@/notifications/notificationCenterStore";
import { useUnreadCount } from "@/notifications/selectors";
import { titlebarIconButtonClass } from "../TitlebarHoverButton";
import { registerBellAnchor } from "./bellAnchor";
import { NotificationBadge } from "./NotificationBadge";

export function NotificationBellButton() {
  const open = useNotificationCenterStore((s) => s.popoverOpen);
  const unread = useUnreadCount();
  const tooltip = unread > 0 ? `${unread} unread` : "Notifications";

  return (
    <div ref={registerBellAnchor} className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center">
      <button
        type="button"
        data-tooltip={tooltip}
        aria-label={tooltip}
        aria-expanded={open}
        onClick={() => setNotificationPopoverOpen(!open)}
        className={titlebarIconButtonClass}
      >
        <Icon
          icon={open ? "tabler:bell-filled" : "tabler:bell"}
          width={18}
          height={18}
          className={open ? "text-[color:var(--accent)]" : undefined}
        />
      </button>
      <NotificationBadge count={unread} className="right-1 top-1.5" />
    </div>
  );
}
