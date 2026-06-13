import { describe, expect, it } from "vitest";

import { resolveActivityShowIsland } from "./activityIslandResolve";

describe("resolveActivityShowIsland", () => {
  it("shows main-music island when left music mode", () => {
    expect(resolveActivityShowIsland("main-music", "media", "default")).toBe(true);
    expect(resolveActivityShowIsland("main-music", "player", "movie")).toBe(true);
  });

  it("hides main-music island while in music mode", () => {
    expect(resolveActivityShowIsland("main-music", "media", "music")).toBe(false);
  });

  it("keeps main-video frozen island off player tab only", () => {
    expect(resolveActivityShowIsland("main-video", "media", "default")).toBe(true);
    expect(resolveActivityShowIsland("main-video", "player", "default")).toBe(false);
  });

  it("always shows mini-owned stub", () => {
    expect(resolveActivityShowIsland("mini-owned", "player", "music")).toBe(true);
  });
});
