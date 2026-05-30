import { useRuforgeStore } from "@/store/ruforgeStore";
import { cn } from "@/lib/utils";

type StorageGlyphProps = {
  size?: number;
  className?: string;
};

export function StorageGlyph({ size = 28, className }: StorageGlyphProps) {
  const stats = useRuforgeStore((s) => s.storageStats);
  const limitGB = useRuforgeStore((s) => s.settings.storageLimitGB);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);

  if (!saveToInternal || !stats) return null;

  const usedGB = stats.total_bytes / (1024 * 1024 * 1024);
  const pct = Math.min((usedGB / limitGB) * 100, 100);
  const isFull = usedGB >= limitGB;
  const isWarning = usedGB >= limitGB * 0.8;
  const tip = `${usedGB.toFixed(1)} / ${limitGB} GB`;

  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div
      className={cn(
        "group/storage relative flex items-center justify-center",
        className,
      )}
    >
      <svg width={size} height={size} className="rotate-[-90deg]" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(255 255 255 / 0.06)"
          strokeWidth={3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className={cn(
            "transition-colors duration-300",
            isFull
              ? "stroke-[color:var(--accent)]"
              : isWarning
                ? "stroke-[color:color-mix(in_srgb,var(--accent),transparent_40%)]"
                : "stroke-stone-600",
          )}
        />
      </svg>
      <span className="rf-rail-tooltip absolute left-[calc(100%+10px)] top-1/2 z-[280] -translate-y-1/2 opacity-0 group-hover/storage:opacity-100">
        {tip}
      </span>
    </div>
  );
}
