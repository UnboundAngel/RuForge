import { describe, expect, it } from "vitest";
import { mergeQueueRaw } from "./downloadQueueDisk";

describe("queue file saved before launch load finished", () => {
  it("keeps the saved jobs alongside the new one", () => {
    const saved = JSON.stringify([{ id: "a", url: "u1" }, { id: "b", url: "u2" }]);
    const newer = JSON.stringify([{ id: "c", url: "u3" }, { id: "x", url: "u2" }]);
    expect(JSON.parse(mergeQueueRaw(saved, newer))).toEqual([
      { id: "a", url: "u1" },
      { id: "c", url: "u3" },
      { id: "x", url: "u2" },
    ]);
  });

  it("returns the newer copy untouched when nothing is missing", () => {
    const newer = JSON.stringify([{ id: "a", url: "u1" }]);
    expect(mergeQueueRaw(newer, newer)).toBe(newer);
  });
});
