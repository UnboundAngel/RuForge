import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import {
  SEVEN_DAYS_MS,
  formatListenDuration,
  getStatsSince,
  getTopArtists,
  getTopArtistsSince,
  getTopTracks,
  getTopTracksSince,
  getTotalListenTimeSec,
  getTotalPlayCount,
  type ListenStat,
  type TopArtistStat,
} from "./musicListenStats";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-[3px] h-4 rounded-full shrink-0" style={{ background: "var(--music-accent)" }} />
      <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--music-text-muted)" }}>
        {children}
      </h2>
    </div>
  );
}

type SummaryCardProps = {
  label: string;
  listenTimeSec: number;
  playCount: number;
  trackCount?: number;
};

function SummaryCard({ label, listenTimeSec, playCount, trackCount }: SummaryCardProps) {
  return (
    <div
      className="flex flex-col gap-2 rounded-2xl px-4 py-3 min-w-0"
      style={{ background: "var(--music-surface-elevated, rgba(255,255,255,0.06))" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--music-text-muted)" }}>
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums tracking-tight" style={{ color: "var(--music-text-primary)" }}>
        {formatListenDuration(listenTimeSec)}
      </p>
      <p className="text-xs" style={{ color: "var(--music-text-secondary)" }}>
        {playCount.toLocaleString()} {playCount === 1 ? "play" : "plays"}
        {trackCount != null && trackCount > 0 ? ` · ${trackCount} tracks` : ""}
      </p>
    </div>
  );
}

type TrackRowProps = {
  rank: number;
  row: ListenStat;
};

function TrackRow({ rank, row }: TrackRowProps) {
  const artist = row.artist.trim();
  return (
    <div className="flex items-center gap-3 min-w-0 py-2 px-1">
      <span
        className="shrink-0 w-6 text-right text-xs font-bold tabular-nums"
        style={{ color: rank <= 3 ? "var(--music-accent)" : "var(--music-text-muted)" }}
      >
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "var(--music-text-primary)" }}>
          {row.title || "Unknown"}
        </p>
        {artist && (
          <p className="text-xs truncate mt-0.5" style={{ color: "var(--music-text-secondary)" }}>
            {artist}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium tabular-nums" style={{ color: "var(--music-text-primary)" }}>
          {formatListenDuration(row.listenTimeSec)}
        </p>
        <p className="text-[10px] tabular-nums mt-0.5" style={{ color: "var(--music-text-muted)" }}>
          {row.playCount} {row.playCount === 1 ? "play" : "plays"}
        </p>
      </div>
    </div>
  );
}

type ArtistRowProps = {
  rank: number;
  row: TopArtistStat;
};

function ArtistRow({ rank, row }: ArtistRowProps) {
  return (
    <div className="flex items-center gap-3 min-w-0 py-2 px-1">
      <span
        className="shrink-0 w-6 text-right text-xs font-bold tabular-nums"
        style={{ color: rank <= 3 ? "var(--music-accent)" : "var(--music-text-muted)" }}
      >
        {rank}
      </span>
      <p className="flex-1 text-sm font-semibold truncate" style={{ color: "var(--music-text-primary)" }}>
        {row.display}
      </p>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium tabular-nums" style={{ color: "var(--music-text-primary)" }}>
          {formatListenDuration(row.listenTimeSec)}
        </p>
        <p className="text-[10px] tabular-nums mt-0.5" style={{ color: "var(--music-text-muted)" }}>
          {row.playCount} {row.playCount === 1 ? "play" : "plays"}
        </p>
      </div>
    </div>
  );
}

type Props = {
  onBack?: () => void;
};

export function MusicStatsView({ onBack }: Props) {
  const playingPath = useRuforgeStore((s) => s.playingFile?.path);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15000);
    return () => window.clearInterval(id);
  }, []);

  const snapshot = useMemo(() => {
    void tick;
    void playingPath;
    const week = getStatsSince(SEVEN_DAYS_MS);
    return {
      allTime: {
        listenTimeSec: getTotalListenTimeSec(),
        playCount: getTotalPlayCount(),
      },
      week,
      topTracks: getTopTracks(10),
      topArtists: getTopArtists(10),
      weekTracks: getTopTracksSince(10, SEVEN_DAYS_MS),
      weekArtists: getTopArtistsSince(10, SEVEN_DAYS_MS),
    };
  }, [playingPath, tick]);

  const hasAnyStats =
    snapshot.allTime.listenTimeSec > 0
    || snapshot.allTime.playCount > 0
    || snapshot.topTracks.length > 0;

  const showWeekLists =
    snapshot.week.listenTimeSec > 0
    && (snapshot.weekTracks.length > 0 || snapshot.weekArtists.length > 0);

  if (!hasAnyStats) {
    return (
      <div className="flex flex-col h-full">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-6 py-3 shrink-0 text-sm transition-opacity opacity-60 hover:opacity-100"
            style={{ color: "var(--music-text-secondary)" }}
          >
            <ChevronLeft size={16} /> Back
          </button>
        )}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm" style={{ color: "var(--music-text-muted)" }}>
            nothing tracked yet. play a song and your stats will show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto rf-scrollbar">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-6 py-3 shrink-0 text-sm transition-opacity opacity-60 hover:opacity-100"
          style={{ color: "var(--music-text-secondary)" }}
        >
          <ChevronLeft size={16} /> Back
        </button>
      )}

      <div className="flex flex-col gap-6 px-6 pb-8 pt-1 max-w-3xl">
        <header className="flex flex-col gap-1">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--music-text-primary)" }}
          >
            Your listening
          </h1>
          <p className="text-xs" style={{ color: "var(--music-text-muted)" }}>
            local stats from this device. play counts and listen time update as you listen.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SummaryCard
            label="All time"
            listenTimeSec={snapshot.allTime.listenTimeSec}
            playCount={snapshot.allTime.playCount}
          />
          <SummaryCard
            label="This week"
            listenTimeSec={snapshot.week.listenTimeSec}
            playCount={snapshot.week.playCount}
            trackCount={snapshot.week.trackCount}
          />
        </div>

        <section>
          <SectionLabel>Top tracks · all time</SectionLabel>
          <div
            className="rounded-2xl px-3 py-1"
            style={{ background: "var(--music-surface-elevated, rgba(255,255,255,0.06))" }}
          >
            {snapshot.topTracks.map((row, i) => (
              <TrackRow key={row.identityKey} rank={i + 1} row={row} />
            ))}
          </div>
        </section>

        <section>
          <SectionLabel>Top artists · all time</SectionLabel>
          <div
            className="rounded-2xl px-3 py-1"
            style={{ background: "var(--music-surface-elevated, rgba(255,255,255,0.06))" }}
          >
            {snapshot.topArtists.map((row, i) => (
              <ArtistRow key={row.artistKey} rank={i + 1} row={row} />
            ))}
          </div>
        </section>

        {showWeekLists && (
          <>
            <section>
              <SectionLabel>Top tracks · this week</SectionLabel>
              <div
                className="rounded-2xl px-3 py-1"
                style={{ background: "var(--music-surface-elevated, rgba(255,255,255,0.06))" }}
              >
                {snapshot.weekTracks.map((row, i) => (
                  <TrackRow key={row.identityKey} rank={i + 1} row={row} />
                ))}
              </div>
            </section>

            <section>
              <SectionLabel>Top artists · this week</SectionLabel>
              <div
                className="rounded-2xl px-3 py-1"
                style={{ background: "var(--music-surface-elevated, rgba(255,255,255,0.06))" }}
              >
                {snapshot.weekArtists.map((row, i) => (
                  <ArtistRow key={row.artistKey} rank={i + 1} row={row} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
