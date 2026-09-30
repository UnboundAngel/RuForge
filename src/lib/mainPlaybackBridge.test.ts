import { describe, expect, it, beforeEach } from "vitest";

import {
  getMainPlaybackBridge,
  publishMainPlaybackBridge,
} from "./mainPlaybackBridge";

describe("mainPlaybackBridge video paused telemetry", () => {
  beforeEach(() => {
    publishMainPlaybackBridge("player-video", null);
  });

  it("trusts paused true from video even when currentTime advances", () => {
    publishMainPlaybackBridge("player-video", {
      paused: false,
      currentTime: 10,
      duration: 120,
    });

    publishMainPlaybackBridge("player-video", {
      paused: true,
      currentTime: 10.05,
      duration: 120,
    });

    expect(getMainPlaybackBridge()?.paused).toBe(true);
  });

  it("trusts paused false while time advances during playback", () => {
    publishMainPlaybackBridge("player-video", {
      paused: false,
      currentTime: 1,
      duration: 120,
    });

    publishMainPlaybackBridge("player-video", {
      paused: false,
      currentTime: 1.5,
      duration: 120,
    });

    expect(getMainPlaybackBridge()?.paused).toBe(false);
  });
});

describe("mainPlaybackBridge host-audio paused telemetry", () => {
  beforeEach(() => {
    publishMainPlaybackBridge("host-audio", null);
  });

  it("trusts paused true on music even when currentTime advanced since last publish", () => {
    publishMainPlaybackBridge("host-audio", {
      paused: false,
      currentTime: 10,
      duration: 240,
    });

    publishMainPlaybackBridge("host-audio", {
      paused: true,
      currentTime: 10.4,
      duration: 240,
    });

    expect(getMainPlaybackBridge()?.paused).toBe(true);
  });

  it("keeps paused true when already paused and currentTime jumps (seek while paused)", () => {
    publishMainPlaybackBridge("host-audio", {
      paused: true,
      currentTime: 50,
      duration: 240,
    });

    publishMainPlaybackBridge("host-audio", {
      paused: true,
      currentTime: 80,
      duration: 240,
    });

    expect(getMainPlaybackBridge()?.paused).toBe(true);
  });
});

describe("mainPlaybackBridge backward-jump guard", () => {
  beforeEach(() => {
    publishMainPlaybackBridge("host-audio", null);
  });

  it("holds time on a backward glitch within the same track", () => {
    publishMainPlaybackBridge("host-audio", {
      paused: false,
      currentTime: 100,
      duration: 240,
      mediaKey: "a.mp3",
    });
    publishMainPlaybackBridge("host-audio", {
      paused: false,
      currentTime: 0,
      duration: 240,
      mediaKey: "a.mp3",
    });

    expect(getMainPlaybackBridge()?.currentTime).toBe(100);
  });

  it("accepts a restart at 0 when the track changes while playing", () => {
    publishMainPlaybackBridge("host-audio", {
      paused: false,
      currentTime: 216,
      duration: 216,
      mediaKey: "a.mp3",
    });
    publishMainPlaybackBridge("host-audio", {
      paused: false,
      currentTime: 0,
      duration: 200,
      mediaKey: "b.mp3",
    });

    expect(getMainPlaybackBridge()?.currentTime).toBe(0);
  });
});
