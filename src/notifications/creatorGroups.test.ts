import { describe, expect, it } from "vitest";
import { groupByCreator } from "./creatorGroups";
import type { NotificationItem } from "./types";

function item(id: string, over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id,
    source: "watchlist",
    kind: "upload",
    title: id,
    subtitle: null,
    thumbnail: null,
    channelId: "UC1",
    createdAt: 1,
    read: false,
    actions: [],
    ref: {},
    ...over,
  } as NotificationItem;
}

describe("groupByCreator", () => {
  it("groups two or more rows from one creator at the first row's position", () => {
    const out = groupByCreator([item("a"), item("b", { channelId: "UC2" }), item("c")]);
    expect(out.map((e) => e.type)).toEqual(["group", "item"]);
    expect(out[0].type === "group" && out[0].items.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("leaves a lone creator row and non-watchlist rows alone", () => {
    const out = groupByCreator([
      item("a"),
      item("d", { source: "download", kind: "download-finished", channelId: "UC1" }),
    ]);
    expect(out.map((e) => e.type)).toEqual(["item", "item"]);
  });
});
