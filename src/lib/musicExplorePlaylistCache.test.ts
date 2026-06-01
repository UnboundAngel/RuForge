import { describe, expect, it } from "vitest";
import {
  clearMusicExplorePlaylistCacheForTests,
  getCachedMusicExplorePlaylist,
  patchCachedMusicExplorePlaylistItems,
  setCachedMusicExplorePlaylist,
} from "./musicExplorePlaylistCache";

const PLAYLIST_URL =
  "https://music.youtube.com/playlist?list=PLsqoQfYJQFhqwOHGyI-RumHzsKRm7Pnmq&si=4BnXT1l64pdP3IIA";

describe("musicExplorePlaylistCache", () => {
  it("keys by playlist id so si= variants share one cache entry", () => {
    clearMusicExplorePlaylistCacheForTests();
    setCachedMusicExplorePlaylist(PLAYLIST_URL, {
      playlistTitle: "Test Mix",
      playlistUrl: PLAYLIST_URL,
      items: [{ id: "abc", title: "Song", url: "https://www.youtube.com/watch?v=abc", duration: 100, thumbnail: null, artist: null, album: null }],
      hasMore: true,
      total: 42,
    });

    const hit = getCachedMusicExplorePlaylist(
      "https://music.youtube.com/playlist?list=PLsqoQfYJQFhqwOHGyI-RumHzsKRm7Pnmq",
    );
    expect(hit?.playlistTitle).toBe("Test Mix");
    expect(hit?.items).toHaveLength(1);
  });

  it("patches items in place for completed-download removals", () => {
    clearMusicExplorePlaylistCacheForTests();
    setCachedMusicExplorePlaylist(PLAYLIST_URL, {
      playlistTitle: "Test Mix",
      playlistUrl: PLAYLIST_URL,
      items: [
        { id: "a", title: "A", url: "https://www.youtube.com/watch?v=a", duration: null, thumbnail: null, artist: null, album: null },
        { id: "b", title: "B", url: "https://www.youtube.com/watch?v=b", duration: null, thumbnail: null, artist: null, album: null },
      ],
      hasMore: false,
      total: 2,
    });

    patchCachedMusicExplorePlaylistItems(PLAYLIST_URL, [
      { id: "b", title: "B", url: "https://www.youtube.com/watch?v=b", duration: null, thumbnail: null, artist: null, album: null },
    ]);

    expect(getCachedMusicExplorePlaylist(PLAYLIST_URL)?.items).toHaveLength(1);
  });
});
