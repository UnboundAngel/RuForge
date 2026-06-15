import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import {
  buildMultiTrackAlbumGroups,
  dedupeMusicTracks,
  diversifyTracksByArtist,
  musicTrackIdentityKey,
  normalizeAlbumShelfKey,
} from "./musicShelfDedup";

const primary = (raw: string) => raw.split(",")[0].trim();

function track(partial: Partial<MediaFile> & Pick<MediaFile, "path" | "name">): MediaFile {
  return {
    size: 0,
    created: 0,
    duration: 0,
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

describe("musicShelfDedup", () => {
  it("normalizes album edition suffixes", () => {
    expect(normalizeAlbumShelfKey("Legends Never Die (Deluxe)")).toBe("legends never die");
  });

  it("dedupes by sourceId", () => {
    const a = track({ path: "/a.mp3", name: "Alone Again", sourceId: "abc123" });
    const b = track({ path: "/b.mp3", name: "Alone Again (Live)", sourceId: "abc123" });
    expect(dedupeMusicTracks([a, b], primary)).toHaveLength(1);
  });

  it("dedupes by artist + normalized title when no id", () => {
    const a = track({
      path: "/Music/Juice/a.mp3",
      name: "Robbery",
      artist: "Juice WRLD",
    });
    const b = track({
      path: "/Music/Juice/b.mp3",
      name: "Robbery",
      artist: "Juice WRLD, Trippie Redd",
    });
    expect(musicTrackIdentityKey(a, primary)).toBe(musicTrackIdentityKey(b, primary));
    expect(dedupeMusicTracks([a, b], primary)).toHaveLength(1);
  });

  it("caps per artist then fills shelf", () => {
    const files = [
      track({ path: "/1.mp3", name: "A", artist: "Juice WRLD" }),
      track({ path: "/2.mp3", name: "B", artist: "Juice WRLD" }),
      track({ path: "/3.mp3", name: "C", artist: "King Von" }),
      track({ path: "/4.mp3", name: "D", artist: "Juice WRLD" }),
    ];
    const out = diversifyTracksByArtist(files, 1, 3, primary);
    expect(out).toHaveLength(3);
    expect(out.filter((f) => f.artist === "Juice WRLD")).toHaveLength(2);
  });

  it("omits single-track pseudo-albums from album groups", () => {
    const solo = track({
      path: "/solo.mp3",
      name: "ascension (slowed)",
      artist: "gloryin",
      album: "ascension (slowed)",
      albumArtist: "gloryin - Topic",
    });
    const realAlbum = [
      track({ path: "/a1.mp3", name: "One", artist: "Sleep Token", album: "Eden", albumArtist: "Sleep Token" }),
      track({ path: "/a2.mp3", name: "Two", artist: "Sleep Token", album: "Eden", albumArtist: "Sleep Token" }),
    ];
    const groups = buildMultiTrackAlbumGroups([solo, ...realAlbum], primary);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.album).toBe("Eden");
    expect(groups[0]?.tracks).toHaveLength(2);
  });
});
