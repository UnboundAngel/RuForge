import type { Chapter } from "./types";

export type NormalizedChapter = Chapter & { end_time: number };

export type ChapterAtTime = {
  index: number;
  chapter: NormalizedChapter;
  /** 0..1 progress within this chapter's time span */
  localProgress01: number;
};

function finitePositive(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

/**
 * Sort, fix end times, drop invalid rows. Returns null if fewer than two chapters.
 */
export function normalizeChapters(
  raw: Chapter[] | null | undefined,
  durationSec: number,
): NormalizedChapter[] | null {
  if (!raw?.length) return null;

  const sorted = raw
    .filter((c) => finitePositive(c.start_time))
    .sort((a, b) => a.start_time - b.start_time);
  if (sorted.length === 0) return null;

  const dur =
    finitePositive(durationSec) && durationSec > 0 ? durationSec : 0;
  const out: NormalizedChapter[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const ch = sorted[i];
    const nextStart =
      i + 1 < sorted.length ? sorted[i + 1].start_time : dur;
    let end = ch.end_time;
    if (!finitePositive(end) || end <= ch.start_time) {
      end =
        nextStart > ch.start_time
          ? nextStart
          : dur > ch.start_time
            ? dur
            : ch.start_time + 1;
    } else if (dur > 0 && end > dur) {
      end = dur;
    }
    const title = (ch.title ?? "").trim() || "Chapter";
    out.push({ start_time: ch.start_time, end_time: end, title });
  }

  return out.length >= 2 ? out : null;
}

export function chapterAtTime(
  chapters: NormalizedChapter[],
  t: number,
): ChapterAtTime | null {
  if (!chapters.length || !finitePositive(t)) {
    if (chapters.length > 0 && t <= 0) {
      const ch = chapters[0];
      return { index: 0, chapter: ch, localProgress01: 0 };
    }
    return null;
  }

  for (let i = chapters.length - 1; i >= 0; i--) {
    const ch = chapters[i];
    if (t >= ch.start_time) {
      const span = ch.end_time - ch.start_time;
      const local =
        span > 0
          ? Math.min(1, Math.max(0, (t - ch.start_time) / span))
          : t > ch.start_time
            ? 1
            : 0;
      return { index: i, chapter: ch, localProgress01: local };
    }
  }

  return { index: 0, chapter: chapters[0], localProgress01: 0 };
}

export function chapterAtHoverPercent(
  chapters: NormalizedChapter[],
  durationSec: number,
  hoverPercent: number,
): ChapterAtTime | null {
  if (!finitePositive(durationSec) || durationSec <= 0) return null;
  const t = (Math.min(100, Math.max(0, hoverPercent)) / 100) * durationSec;
  return chapterAtTime(chapters, t);
}

/** Global seek ratio (0..1) for jumping to a chapter start */
export function seekRatioForChapterStart(
  chapter: NormalizedChapter,
  durationSec: number,
): number {
  if (!finitePositive(durationSec) || durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, chapter.start_time / durationSec));
}

export function segmentWidthPercent(
  chapter: NormalizedChapter,
  durationSec: number,
): number {
  if (!finitePositive(durationSec) || durationSec <= 0) return 0;
  const span = Math.max(0, chapter.end_time - chapter.start_time);
  return (span / durationSec) * 100;
}

/** Horizontal center of a chapter segment on the scrubber (0..100). */
export function chapterSegmentCenterPercent(
  chapters: NormalizedChapter[],
  durationSec: number,
  chapterIndex: number,
): number {
  if (!finitePositive(durationSec) || durationSec <= 0) return 0;
  const ch = chapters[chapterIndex];
  if (!ch) return 0;
  const mid = (ch.start_time + ch.end_time) / 2;
  return Math.min(100, Math.max(0, (mid / durationSec) * 100));
}

/** CSS grid columns that sum to 100% width (unlike flex % + gap). */
export function chapterGridTemplateColumns(
  chapters: NormalizedChapter[],
  durationSec: number,
): string {
  if (!chapters.length) return "1fr";
  if (!finitePositive(durationSec) || durationSec <= 0) {
    return chapters.map(() => "minmax(0, 1fr)").join(" ");
  }
  return chapters
    .map((ch) => {
      const span = Math.max(0.001, ch.end_time - ch.start_time);
      // min width keeps tiny chapters visible as separate pills when count is high
      return `minmax(4px, ${span}fr)`;
    })
    .join(" ");
}

/** Buffered fill within one chapter segment (0..100) */
export function bufferedPercentInChapter(
  chapter: NormalizedChapter,
  bufferedGlobalPercent: number,
  durationSec: number,
): number {
  return progressPercentInChapter(
    chapter,
    bufferedGlobalPercent,
    durationSec,
  );
}

/** Hover scrub wash within one chapter segment (0..100), same mapping as buffered. */
export function hoverPercentInChapter(
  chapter: NormalizedChapter,
  hoverGlobalPercent: number,
  durationSec: number,
): number {
  return progressPercentInChapter(chapter, hoverGlobalPercent, durationSec);
}

/** Must match ChapterScrubber grid gap (Tailwind gap-[3px]). */
export const CHAPTER_SCRUB_GAP_PX = 3;

export type ChapterScrubSegmentLayout = {
  leftPx: number;
  widthPx: number;
};

function chapterSpanTotal(chapters: NormalizedChapter[], durationSec: number): number {
  const fromChapters = chapters.reduce(
    (sum, ch) => sum + Math.max(0, ch.end_time - ch.start_time),
    0,
  );
  if (fromChapters > 0) return fromChapters;
  return finitePositive(durationSec) ? durationSec : 0;
}

/** Pixel layout for each chapter pill; accounts for fixed inter-segment gaps. */
export function chapterScrubSegmentLayouts(
  chapters: NormalizedChapter[],
  durationSec: number,
  barWidthPx: number,
  gapPx = CHAPTER_SCRUB_GAP_PX,
): ChapterScrubSegmentLayout[] {
  if (!chapters.length || barWidthPx <= 0) {
    return chapters.map(() => ({ leftPx: 0, widthPx: 0 }));
  }

  const spanBase = chapterSpanTotal(chapters, durationSec);
  const n = chapters.length;
  const totalGap = Math.max(0, n - 1) * gapPx;
  const contentWidth = Math.max(0, barWidthPx - totalGap);
  const layouts: ChapterScrubSegmentLayout[] = [];
  let cursor = 0;

  for (let i = 0; i < n; i++) {
    if (i > 0) cursor += gapPx;
    const span = Math.max(0, chapters[i].end_time - chapters[i].start_time);
    const widthPx = spanBase > 0 ? (span / spanBase) * contentWidth : 0;
    layouts.push({ leftPx: cursor, widthPx });
    cursor += widthPx;
  }

  return layouts;
}

/** Playhead / cursor position on the full scrubber width (0..100). */
export function scrubberPercentForTime(
  chapters: NormalizedChapter[],
  durationSec: number,
  timeSec: number,
  barWidthPx: number,
  gapPx = CHAPTER_SCRUB_GAP_PX,
): number {
  if (barWidthPx <= 0) {
    return finitePositive(durationSec) && durationSec > 0
      ? (timeSec / durationSec) * 100
      : 0;
  }

  const at = chapterAtTime(chapters, timeSec);
  if (!at) {
    return finitePositive(durationSec) && durationSec > 0
      ? (timeSec / durationSec) * 100
      : 0;
  }

  const layouts = chapterScrubSegmentLayouts(
    chapters,
    durationSec,
    barWidthPx,
    gapPx,
  );
  const seg = layouts[at.index];
  if (!seg) return 0;
  const x = seg.leftPx + at.localProgress01 * seg.widthPx;
  return (x / barWidthPx) * 100;
}

/** Inverse of scrubberPercentForTime for hover and seek. */
export function timeForScrubberPercent(
  chapters: NormalizedChapter[],
  durationSec: number,
  percent: number,
  barWidthPx: number,
  gapPx = CHAPTER_SCRUB_GAP_PX,
): number {
  if (barWidthPx <= 0 || !finitePositive(durationSec) || durationSec <= 0) {
    return 0;
  }

  const x = (Math.min(100, Math.max(0, percent)) / 100) * barWidthPx;
  const layouts = chapterScrubSegmentLayouts(
    chapters,
    durationSec,
    barWidthPx,
    gapPx,
  );

  for (let i = 0; i < chapters.length; i++) {
    const seg = layouts[i];
    const segEnd = seg.leftPx + seg.widthPx;
    const inSegment =
      i === chapters.length - 1 ? x >= seg.leftPx && x <= segEnd : x >= seg.leftPx && x < segEnd;
    if (!inSegment) continue;

    const ch = chapters[i];
    const span = ch.end_time - ch.start_time;
    const localX = Math.max(0, Math.min(seg.widthPx, x - seg.leftPx));
    const localProgress = seg.widthPx > 0 ? localX / seg.widthPx : 0;
    return ch.start_time + localProgress * span;
  }

  return durationSec;
}

export function timeForScrubberClientX(
  chapters: NormalizedChapter[] | null,
  durationSec: number,
  clientX: number,
  barLeft: number,
  barWidth: number,
  gapPx = CHAPTER_SCRUB_GAP_PX,
): number {
  if (barWidth <= 0) return 0;
  const percent = ((clientX - barLeft) / barWidth) * 100;
  if (chapters && chapters.length >= 2 && finitePositive(durationSec)) {
    return timeForScrubberPercent(chapters, durationSec, percent, barWidth, gapPx);
  }
  return (percent / 100) * durationSec;
}

/** Hover wash width inside one chapter segment, aligned to cursor pixels. */
export function hoverFillPercentInChapter(
  chapterIndex: number,
  chapters: NormalizedChapter[],
  durationSec: number,
  hoverGlobalPercent: number,
  barWidthPx: number,
  gapPx = CHAPTER_SCRUB_GAP_PX,
): number {
  const chapter = chapters[chapterIndex];
  if (!chapter) return 0;

  if (barWidthPx <= 0) {
    return hoverPercentInChapter(chapter, hoverGlobalPercent, durationSec);
  }

  const hoverX = (hoverGlobalPercent / 100) * barWidthPx;
  const layouts = chapterScrubSegmentLayouts(
    chapters,
    durationSec,
    barWidthPx,
    gapPx,
  );
  const seg = layouts[chapterIndex];
  if (!seg || hoverX <= seg.leftPx) return 0;
  if (hoverX >= seg.leftPx + seg.widthPx) return 100;
  return ((hoverX - seg.leftPx) / seg.widthPx) * 100;
}

function progressPercentInChapter(
  chapter: NormalizedChapter,
  globalPercent: number,
  durationSec: number,
): number {
  if (!finitePositive(durationSec) || durationSec <= 0) return 0;
  const t = (globalPercent / 100) * durationSec;
  if (t <= chapter.start_time) return 0;
  if (t >= chapter.end_time) return 100;
  const span = chapter.end_time - chapter.start_time;
  if (span <= 0) return 0;
  return ((t - chapter.start_time) / span) * 100;
}

export function prevChapterIndex(
  _chapters: NormalizedChapter[],
  currentIndex: number,
): number | null {
  if (currentIndex > 0) return currentIndex - 1;
  return null;
}

export function nextChapterIndex(
  chapters: NormalizedChapter[],
  currentIndex: number,
): number | null {
  if (currentIndex < chapters.length - 1) return currentIndex + 1;
  return null;
}
