import { describe, expect, it } from "vitest";

import { islandOverlayBounds, islandOverlayTransitionBounds } from "./islandOverlayBounds";

describe("islandOverlayBounds", () => {
  it("hugs the collapsed pill height", () => {
    expect(islandOverlayBounds("compact")).toEqual({ width: 366, height: 46 });
    expect(islandOverlayBounds("download")).toEqual({ width: 366, height: 46 });
  });

  it("keeps expanded slack for overflowing menus", () => {
    expect(islandOverlayBounds("expanded")).toEqual({ width: 366, height: 220 });
  });

  it("never changes width, so the centered pill cannot slide during a resize", () => {
    const widths = new Set(
      (["compact", "expanded", "notice", "watchlist", "watchlist-expanded", "download-expanded"] as const).map(
        (s) => islandOverlayBounds(s).width,
      ),
    );
    expect(widths.size).toBe(1);
  });
});

describe("islandOverlayTransitionBounds", () => {
  const compact = { width: 366, height: 46 };
  const expanded = { width: 366, height: 220 };

  it("grows straight to a larger target", () => {
    expect(islandOverlayTransitionBounds(compact, expanded)).toEqual({ now: expanded, settle: null });
  });

  it("holds the larger size until the collapse settles", () => {
    expect(islandOverlayTransitionBounds(expanded, compact)).toEqual({
      now: expanded,
      settle: compact,
    });
  });

  it("covers both sizes when one axis grows and the other shrinks", () => {
    expect(
      islandOverlayTransitionBounds({ width: 380, height: 52 }, { width: 296, height: 220 }),
    ).toEqual({ now: { width: 380, height: 220 }, settle: { width: 296, height: 220 } });
  });
});
