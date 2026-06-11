import { useEffect, useMemo, useState } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import {
  formatListenDuration,
  getTopArtists,
  getTopTracks,
  getTotalListenTimeSec,
} from "./musicListenStats";

type Props = {
  onSeeAll?: () => void;
};

export function MusicHomeStatsStrip({ onSeeAll }: Props) {
  const playingPath = useRuforgeStore((s) => s.playingFile?.path);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15000);
    return () => window.clearInterval(id);
  }, []);

  const { topTracks, topArtists, totalLabel } = useMemo(() => {
    void tick;
    void playingPath;
    const topTracks = getTopTracks(5);
    const topArtists = getTopArtists(5);
    return {
      topTracks,
      topArtists,
      totalLabel: `${formatListenDuration(getTotalListenTimeSec())} listened`,
    };
  }, [playingPath, tick]);

  if (topTracks.length === 0 && topArtists.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          className="text-lg font-bold tracking-tight"
          style={{ color: "var(--music-text-primary)" }}
        >
          Your stats
        </h2>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--music-text-muted)" }}>
            {totalLabel}
          </span>
          {onSeeAll && (
            <button
              type="button"
              onClick={onSeeAll}
              className="flex items-center gap-0.5 text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ color: "var(--music-accent)" }}
            >
              See all
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topTracks.length > 0 && (
          <div
            className="rounded-2xl px-4 py-3 flex flex-col gap-2"
            style={{ background: "var(--music-surface-elevated, rgba(255,255,255,0.06))" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--music-text-muted)" }}>
              Top tracks
            </p>
            <ol className="flex flex-col gap-1.5 list-none m-0 p-0">
              {topTracks.map((row, i) => (
                <li key={row.identityKey} className="flex items-baseline gap-2 min-w-0 text-sm">
                  <span className="shrink-0 w-4 tabular-nums text-xs font-bold" style={{ color: "var(--music-accent)" }}>
                    {i + 1}
                  </span>
                  <span className="truncate font-medium" style={{ color: "var(--music-text-primary)" }}>
                    {row.title || "Unknown"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {topArtists.length > 0 && (
          <div
            className="rounded-2xl px-4 py-3 flex flex-col gap-2"
            style={{ background: "var(--music-surface-elevated, rgba(255,255,255,0.06))" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--music-text-muted)" }}>
              Top artists
            </p>
            <ol className="flex flex-col gap-1.5 list-none m-0 p-0">
              {topArtists.map((row, i) => (
                <li key={row.artistKey} className="flex items-baseline gap-2 min-w-0 text-sm">
                  <span className="shrink-0 w-4 tabular-nums text-xs font-bold" style={{ color: "var(--music-accent)" }}>
                    {i + 1}
                  </span>
                  <span className="truncate font-medium" style={{ color: "var(--music-text-primary)" }}>
                    {row.display}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
