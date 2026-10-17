import { describe, expect, it } from "vitest";
import { isMilestoneNote, isStatValue, isStatsSummary } from "./activityStats";

describe("activityStats type guards", () => {
  it("accepts StatValue", () => {
    expect(isStatValue({ value: 3, liveOnly: false, sampleSize: 3 })).toBe(true);
    expect(isStatValue({ value: null, liveOnly: true, sampleSize: 0 })).toBe(true);
    expect(isStatValue({ value: 1, liveOnly: false })).toBe(false);
    expect(isStatValue(null)).toBe(false);
  });

  it("accepts StatsSummary shape", () => {
    const area = {
      downloads: { value: 1, liveOnly: false, sampleSize: 1 },
      downloadBytes: { value: 10, liveOnly: false, sampleSize: 1 },
      watchSec: { value: 2, liveOnly: false, sampleSize: 1 },
      listenSec: { value: 3, liveOnly: false, sampleSize: 1 },
    };
    expect(isStatsSummary({ current: area, previous: area })).toBe(true);
    expect(isStatsSummary({ current: area })).toBe(false);
  });

  it("accepts MilestoneNote", () => {
    expect(
      isMilestoneNote({
        id: "downloads:1000",
        title: "1,000 downloads",
        subtitle: "Reached Oct 11, 2026",
        createdAt: 1,
      }),
    ).toBe(true);
    expect(isMilestoneNote({ id: "x", title: "t" })).toBe(false);
  });
});
