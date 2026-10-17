import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCachedListenSnapshot,
  getListenSnapshotRevision,
  isListenSnapshotReady,
  refreshListenSnapshot,
  resetListenSnapshotForTests,
  setListenSnapshotForTests,
  subscribeListenSnapshot,
} from "./musicListenSnapshot";
import { EMPTY_LISTEN_SNAPSHOT } from "./musicListenTypes";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

afterEach(() => {
  resetListenSnapshotForTests();
  vi.mocked(invoke).mockReset();
});

describe("musicListenSnapshot", () => {
  it("stays not-ready until the first fetch settles", async () => {
    expect(isListenSnapshotReady()).toBe(false);
    expect(getCachedListenSnapshot()).toEqual(EMPTY_LISTEN_SNAPSHOT);

    const snap = {
      v: 1,
      stats: [
        {
          identityKey: "a",
          path: "/a.mp3",
          title: "A",
          artist: "X",
          playCount: 3,
          listenTimeSec: 120,
          lastPlayed: 1,
        },
      ],
      history: [],
    };
    vi.mocked(invoke).mockResolvedValueOnce(snap);

    const revisions: number[] = [];
    const unsub = subscribeListenSnapshot(() => {
      revisions.push(getListenSnapshotRevision());
    });

    await refreshListenSnapshot();
    unsub();

    expect(isListenSnapshotReady()).toBe(true);
    expect(getCachedListenSnapshot()).toEqual(snap);
    expect(revisions.length).toBeGreaterThan(0);
  });

  it("keeps the previous cache when a later fetch fails", async () => {
    setListenSnapshotForTests({
      v: 1,
      stats: [
        {
          identityKey: "a",
          path: "/a.mp3",
          title: "A",
          artist: "X",
          playCount: 1,
          listenTimeSec: 60,
          lastPlayed: 1,
        },
      ],
      history: [],
    });
    const before = getCachedListenSnapshot();
    vi.mocked(invoke).mockRejectedValueOnce(new Error("offline"));

    await refreshListenSnapshot();

    expect(isListenSnapshotReady()).toBe(true);
    expect(getCachedListenSnapshot()).toBe(before);
  });
});
