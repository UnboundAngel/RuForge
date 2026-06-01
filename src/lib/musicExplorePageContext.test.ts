import { describe, expect, it } from "vitest";
import {
  classifyMusicExplorePageFromUrl,
  mergeMusicExplorePageContext,
} from "./musicExplorePageContext";

describe("musicExplorePageContext", () => {
  it("classifies playlist URLs from list= param", () => {
    const ctx = classifyMusicExplorePageFromUrl(
      "https://music.youtube.com/playlist?list=PLrAXtmRdnEQy6nuLMH",
    );
    expect(ctx.kind).toBe("playlist");
    expect(ctx.canDownloadPlaylist).toBe(true);
    expect(ctx.hint).toContain("Playlist");
  });

  it("classifies browse URLs as browse until playlist payload arrives", () => {
    const ctx = classifyMusicExplorePageFromUrl(
      "https://music.youtube.com/browse/MPREb_example",
    );
    expect(ctx.kind).toBe("browse");
    expect(ctx.canDownloadPlaylist).toBe(false);
    expect(ctx.canPickTracks).toBe(true);
  });

  it("merges webview playlist detection with extracted list URL", () => {
    const ctx = mergeMusicExplorePageContext(
      "https://music.youtube.com/browse/MPREb_example",
      {
        url: "https://music.youtube.com/browse/MPREb_example",
        kind: "browse",
        pageTitle: "My Mix",
        playlistUrl: "https://music.youtube.com/playlist?list=PLtest1234567890",
        isPlaylistPage: true,
      },
    );
    expect(ctx.kind).toBe("playlist");
    expect(ctx.canDownloadPlaylist).toBe(true);
    expect(ctx.pageTitle).toBe("My Mix");
  });

  it("classifies search and home pages with hints", () => {
    expect(classifyMusicExplorePageFromUrl("https://music.youtube.com/search?q=lofi").kind).toBe(
      "search",
    );
    expect(classifyMusicExplorePageFromUrl("https://music.youtube.com/").kind).toBe("home");
  });
});
