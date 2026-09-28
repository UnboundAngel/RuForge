import { X } from "lucide-react";
import { NOTIFICATION_FILTERS } from "@/notifications/panelModel";
import {
  NOTIFICATION_CENTER_TABS,
  type NotificationCenterFilter,
  type NotificationCenterTab,
} from "@/notifications/types";

const ENABLED_TABS = NOTIFICATION_CENTER_TABS.filter((t) => t.enabled);

type Props = {
  tab: NotificationCenterTab;
  filter: NotificationCenterFilter;
  unread: number;
  onTab: (tab: NotificationCenterTab) => void;
  onFilter: (filter: NotificationCenterFilter) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
};

export function NotificationCenterHeader({ tab, filter, unread, onTab, onFilter, onMarkAllRead, onClose }: Props) {
  return (
    <header className="shrink-0 space-y-2 px-3 pb-2 pt-3">
      <div className="flex items-center gap-1">
        {ENABLED_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={`rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors duration-150 ${
              tab === t.id
                ? "bg-[color:var(--rf-popover-raised)] text-stone-100"
                : "text-stone-500 hover:text-stone-300"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {tab === "feed" && unread > 0 ? (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="px-1.5 text-[11px] font-semibold text-stone-500 transition-colors duration-150 hover:text-[color:var(--accent)]"
            >
              Mark all read
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-stone-500 transition-colors duration-150 hover:text-stone-200"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {tab === "feed" ? (
        <div className="flex items-center gap-1 px-1">
          {NOTIFICATION_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilter(f.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150 ${
                filter === f.id
                  ? "bg-[color:var(--rf-popover-raised)] text-stone-100"
                  : "text-stone-500 hover:text-stone-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}
