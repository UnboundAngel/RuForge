import type { ReactNode } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import type { NotificationPrefs } from "@/notifications/types";
import type { WatchedChannel } from "@/watchlist/types";
import { CHECK_INTERVAL_OPTIONS } from "@/watchlist/watchlistSettings";
import { MiniToggle } from "./channels/MiniToggle";
import { controlLabelClass, panelLabelClass, panelRowDetailClass, raisedClass } from "./panelStyles";

export type PrefsHandlers = {
  onAlerts: (enabled: boolean) => void;
  onCheckInterval: (minutes: number) => void;
};

type Props = {
  prefs: NotificationPrefs;
  handlers: PrefsHandlers;
  channels: WatchedChannel[];
  onManageChannels: () => void;
  onAllSettings: () => void;
  compact?: boolean;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-2 pt-3">
      <h3 className={`pb-1 ${panelLabelClass}`}>{title}</h3>
      <div className="rf-settings-section-body">{children}</div>
    </section>
  );
}

function Row({
  title,
  description,
  control,
  stacked = false,
}: {
  title: string;
  description: string;
  control: ReactNode;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="rf-settings-row flex-col items-stretch! gap-2.5!">
        <div className="rf-settings-row-label space-y-0.5">
          <h4 className="text-stone-100">{title}</h4>
          <p className={panelRowDetailClass}>{description}</p>
        </div>
        {control}
      </div>
    );
  }
  return (
    <div className="rf-settings-row">
      <div className="rf-settings-row-label space-y-0.5">
        <h4 className="text-stone-100">{title}</h4>
        <p className={panelRowDetailClass}>{description}</p>
      </div>
      <div className="rf-settings-row-control">{control}</div>
    </div>
  );
}

function IntervalSelect({
  value,
  onChange,
  fill = false,
}: {
  value: number;
  onChange: (minutes: number) => void;
  fill?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Check interval" className={`flex p-1 ${fill ? "w-full" : ""} ${raisedClass}`}>
      {CHECK_INTERVAL_OPTIONS.map((o) => {
        const on = o.minutes === value;
        return (
          <button
            key={o.minutes}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.minutes)}
            className={`h-7 rounded-lg px-2.5 transition-colors duration-150 ${fill ? "flex-1" : ""} ${controlLabelClass} ${
              on
                ? "bg-[color:var(--accent)] text-[color:var(--rf-popover-cta-fg,#1d1613)]"
                : "text-stone-400 hover:bg-white/[0.05] hover:text-stone-200"
            }`}
          >
            {o.short}
          </button>
        );
      })}
    </div>
  );
}

export function NotificationPrefsView({
  prefs,
  handlers,
  channels,
  onManageChannels,
  onAllSettings,
  compact = false,
}: Props) {
  const autoCount = channels.filter((c) => c.autoDownload).length;

  return (
    <div className="pb-2">
      <Section title="Alerts">
        <Row
          title="New upload alerts"
          description="In app, or on the desktop island while RuForge is in the background."
          control={
            <MiniToggle
              active={prefs.alerts}
              label={prefs.alerts ? "Upload alerts on" : "Upload alerts off"}
              onChange={handlers.onAlerts}
            />
          }
        />
      </Section>
      <Section title="Schedule">
        <Row
          title="Check for uploads"
          description="How often followed channels are checked."
          stacked={compact}
          control={
            <IntervalSelect value={prefs.checkIntervalMin} onChange={handlers.onCheckInterval} fill={compact} />
          }
        />
      </Section>
      <Section title="Channels">
        <Row
          title="Followed channels"
          description={channels.length === 0 ? "Not following anyone yet." : `${autoCount} set to auto-download.`}
          control={
            <button
              type="button"
              onClick={onManageChannels}
              className={`flex min-w-[120px] items-center justify-between gap-3 px-4 py-2.5 text-stone-300 transition-colors duration-150 hover:bg-white/[0.1] hover:text-stone-100 ${raisedClass} ${controlLabelClass}`}
            >
              {channels.length} followed
              <ChevronRight size={12} className="text-stone-500" />
            </button>
          }
        />
      </Section>
      <button
        type="button"
        onClick={onAllSettings}
        className="group mx-2 mt-3 flex items-center gap-1.5 text-[11px] font-medium text-stone-500 transition-colors duration-150 hover:text-stone-200"
      >
        Open full Settings
        <ExternalLink size={12} />
      </button>
    </div>
  );
}
