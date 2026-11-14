import { describe, expect, it } from "vitest";
import { playlistIndexWidth } from "@/playlistDownloadPlan";
import { mergeRoster } from "./videoPlaylistSidecar";
import { keysInRange } from "./playlistPreviewState";

describe("keysInRange", () => {
  const keys = ["a", "b", "c", "d"];
  it("spans both directions", () => {
    expect(keysInRange(keys, "b", "d")).toEqual(["b", "c", "d"]);
    expect(keysInRange(keys, "d", "b")).toEqual(["b", "c", "d"]);
  });
  it("falls back to the clicked key without a visible anchor", () => {
    expect(keysInRange(keys, null, "c")).toEqual(["c"]);
    expect(keysInRange(keys, "zz", "c")).toEqual(["c"]);
    expect(keysInRange(keys, "a", "zz")).toEqual([]);
  });
});

describe("playlistIndexWidth", () => {
  it("pads to at least two digits", () => {
    expect(playlistIndexWidth(5)).toBe(2);
    expect(playlistIndexWidth(100)).toBe(3);
  });
});

describe("mergeRoster", () => {
  it("keeps old tracks and appends only unseen videos", () => {
    const out = mergeRoster(
      [{ url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", title: "A" }],
      [
        { url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", title: "A again" },
        { url: "https://www.youtube.com/watch?v=bbbbbbbbbbb", title: "B" },
      ],
    );
    expect(out.map((t) => t.title)).toEqual(["A", "B"]);
  });
});
