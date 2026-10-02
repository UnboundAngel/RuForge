import { describe, expect, it } from "vitest";
import { chapterScrubSegmentLayouts, timeForScrubberPercent, type NormalizedChapter } from "./chapters";

const chapters: NormalizedChapter[] = [
  { title: "A", start_time: 0, end_time: 100 },
  { title: "B", start_time: 100, end_time: 200 },
  { title: "C", start_time: 200, end_time: 300 },
];

describe("timeForScrubberPercent", () => {
  it("maps the gap between pills to the next chapter start, not the end of the video", () => {
    const width = 303;
    const [a] = chapterScrubSegmentLayouts(chapters, 300, width);
    const gapX = a.leftPx + a.widthPx + 1;
    expect(timeForScrubberPercent(chapters, 300, (gapX / width) * 100, width)).toBe(100);
  });

  it("still maps the far right edge to the end", () => {
    expect(timeForScrubberPercent(chapters, 300, 100, 303)).toBe(300);
  });
});
