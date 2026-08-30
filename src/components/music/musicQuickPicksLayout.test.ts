import { describe, expect, it } from "vitest";
import {
  quickPickColumnCount,
  quickPickVisibleCount,
  QUICK_PICKS_POOL_CAP,
} from "./musicQuickPicksLayout";

describe("quickPickColumnCount", () => {
  it("defaults before measure", () => {
    expect(quickPickColumnCount(0)).toBe(2);
  });

  it("fits columns from width without exceeding 4", () => {
    expect(quickPickColumnCount(250)).toBe(1);
    expect(quickPickColumnCount(520)).toBe(2);
    expect(quickPickColumnCount(780)).toBe(3);
    expect(quickPickColumnCount(1040)).toBe(4);
    expect(quickPickColumnCount(2000)).toBe(4);
  });
});

describe("quickPickVisibleCount", () => {
  it("caps at 3 rows and the pool ceiling", () => {
    expect(quickPickVisibleCount(1)).toBe(3);
    expect(quickPickVisibleCount(2)).toBe(6);
    expect(quickPickVisibleCount(3)).toBe(9);
    expect(quickPickVisibleCount(4)).toBe(12);
    expect(quickPickVisibleCount(4)).toBeLessThanOrEqual(QUICK_PICKS_POOL_CAP);
  });
});
