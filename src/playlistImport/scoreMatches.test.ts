import { describe, expect, it } from "vitest";
import type { MusicTrackInfo } from "@/lib/musicExploreTracks";
import type { MediaFile } from "@/types";
import { findInLibrary } from "./libraryMatch";
import type { ImportTrack } from "./parseImport";
import { bucketFor, coreTitle, rankCandidates, searchQueryFor } from "./scoreMatches";

const src = (title: string, artists: string[], durationSec: number | null = 200, unclear = false): ImportTrack => ({
  title,
  artists,
  album: null,
  durationSec,
  unclear,
});

let n = 0;
const cand = (title: string, artist: string, duration: number | null): MusicTrackInfo => {
  n++;
  const id = `vid${String(n).padStart(8, "0")}`;
  return { id, title, url: `https://www.youtube.com/watch?v=${id}`, duration, thumbnail: null, artist, album: null };
};

describe("scoring", () => {
  it("prefers the official audio over live, remix and sped up uploads", () => {
    const s = src("Blinding Lights", ["The Weeknd"], 200);
    const ranked = rankCandidates(s, [
      cand("The Weeknd - Blinding Lights (Live at the Grammys)", "The Weeknd", 260),
      cand("Blinding Lights (sped up)", "fastsongs", 160),
      cand("Blinding Lights", "The Weeknd - Topic", 201),
      cand("The Weeknd - Blinding Lights (Remix)", "The Weeknd", 210),
    ]);
    expect(ranked[0].track.artist).toBe("The Weeknd - Topic");
    expect(bucketFor(s, ranked[0])).toBe("matched");
  });

  it("uses duration to pick between same-titled uploads", () => {
    const s = src("Song", ["Band"], 180);
    const ranked = rankCandidates(s, [cand("Band - Song (Official Video)", "Band", 290), cand("Band - Song", "Band", 182)]);
    expect(ranked[0].track.duration).toBe(182);
  });

  it("does not penalize a version word the source already has", () => {
    const s = src("Song (Live)", ["Band"], 240);
    const ranked = rankCandidates(s, [cand("Band - Song (Live)", "Band", 241)]);
    expect(bucketFor(s, ranked[0])).toBe("matched");
  });

  it("sends unclear rows to check even on a perfect match", () => {
    const s = src("Blinding Lights", ["The Weeknd"], 200, true);
    const ranked = rankCandidates(s, [cand("Blinding Lights", "The Weeknd - Topic", 200)]);
    expect(bucketFor(s, ranked[0])).toBe("check");
  });

  it("marks unrelated results as missing", () => {
    const s = src("Obscure B-Side", ["Nobody Knows"], 200);
    const ranked = rankCandidates(s, [cand("Completely different thing", "Some channel", 600)]);
    expect(bucketFor(s, ranked[0])).toBe("missing");
    expect(bucketFor(s, undefined)).toBe("missing");
  });

  it("matches a title with feat. credits and a remaster suffix", () => {
    expect(coreTitle("Get Lucky (feat. Pharrell Williams & Nile Rodgers)")).toBe("Get Lucky");
    expect(coreTitle("Here Comes The Sun - Remastered 2009")).toBe("Here Comes The Sun");
    const s = src("Get Lucky (feat. Pharrell Williams & Nile Rodgers)", ["Daft Punk", "Pharrell Williams"], 369);
    const ranked = rankCandidates(s, [cand("Get Lucky (feat. Pharrell Williams and Nile Rodgers)", "Daft Punk - Topic", 369)]);
    expect(bucketFor(s, ranked[0])).toBe("matched");
    expect(searchQueryFor(s)).toBe("Daft Punk Get Lucky audio");
  });
});

describe("findInLibrary", () => {
  const file = (over: Partial<MediaFile>): MediaFile =>
    ({ name: "x.m4a", path: "/m/x.m4a", size: 1, created: 0, duration: 200, thumbnailPath: null, ruforgePosterPath: null, subtitlePath: null, chapters: null, downloadMetadataHint: null, sourceUrl: null, sourceId: null, ...over }) as MediaFile;

  it("finds a song by title, artist and length", () => {
    const lib = [file({ path: "/a", canonicalTitle: "Blinding Lights", canonicalArtist: "The Weeknd", duration: 201 })];
    expect(findInLibrary(src("Blinding Lights", ["The Weeknd"], 200), lib)?.path).toBe("/a");
  });

  it("skips a different artist or length", () => {
    const lib = [
      file({ path: "/a", canonicalTitle: "Blinding Lights", canonicalArtist: "Cover Band", duration: 200 }),
      file({ path: "/b", canonicalTitle: "Blinding Lights", canonicalArtist: "The Weeknd", duration: 260 }),
    ];
    expect(findInLibrary(src("Blinding Lights", ["The Weeknd"], 200), lib)).toBeNull();
  });
});
