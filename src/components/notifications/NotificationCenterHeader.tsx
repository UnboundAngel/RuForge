import { Icon } from "@iconify/react";
import { ChevronLeft, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { OVERLAY_EASE } from "@/lib/overlayMotion";
import type { NotificationCenterTab } from "@/notifications/types";

const iconButtonBase =
  "flex items-center justify-center rounded-full text-stone-500 transition-colors duration-150 hover:bg-white/[0.05] hover:text-stone-200";
const fullIconButtonClass = `h-9 w-9 ${iconButtonBase}`;
const compactIconButtonClass = `h-7 w-7 ${iconButtonBase}`;

type Props = {
  tab: NotificationCenterTab;
  unread: number;
  channelCount: number;
  onTab: (tab: NotificationCenterTab) => void;
  onClose: () => void;
  compact?: boolean;
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

export function NotificationCenterHeader({ tab, unread, channelCount, onTab, onClose, compact = false }: Props) {
  const reduceMotion = useReducedMotion();
  const nested = tab !== "feed";
  const { title, subtitle } = copyFor(tab, unread, channelCount);
  const iconButtonClass = compact ? compactIconButtonClass : fullIconButtonClass;
  const iconSize = compact ? 16 : 19;

  return (
    <header
      className={`flex shrink-0 gap-2 ${compact ? "items-center px-4 pb-1 pt-3.5" : "items-start px-4 pb-3 pt-4"}`}
    >
      {nested ? (
        <button
          type="button"
          onClick={() => onTab("feed")}
          aria-label="Back to notifications"
          data-tooltip="Back"
          className={`${compact ? "-ml-1.5" : "-ml-2 mt-0.5"} ${iconButtonClass}`}
        >
          <ChevronLeft size={compact ? 17 : 20} />
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
          {compact ? (
            <p className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 text-[14px] font-bold text-stone-100">
                {tab === "settings" ? "Settings" : title}
              </span>
              <span className="truncate text-[11px] font-medium text-stone-500">{subtitle}</span>
            </p>
          ) : (
            <>
              <h2 className="rf-settings-page-title truncate text-[1.375rem] leading-tight">{title}</h2>
              <p className="mt-0.5 truncate text-[13px] font-medium text-stone-500">{subtitle}</p>
            </>
          )}
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
              <Icon icon="tabler:users" width={iconSize} height={iconSize} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onTab("settings")}
              aria-label="Notification settings"
              data-tooltip="Notification settings"
              className={iconButtonClass}
            >
              <Icon icon="tabler:settings" width={iconSize} height={iconSize} aria-hidden />
            </button>
          </>
        ) : null}
        <button type="button" onClick={onClose} aria-label="Close" data-tooltip="Close" className={iconButtonClass}>
          <X size={iconSize} />
        </button>
      </div>
    </header>
  );
}
