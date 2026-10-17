import { useEffect, useState } from "react";
import { cancelSave, saveMany, useOfflineState } from "../offlineStore";
import { Check, Download, X } from "./icons";
import type { CompanionItem } from "../types";

/** Saving this many at once asks for a second tap; Stop is always one tap. */
const CONFIRM_ABOVE = 25;
const CONFIRM_MS = 4000;

type Props = { items: CompanionItem[]; label: string; className?: string; withText?: boolean };

/** Batch save for a page or list: save the rest, or stop whatever of it is still downloading. */
export function SaveAllButton({ items, label, className = "ph-source-btn", withText = false }: Props) {
  const { saved, progress, queued } = useOfflineState();
  const open = items.filter((i) => !saved.has(i.id));
  const running = items.filter((i) => progress.has(i.id) || queued.has(i.id));
  const allSaved = items.length > 0 && open.length === 0;

  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), CONFIRM_MS);
    return () => window.clearTimeout(t);
  }, [armed]);

  const act = () => {
    if (running.length > 0) {
      running.forEach((i) => cancelSave(i.id));
    } else if (open.length > CONFIRM_ABOVE && !armed) {
      setArmed(true);
    } else {
      setArmed(false);
      saveMany(open, label);
    }
  };

  const text = running.length > 0 ? `Stop ${running.length}` : allSaved ? "Saved" : armed ? `Save ${open.length}? Tap again` : `Save ${open.length}`;
  const aria = running.length > 0 ? `Stop downloading ${label}` : allSaved ? `${label} is saved` : `Save ${label} to this device`;
  const Icon = running.length > 0 ? X : allSaved ? Check : Download;
  const ariaLabel = armed ? `Tap again to save ${open.length} items from ${label}` : aria;

  return (
    <button
      type="button"
      className={`${className}${withText ? " ph-save-all" : ""}${allSaved ? " ph-save-all--done" : ""}${armed ? " ph-save-all--armed" : ""}`}
      disabled={items.length === 0 || (allSaved && running.length === 0)}
      onClick={act}
      aria-label={ariaLabel}
    >
      <Icon size={withText ? 16 : 26} strokeWidth={2.25} />
      {withText ? text : null}
    </button>
  );
}
