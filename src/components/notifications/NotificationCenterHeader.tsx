import { Icon } from "@iconify/react";
import { ChevronLeft, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { OVERLAY_EASE } from "@/lib/overlayMotion";
import type { NotificationCenterTab } from "@/notifications/types";

const iconButtonClass =
  "flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition-colors duration-150 hover:bg-white/[0.05] hover:text-stone-200";

type Props = {
  tab: NotificationCenterTab;
  unread: number;
  channelCount: number;
  onTab: (tab: NotificationCenterTab) => void;
  onClose: () => void;
};

function copyFor(tab: NotificationCenterTab, unread: number, channelCount: number) {
  if (tab === "settings") return { title: "Notification settings", subtitle: "Alerts and how often to check." };
  if (tab === "channels") {
    const subtitle =
      channelCount === 0
        ? "Follow a channel to hear about new uploads."
        : `Following ${channelCount} ${channelCount === 1 ? "channel" : "channels"}`;
    return { title: "Channels", subtitle };
  }
  return { title: "Notifications", subtitle: unread > 0 ? `${unread} new` : "You're all caught up." };
}

export function NotificationCenterHeader({ tab, unread, channelCount, onTab, onClose }: Props) {
  const reduceMotion = useReducedMotion();
  const nested = tab !== "feed";
  const { title, subtitle } = copyFor(tab, unread, channelCount);

  return (
    <header className="flex shrink-0 items-start gap-2 px-4 pb-3 pt-4">
      {nested ? (
        <button
          type="button"
          onClick={() => onTab("feed")}
          aria-label="Back to notifications"
          data-tooltip="Back"
          className={`-ml-2 mt-0.5 ${iconButtonClass}`}
        >
          <ChevronLeft size={20} />
        </button>
      ) : null}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: OVERLAY_EASE }}
          className="min-w-0 flex-1"
        >
          <h2 className="rf-settings-page-title truncate text-[1.375rem] leading-tight">{title}</h2>
          <p className="mt-0.5 truncate text-[13px] font-medium text-stone-500">{subtitle}</p>
        </motion.div>
      </AnimatePresence>
      <div className="-mr-2 flex shrink-0 items-center">
        {tab === "feed" ? (
          <>
            <button
              type="button"
              onClick={() => onTab("channels")}
              aria-label="Channels"
              data-tooltip="Channels"
              className={iconButtonClass}
            >
              <Icon icon="tabler:users" width={19} height={19} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onTab("settings")}
              aria-label="Notification settings"
              data-tooltip="Notification settings"
              className={iconButtonClass}
            >
              <Icon icon="tabler:settings" width={19} height={19} aria-hidden />
            </button>
          </>
        ) : null}
        <button type="button" onClick={onClose} aria-label="Close" data-tooltip="Close" className={iconButtonClass}>
          <X size={19} />
        </button>
      </div>
    </header>
  );
}
