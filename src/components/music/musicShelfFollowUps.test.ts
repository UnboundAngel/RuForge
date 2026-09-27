import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import type { OutsideTrack } from "./musicOutsideRecommend";
import { type ShelfItem, layoutShelf, shelfKey, shelfKeys, similarLibrarySongs } from "./musicShelfFollowUps";

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

function yt(videoId: string): OutsideTrack {
  return { videoId, title: videoId, artist: "", thumbnail: null, duration: null, url: `https://music.youtube.com/watch?v=${videoId}` };
}

const local = (file: MediaFile): ShelfItem => ({ kind: "local", file });
const outside = (t: OutsideTrack): ShelfItem => ({ kind: "outside", track: t });

describe("similarLibrarySongs", () => {
  const added = track("added", { artist: "Ay", album: "One" });
  const library = [
    added,
    track("same album other artist", { artist: "Bee", album: "One", created: 9 }),
    track("same artist old", { artist: "Ay", created: 1 }),
    track("same artist new", { artist: "Ay", created: 5 }),
    track("both", { artist: "Ay", album: "one", created: 0 }),
    track("unrelated", { artist: "Cee" }),
  ];

  it("ranks artist and album matches, then newest, and skips the added song", () => {
    const names = similarLibrarySongs(added, library, () => false, 4).map((t) => t.name);
    expect(names).toEqual(["both", "same artist new", "same artist old", "same album other artist"]);
  });

  it("honors the exclusion and never pads with unrelated songs", () => {
    const names = similarLibrarySongs(added, library, (p) => p.includes("both") || p.includes("same artist"), 5).map((t) => t.name);
    expect(names).toEqual(["same album other artist"]);
    expect(similarLibrarySongs(track("lone"), library, () => false)).toEqual([]);
  });
});

describe("layoutShelf", () => {
  const a = local(track("a"));
  const b = local(track("b"));
  const c = local(track("c"));
  const x = outside(yt("xxxxxxxxxx1"));
  const y = outside(yt("yyyyyyyyyy1"));

  it("puts follow-ups right behind the card that brought them, depth first", () => {
    const followUps = new Map([
      [shelfKey(a), [x, c]],
      [shelfKey(x), [y]],
    ]);
    const out = layoutShelf([a, b], followUps, (i) => i === a || i === x);
    expect(out.map(shelfKey)).toEqual([y, c, b].map(shelfKey));
  });

  it("keeps follow-ups hidden while their card is still on the shelf", () => {
    const followUps = new Map([[shelfKey(a), [x, c]]]);
    expect(layoutShelf([a, b], followUps, () => false).map(shelfKey)).toEqual([a, b].map(shelfKey));
  });

  it("drops gone cards but keeps their follow-ups in place", () => {
    const followUps = new Map([[shelfKey(a), [x]]]);
    const out = layoutShelf([a, b], followUps, (i) => i === a);
    expect(out.map(shelfKey)).toEqual([x, b].map(shelfKey));
  });

  it("shows a card once even if two adds suggested it", () => {
    const followUps = new Map([
      [shelfKey(a), [c]],
      [shelfKey(b), [c]],
    ]);
    expect(layoutShelf([a, b], followUps, (i) => i !== c).map(shelfKey)).toEqual([c].map(shelfKey));
    expect([...shelfKeys([a, b], followUps)]).toEqual([a, b, c].map(shelfKey));
  });
});
