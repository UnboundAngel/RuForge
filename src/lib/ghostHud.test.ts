import { describe, expect, it } from "vitest";
import type { NormalizedChapter } from "../chapters";
import {
  crossedChapterEnd,
  ghostChapterDoneReadout,
  ghostChapterPosition,
  ghostChapterReadout,
  ghostEdgeLayout,
} from "./ghostHud";

const chapters: NormalizedChapter[] = [
  { title: "Spawn", start_time: 0, end_time: 60 },
  { title: "Nether portal", start_time: 60, end_time: 180 },
  { title: "Fortress", start_time: 180, end_time: 300 },
];

function many(n: number): NormalizedChapter[] {
  return Array.from({ length: n }, (_, i) => ({ title: `C${i}`, start_time: i * 10, end_time: (i + 1) * 10 }));
}

describe("ghostChapterPosition", () => {
  it("returns null without chapters", () => {
    expect(ghostChapterPosition(null, 10)).toBeNull();
    expect(ghostChapterPosition([], 10)).toBeNull();
  });

  it("finds the chapter and progress inside it", () => {
    expect(ghostChapterPosition(chapters, 0)).toEqual({ index: 0, total: 3, local01: 0 });
    expect(ghostChapterPosition(chapters, 120)).toEqual({ index: 1, total: 3, local01: 0.5 });
    expect(ghostChapterPosition(chapters, 300)).toEqual({ index: 2, total: 3, local01: 1 });
  });

  it("treats a boundary as the start of the next chapter", () => {
    expect(ghostChapterPosition(chapters, 60)).toEqual({ index: 1, total: 3, local01: 0 });
  });

  it("clamps negative time to the first chapter", () => {
    expect(ghostChapterPosition(chapters, -5)?.index).toBe(0);
  });
});

describe("ghostChapterReadout", () => {
  it("formats index, total and title", () => {
    expect(ghostChapterReadout(chapters, 1, false)).toBe("2/3 · Nether portal");
  });

  it("adds Loop when looping", () => {
    expect(ghostChapterReadout(chapters, 2, true)).toBe("3/3 · Fortress · Loop");
  });

  it("shows nothing without chapters", () => {
    expect(ghostChapterReadout(null, 0, true)).toBeNull();
    expect(ghostChapterReadout(chapters, 5, false)).toBeNull();
  });

  it("formats the chapter done line with the next chapter number", () => {
    expect(ghostChapterDoneReadout(3, 7)).toBe("Chapter done · 4/7 next");
  });
});

describe("ghostEdgeLayout", () => {
  it("weights segments by chapter length", () => {
    const { segments, gapped } = ghostEdgeLayout(chapters, 300, 0);
    expect(gapped).toBe(true);
    expect(segments.map((s) => s.fr)).toEqual([60, 120, 120]);
  });

  it("fills played chapters and the current one to the playhead", () => {
    expect(ghostEdgeLayout(chapters, 300, 0).segments.map((s) => s.fill01)).toEqual([0, 0, 0]);
    expect(ghostEdgeLayout(chapters, 300, 120).segments.map((s) => s.fill01)).toEqual([1, 0.5, 0]);
    expect(ghostEdgeLayout(chapters, 300, 300).segments.map((s) => s.fill01)).toEqual([1, 1, 1]);
  });

  it("drops the gaps at 40 chapters and above", () => {
    expect(ghostEdgeLayout(many(39), 390, 0).gapped).toBe(true);
    const flat = ghostEdgeLayout(many(40), 400, 100);
    expect(flat.gapped).toBe(false);
    expect(flat.segments).toEqual([{ fr: 1, fill01: 0.25 }]);
  });

  it("falls back to one line of whole-video progress without chapters", () => {
    expect(ghostEdgeLayout(null, 200, 50)).toEqual({ gapped: false, segments: [{ fr: 1, fill01: 0.25 }] });
    expect(ghostEdgeLayout(null, 0, 50).segments[0]!.fill01).toBe(0);
  });
});

describe("crossedChapterEnd", () => {
  it("reports the chapter played through", () => {
    expect(crossedChapterEnd(chapters, 59.8, 60.1, 1.5)).toBe(0);
    expect(crossedChapterEnd(chapters, 179.9, 180, 1.5)).toBe(1);
  });

  it("ignores steps that stay inside a chapter", () => {
    expect(crossedChapterEnd(chapters, 10, 10.25, 1.5)).toBeNull();
  });

  it("ignores seeks and backwards jumps", () => {
    expect(crossedChapterEnd(chapters, 50, 70, 1.5)).toBeNull();
    expect(crossedChapterEnd(chapters, 61, 59, 1.5)).toBeNull();
    expect(crossedChapterEnd(chapters, null, 60.1, 1.5)).toBeNull();
  });

  it("never fires for the end of the last chapter", () => {
    expect(crossedChapterEnd(chapters, 299.9, 300, 1.5)).toBeNull();
  });
});
