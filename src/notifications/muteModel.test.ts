import { describe, expect, it } from "vitest";
import { filterMuted, isKindMuted, muteKeyForKind, normalizeMutedList } from "./muteModel";
import type { NotificationItem, NotificationKind } from "./types";

function item(id: string, kind: NotificationKind): NotificationItem {
  return {
    id,
    source: "download",
    kind,
    title: id,
    subtitle: null,
    thumbnail: null,
    channelId: null,
    createdAt: 0,
    read: false,
    actions: [],
    ref: {},
  };
}

describe("muteModel", () => {
  it("groups failures, timeouts and holds as problems, apart from finished downloads", () => {
    expect(muteKeyForKind("download-finished")).toBe("downloads");
    expect(muteKeyForKind("download-failed")).toBe("problems");
    expect(muteKeyForKind("download-timed-out")).toBe("problems");
    expect(muteKeyForKind("download-blocked")).toBe("problems");
    expect(muteKeyForKind("premiere")).toBe("uploads");
  });

  it("muting downloads keeps failures visible", () => {
    const items = [item("a", "download-finished"), item("b", "download-failed")];
    expect(filterMuted(items, ["downloads"]).map((i) => i.id)).toEqual(["b"]);
    expect(isKindMuted("download-failed", ["downloads"])).toBe(false);
  });

  it("returns the same array when nothing is muted", () => {
    const items = [item("a", "download-finished")];
    expect(filterMuted(items, [])).toBe(items);
  });

  it("drops unknown and duplicate keys from stored settings", () => {
    expect(normalizeMutedList(["downloads", "downloads", "bogus", 4])).toEqual(["downloads"]);
    expect(normalizeMutedList("downloads")).toEqual([]);
  });
});
