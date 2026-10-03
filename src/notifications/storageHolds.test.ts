import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWatchlistStore } from "@/watchlist/watchlistStore";
import type { WatchlistSnapshot } from "@/watchlist/types";
import { upsertLocal, useNotificationCenterStore } from "./notificationCenterStore";

vi.mock("./recordNotification", () => ({ recordNotification: (item: never) => upsertLocal(item) }));
import { STORAGE_FULL_NOTIFICATION_ID, buildDownloadNotification, recordStorageFullRefusal } from "./sources/downloadItems";
import { watchlistUploadToItem } from "./sources/watchlistItems";
import { withStorageHolds } from "./storageHolds";

const upload = {
  videoId: "dQw4w9WgXcQ",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  title: "Video",
  thumbnail: "t.jpg",
  channelId: "UC1",
  channelTitle: "Chan",
  discoveredAt: 1,
  seen: false,
  liveStatus: null,
  scheduledAt: null,
} as unknown as WatchlistSnapshot["uploads"][number];

describe("withStorageHolds", () => {
  it("badges a held upload in place and adds storage settings", () => {
    const [item] = withStorageHolds([watchlistUploadToItem(upload)], new Set([upload.videoId]));
    expect(item.ref.storageHeld).toBe(true);
    expect(item.actions).toEqual(["queue", "open-explorer", "open-storage-settings"]);
  });

  it("matches download rows by URL", () => {
    const failed = buildDownloadNotification("download-failed", { jobId: "j", url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(withStorageHolds([failed], new Set([upload.videoId]))[0].ref.storageHeld).toBe(true);
  });

  it("returns the same array with no holds", () => {
    const list = [watchlistUploadToItem(upload)];
    expect(withStorageHolds(list, new Set())).toBe(list);
  });
});

describe("recordStorageFullRefusal", () => {
  beforeEach(() => {
    useNotificationCenterStore.setState({ local: [], storageHeldVideoIds: new Set() });
    useWatchlistStore.setState({ snapshot: null });
  });

  it("marks a followed upload instead of adding a row", () => {
    useWatchlistStore.setState({ snapshot: { uploads: [upload] } as unknown as WatchlistSnapshot });
    recordStorageFullRefusal({ url: upload.url, title: upload.title });
    const s = useNotificationCenterStore.getState();
    expect(s.local).toHaveLength(0);
    expect(s.storageHeldVideoIds.has(upload.videoId)).toBe(true);
  });

  it("adds a row for the video itself when the feed has none", () => {
    recordStorageFullRefusal({ url: upload.url, title: "Other", thumbnail: "x.jpg" });
    const [row] = useNotificationCenterStore.getState().local;
    expect(row.id).toBe(`${STORAGE_FULL_NOTIFICATION_ID}:youtube:${upload.videoId}`);
    expect(row.title).toBe("Other");
    expect(row.thumbnail).toBe("x.jpg");
  });

  it("falls back to the shared row without a video", () => {
    recordStorageFullRefusal();
    expect(useNotificationCenterStore.getState().local[0].id).toBe(STORAGE_FULL_NOTIFICATION_ID);
  });
});
