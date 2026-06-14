import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getMainPlaybackBridge,
  getMainPlaybackBridgeOwner,
  publishMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";
import { registerPlaybackMediaElement } from "@/lib/playbackMediaElement";
import {
  parkAndStopVideoPlayback,
  snapshotVideoPlaybackSec,
} from "@/lib/videoPlaybackPark";
import type { MediaFile } from "@/types";

let store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    store = {};
  },
});

const videoFile: MediaFile = {
  path: "C:/media/clip.mp4",
  name: "clip.mp4",
  duration: 120,
  size: 1,
  created: 0,
  thumbnailPath: null,
  ruforgePosterPath: null,
  subtitlePath: null,
  chapters: null,
  downloadMetadataHint: null,
  sourceUrl: null,
  sourceId: null,
};

describe("snapshotVideoPlaybackSec", () => {
  beforeEach(() => {
    store = {};
    publishMainPlaybackBridge("player-video", null);
    publishMainPlaybackBridge("host-audio", null);
    registerPlaybackMediaElement("player-video", null);
  });

  it("prefers live player-video bridge currentTime", () => {
    publishMainPlaybackBridge("player-video", {
      paused: false,
      currentTime: 87.4,
      duration: 120,
    });

    expect(snapshotVideoPlaybackSec(videoFile)).toBeCloseTo(87.4, 1);
  });

  it("falls back to media element currentTime when bridge owner matches", () => {
    const video = {
      currentTime: 42.5,
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    } as unknown as HTMLMediaElement;
    registerPlaybackMediaElement("player-video", video);

    expect(snapshotVideoPlaybackSec(videoFile)).toBeCloseTo(42.5, 1);
  });
});

describe("parkAndStopVideoPlayback", () => {
  beforeEach(() => {
    store = {};
    publishMainPlaybackBridge("player-video", null);
    registerPlaybackMediaElement("player-video", null);
  });

  it("clears bridge and stops the registered video element", () => {
    const video = {
      currentTime: 55,
      src: "blob:test",
      pause: vi.fn(),
      removeAttribute: vi.fn(function (this: { src?: string }, name: string) {
        if (name === "src") this.src = undefined;
      }),
      load: vi.fn(),
      getAttribute: vi.fn((name: string) => (name === "src" ? video.src ?? null : null)),
    } as unknown as HTMLMediaElement;
    registerPlaybackMediaElement("player-video", video);
    publishMainPlaybackBridge("player-video", {
      paused: false,
      currentTime: 55,
      duration: 120,
    });

    const pauseSpy = video.pause as ReturnType<typeof vi.fn>;
    const parkedAt = parkAndStopVideoPlayback(videoFile);

    expect(parkedAt).toBe(55);
    expect(pauseSpy).toHaveBeenCalled();
    expect(video.getAttribute("src")).toBeNull();
    expect(getMainPlaybackBridge()).toBeNull();
    expect(getMainPlaybackBridgeOwner()).toBeNull();
  });
});
