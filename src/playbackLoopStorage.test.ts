import { describe, expect, it } from "vitest";
import {
  cycleLoopMode,
  musicUserLoopEndIndex,
  parseLoopMode,
  resolveLoopModeForPlay,
} from "./playbackLoopStorage";

describe("parseLoopMode", () => {
  it("migrates boolean true to one", () => {
    expect(parseLoopMode("true")).toBe("one");
  });

  it("maps false and unknown to off", () => {
    expect(parseLoopMode("false")).toBe("off");
    expect(parseLoopMode(null)).toBe("off");
    expect(parseLoopMode("yes")).toBe("off");
  });

  it("keeps new tokens", () => {
    expect(parseLoopMode("off")).toBe("off");
    expect(parseLoopMode("all")).toBe("all");
    expect(parseLoopMode("one")).toBe("one");
  });
});

describe("cycleLoopMode", () => {
  it("cycles off → all → one → off", () => {
    expect(cycleLoopMode("off")).toBe("all");
    expect(cycleLoopMode("all")).toBe("one");
    expect(cycleLoopMode("one")).toBe("off");
  });
});

describe("resolveLoopModeForPlay", () => {
  it("path one wins", () => {
    expect(resolveLoopModeForPlay("one", "all")).toBe("one");
  });

  it("keeps session all when path is off", () => {
    expect(resolveLoopModeForPlay("off", "all")).toBe("all");
  });
});

describe("musicUserLoopEndIndex", () => {
  it("uses full length when no endless boundary", () => {
    expect(musicUserLoopEndIndex(5, null)).toBe(5);
  });

  it("clamps endless boundary", () => {
    expect(musicUserLoopEndIndex(10, 4)).toBe(4);
    expect(musicUserLoopEndIndex(3, 9)).toBe(3);
  });
});
