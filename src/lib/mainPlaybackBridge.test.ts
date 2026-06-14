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
