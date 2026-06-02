import { describe, expect, it } from "vitest";
import {
  classifyMusicExplorePageFromUrl,
  mergeMusicExplorePageContext,
  resolveExplorePanelUrl,
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

  it("resolveExplorePanelUrl prefers playlist action over browse target", () => {
    const ctx = mergeMusicExplorePageContext(
      "https://music.youtube.com/browse/MPADexample123456789",
      {
        url: "https://music.youtube.com/browse/MPADexample123456789",
        kind: "album",
        playlistUrl: "https://music.youtube.com/playlist?list=OLAK5uy_test1234567890",
        browseTargetUrl: "https://music.youtube.com/browse/MPADexample123456789",
      },
    );
    expect(resolveExplorePanelUrl("", ctx, ctx.url)).toBe(
      "https://music.youtube.com/playlist?list=OLAK5uy_test1234567890",
    );
  });

  it("resolveExplorePanelUrl keeps artist home URL instead of first shelf link", () => {
    const ctx = mergeMusicExplorePageContext("https://music.youtube.com/@Eminem", {
      url: "https://music.youtube.com/@Eminem",
      kind: "artist",
      browseTargetUrl: "https://music.youtube.com/browse/MPADfirstalbumonly",
      shelfLinks: [
        { title: "Album A", url: "https://music.youtube.com/browse/MPADfirstalbumonly" },
        { title: "Album B", url: "https://music.youtube.com/browse/MPADsecondalbum" },
      ],
    });
    expect(resolveExplorePanelUrl("", ctx, ctx.url)).toBe("https://music.youtube.com/@Eminem");
  });

  it("merges shelf links from webview payload", () => {
    const ctx = mergeMusicExplorePageContext("https://music.youtube.com/@Eminem", {
      url: "https://music.youtube.com/@Eminem",
      kind: "artist",
      shelfLinks: [
        { title: "Album A", url: "https://music.youtube.com/browse/MPADaaaaaaaaaaaa" },
      ],
    });
    expect(ctx.shelfLinks).toHaveLength(1);
    expect(ctx.shelfLinks[0]?.title).toBe("Album A");
  });
});
