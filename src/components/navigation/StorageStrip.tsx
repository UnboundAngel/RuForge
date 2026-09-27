import { useEffect } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { CLEANUP_SUGGEST_USAGE_RATIO } from "@/cleanupCandidates";
import { cn } from "@/lib/utils";

/** Video-mode twin of `MusicStorageStrip`, in the stone chrome palette. */
export function StorageStrip() {
  const stats = useRuforgeStore((s) => s.storageStats);
  const limitGB = useRuforgeStore((s) => s.settings.storageLimitGB);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const refreshStorageStats = useRuforgeStore((s) => s.refreshStorageStats);
  const openAuthorizeCleanupModal = useRuforgeStore((s) => s.openAuthorizeCleanupModal);

  useEffect(() => {
    void refreshStorageStats();
  }, [refreshStorageStats]);

  if (!stats) return null;

  const usedGB = stats.total_bytes / (1024 * 1024 * 1024);
  const hasLimit = saveToInternal && limitGB > 0;
  const pct = hasLimit ? Math.min(usedGB / limitGB, 1) : 0;
  const isFull = hasLimit && usedGB >= limitGB;
  const isWarning = hasLimit && usedGB >= limitGB * CLEANUP_SUGGEST_USAGE_RATIO;

  const detail = hasLimit
    ? `${usedGB.toFixed(1)} / ${limitGB} GB`
    : `${usedGB.toFixed(1)} GB · ${stats.file_count.toLocaleString()} ${stats.file_count === 1 ? "file" : "files"}`;

  return (
    <button
      type="button"
      onClick={() => {
        if (saveToInternal) void openAuthorizeCleanupModal();
      }}
      disabled={!saveToInternal}
      className={cn(
        "flex h-9 w-full shrink-0 items-center gap-3 bg-[#271C18] px-4 text-stone-500",
        saveToInternal ? "cursor-pointer transition-opacity hover:opacity-90" : "cursor-default",
      )}
      aria-label={hasLimit ? `Library storage ${detail}` : `Library size ${detail}`}
    >
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest">Storage</span>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {hasLimit ? (
          <div className="h-1 min-w-[48px] flex-1 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
            <div
              className={cn(
                "h-full origin-left rounded-full transition-[transform,background-color] duration-300",
                isFull
                  ? "bg-[color:var(--accent)]"
                  : isWarning
                    ? "bg-[color:color-mix(in_srgb,var(--accent),transparent_28%)]"
                    : "bg-stone-500/70",
              )}
              style={{ transform: `scaleX(${pct})` }}
            />
          </div>
        ) : null}
        <span
          className={cn(
            "ml-auto shrink-0 text-xs font-medium tabular-nums",
            isFull ? "font-semibold text-[color:var(--accent)]" : "text-stone-300",
          )}
        >
          {detail}
        </span>
      </div>
    </button>
  );
}
