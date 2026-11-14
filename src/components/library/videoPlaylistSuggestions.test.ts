import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import { suggestVideoPlaylists } from "./videoPlaylistSuggestions";

const f = (path: string, channelId?: string, channel?: string) =>
  ({ path, youtube: channelId ? { channelId, channel } : undefined }) as unknown as MediaFile;
const many = (n: number, id: string, name: string) =>
  Array.from({ length: n }, (_, i) => f(`${id}${i}`, id, name));

describe("suggestVideoPlaylists", () => {
  it("groups by channel, needs 4 videos, biggest first", () => {
    const out = suggestVideoPlaylists([...many(4, "a", "Alpha"), ...many(6, "b", "Beta"), ...many(3, "c", "Gamma")], []);
    expect(out.map((s) => s.title)).toEqual(["Beta", "Alpha"]);
    expect(out[0].files).toHaveLength(6);
  });
  it("skips channels that already have a playlist of that name", () => {
    expect(suggestVideoPlaylists(many(5, "a", "Alpha"), [" alpha "])).toEqual([]);
  });
  it("ignores files without channel info", () => {
    expect(suggestVideoPlaylists(Array.from({ length: 6 }, (_, i) => f(`x${i}`)), [])).toEqual([]);
  });
});
