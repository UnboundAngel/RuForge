import { beforeEach, describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import type { OutsideTrack } from "./musicOutsideRecommend";
import type { ShelfItem } from "./musicShelfFollowUps";
import {
  currentHiddenMatcher,
  hideShelfArtist,
  hideShelfSong,
  shelfItemArtist,
  unhideArtist,
  unhideSong,
  useHiddenRecommendations,
} from "./musicHiddenRecommendations";

function track(name: string, extra: Partial<MediaFile> = {}): MediaFile {
  return {
    name,
    path: `C:\\m\\${name}.m4a`,
    size: 1,
    created: 1,
    duration: 100,
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

function yt(videoId: string, title = videoId, artist = ""): OutsideTrack {
  return { videoId, title, artist, thumbnail: null, duration: null, url: `https://music.youtube.com/watch?v=${videoId}` };
}

const local = (file: MediaFile): ShelfItem => ({ kind: "local", file });
const outside = (t: OutsideTrack): ShelfItem => ({ kind: "outside", track: t });

beforeEach(() => useHiddenRecommendations.setState({ songs: [], artists: [] }));

describe("hidden recommendations", () => {
  it("hides a library song by path and nothing else", () => {
    const a = track("A", { artist: "X" });
    hideShelfSong(local(a));
    const hidden = currentHiddenMatcher();
    expect(hidden(local(a))).toBe(true);
    expect(hidden(local(track("B", { artist: "X" })))).toBe(false);
  });

  it("keeps a YouTube Music song hidden under another video id and once downloaded", () => {
    hideShelfSong(outside(yt("aaaaaaaaaaa", "Night Drive (Official Video)", "Neon")));
    const hidden = currentHiddenMatcher();
    expect(hidden(outside(yt("bbbbbbbbbbb", "Night Drive", "Neon")))).toBe(true);
    expect(hidden(local(track("Other name", { sourceId: "aaaaaaaaaaa" })))).toBe(true);
    expect(hidden(local(track("Night Drive", { artist: "Neon" })))).toBe(true);
    expect(hidden(outside(yt("ccccccccccc", "Night Drive", "Someone Else")))).toBe(false);
  });

  it("does not match by title alone when the artist is unknown", () => {
    hideShelfSong(outside(yt("aaaaaaaaaaa", "Intro", "")));
    expect(currentHiddenMatcher()(outside(yt("bbbbbbbbbbb", "Intro", "")))).toBe(false);
  });

  it("hides an artist across library and YouTube Music cards", () => {
    hideShelfArtist(local(track("A", { artist: "Neon, Guest" })));
    const hidden = currentHiddenMatcher();
    expect(hidden(outside(yt("aaaaaaaaaaa", "Song", "Neon")))).toBe(true);
    expect(hidden(local(track("B", { artist: "neon" })))).toBe(true);
    expect(hidden(local(track("C", { artist: "Other" })))).toBe(false);
  });

  it("unhides songs and artists individually", () => {
    const song = hideShelfSong(local(track("A", { artist: "X" })));
    const artist = hideShelfArtist(outside(yt("aaaaaaaaaaa", "S", "Y")));
    unhideSong(song.id);
    expect(useHiddenRecommendations.getState().songs).toHaveLength(0);
    expect(useHiddenRecommendations.getState().artists).toHaveLength(1);
    unhideArtist(artist!.key);
    expect(useHiddenRecommendations.getState().artists).toHaveLength(0);
  });

  it("names the artist the same way for both card kinds", () => {
    expect(shelfItemArtist(local(track("A", { artist: "Neon feat. Guest" })))?.key).toBe("neon");
    expect(shelfItemArtist(outside(yt("aaaaaaaaaaa", "S", "Neon")))?.key).toBe("neon");
    expect(shelfItemArtist(outside(yt("aaaaaaaaaaa", "S", "")))).toBeNull();
  });
});
