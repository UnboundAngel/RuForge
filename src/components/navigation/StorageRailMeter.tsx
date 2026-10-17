import { useEffect } from "react";
import { HardDrive } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { CLEANUP_SUGGEST_USAGE_RATIO } from "@/cleanupCandidates";
import { cn } from "@/lib/utils";

/** Video-mode storage readout at the foot of the sidebar rail. */
export function StorageRailMeter() {
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
      data-tooltip={hasLimit ? `Storage ${detail}` : `Library ${detail}`}
      data-tooltip-side="right"
      className={cn(
        "flex w-10 shrink-0 items-center justify-center rounded-xl py-2 text-stone-500 transition-colors",
        saveToInternal ? "cursor-pointer hover:text-stone-200" : "cursor-default",
      )}
      aria-label={hasLimit ? `Library storage ${detail}` : `Library size ${detail}`}
    >
      {hasLimit ? (
        <span className="flex h-12 w-1 items-end overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
          <span
            className={cn(
              "h-full w-full origin-bottom rounded-full transition-[transform,background-color] duration-300",
              isFull
                ? "bg-[color:var(--accent)]"
                : isWarning
                  ? "bg-[color:color-mix(in_srgb,var(--accent),transparent_28%)]"
                  : "bg-stone-500/70",
            )}
            style={{ transform: `scaleY(${pct})` }}
          />
        </span>
      ) : (
        <HardDrive size={16} aria-hidden />
      )}
    </button>
  );
}
