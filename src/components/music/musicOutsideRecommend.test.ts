import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicTrackInfo } from "@/lib/musicExploreTracks";
import type { MediaFile } from "@/types";
import {
  PENDING_ADD_TTL_MS,
  RADIO_BACKOFF_MS,
  RADIO_CACHE_TTL_MS,
  fileVideoId,
  mergeOutsideRecommendations,
  type OutsideTrack,
  blendRadios,
  musicRadioUrl,
  outsidePageSpread,
  outsideRoundSeeds,
  radioBackoffActive,
  radioSeeds,
  readCachedRadio,
  resolvePendingAdds,
  startRadioBackoff,
  writeCachedRadio,
} from "./musicOutsideRecommend";

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

function radioItem(id: string, title: string, artist: string | null): MusicTrackInfo {
  return {
    id: `https://music.youtube.com/watch?v=${id}`,
    url: `https://music.youtube.com/watch?v=${id}`,
    title,
    artist,
    album: null,
    duration: 200,
    thumbnail: null,
  };
}

// Video ids are 11 characters.
const A1 = "aaaaaaaaaa1";
const A2 = "aaaaaaaaaa2";
const B1 = "bbbbbbbbbb1";
const C1 = "cccccccccc1";

describe("fileVideoId", () => {
  it("prefers the sidecar id and falls back to the source URL", () => {
    expect(fileVideoId(track("x", { sourceId: A1 }))).toBe(A1);
    expect(fileVideoId(track("x", { sourceUrl: `https://www.youtube.com/watch?v=${B1}` }))).toBe(B1);
    expect(fileVideoId(track("x"))).toBeNull();
  });

  it("ignores a sidecar id that isn't a video id", () => {
    expect(fileVideoId(track("x", { sourceId: "not-an-id" }))).toBeNull();
  });
});

describe("musicRadioUrl", () => {
  it("builds YouTube Music's RDAMVM radio for a song", () => {
    expect(musicRadioUrl(A1)).toBe(`https://music.youtube.com/watch?v=${A1}&list=RDAMVM${A1}`);
  });
});

describe("radioSeeds", () => {
  it("puts the most represented artist first, one seed per artist before repeats", () => {
    const tracks = [
      track("b1", { sourceId: B1, artist: "Bee" }),
      track("a1", { sourceId: A1, artist: "Ay" }),
      track("a2", { sourceId: A2, artist: "Ay" }),
      track("none", { artist: "Ay" }),
      track("c1", { sourceId: C1, artist: "Cee" }),
    ];
    expect(radioSeeds(tracks)).toEqual([A1, B1, C1, A2]);
  });

  it("skips songs without an id and caps the count", () => {
    const tracks = [track("a1", { sourceId: A1 }), track("x"), track("b1", { sourceId: B1 })];
    expect(radioSeeds(tracks, 1)).toHaveLength(1);
    expect(radioSeeds([track("x")])).toEqual([]);
  });
});

describe("mergeOutsideRecommendations", () => {
  const library = [
    track("Owned By Id", { sourceId: B1, artist: "Someone" }),
    track("Owned Song", { artist: "Band" }),
  ];

  it("drops the seed, owned ids and owned title+artist matches", () => {
    const radio = [
      radioItem(A1, "Seed", "Band"),
      radioItem(B1, "Owned By Id", "Someone"),
      radioItem("dddddddddd1", "Owned Song (Official Video)", "Band - Topic"),
      radioItem(C1, "New Song", "Band - Topic"),
    ];
    const out = mergeOutsideRecommendations(radio, library, A1);
    expect(out.map((t) => t.videoId)).toEqual([C1]);
    expect(out[0]).toMatchObject({ title: "New Song", artist: "Band", url: `https://music.youtube.com/watch?v=${C1}` });
  });

  it("keeps one of a video and its audio upload", () => {
    const radio = [radioItem(C1, "Fresh", "Band"), radioItem("eeeeeeeeee1", "Fresh [Audio]", "Band - Topic")];
    expect(mergeOutsideRecommendations(radio, [], A1)).toHaveLength(1);
  });

  it("skips entries without a video id or title", () => {
    const bad = { ...radioItem(C1, "x", null), id: "nope", url: "nope" };
    expect(mergeOutsideRecommendations([bad, radioItem(A2, "  ", null)], [], A1)).toEqual([]);
  });
});

describe("outsideRoundSeeds / blendRadios / outsidePageSpread", () => {
  const out = (id: string, artist: string): OutsideTrack => ({
    videoId: id,
    title: `Song ${id}`,
    artist,
    thumbnail: null,
    duration: 200,
    url: `https://music.youtube.com/watch?v=${id}`,
  });

  it("walks windows of seeds before paging the blend", () => {
    const seeds = ["s1", "s2", "s3", "s4", "s5", "s6"];
    expect(outsideRoundSeeds(seeds, 0)).toEqual({ seedIds: ["s1", "s2", "s3"], page: 0 });
    expect(outsideRoundSeeds(seeds, 1)).toEqual({ seedIds: ["s4", "s5", "s6"], page: 0 });
    expect(outsideRoundSeeds(seeds, 2)).toEqual({ seedIds: ["s1", "s2", "s3"], page: 1 });
    expect(outsideRoundSeeds(["s1"], 4)).toEqual({ seedIds: ["s1"], page: 4 });
    expect(outsideRoundSeeds([], 1)).toEqual({ seedIds: [], page: 0 });
  });

  it("interleaves radios and drops repeats", () => {
    const blended = blendRadios([
      [out("a", "King Von"), out("b", "King Von")],
      [out("c", "Drake"), out("a", "King Von")],
    ]);
    expect(blended.map((t) => t.videoId)).toEqual(["a", "c", "b"]);
  });

  it("caps one artist per page and only repeats them when nobody else is left", () => {
    const pool = [out("1", "King Von"), out("2", "King Von"), out("3", "King Von"), out("4", "Drake")];
    expect(outsidePageSpread(pool, 0, 3).map((t) => t.videoId)).toEqual(["1", "2", "4"]);
    expect(outsidePageSpread(pool.slice(0, 3), 0, 3).map((t) => t.videoId)).toEqual(["1", "2", "3"]);
  });
});

describe("radio cache and backoff", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("serves a radio for a day, then expires it", () => {
    const items = [radioItem(C1, "New", "Band")];
    writeCachedRadio(A1, items, 1000);
    expect(readCachedRadio(A1, 1000 + RADIO_CACHE_TTL_MS)).toEqual(items);
    expect(readCachedRadio(A1, 1001 + RADIO_CACHE_TTL_MS)).toBeNull();
    expect(readCachedRadio(B1, 1000)).toBeNull();
  });

  it("backs off after a failure", () => {
    expect(radioBackoffActive(0)).toBe(false);
    startRadioBackoff(0);
    expect(radioBackoffActive(RADIO_BACKOFF_MS - 1)).toBe(true);
    expect(radioBackoffActive(RADIO_BACKOFF_MS)).toBe(false);
  });
});

describe("resolvePendingAdds", () => {
  it("adds songs that landed, keeps the rest, and gives up after the TTL", () => {
    const landed = track("landed", { sourceId: A1 });
    const pending = [
      { videoId: A1, playlistId: "p1", at: 0 },
      { videoId: B1, playlistId: "p1", at: 10 },
      { videoId: C1, playlistId: "p2", at: 0 },
    ];
    const { ready, waiting } = resolvePendingAdds(pending, [landed], PENDING_ADD_TTL_MS + 5);
    expect(ready).toEqual([{ add: pending[0], path: landed.path }]);
    expect(waiting).toEqual([pending[1]]);
  });

  it("keeps waiting when the match is a file the playlist already holds", () => {
    const stale = track("older-song", { sourceId: A1 });
    const pending = [{ videoId: A1, playlistId: "p1", at: 0 }];
    const has = (id: string, path: string) => id === "p1" && path === stale.path;
    const { ready, waiting } = resolvePendingAdds(pending, [stale], 1, has);
    expect(ready).toEqual([]);
    expect(waiting).toEqual(pending);
  });
});
