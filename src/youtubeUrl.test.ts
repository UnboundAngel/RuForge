import { describe, expect, it } from "vitest";
import {
  classifyMusicExploreUrl,
  isMusicExplorePasteUrl,
  isMusicYouTubePlaylistUrl,
  isMusicYouTubeUrl,
  isMusicYouTubeWatchUrl,
  resolveMusicExplorePasteUrl,
  youtubeMusicSearchUrl,
} from "./youtubeUrl";

const TRACK =
  "https://music.youtube.com/watch?v=Gao3xSDSibk&si=ANRFcPj7XYOkjv8h";
const PLAYLIST = "https://music.youtube.com/playlist?list=PLrAXtmRdnEQy6nuLMH";
const ARTIST = "https://music.youtube.com/@SomeArtist";
const BROWSE = "https://music.youtube.com/browse/MPREb_example";
const YT_WATCH = "https://www.youtube.com/watch?v=Gao3xSDSibk&feature=share";
const YT_BE = "https://youtu.be/Gao3xSDSibk?si=abc";

describe("Music Explore URL helpers", () => {
  it("classifies a single music.youtube.com track", () => {
    expect(classifyMusicExploreUrl(TRACK)).toBe("watch");
    expect(isMusicYouTubeWatchUrl(TRACK)).toBe(true);
    expect(isMusicYouTubeUrl(TRACK)).toBe(false);
    expect(isMusicYouTubePlaylistUrl(TRACK)).toBe(false);
    expect(isMusicExplorePasteUrl(TRACK)).toBe(true);
    expect(resolveMusicExplorePasteUrl(TRACK)).toBe(
      "https://www.youtube.com/watch?v=Gao3xSDSibk",
    );
  });

  it("classifies playlists before watch when list= is present", () => {
    const mixed =
      "https://music.youtube.com/watch?v=Gao3xSDSibk&list=PLrAXtmRdnEQy6nuLMH";
    expect(classifyMusicExploreUrl(mixed)).toBe("playlist");
    expect(isMusicYouTubeWatchUrl(mixed)).toBe(false);
    expect(isMusicYouTubePlaylistUrl(mixed)).toBe(true);
  });

  it("classifies browse URLs", () => {
    expect(classifyMusicExploreUrl(PLAYLIST)).toBe("playlist");
    expect(classifyMusicExploreUrl(ARTIST)).toBe("browse");
    expect(classifyMusicExploreUrl(BROWSE)).toBe("browse");
    expect(isMusicYouTubeUrl(ARTIST)).toBe(true);
  });

  it("accepts regular YouTube watch and youtu.be links", () => {
    expect(classifyMusicExploreUrl(YT_WATCH)).toBe("watch");
    expect(classifyMusicExploreUrl(YT_BE)).toBe("watch");
    expect(resolveMusicExplorePasteUrl(YT_WATCH)).toBe(
      "https://www.youtube.com/watch?v=Gao3xSDSibk",
    );
    expect(resolveMusicExplorePasteUrl(YT_BE)).toBe(
      "https://www.youtube.com/watch?v=Gao3xSDSibk",
    );
  });

  it("rejects non-YouTube URLs", () => {
    expect(classifyMusicExploreUrl("https://example.com/watch?v=Gao3xSDSibk")).toBeNull();
    expect(isMusicExplorePasteUrl("not a url")).toBe(false);
  });

  it("builds music.youtube.com search URLs", () => {
    expect(youtubeMusicSearchUrl("  lofi beats  ")).toBe(
      "https://music.youtube.com/search?q=lofi+beats",
    );
    expect(youtubeMusicSearchUrl("   ")).toBeNull();
  });
});
