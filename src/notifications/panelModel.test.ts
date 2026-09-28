import { describe, expect, it } from "vitest";
import { actionClosesPopover, filterNotificationItems, unreadBadgeLabel } from "./panelModel";
import type { NotificationItem } from "./types";

function item(id: string, source: NotificationItem["source"]): NotificationItem {
  return {
    id,
    source,
    kind: source === "watchlist" ? "upload" : "download-finished",
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

describe("panelModel", () => {
  const items = [item("a", "watchlist"), item("b", "download"), item("c", "watchlist")];

  it("filters by source and keeps order", () => {
    expect(filterNotificationItems(items, "all")).toBe(items);
    expect(filterNotificationItems(items, "watchlist").map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterNotificationItems(items, "download").map((i) => i.id)).toEqual(["b"]);
  });

  it("closes only on actions that navigate away", () => {
    expect(actionClosesPopover("open-explorer")).toBe(true);
    expect(actionClosesPopover("play")).toBe(true);
    expect(actionClosesPopover("open-storage-settings")).toBe(true);
    expect(actionClosesPopover("queue")).toBe(false);
    expect(actionClosesPopover("retry")).toBe(false);
    expect(actionClosesPopover("show-in-folder")).toBe(false);
  });

  it("caps the badge at 9+", () => {
    expect(unreadBadgeLabel(1)).toBe("1");
    expect(unreadBadgeLabel(9)).toBe("9");
    expect(unreadBadgeLabel(10)).toBe("9+");
  });
});
