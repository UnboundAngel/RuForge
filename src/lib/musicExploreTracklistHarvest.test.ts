import { describe, expect, it } from "vitest";
import {
  harvestedTracklistAppliesToUrl,
  harvestedTracklistToPlaylistPage,
  isHarvestTracklistComplete,
  tryPlaylistPageFromHarvest,
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
});
