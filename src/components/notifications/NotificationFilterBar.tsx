import { NOTIFICATION_FILTERS } from "@/notifications/panelModel";
import type { NotificationCenterFilter } from "@/notifications/types";
import { controlLabelClass } from "./panelStyles";

type Props = {
  value: NotificationCenterFilter;
  /** Rows per filter id; a filter with none is left out. */
  total: Readonly<Record<NotificationCenterFilter, number>>;
  onChange: (filter: NotificationCenterFilter) => void;
};

export function NotificationFilterBar({ value, total, onChange }: Props) {
  return (
    <div role="tablist" aria-label="Filter notifications" className="-ml-1 flex min-w-0 items-center gap-1">
      {NOTIFICATION_FILTERS.filter((f) => f.id === "all" || total[f.id] > 0).map((f) => {
        const on = f.id === value;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(f.id)}
            className={`flex h-6 items-center rounded-full px-2.5 transition-colors duration-150 ${controlLabelClass} ${
              on
                ? "bg-white/[0.1] text-stone-100"
                : "text-stone-500 hover:bg-white/[0.05] hover:text-stone-200"
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
