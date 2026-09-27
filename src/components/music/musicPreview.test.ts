import { describe, expect, it } from "vitest";
import { previewStreamFresh } from "./musicPreviewStream";

describe("previewStreamFresh", () => {
  const stream = { url: "https://x", duration: 200, expiresAt: 10_000 };

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
