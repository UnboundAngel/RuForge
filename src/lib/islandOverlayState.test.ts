import { describe, expect, it } from "vitest";
import { resolveOverlayIslandState } from "./islandOverlayState";

const base = {
  expandedTarget: null,
  hasSession: false,
  hasNotice: false,
  hasDownload: false,
  watchlist: null,
} as const;

describe("resolveOverlayIslandState", () => {
  it("keeps the music order when there is no watchlist", () => {
    expect(resolveOverlayIslandState(base)).toBe("idle");
    expect(resolveOverlayIslandState({ ...base, hasDownload: true })).toBe("download");
    expect(resolveOverlayIslandState({ ...base, hasSession: true, hasDownload: true })).toBe("compact");
    expect(resolveOverlayIslandState({ ...base, hasSession: true, hasNotice: true })).toBe("notice");
    expect(resolveOverlayIslandState({ ...base, hasSession: true, expandedTarget: "music" })).toBe("expanded");
  });

  it("shows the watchlist pill during takeover or when no music is up", () => {
    const fresh = { takeover: true };
    const stale = { takeover: false };
    expect(resolveOverlayIslandState({ ...base, hasSession: true, watchlist: fresh })).toBe("watchlist");
    expect(resolveOverlayIslandState({ ...base, hasSession: true, watchlist: stale })).toBe("compact");
    expect(resolveOverlayIslandState({ ...base, hasDownload: true, watchlist: stale })).toBe("watchlist");
  });

  it("lets a notice beat the collapsed watchlist but not the expanded one", () => {
    const w = { takeover: true };
    expect(resolveOverlayIslandState({ ...base, hasNotice: true, watchlist: w })).toBe("notice");
    expect(
      resolveOverlayIslandState({ ...base, hasNotice: true, watchlist: w, expandedTarget: "watchlist" }),
    ).toBe("watchlist-expanded");
  });

  it("falls back when the expanded target is gone", () => {
    expect(resolveOverlayIslandState({ ...base, expandedTarget: "watchlist", hasSession: true })).toBe("compact");
    expect(resolveOverlayIslandState({ ...base, expandedTarget: "music", hasDownload: true })).toBe("download");
    expect(resolveOverlayIslandState({ ...base, expandedTarget: "download", hasSession: true })).toBe("compact");
  });

  it("hands the music slot to the download on its turn", () => {
    const both = { ...base, hasSession: true, hasDownload: true };
    expect(resolveOverlayIslandState({ ...both, downloadTurn: true })).toBe("download");
    expect(resolveOverlayIslandState({ ...both, downloadTurn: false })).toBe("compact");
    expect(resolveOverlayIslandState({ ...base, hasSession: true, downloadTurn: true })).toBe("compact");
    expect(resolveOverlayIslandState({ ...both, downloadTurn: true, hasNotice: true })).toBe("notice");
  });

  it("opens the download list over a notice", () => {
    expect(
      resolveOverlayIslandState({ ...base, expandedTarget: "download", hasDownload: true, hasNotice: true }),
    ).toBe("download-expanded");
  });
});
