import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationItem } from "./types";

const runAction = vi.fn();
const markNotificationsRead = vi.fn(async (_items: NotificationItem[]) => {});

vi.mock("./registry", () => ({
  notificationSource: () => ({ runAction }),
  markNotificationsRead: (items: NotificationItem[]) => markNotificationsRead(items),
  markAllNotificationsRead: vi.fn(async () => {}),
}));

const { runNotificationAction } = await import("./popoverActions");

const upload: NotificationItem = {
  id: "watchlist:abc",
  source: "watchlist",
  kind: "upload",
  title: "Video",
  subtitle: "Channel",
  thumbnail: null,
  channelId: null,
  createdAt: 1,
  read: false,
  actions: ["queue", "open-explorer"],
  ref: { videoId: "abc" },
};

describe("runNotificationAction", () => {
  beforeEach(() => {
    runAction.mockReset();
    markNotificationsRead.mockClear();
  });

  it("marks the row read after a successful action", async () => {
    runAction.mockResolvedValue(true);
    await runNotificationAction(upload, "queue");
    expect(markNotificationsRead).toHaveBeenCalledWith([upload]);
  });

  it("marks read when the source reports nothing", async () => {
    runAction.mockResolvedValue(undefined);
    await runNotificationAction(upload, "open-explorer");
    expect(markNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it("keeps the row unread when the queue is refused", async () => {
    runAction.mockResolvedValue(false);
    await runNotificationAction(upload, "queue");
    expect(markNotificationsRead).not.toHaveBeenCalled();
  });

  it("keeps the row unread when the action throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    runAction.mockRejectedValue(new Error("boom"));
    await runNotificationAction(upload, "queue");
    expect(markNotificationsRead).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
