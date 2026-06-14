import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getMainPlaybackBridge,
  getMainPlaybackBridgeOwner,
  publishMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";
import type { MediaFile } from "@/types";

vi.hoisted(() => {
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
});

vi.mock("@/lib/mainPlaybackClaim", () => ({
  claimMainPlayback: vi.fn(),
  closeVideoMiniWindow: vi.fn(),
  stopMusicMiniForMainClaim: vi.fn(),
}));

const { useRuforgeStore } = await import("@/store/ruforgeStore");

function media(partial: Partial<MediaFile> & Pick<MediaFile, "path" | "name">): MediaFile {
  return {
    size: 0,
    created: 0,
    duration: 120,
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: null,
    sourceId: null,
    ...partial,
  };
}

describe("video session across music nav", () => {
  beforeEach(() => {
    localStorage.clear();
    publishMainPlaybackBridge("player-video", null);
    publishMainPlaybackBridge("host-audio", null);
    useRuforgeStore.setState({
      playingFile: null,
      parkedVideoFile: null,
      parkedVideoAt: null,
      playerResumeAt: null,
      activityOwner: null,
      activityHandoff: null,
    });
  });

  it("keeps player-video bridge live when only navMode would change (no audio claim)", () => {
    const video = media({ path: "C:/v/a.mp4", name: "a.mp4" });
    publishMainPlaybackBridge("player-video", {
      paused: false,
      currentTime: 103.2,
      duration: 120,
    });
    useRuforgeStore.setState({ playingFile: video, navMode: "default" });

    useRuforgeStore.setState({ navMode: "music" });

    expect(getMainPlaybackBridgeOwner()).toBe("player-video");
    expect(getMainPlaybackBridge()?.currentTime).toBeCloseTo(103.2, 1);
    expect(getMainPlaybackBridge()?.paused).toBe(false);
  });

  it("parks and clears video bridge when audio claims playback", () => {
    const video = media({ path: "C:/v/a.mp4", name: "a.mp4" });
    const song = media({ path: "C:/m/song.m4a", name: "song.m4a" });
    publishMainPlaybackBridge("player-video", {
      paused: false,
      currentTime: 88.1,
      duration: 120,
    });
    useRuforgeStore.setState({ playingFile: video, navMode: "music" });

    useRuforgeStore.getState().setPlayingFile(song);

    const st = useRuforgeStore.getState();
    expect(st.playingFile?.path).toBe(song.path);
    expect(st.parkedVideoFile?.path).toBe(video.path);
    expect(st.parkedVideoAt).toBeCloseTo(88.1, 1);
    expect(getMainPlaybackBridge()).toBeNull();
    expect(getMainPlaybackBridgeOwner()).toBeNull();
  });
});
