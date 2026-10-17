import type { KeyboardEvent, MouseEvent } from "react";
import { toggleSaved, useOfflineState } from "../offlineStore";
import type { CompanionItem } from "../types";

const R = 9;
const C = 2 * Math.PI * R;

type Props = { item: CompanionItem; size?: number; className?: string };

/** Span with a button role so it can sit inside a row that is itself a button. */
export function SaveButton({ item, size = 22, className }: Props) {
  const { saved, progress, queued, failed } = useOfflineState();
  const frac = progress.get(item.id);
  const waiting = queued.has(item.id);
  const saving = frac !== undefined || waiting;
  const isSaved = saved.has(item.id);
  const hasFailed = failed.has(item.id);
  const label = saving
    ? "Cancel download"
    : isSaved
      ? "Remove from this device"
      : hasFailed
        ? "Retry download"
        : "Save to this device";

  const act = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    void toggleSaved(item);
  };

  return (
    <span
      role="button"
      tabIndex={0}
      className={`ph-save${isSaved ? " ph-save--on" : ""}${hasFailed && !saving ? " ph-save--failed" : ""}${className ? ` ${className}` : ""}`}
      aria-label={label}
      aria-busy={saving}
      onClick={act}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") act(e); }}
    >
      {saving ? (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r={R} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
          <circle
            cx="12"
            cy="12"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - (waiting ? 0 : (frac ?? 0) > 0 ? frac! : 0.08))}
            strokeOpacity={waiting ? 0.35 : 1}
            className="ph-save-ring"
          />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="currentColor" />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <mask id={isSaved ? "rf-save-on" : "rf-save-off"}>
            <rect width="24" height="24" fill="#fff" />
            <path
              d={isSaved ? "M7.5 12.3l3 3 6-6.3" : "M12 6.5v8M8.3 11.3L12 15l3.7-3.7M8 18h8"}
              fill="none"
              stroke="#000"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </mask>
          <circle cx="12" cy="12" r="11" fill="currentColor" mask={`url(#${isSaved ? "rf-save-on" : "rf-save-off"})`} />
        </svg>
      )}
    </span>
  );
}
