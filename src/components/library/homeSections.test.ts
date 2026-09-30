import { describe, expect, it } from "vitest";
import { composeHomeSections, pickChannelSpotlight, shortsPerShelf } from "./homeSections";
import type { FeedVideo, MixedGridItem } from "./youtubeFeed";

const short = (id: string): FeedVideo => ({
  videoId: id,
  title: id,
  url: `https://www.youtube.com/watch?v=${id}`,
  channel: null,
  channelId: null,
  channelVerified: false,
  thumbnail: null,
  duration: null,
  viewCount: null,
  timestamp: null,
  short: true,
});

const video = (id: string): FeedVideo => ({ ...short(id), short: false });

const files = (n: number): MixedGridItem<string>[] =>
  Array.from({ length: n }, (_, i) => ({ kind: "file", file: `v${i}` }));

describe("composeHomeSections", () => {
  it("breaks video rows up with differently shaped shelves, then trails a plain grid", () => {
    const sections = composeHomeSections({
      mixed: files(40),
      columns: 4,
      continueFiles: ["c1"],
      shorts: Array.from({ length: 12 }, (_, i) => short(`s${i}`)),
      watchlist: [],
      hasPlaylists: true,
      channels: [{ channel: "CaseOh", channelId: null, items: files(3) }],
    });
    expect(sections.map((s) => s.kind)).toEqual([
      "grid", "continue", "grid", "shorts", "grid", "channel", "playlists", "grid", "shorts", "grid",
    ]);
    const grids = sections.filter((s) => s.kind === "grid");
    expect(grids.map((g) => g.items.length)).toEqual([4, 4, 8, 4, 20]);
    expect(grids[grids.length - 1]?.title).toBe("Keep exploring");
  });

  it("gives each channel shelf its own slot and drops empty ones", () => {
    const sections = composeHomeSections({
      mixed: files(40),
      columns: 4,
      continueFiles: [],
      shorts: [],
      watchlist: [],
      hasPlaylists: false,
      channels: [
        { channel: "Followed", channelId: "UC1", items: [{ kind: "feed", video: video("f1") }] },
        { channel: "Empty", channelId: "UC2", items: [] },
        { channel: "Library", channelId: "UC3", items: files(2) },
      ],
    });
    const shelves = sections.flatMap((s) => (s.kind === "channel" ? [s.channel] : []));
    expect(shelves).toEqual(["Followed", "Library"]);
  });

  it("skips shelves with nothing to show", () => {
    const sections = composeHomeSections({
      mixed: files(3),
      columns: 4,
      continueFiles: [],
      shorts: [short("s1")],
      watchlist: [],
      hasPlaylists: false,
      channels: [],
    });
    expect(sections.map((s) => s.kind)).toEqual(["grid"]);
  });

  it("puts the followed-channels shelf right after the first video row", () => {
    const uploads = [video("w1"), video("w2")];
    const sections = composeHomeSections({
      mixed: files(12),
      columns: 4,
      continueFiles: ["c1"],
      shorts: [],
      watchlist: uploads,
      hasPlaylists: false,
      channels: [],
    });
    expect(sections.map((s) => s.kind)).toEqual(["grid", "watchlist", "continue", "grid", "grid"]);
    const shelf = sections[1];
    expect(shelf?.kind === "watchlist" ? shelf.videos : null).toBe(uploads);
  });
});

describe("pickChannelSpotlight", () => {
  it("picks the most downloaded channel with at least three videos", () => {
    const lib = [
      { id: 1, ch: "A" },
      { id: 2, ch: "B" },
      { id: 3, ch: "B" },
      { id: 4, ch: "B" },
      { id: 5, ch: "A" },
    ];
    const pick = pickChannelSpotlight(lib, (f) => ({ channel: f.ch }), 2);
    expect(pick?.channel).toBe("B");
    expect(pick?.files.map((f) => f.id)).toEqual([2, 3]);
    expect(pickChannelSpotlight(lib.slice(0, 2), (f) => ({ channel: f.ch }), 4)).toBeNull();
  });
});

describe("shortsPerShelf", () => {
  it("fits a few more Shorts than video columns", () => {
    expect(shortsPerShelf(4)).toBe(6);
    expect(shortsPerShelf(8)).toBe(8);
  });
});
