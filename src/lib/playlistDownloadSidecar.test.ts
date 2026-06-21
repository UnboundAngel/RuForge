import { describe, expect, it } from "vitest";
import {
  isStalePlaylistCoverUrl,
  isUsablePlaylistCoverUrl,
  mergePlaylistSidecarMetadata,
  playlistSidecarLocationFromTrackPath,
} from "@/lib/playlistDownloadSidecar";

describe("isStalePlaylistCoverUrl", () => {
  it("treats bare maxresdefault as stale", () => {
    expect(
      isStalePlaylistCoverUrl(
        "https://i9.ytimg.com/s_p/OLAK5uy_test/maxresdefault.jpg",
      ),
    ).toBe(true);
  });

  it("accepts signed s_p art", () => {
    expect(
      isStalePlaylistCoverUrl(
        "https://i9.ytimg.com/s_p/OLAK5uy_test/sddefault.jpg?sqp=x&rs=y",
      ),
    ).toBe(false);
  });

  it("treats bare unsigned s_p paths as stale", () => {
    expect(
      isStalePlaylistCoverUrl(
        "https://i9.ytimg.com/s_p/OLAK5uy_test/sddefault.jpg",
      ),
    ).toBe(true);
  });
});

describe("mergePlaylistSidecarMetadata cover", () => {
  it("prefers signed patch over stale base", () => {
    const merged = mergePlaylistSidecarMetadata(
      {
        coverUrl: "https://i9.ytimg.com/s_p/OLAK5uy_test/maxresdefault.jpg",
      },
      {
        coverUrl: "https://i9.ytimg.com/s_p/OLAK5uy_test/sddefault.jpg?sqp=x",
      },
    );
    expect(merged.coverUrl).toContain("sddefault");
    expect(merged.coverUrl).toContain("?");
  });

  it("keeps signed base when patch is stale", () => {
    const signed = "https://i9.ytimg.com/s_p/OLAK5uy_test/sddefault.jpg?sqp=x";
    const merged = mergePlaylistSidecarMetadata(
      { coverUrl: signed },
      { coverUrl: "https://i9.ytimg.com/s_p/OLAK5uy_test/maxresdefault.jpg" },
    );
    expect(merged.coverUrl).toBe(signed);
  });

  it("returns null cover when both sides are stale", () => {
    const merged = mergePlaylistSidecarMetadata(
      {
        coverUrl: "https://i9.ytimg.com/s_p/OLAK5uy_test/maxresdefault.jpg",
      },
      {
        coverUrl: "https://i9.ytimg.com/s_p/OLAK5uy_test/mqdefault.jpg",
      },
    );
    expect(merged.coverUrl).toBeNull();
  });
});

describe("playlistSidecarLocationFromTrackPath", () => {
  it("parses Playlists folder segment", () => {
    expect(
      playlistSidecarLocationFromTrackPath(
        "C:/RuForge/Media/Playlists/Meteora/01 - Numb/track.mp3",
      ),
    ).toEqual({ outputDir: "C:/RuForge/Media", folderName: "Meteora" });
  });
});

describe("isUsablePlaylistCoverUrl", () => {
  it("rejects null and stale", () => {
    expect(isUsablePlaylistCoverUrl(null)).toBe(false);
    expect(
      isUsablePlaylistCoverUrl(
        "https://i9.ytimg.com/s_p/OLAK5uy_test/maxresdefault.jpg",
      ),
    ).toBe(false);
  });
});
