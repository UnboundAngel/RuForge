import { useEffect } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { CLEANUP_SUGGEST_USAGE_RATIO } from "@/cleanupCandidates";
import { cn } from "@/lib/utils";

export function MusicStorageStrip() {
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
  const pct = hasLimit ? Math.min((usedGB / limitGB) * 100, 100) : 0;
  const isFull = hasLimit && usedGB >= limitGB;
  const isWarning = hasLimit && usedGB >= limitGB * CLEANUP_SUGGEST_USAGE_RATIO;

  const detail = hasLimit
    ? `${usedGB.toFixed(1)} / ${limitGB} GB`
    : `${usedGB.toFixed(1)} GB · ${stats.file_count.toLocaleString()} ${stats.file_count === 1 ? "file" : "files"}`;

  const handleClick = () => {
    if (saveToInternal) void openAuthorizeCleanupModal();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!saveToInternal}
      className={cn(
        "flex h-full w-full items-center gap-3 px-4 min-h-0",
        saveToInternal && "cursor-pointer transition-opacity hover:opacity-90",
        !saveToInternal && "cursor-default",
      )}
      style={{
        background: "var(--music-shell-chrome)",
        color: "var(--music-text-muted)",
      }}
      aria-label={hasLimit ? `Library storage ${detail}` : `Library size ${detail}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-widest shrink-0">
        Storage
      </span>
      <div className="flex flex-1 min-w-0 items-center gap-3">
        {hasLimit ? (
          <div
            className="flex-1 h-1 rounded-full overflow-hidden min-w-[48px]"
            style={{ background: "color-mix(in srgb, var(--music-text-muted) 18%, transparent)" }}
            aria-hidden
          >
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${pct}%`,
                background: isFull
                  ? "var(--music-accent)"
                  : isWarning
                    ? "color-mix(in srgb, var(--music-accent) 72%, transparent)"
                    : "color-mix(in srgb, var(--music-text-muted) 55%, transparent)",
              }}
            />
          </div>
        ) : null}
        <span
          className={cn(
            "text-xs font-medium tabular-nums shrink-0 ml-auto",
            isFull && "font-semibold",
          )}
          style={{ color: isFull ? "var(--music-accent)" : "var(--music-text-secondary)" }}
        >
          {detail}
        </span>
      </div>
    </button>
  );
}
