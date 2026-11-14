import { formatApproxFileSize, formatDuration, formatTotalDuration } from "./downloaderFormat";
import { RollText } from "./RollText";

type Stat = { value: string; label: string; tooltip?: string; shimmer?: boolean };

export function HeroStats({
  duration,
  bytes,
  isPlaylist,
  videoCount,
  keptCount,
  sizeGrowing = false,
}: {
  duration: number;
  bytes: number | null | undefined;
  isPlaylist: boolean;
  videoCount: number;
  /** Rows still going to be downloaded after cancels. */
  keptCount?: number;
  /** The size is a running total that is still growing. */
  sizeGrowing?: boolean;
}) {
  const stats: Stat[] = [];
  if (duration > 0) {
    stats.push({
      value: isPlaylist ? formatTotalDuration(duration) : formatDuration(duration),
      label: isPlaylist ? "Runtime" : "Length",
    });
  }
  if (isPlaylist) {
    const cut = keptCount != null && keptCount < videoCount;
    stats.push({
      value: cut ? `${keptCount} of ${videoCount}` : String(videoCount),
      label: videoCount === 1 ? "Video" : "Videos",
    });
  }
  if (bytes != null && bytes > 0) {
    stats.push({
      value: `~${formatApproxFileSize(bytes)}`,
      label: "Size",
      tooltip: sizeGrowing ? "Still adding up sizes" : "Approximate size",
      shimmer: sizeGrowing,
    });
  }
  stats.push({ value: "YouTube", label: "Source" });

  return (
    <dl className="hidden items-end justify-center gap-x-10 gap-y-3 min-[600px]:flex sm:gap-x-14">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col-reverse items-center gap-1.5" data-tooltip={s.tooltip}>
          <dt className="text-[9px] font-black uppercase tracking-[0.3em] text-[color:var(--accent)] opacity-80">
            {s.label}
          </dt>
          <dd
            className={`font-display text-lg font-extrabold leading-none tracking-tight tabular-nums sm:text-2xl ${
              s.shimmer ? "rf-text-shimmer" : "text-stone-100"
            }`}
          >
            <RollText id={s.value}>{s.value}</RollText>
          </dd>
        </div>
      ))}
    </dl>
  );
}
