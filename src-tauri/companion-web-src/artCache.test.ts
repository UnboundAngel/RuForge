import { describe, expect, it } from "vitest";
// @ts-expect-error plain service worker script, no types
import { planArtEviction } from "./public/art-cache.js";

const entry = (n: number, bytes = 10) => ({ url: `/art/${n}`, bytes });

describe("planArtEviction", () => {
  it("drops nothing under both limits", () => {
    expect(planArtEviction([entry(1), entry(2)], new Set(), 5, 1000)).toEqual([]);
  });

  it("drops oldest first until the count fits", () => {
    const all = [1, 2, 3, 4].map((n) => entry(n));
    expect(planArtEviction(all, new Set(), 2, 1000)).toEqual(["/art/1", "/art/2"]);
  });

  it("drops by bytes when the count is fine", () => {
    const all = [entry(1, 60), entry(2, 60), entry(3, 60)];
    expect(planArtEviction(all, new Set(), 10, 100)).toEqual(["/art/1", "/art/2"]);
  });

  it("never drops pinned covers, even when over the limit", () => {
    const all = [1, 2, 3, 4].map((n) => entry(n));
    expect(planArtEviction(all, new Set(["/art/1", "/art/2"]), 2, 1000)).toEqual(["/art/3", "/art/4"]);
    expect(planArtEviction(all, new Set(all.map((e) => e.url)), 1, 1)).toEqual([]);
  });
});
