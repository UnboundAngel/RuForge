import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import {
  importSummary,
  matchM3u8Entries,
  parseM3u8,
  playlistNameFromPath,
  serializeM3u8,
} from "./musicPlaylistM3u8";

function file(path: string, extra: Partial<MediaFile> = {}): MediaFile {
  return {
    name: path.slice(Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/")) + 1).replace(/\.[^.]+$/, ""),
    path,
    size: 1,
    created: 1,
    duration: 0,
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: null,
    sourceId: null,
    ...extra,
  };
}

const ride = file("C:\\Music\\Ride.mp3", { artist: "Twenty One Pilots", canonicalTitle: "Ride", duration: 214.4 });
const hum = file("C:\\Music\\hum.flac", { duration: 0 });

describe("serializeM3u8", () => {
  it("writes the header, EXTINF with duration and Artist - Title, and absolute paths", () => {
    const text = serializeM3u8([ride, hum], "Road\ntrip");
    expect(text.split("\r\n")).toEqual([
      "#EXTM3U",
      "#PLAYLIST:Road trip",
      "#EXTINF:214,Twenty One Pilots - Ride",
      "C:\\Music\\Ride.mp3",
      "#EXTINF:-1,hum",
      "C:\\Music\\hum.flac",
      "",
    ]);
  });

  it("round-trips through parseM3u8", () => {
    const parsed = parseM3u8(serializeM3u8([ride, hum], "Road trip"));
    expect(parsed.name).toBe("Road trip");
    expect(parsed.entries).toEqual([
      { path: ride.path, duration: 214, artist: "Twenty One Pilots", title: "Ride" },
      { path: hum.path, duration: null, artist: null, title: "hum" },
    ]);
  });
});

describe("parseM3u8", () => {
  it("handles a BOM, LF, comments, file URLs, streams and relative paths", () => {
    const text = [
      "\uFEFF#EXTM3U",
      "# a comment",
      "#EXTINF:120 tvg-id=\"x\",Some One - Track",
      "sub/track one.mp3",
      "../up.mp3",
      "file:///C:/Other/Caf%C3%A9.mp3",
      "file:///home/me/a.ogg",
      "#EXTINF:10,Radio",
      "https://stream.example/live",
      "",
    ].join("\n");
    const { name, entries } = parseM3u8(text, "C:\\Lists\\mine.m3u8");
    expect(name).toBeNull();
    expect(entries.map((e) => e.path)).toEqual([
      "C:\\Lists\\sub\\track one.mp3",
      "C:\\up.mp3",
      "C:/Other/Café.mp3",
      "/home/me/a.ogg",
    ]);
    expect(entries[0]).toMatchObject({ duration: 120, artist: "Some One", title: "Track" });
    expect(entries[1]).toMatchObject({ duration: null, artist: null, title: null });
  });

  it("names a playlist after its file when there is no #PLAYLIST", () => {
    expect(playlistNameFromPath("C:\\Lists\\Gym mix.m3u8")).toBe("Gym mix");
  });
});

describe("matchM3u8Entries", () => {
  const library = [
    ride,
    hum,
    file("C:\\Music\\Heathens.mp3", { artist: "Twenty One Pilots", canonicalTitle: "Heathens" }),
    file("C:\\Music\\a\\Intro.mp3", { canonicalTitle: "Intro" }),
    file("C:\\Music\\b\\Intro.mp3", { canonicalTitle: "Intro" }),
  ];

  it("matches by path, then artist and title, then filename, then a unique title", () => {
    const { paths, unmatched } = matchM3u8Entries(
      [
        { path: "c:/music/ride.mp3", duration: null, artist: null, title: null },
        { path: "X:\\old\\whatever.mp3", duration: null, artist: "twenty one pilots", title: "HEATHENS" },
        { path: "\\\\nas\\share\\hum.flac", duration: null, artist: null, title: null },
        { path: "Z:\\nope.mp3", duration: null, artist: null, title: "Heathens" },
      ],
      library,
    );
    expect(paths).toEqual([ride.path, "C:\\Music\\Heathens.mp3", hum.path]);
    expect(unmatched).toBe(0);
  });

  it("counts lines that match nothing or only an ambiguous title", () => {
    const { paths, unmatched } = matchM3u8Entries(
      [
        { path: "Z:\\nothing.mp3", duration: null, artist: null, title: "Nothing" },
        { path: "Z:\\x.mp3", duration: null, artist: null, title: "Intro" },
      ],
      library,
    );
    expect(paths).toEqual([]);
    expect(unmatched).toBe(2);
  });

  it("reports the result in one sentence", () => {
    expect(importSummary("Gym", 3, 0)).toBe("Imported 3 songs into Gym");
    expect(importSummary("Gym", 1, 2)).toBe("Imported 1 song into Gym. 2 lines not in your library.");
  });
});
