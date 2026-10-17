import { chapterAtTime, type NormalizedChapter } from "../chapters";

export const GHOST_HUD_SHOW_MS = 3000;

/** Boundary gaps only read as structure in this range; past it the line turns into dashes. */
export const GHOST_EDGE_MAX_GAPPED_CHAPTERS = 40;

export type GhostChapterPosition = {
  index: number;
  total: number;
  local01: number;
};

export function ghostChapterPosition(
  chapters: NormalizedChapter[] | null,
  timeSec: number,
): GhostChapterPosition | null {
  if (!chapters?.length) return null;
  const at = chapterAtTime(chapters, Math.max(0, timeSec));
  if (!at) return null;
  return { index: at.index, total: chapters.length, local01: at.localProgress01 };
}

export function ghostChapterReadout(
  chapters: NormalizedChapter[] | null,
  index: number,
  looping: boolean,
): string | null {
  const ch = chapters?.[index];
  if (!chapters || !ch) return null;
  const parts = [`${index + 1}/${chapters.length}`, ch.title];
  if (looping) parts.push("Loop");
  return parts.join(" · ");
}

export function ghostChapterDoneReadout(nextIndex: number, total: number): string {
  return `Chapter done · ${nextIndex + 1}/${total} next`;
}

export type GhostEdgeSegment = {
  /** Relative width; feeds a CSS grid `fr` column so the 1px gaps come out of the total. */
  fr: number;
  fill01: number;
};

export type GhostEdgeLayout = {
  segments: GhostEdgeSegment[];
  gapped: boolean;
};

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/** Played chapters fill, the current one fills to the playhead, later ones stay empty. */
export function ghostEdgeLayout(
  chapters: NormalizedChapter[] | null,
  durationSec: number,
  timeSec: number,
): GhostEdgeLayout {
  const n = chapters?.length ?? 0;
  if (!chapters || n < 2 || n >= GHOST_EDGE_MAX_GAPPED_CHAPTERS) {
    const fill = durationSec > 0 ? clamp01(timeSec / durationSec) : 0;
    return { segments: [{ fr: 1, fill01: fill }], gapped: false };
  }
  const pos = ghostChapterPosition(chapters, timeSec);
  const current = pos?.index ?? 0;
  return {
    gapped: true,
    segments: chapters.map((ch, i) => ({
      fr: Math.max(0.001, ch.end_time - ch.start_time),
      fill01: i < current ? 1 : i > current ? 0 : clamp01(pos?.local01 ?? 0),
    })),
  };
}

/**
 * Index of the chapter whose end the playhead just played through, or null. Only natural playback
 * counts: a step larger than `maxStepSec` is a seek. The last chapter ends with the video, so it
 * never counts.
 */
export function crossedChapterEnd(
  chapters: NormalizedChapter[] | null,
  prevSec: number | null,
  nextSec: number,
  maxStepSec: number,
): number | null {
  if (!chapters || chapters.length < 2 || prevSec == null) return null;
  const step = nextSec - prevSec;
  if (!(step > 0) || step > maxStepSec) return null;
  for (let i = 0; i < chapters.length - 1; i++) {
    const end = chapters[i]!.end_time;
    if (prevSec < end && nextSec >= end) return i;
  }
  return null;
}
