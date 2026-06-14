import { describe, expect, it, vi } from "vitest";

import {
  bridgeOwnerMatchesRenderState,
  navigateToActivityOwningSurface,
  resolveActivityAwayFromSurface,
  resolveActivityHasSession,
} from "./activityIslandResolve";

describe("resolveActivityHasSession", () => {
  it("is false only for idle", () => {
    expect(resolveActivityHasSession("idle")).toBe(false);
    expect(resolveActivityHasSession("main-music")).toBe(true);
    expect(resolveActivityHasSession("main-video")).toBe(true);
    expect(resolveActivityHasSession("mini-owned")).toBe(true);
  });
});

describe("bridgeOwnerMatchesRenderState", () => {
  it("matches host-audio to main-music and player-video to main-video", () => {
    expect(bridgeOwnerMatchesRenderState("host-audio", "main-music")).toBe(true);
    expect(bridgeOwnerMatchesRenderState("player-video", "main-video")).toBe(true);
    expect(bridgeOwnerMatchesRenderState("player-video", "main-music")).toBe(false);
    expect(bridgeOwnerMatchesRenderState("host-audio", "main-video")).toBe(false);
    expect(bridgeOwnerMatchesRenderState(null, "main-video")).toBe(false);
  });
});

describe("resolveActivityAwayFromSurface", () => {
  it("is false for idle", () => {
    expect(resolveActivityAwayFromSurface("idle", "media", "default")).toBe(false);
  });

  it("collapses on music mode for main-music but session remains", () => {
    expect(resolveActivityAwayFromSurface("main-music", "media", "music")).toBe(false);
    expect(resolveActivityAwayFromSurface("main-music", "media", "default")).toBe(true);
    expect(resolveActivityAwayFromSurface("main-music", "player", "movie")).toBe(true);
  });

  it("collapses on player tab for main-video but session remains", () => {
    expect(resolveActivityAwayFromSurface("main-video", "player", "default")).toBe(false);
    expect(resolveActivityAwayFromSurface("main-video", "media", "default")).toBe(true);
  });

  it("allows expansion for mini-owned stub on any tab", () => {
    expect(resolveActivityAwayFromSurface("mini-owned", "player", "music")).toBe(true);
    expect(resolveActivityAwayFromSurface("mini-owned", "media", "default")).toBe(true);
  });
});

describe("navigateToActivityOwningSurface", () => {
  it("opens music mode for main-music", () => {
    const setNavMode = vi.fn();
    const setActiveTab = vi.fn();
    navigateToActivityOwningSurface("main-music", "/a.flac", { setNavMode, setActiveTab });
    expect(setNavMode).toHaveBeenCalledWith("music");
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it("opens player tab for main-video", () => {
    const setNavMode = vi.fn();
    const setActiveTab = vi.fn();
    navigateToActivityOwningSurface("main-video", "/a.mp4", { setNavMode, setActiveTab });
    expect(setNavMode).toHaveBeenCalledWith("default");
    expect(setActiveTab).toHaveBeenCalledWith("player");
    expect(setNavMode.mock.invocationCallOrder[0]).toBeLessThan(
      setActiveTab.mock.invocationCallOrder[0]!,
    );
  });

  it("opens music mode for audio mini-owned stub", () => {
    const setNavMode = vi.fn();
    const setActiveTab = vi.fn();
    navigateToActivityOwningSurface("mini-owned", "/a.mp3", { setNavMode, setActiveTab });
    expect(setNavMode).toHaveBeenCalledWith("music");
    expect(setActiveTab).not.toHaveBeenCalled();
  });
});
