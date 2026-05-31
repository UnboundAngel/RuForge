import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import {
  artistKeyFromFile,
  fileMatchesArtistKey,
  primaryArtist,
  rawArtistFromFile,
} from "./musicArtist";

function file(overrides: Partial<MediaFile> & Pick<MediaFile, "path" | "name">): MediaFile {
  return {
    size: 1,
    created: "",
    modified: "",
    duration: 0,
    ...overrides,
  } as MediaFile;
}

describe("primaryArtist", () => {
  it("takes first artist before feat", () => {
    expect(primaryArtist("A.MeloFI feat. Guest")).toBe("A.MeloFI");
  });
});

describe("fileMatchesArtistKey", () => {
  it("matches artist from path when name is title-only", () => {
    const f = file({
      path: "/m/A.MeloFI - Alone Again.mp3",
      name: "Alone Again",
    });
    expect(artistKeyFromFile(f)).toBe("a.melofi");
    expect(fileMatchesArtistKey(f, "a.melofi")).toBe(true);
  });

  it("matches primary key for multi-artist tags", () => {
    const f = file({
      path: "/m/t.mp3",
      name: "Song",
      artist: "Juice WRLD, Trippie Redd",
    });
    expect(fileMatchesArtistKey(f, "juice wrld")).toBe(true);
    expect(fileMatchesArtistKey(f, "juice wrld, trippie redd")).toBe(false);
  });
});

describe("rawArtistFromFile", () => {
  it("prefers artist tag over filename", () => {
    const f = file({
      path: "/m/x.mp3",
      name: "Wrong - Title",
      artist: "Real Artist",
    });
    expect(rawArtistFromFile(f)).toBe("Real Artist");
  });
});
