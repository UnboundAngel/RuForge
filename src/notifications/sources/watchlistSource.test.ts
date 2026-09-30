import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistSnapshot, WatchlistUpload } from "@/watchlist/types";

const queueUpload = vi.fn<(u: WatchlistUpload) => Promise<boolean>>();

vi.mock("@/watchlist/watchlistActions", () => ({
  queueUpload: (u: WatchlistUpload) => queueUpload(u),
  openUploadInExplorer: vi.fn(async () => {}),
  markSeen: vi.fn(async () => {}),
  markAllSeen: vi.fn(async () => {}),
}));

vi.mock("@/store/ruforgeStore", () => ({
  useRuforgeStore: { getState: () => ({ entries: [], downloadJobs: [] }), subscribe: () => () => {} },
}));

const { useWatchlistStore } = await import("@/watchlist/watchlistStore");
const { watchlistSource } = await import("./watchlistSource");

const upload: WatchlistUpload = {
  videoId: "vid00000001",
  channelId: "UC0000000000000000000001",
  channelTitle: "Channel",
  title: "New video",
  url: "https://www.youtube.com/watch?v=vid00000001",
  thumbnail: "https://i.ytimg.com/vi/vid00000001/mqdefault.jpg",
  publishedAt: 100,
  discoveredAt: 100,
  durationSec: 60,
  liveStatus: "none",
  scheduledAt: null,
  seen: false,
  autoQueued: false,
};

const snapshot: WatchlistSnapshot = { channels: [], uploads: [upload], unseenCount: 1, checkIntervalMin: 30 };

describe("watchlistSource queue", () => {
  beforeEach(() => {
    queueUpload.mockReset();
    useWatchlistStore.setState({ snapshot });
  });

  it("reports a refused queue so the row stays unread", async () => {
    queueUpload.mockResolvedValue(false);
    const [item] = watchlistSource.items();
    await expect(watchlistSource.runAction(item, "queue")).resolves.toBe(false);
  });

  it("reports a successful queue", async () => {
    queueUpload.mockResolvedValue(true);
    const [item] = watchlistSource.items();
    await expect(watchlistSource.runAction(item, "queue")).resolves.toBe(true);
  });
});
