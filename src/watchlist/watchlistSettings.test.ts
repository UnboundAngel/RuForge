import { describe, expect, it, vi } from "vitest";

vi.mock("@/store/ruforgeStore", () => ({ useRuforgeStore: { getState: () => ({}) } }));

import { checkIntervalFromLabel, checkIntervalLabel, CHECK_INTERVAL_OPTIONS } from "./watchlistSettings";

describe("check interval labels", () => {
  it("round-trips every preset", () => {
    for (const o of CHECK_INTERVAL_OPTIONS) {
      expect(checkIntervalFromLabel(checkIntervalLabel(o.minutes))).toBe(o.minutes);
    }
  });

  it("labels values outside the presets", () => {
    expect(checkIntervalLabel(120)).toBe("Every 2 hours");
    expect(checkIntervalLabel(45)).toBe("Every 45 minutes");
  });

  it("rejects unknown labels", () => {
    expect(checkIntervalFromLabel("Every 2 hours")).toBeNull();
  });
});
