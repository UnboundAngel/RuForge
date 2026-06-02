import { describe, expect, it } from "vitest";
import {
  isLikelyImageUrl,
  isYoutubeChannelId,
  musicPlaylistKey,
  musicTrackKey,
  type MusicPlaylistInfo,
  type MusicTrackInfo,
} from "./musicExploreTracks";

const CHANNEL_ID = "UCfM3zsQsOnfWNUppiycmBuw";

describe("musicExploreTracks keys", () => {
  it("isLikelyImageUrl rejects playlist page URLs", () => {
    expect(
      isLikelyImageUrl("https://www.youtube.com/playlist?list=UCfM3zsQsOnfWNUppiycmBuw"),
    ).toBe(false);
    expect(isLikelyImageUrl("https://i.ytimg.com/vi/abc/hqdefault.jpg")).toBe(true);
  });

  it("detects YouTube channel ids", () => {
    expect(isYoutubeChannelId(CHANNEL_ID)).toBe(true);
    expect(isYoutubeChannelId("PLrAXtmRdnEQy6nuLMH")).toBe(false);
  });

  it("musicPlaylistKey disambiguates with title when url repeats", () => {
    const dupUrl = `https://www.youtube.com/channel/${CHANNEL_ID}/videos`;
    const videos: MusicPlaylistInfo = {
      id: CHANNEL_ID,
      title: "Videos",
      url: dupUrl,
      thumbnail: null,
      trackCount: null,
    };
    const live: MusicPlaylistInfo = {
      id: CHANNEL_ID,
      title: "Live",
      url: dupUrl,
      thumbnail: null,
      trackCount: null,
    };
    expect(musicPlaylistKey(videos, 0)).toBe(`${dupUrl}::Videos`);
    expect(musicPlaylistKey(live, 1)).toBe(`${dupUrl}::Live`);
    expect(musicPlaylistKey(videos, 0)).not.toBe(musicPlaylistKey(live, 1));
  });

  it("musicPlaylistKey uses distinct urls when tabs differ", () => {
    const base: Omit<MusicPlaylistInfo, "url" | "title"> = {
      id: CHANNEL_ID,
      thumbnail: null,
      trackCount: null,
    };
    const videos: MusicPlaylistInfo = {
      ...base,
      title: "Videos",
      url: `https://www.youtube.com/channel/${CHANNEL_ID}/videos`,
    };
    const shorts: MusicPlaylistInfo = {
      ...base,
      title: "Shorts",
      url: `https://www.youtube.com/channel/${CHANNEL_ID}/shorts`,
    };
    expect(musicPlaylistKey(videos, 0)).not.toBe(musicPlaylistKey(shorts, 1));
  });

  it("musicTrackKey prefers url over repeated channel id", () => {
    const track: MusicTrackInfo = {
      id: CHANNEL_ID,
      title: "Track",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      duration: null,
      thumbnail: null,
      artist: null,
      album: null,
    };
    expect(musicTrackKey(track, 0)).toBe(track.url);
  });
});
