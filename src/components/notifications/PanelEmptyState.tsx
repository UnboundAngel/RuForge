import { Icon } from "@iconify/react";
import { controlLabelClass, panelRowDetailClass, raisedClass } from "./panelStyles";

type Props = {
  icon: string;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
};

/** Shared by the feed and Channels views so both empty screens read as one panel. */
export function PanelEmptyState({ icon, title, body, action }: Props) {
  return (
    <div className="flex flex-col items-center px-8 pb-8 pt-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--rf-popover-raised)]">
        <Icon icon={icon} width={24} height={24} className="text-stone-400" aria-hidden />
      </span>
      <p className="rf-settings-page-title mt-4 text-[1.125rem]">{title}</p>
      <p className={`mt-1 max-w-[280px] ${panelRowDetailClass}`}>{body}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className={`mt-5 px-4 py-2.5 text-stone-300 transition-colors duration-150 hover:bg-white/[0.1] hover:text-stone-100 ${raisedClass} ${controlLabelClass}`}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
