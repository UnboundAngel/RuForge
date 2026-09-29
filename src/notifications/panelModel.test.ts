import { describe, expect, it } from "vitest";
import {
  actionClosesPopover,
  filterNotificationItems,
  notificationDetail,
  notificationHeadline,
  notificationKicker,
  splitByRead,
  unreadBadgeLabel,
} from "./panelModel";
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

  it("splits unread from read and keeps order", () => {
    const list = [item("a", "watchlist"), { ...item("b", "download"), read: true }, item("c", "watchlist")];
    const { fresh, earlier } = splitByRead(list);
    expect(fresh.map((i) => i.id)).toEqual(["a", "c"]);
    expect(earlier.map((i) => i.id)).toEqual(["b"]);
  });

  it("builds the upload headline from the channel name", () => {
    const upload = { ...item("Video", "watchlist"), subtitle: "Chan" };
    expect(notificationHeadline(upload, null)).toEqual({ channel: "Chan", verb: "uploaded", title: "Video" });
    expect(notificationKicker(upload, null)).toEqual({ text: "Chan uploaded", tone: "muted" });
    expect(notificationDetail(upload)).toBeNull();
  });

  it("needs the followed channel name for premieres", () => {
    const premiere = { ...item("Show", "watchlist"), kind: "premiere" as const, subtitle: "Premieres soon" };
    expect(notificationHeadline(premiere, null)).toEqual({ channel: null, verb: null, title: "Show" });
    expect(notificationHeadline(premiere, "Chan").verb).toBe("scheduled a premiere");
    expect(notificationKicker(premiere, null).text).toBe("Premiere");
    expect(notificationDetail(premiere)).toBe("Premieres soon");
  });

  it("labels download rows by outcome and drops a subtitle that repeats the title", () => {
    const failed = { ...item("File", "download"), kind: "download-failed" as const, subtitle: "HTTP 403" };
    expect(notificationHeadline(failed, "Chan")).toEqual({ channel: null, verb: null, title: "File" });
    expect(notificationKicker(failed, "Chan")).toEqual({ text: "Download failed", tone: "danger" });
    expect(notificationDetail(failed)).toBe("HTTP 403");
    expect(notificationDetail({ ...item("Same", "download"), subtitle: "Same" })).toBeNull();
  });
});
