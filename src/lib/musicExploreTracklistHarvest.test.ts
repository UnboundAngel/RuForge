import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyHarvestWaitState,
  harvestedTracklistAppliesToUrl,
  harvestedTracklistToPlaylistPage,
  HARVEST_PANEL_WAIT_MS,
  isHarvestTracklistComplete,
  tryPlaylistPageFromHarvest,
  waitForCompleteHarvestPlaylist,
  type MusicExploreHarvestedTracklist,
} from "./musicExploreTracklistHarvest";

const sampleTrack = {
  videoId: "abc12345678",
  title: "Test Song",
  durationSeconds: 213,
  artist: "Artist",
  thumbnail: null,
};

function harvest(overrides: Partial<MusicExploreHarvestedTracklist>): MusicExploreHarvestedTracklist {
  return {
    harvestSourceUrl: "https://music.youtube.com/browse/MPREb_test",
    playlistUrl: "https://music.youtube.com/playlist?list=OLAK5uy_test1234567890",
    browseTargetUrl: "https://music.youtube.com/browse/MPREb_test",
    shelfKind: "musicShelfRenderer",
    headerTrackCount: 1,
    hasContinuation: false,
    tracks: [sampleTrack],
    ...overrides,
  };
}

describe("musicExploreTracklistHarvest", () => {
  it("isHarvestTracklistComplete requires harvested >= header count", () => {
    expect(isHarvestTracklistComplete(harvest({ headerTrackCount: 1 }))).toBe(true);
    expect(isHarvestTracklistComplete(harvest({ headerTrackCount: 5, tracks: [sampleTrack] }))).toBe(false);
  });

  it("isHarvestTracklistComplete rejects continuation shelves", () => {
    expect(isHarvestTracklistComplete(harvest({ hasContinuation: true }))).toBe(false);
  });

  it("isHarvestTracklistComplete fails safe when header count is null", () => {
    expect(
      isHarvestTracklistComplete(
        harvest({ headerTrackCount: null, tracks: Array(200).fill(sampleTrack) }),
      ),
    ).toBe(false);
    expect(
      isHarvestTracklistComplete(
        harvest({ headerTrackCount: null, tracks: [sampleTrack] }),
      ),
    ).toBe(false);
  });

  it("isHarvestTracklistComplete rejects browse shelf at truncation boundary without header", () => {
    expect(
      isHarvestTracklistComplete(
        harvest({
          headerTrackCount: null,
          shelfKind: "musicShelfRenderer",
          tracks: Array(200).fill(sampleTrack),
        }),
      ),
    ).toBe(false);
  });

  it("harvestedTracklistAppliesToUrl matches OLAK playlist and browse URLs", () => {
    const h = harvest({});
    expect(
      harvestedTracklistAppliesToUrl(h, "https://music.youtube.com/playlist?list=OLAK5uy_test1234567890"),
    ).toBe(true);
    expect(
      harvestedTracklistAppliesToUrl(h, "https://music.youtube.com/browse/MPREb_test"),
    ).toBe(true);
    expect(
      harvestedTracklistAppliesToUrl(h, "https://music.youtube.com/@artist"),
    ).toBe(false);
  });

  it("tryPlaylistPageFromHarvest returns MusicPlaylistPage when complete", () => {
    const page = tryPlaylistPageFromHarvest(
      harvest({}),
      "https://music.youtube.com/playlist?list=OLAK5uy_test1234567890",
      "Album Title",
    );
    expect(page?.items).toHaveLength(1);
    expect(page?.items[0]?.url).toBe("https://www.youtube.com/watch?v=abc12345678");
    expect(page?.hasMore).toBe(false);
    expect(page?.total).toBe(1);
  });

  it("tryPlaylistPageFromHarvest returns null when truncated", () => {
    const page = tryPlaylistPageFromHarvest(
      harvest({ headerTrackCount: 531, tracks: Array(200).fill(sampleTrack) }),
      "https://music.youtube.com/playlist?list=OLAK5uy_test1234567890",
      "Big Album",
    );
    expect(page).toBeNull();
  });

  it("harvestedTracklistToPlaylistPage sets album field on musicShelfRenderer harvests", () => {
    const page = harvestedTracklistToPlaylistPage(
      harvest({}),
      "https://music.youtube.com/playlist?list=OLAK5uy_test1234567890",
      "Revival",
    );
    expect(page.items[0]?.album).toBe("Revival");
  });

  describe("waitForCompleteHarvestPlaylist early-bail", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("bails immediately when harvest is null and panel URL does not match webview", async () => {
      vi.useFakeTimers();
      const promise = waitForCompleteHarvestPlaylist(
        () => null,
        "https://music.youtube.com/playlist?list=OLAK5uy_pasted1234567890",
        "Pasted",
        new AbortController().signal,
        () => ["https://music.youtube.com/playlist?list=OLAK5uy_other1234567890"],
      );
      const result = await promise;
      expect(result).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("bails immediately when harvest applies but gate rejects truncation", async () => {
      vi.useFakeTimers();
      const truncated = harvest({
        headerTrackCount: 531,
        tracks: Array(200).fill(sampleTrack),
      });
      const promise = waitForCompleteHarvestPlaylist(
        () => truncated,
        "https://music.youtube.com/playlist?list=OLAK5uy_test1234567890",
        "Big Album",
        new AbortController().signal,
        () => ["https://music.youtube.com/browse/MPREb_test"],
      );
      const result = await promise;
      expect(result).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("bails immediately when harvest exists for a different album than panel URL", async () => {
      vi.useFakeTimers();
      const otherAlbum = harvest({
        playlistUrl: "https://music.youtube.com/playlist?list=OLAK5uy_other1234567890",
        browseTargetUrl: "https://music.youtube.com/browse/MPREb_other",
        harvestSourceUrl: "https://music.youtube.com/browse/MPREb_other",
      });
      const promise = waitForCompleteHarvestPlaylist(
        () => otherAlbum,
        "https://music.youtube.com/playlist?list=OLAK5uy_pasted1234567890",
        "Pasted",
        new AbortController().signal,
        () => ["https://music.youtube.com/browse/MPREb_other"],
      );
      const result = await promise;
      expect(result).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("waits when harvest is null but panel URL matches the browsed webview page", async () => {
      vi.useFakeTimers();
      let harvestValue: MusicExploreHarvestedTracklist | null = null;
      const panelUrl = "https://music.youtube.com/playlist?list=OLAK5uy_test1234567890";
      const promise = waitForCompleteHarvestPlaylist(
        () => harvestValue,
        panelUrl,
        "Album Title",
        new AbortController().signal,
        () => [panelUrl, "https://music.youtube.com/browse/MPREb_test"],
      );

      await vi.advanceTimersByTimeAsync(150);
      expect(await Promise.race([
        promise.then(() => "resolved"),
        Promise.resolve("pending"),
      ])).toBe("pending");

      harvestValue = harvest({});
      await vi.advanceTimersByTimeAsync(HARVEST_PANEL_WAIT_MS);
      const result = await promise;
      expect(result?.items).toHaveLength(1);
    });

    it("classifyHarvestWaitState marks null harvest on mismatched paste as bail", () => {
      expect(
        classifyHarvestWaitState(
          null,
          "https://music.youtube.com/playlist?list=OLAK5uy_pasted1234567890",
          ["https://music.youtube.com/playlist?list=OLAK5uy_other1234567890"],
        ),
      ).toBe("bail");
    });

    it("classifyHarvestWaitState marks gate-incomplete applicable harvest as bail", () => {
      expect(
        classifyHarvestWaitState(
          harvest({ headerTrackCount: 531, tracks: Array(200).fill(sampleTrack) }),
          "https://music.youtube.com/playlist?list=OLAK5uy_test1234567890",
          ["https://music.youtube.com/browse/MPREb_test"],
        ),
      ).toBe("bail");
    });
  });
});
