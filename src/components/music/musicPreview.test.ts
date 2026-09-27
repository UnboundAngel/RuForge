import { describe, expect, it } from "vitest";
import { previewStartSec, previewStreamFresh } from "./musicPreviewStream";

describe("previewStreamFresh", () => {
  const stream = { url: "https://x", duration: 200, expiresAt: 10_000, hookStart: null };

  it("keeps a URL until twenty minutes before it expires", () => {
    expect(previewStreamFresh(stream, 0, 8_000)).toBe(true);
    expect(previewStreamFresh(stream, 0, 8_800)).toBe(false);
  });

  it("falls back to an hour from resolving when the URL carries no expiry", () => {
    const bare = { ...stream, expiresAt: null };
    expect(previewStreamFresh(bare, 1_000, 3_300)).toBe(true);
    expect(previewStreamFresh(bare, 1_000, 3_500)).toBe(false);
  });
});

describe("previewStartSec", () => {
  it("starts short or unknown-length tracks at the top", () => {
    expect(previewStartSec(30, 12)).toBe(0);
    expect(previewStartSec(null, null)).toBe(0);
    expect(previewStartSec(Number.NaN, null)).toBe(0);
  });

  it("jumps to the hook when YouTube knows it", () => {
    expect(previewStartSec(210, 63)).toBe(63);
  });

  it("keeps a full window before the end", () => {
    expect(previewStartSec(200, 195)).toBe(185);
    expect(previewStartSec(40, null)).toBe(25);
  });

  it("guesses about a third in, between 30s and 75s", () => {
    expect(previewStartSec(200, null)).toBe(70);
    expect(previewStartSec(60, null)).toBe(30);
    expect(previewStartSec(400, null)).toBe(75);
  });
});
