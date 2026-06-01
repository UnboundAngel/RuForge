import { useMemo } from "react";

import type { SponsorBlockSegment } from "@/sponsorBlock";
import type { Chapter } from "@/types";
import { sbSegmentColor, SPONSORBLOCK_CATEGORY_COLORS } from "@/sponsorBlockColors";
import { formatDuration } from "@/components/downloader/downloaderFormat";

type Props = {
  currentTime: number;
  duration: number;
  chapters: Chapter[] | null;
  sbSegments: SponsorBlockSegment[];
  musicOnlySkip: boolean;
  onToggleMusicOnlySkip: () => void;
  onSeek: (t: number) => void;
};

/** Human-readable category labels for SB. */
const CATEGORY_LABELS: Record<string, string> = {
  sponsor: "Sponsor",
  selfpromo: "Self-promo",
  interaction: "Interaction",
  intro: "Intro",
  outro: "Outro",
  preview: "Preview",
  filler: "Filler",
  music_offtopic: "Non-music section",
  poi_highlight: "Highlight",
};

export function MusicSegmentsTab({
  currentTime,
  duration,
  chapters,
  sbSegments,
  musicOnlySkip,
  onToggleMusicOnlySkip,
  onSeek,
}: Props) {
  const safeDuration = duration > 0 ? duration : 1;

  const skipSegments = useMemo(
    () => sbSegments.filter((s) => s.actionType === "skip"),
    [sbSegments],
  );
  const hasChapters = !!(chapters && chapters.length >= 2);

  // Active chapter index
  const activeChapterIdx = useMemo(() => {
    if (!hasChapters) return -1;
    let idx = -1;
    for (let i = 0; i < chapters!.length; i++) {
      if (currentTime >= chapters![i]!.start_time) idx = i;
    }
    return idx;
  }, [hasChapters, chapters, currentTime]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Music-only toggle */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-3 select-none"
      >
        <div>
          <p className="text-[13px] font-semibold tracking-wide" style={{ color: "var(--music-text-primary)" }}>
            Skip non-music sections
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--music-text-muted)" }}>
            Auto-seek past non-music SB segments
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleMusicOnlySkip}
          className="rf-music-toggle shrink-0 w-[36px] h-[20px] rounded-full relative transition-colors duration-200 cursor-pointer border-0 outline-none"
          style={{
            background: musicOnlySkip ? "var(--music-accent)" : "rgba(255,255,255,0.16)",
          }}
          aria-checked={musicOnlySkip}
          role="switch"
        >
          <span
            className="absolute top-[2px] left-[2px] w-[16px] h-[16px] rounded-full bg-white transition-transform duration-200 ease-out"
            style={{ transform: musicOnlySkip ? "translateX(16px)" : "translateX(0px)" }}
          />
        </button>
      </div>

      {/* Density strip */}
      {(skipSegments.length > 0 || hasChapters) && duration > 0 && (
        <div className="shrink-0 px-4 py-3">
          <DensityStrip
            duration={safeDuration}
            chapters={hasChapters ? chapters! : []}
            sbSegments={skipSegments}
            currentTime={currentTime}
            onSeek={onSeek}
          />
        </div>
      )}

      {/* Lists */}
      <div className="flex-1 min-h-0 overflow-y-auto rf-scrollbar">
        {hasChapters && (
          <Section label="Chapters">
            {chapters!.map((ch, i) => {
              const nextStart = chapters![i + 1]?.start_time ?? duration;
              const active = i === activeChapterIdx;
              return (
                <SegmentRow
                  key={ch.start_time}
                  active={active}
                  label={ch.title ?? `Chapter ${i + 1}`}
                  startTime={ch.start_time}
                  endTime={nextStart}
                  color={SPONSORBLOCK_CATEGORY_COLORS.chapter}
                  onSeek={onSeek}
                />
              );
            })}
          </Section>
        )}

        {skipSegments.length > 0 && (
          <Section label="SponsorBlock">
            {skipSegments.map((seg) => {
              const [start, end] = seg.segment;
              const active = currentTime >= start && currentTime < end;
              const color = sbSegmentColor(seg.category, seg.actionType) ?? "#a8a8a8";
              return (
                <SegmentRow
                  key={seg.UUID}
                  active={active}
                  label={
                    (seg.description?.trim()) ||
                    CATEGORY_LABELS[seg.category] ||
                    seg.category
                  }
                  startTime={start}
                  endTime={end}
                  color={color}
                  onSeek={onSeek}
                />
              );
            })}
          </Section>
        )}

        {!hasChapters && skipSegments.length === 0 && (
          <div className="flex items-center justify-center h-24 px-4 text-center">
            <p className="text-xs" style={{ color: "var(--music-text-muted)" }}>
              No segments for this track
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DensityStrip({
  duration,
  chapters,
  sbSegments,
  currentTime,
  onSeek,
}: {
  duration: number;
  chapters: Chapter[];
  sbSegments: SponsorBlockSegment[];
  currentTime: number;
  onSeek: (t: number) => void;
}) {
  const playheadPct = Math.min(100, (currentTime / duration) * 100);

  return (
    <div
      className="rf-music-density-strip relative w-full rounded-full overflow-hidden cursor-pointer"
      style={{ height: "5px", background: "rgba(255,255,255,0.1)" }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        onSeek(pct * duration);
      }}
    >
      {/* SB segment blocks */}
      {sbSegments.map((seg) => {
        const [start, end] = seg.segment;
        const left = (start / duration) * 100;
        const width = ((end - start) / duration) * 100;
        const color = sbSegmentColor(seg.category, seg.actionType);
        if (!color) return null;
        return (
          <div
            key={seg.UUID}
            className="absolute inset-y-0 rounded-sm"
            style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%`, background: color, opacity: 0.8 }}
          />
        );
      })}

      {/* Chapter divider ticks */}
      {chapters.map((ch) => {
        const left = (ch.start_time / duration) * 100;
        return (
          <div
            key={ch.start_time}
            className="absolute inset-y-0 w-px"
            style={{ left: `${left}%`, background: "rgba(255,255,255,0.3)" }}
          />
        );
      })}

      {/* Playhead */}
      <div
        className="absolute inset-y-0 w-0.5 rounded-full"
        style={{ left: `${playheadPct}%`, background: "#fff", opacity: 0.9 }}
      />
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <p
        className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest select-none"
        style={{ color: "var(--music-text-muted)" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function SegmentRow({
  active,
  label,
  startTime,
  endTime,
  color,
  onSeek,
}: {
  active: boolean;
  label: string;
  startTime: number;
  endTime: number;
  color: string;
  onSeek: (t: number) => void;
}) {
  return (
    <button
      type="button"
      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors text-left border-0 outline-none cursor-pointer select-none"
      style={active ? { background: "rgba(255,255,255,0.06)" } : {}}
      onClick={() => onSeek(startTime)}
    >
      <div
        className="shrink-0 w-2 h-2 rounded-full"
        style={{ background: color, opacity: 0.9 }}
      />
      <span
        className="flex-1 min-w-0 text-[12px] truncate"
        style={{ color: active ? "var(--music-accent)" : "var(--music-text-primary)" }}
      >
        {label}
      </span>
      <span
        className="shrink-0 text-[11px] tabular-nums font-normal"
        style={{ color: "var(--music-text-muted)" }}
      >
        {formatDuration(startTime)}
        {endTime > 0 && endTime < 999999 && `–${formatDuration(endTime)}`}
      </span>
    </button>
  );
}
