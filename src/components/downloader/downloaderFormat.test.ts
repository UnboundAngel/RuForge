import { describe, expect, it } from "vitest";

import { formatTotalDuration } from "./downloaderFormat";

describe("formatTotalDuration", () => {
  it("uses days and hours past a day", () => {
    expect(formatTotalDuration(345 * 3600 + 26 * 60 + 24)).toBe("14 days 9 hr");
    expect(formatTotalDuration(86400)).toBe("1 day");
  });

  it("uses hours and minutes under a day", () => {
    expect(formatTotalDuration(5 * 3600 + 12 * 60)).toBe("5 hr 12 min");
    expect(formatTotalDuration(3 * 3600)).toBe("3 hr");
  });

  it("never shows zero minutes", () => {
    expect(formatTotalDuration(42 * 60)).toBe("42 min");
    expect(formatTotalDuration(20)).toBe("1 min");
  });
});
