import { describe, expect, it } from "vitest";
import { buildPlaylistEnqueuePlan, playlistItemKey } from "./playlistDownloadPlan";
import type { PlaylistItem } from "./types";

const vid = (id: string): PlaylistItem => ({ id, title: `T${id}`, thumbnail: "", duration: 60 });
const ids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd"];
const items = ids.map(vid);

describe("buildPlaylistEnqueuePlan exclusion", () => {
  it("numbers kept rows contiguously", () => {
    const excluded = new Set([playlistItemKey(items[1], 2)]);
    const plan = buildPlaylistEnqueuePlan(items, [], {}, false, false, excluded);
    expect(plan.toDownload.map((i) => i.index)).toEqual([1, 2, 3]);
    expect(plan.toDownload.map((i) => i.title)).toEqual(["Taaaaaaaaaaa", "Tccccccccccc", "Tddddddddddd"]);
    expect(plan.totalResolved).toBe(3);
  });

  it("downloads everything without exclusions", () => {
    const plan = buildPlaylistEnqueuePlan(items, [], {}, false, false);
    expect(plan.toDownload).toHaveLength(4);
  });

  it("keeps per-row audio overrides keyed by row position", () => {
    const excluded = new Set([playlistItemKey(items[0], 1)]);
    const overrides = { [playlistItemKey(items[2], 3)]: true };
    const plan = buildPlaylistEnqueuePlan(items, [], overrides, false, false, excluded);
    expect(plan.toDownload.find((i) => i.title === "Tccccccccccc")?.audioOnly).toBe(true);
    expect(plan.toDownload.find((i) => i.title === "Tbbbbbbbbbbb")?.audioOnly).toBe(false);
  });
});
