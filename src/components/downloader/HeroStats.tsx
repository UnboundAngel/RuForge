import { formatApproxFileSize, formatDuration, formatTotalDuration } from "./downloaderFormat";
import { RollText } from "./RollText";

type Stat = { value: string; label: string; tooltip?: string };

export function HeroStats({
  duration,
  bytes,
  isPlaylist,
  videoCount,
}: {
  duration: number;
  bytes: number | null | undefined;
  isPlaylist: boolean;
  videoCount: number;
}) {
  const stats: Stat[] = [];
  if (duration > 0) {
    stats.push({
      value: isPlaylist ? formatTotalDuration(duration) : formatDuration(duration),
      label: isPlaylist ? "Runtime" : "Length",
    });
  }
  if (isPlaylist) stats.push({ value: String(videoCount), label: videoCount === 1 ? "Video" : "Videos" });
  if (bytes != null && bytes > 0) {
    stats.push({ value: `~${formatApproxFileSize(bytes)}`, label: "Size", tooltip: "Approximate size" });
  }
  stats.push({ value: "YouTube", label: "Source" });

  return (
    <dl className="hidden items-end justify-center gap-x-10 gap-y-3 min-[600px]:flex sm:gap-x-14">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col-reverse items-center gap-1.5" data-tooltip={s.tooltip}>
          <dt className="text-[9px] font-black uppercase tracking-[0.3em] text-[color:var(--accent)] opacity-80">
            {s.label}
          </dt>
          <dd className="font-display text-lg font-extrabold leading-none tracking-tight text-stone-100 tabular-nums sm:text-2xl">
            <RollText id={s.value}>{s.value}</RollText>
          </dd>
        </div>
      ))}
    </dl>
  );
}
