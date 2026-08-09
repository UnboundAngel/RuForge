import { describe, expect, it } from "vitest";
import {
  activeSkipSegments,
  defaultCategoryStats,
  effectiveCategoryMode,
  learnedCategoryMode,
  segmentDedupeKey,
  type SponsorBlockSegment,
} from "./sponsorBlock";
import {
  SB_GRADUATE_MIN_APPEARANCES,
  SB_GRADUATE_MIN_MANUAL_SKIPS,
} from "./sponsorBlockConstants";
import { DEFAULT_SETTINGS } from "./store/types";

describe("learnedCategoryMode", () => {
  it("stays on button until skip and appearance floors are met", () => {
    expect(
      learnedCategoryMode({
        appearances: SB_GRADUATE_MIN_APPEARANCES - 1,
        manualSkips: SB_GRADUATE_MIN_MANUAL_SKIPS,
        undoSignals: 0,
      }),
    ).toBe("button");
    expect(
      learnedCategoryMode({
        appearances: SB_GRADUATE_MIN_APPEARANCES,
        manualSkips: SB_GRADUATE_MIN_MANUAL_SKIPS - 1,
        undoSignals: 0,
      }),
    ).toBe("button");
  });

  it("graduates to auto when skip rate and floors are met", () => {
    expect(
      learnedCategoryMode({
        appearances: 5,
        manualSkips: 4,
        undoSignals: 0,
      }),
    ).toBe("auto");
  });

  it("demotes when undo signals hit the threshold", () => {
    expect(
      learnedCategoryMode({
        appearances: 10,
        manualSkips: 10,
        undoSignals: 2,
      }),
    ).toBe("button");
  });
});

describe("effectiveCategoryMode", () => {
  it("honors explicit auto and off over learning", () => {
    const stats = defaultCategoryStats();
    const base = {
      ...DEFAULT_SETTINGS,
      sponsorBlockCategoryModes: {
        ...DEFAULT_SETTINGS.sponsorBlockCategoryModes,
        sponsor: "auto" as const,
        selfpromo: "off" as const,
      },
      sponsorBlockCategoryStats: stats,
    };
    expect(effectiveCategoryMode(base, "sponsor")).toBe("auto");
    expect(effectiveCategoryMode(base, "selfpromo")).toBe("off");
  });

  it("uses learning when user mode is button", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      sponsorBlockCategoryModes: {
        ...DEFAULT_SETTINGS.sponsorBlockCategoryModes,
        sponsor: "button" as const,
      },
      sponsorBlockCategoryStats: {
        ...defaultCategoryStats(),
        sponsor: { appearances: 5, manualSkips: 5, undoSignals: 0 },
      },
    };
    expect(effectiveCategoryMode(settings, "sponsor")).toBe("auto");
  });
});

describe("segmentDedupeKey", () => {
  it("prefers UUID when present", () => {
    expect(
      segmentDedupeKey({
        UUID: "abc",
        category: "sponsor",
        segment: [1, 2],
      }),
    ).toBe("abc");
  });

  it("falls back to category and bounds", () => {
    expect(
      segmentDedupeKey({
        UUID: "  ",
        category: "intro",
        segment: [10, 20],
      }),
    ).toBe("intro:10:20");
  });
});

describe("activeSkipSegments", () => {
  const seg = (partial: Partial<SponsorBlockSegment> & Pick<SponsorBlockSegment, "segment">): SponsorBlockSegment => ({
    UUID: "u1",
    category: "sponsor",
    actionType: "skip",
    ...partial,
  });

  it("treats actionType case-insensitively", () => {
    const segments = [seg({ actionType: "Skip", segment: [5, 15] })];
    expect(activeSkipSegments(segments, 10)).toHaveLength(1);
  });
});
