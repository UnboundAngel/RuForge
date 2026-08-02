import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getGalleryColdFetchStats,
  resetGalleryColdFetchForTests,
  runEnsureGalleryOnViewMount,
  tryJoinColdGalleryFetch,
} from "./galleryColdFetch";

afterEach(() => {
  resetGalleryColdFetchForTests();
});

describe("galleryColdFetch", () => {
  it("coalesces overlapping cold ensure calls into one fetchEntries", async () => {
    let active = 0;
    let maxActive = 0;
    let fetchStarts = 0;
    const fetchEntries = vi.fn(async () => {
      fetchStarts += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 30));
      active -= 1;
    });

    await Promise.all([
      runEnsureGalleryOnViewMount({ fetchEntries }),
      runEnsureGalleryOnViewMount({ fetchEntries }),
      runEnsureGalleryOnViewMount({ fetchEntries }),
    ]);

    const stats = getGalleryColdFetchStats();
    expect(stats.ensureCalls).toBe(3);
    expect(fetchStarts).toBe(1);
    expect(maxActive).toBe(1);
    expect(fetchEntries).toHaveBeenCalledTimes(1);
  });

  it("lets joinColdInFlight share the in-flight cold promise", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchEntries = vi.fn(async () => {
      await gate;
    });

    const cold = runEnsureGalleryOnViewMount({ fetchEntries });
    const joined = tryJoinColdGalleryFetch();
    expect(joined).not.toBeNull();

    release();
    await Promise.all([cold, joined]);
    expect(getGalleryColdFetchStats().fetchJoinedCold).toBe(1);
  });

  it("forceCold during an in-flight cold joins instead of starting a second fetch", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchEntries = vi.fn(async () => {
      await gate;
    });

    const first = runEnsureGalleryOnViewMount({ fetchEntries });
    const forced = runEnsureGalleryOnViewMount({
      forceCold: true,
      fetchEntries,
    });

    release();
    await Promise.all([first, forced]);
    expect(fetchEntries).toHaveBeenCalledTimes(1);
  });

  it("forceCold after cold finished starts a new fetchEntries", async () => {
    const fetchEntries = vi.fn(async () => {});

    await runEnsureGalleryOnViewMount({ fetchEntries });
    await runEnsureGalleryOnViewMount({ forceCold: true, fetchEntries });

    expect(fetchEntries).toHaveBeenCalledTimes(2);
    expect(fetchEntries).toHaveBeenLastCalledWith({ forceReindex: true });
  });

  it("quiet remount after cold does not use the cold path", async () => {
    const fetchEntries = vi.fn(async () => {});

    await runEnsureGalleryOnViewMount({ fetchEntries });
    await runEnsureGalleryOnViewMount({ fetchEntries });

    expect(fetchEntries).toHaveBeenCalledTimes(2);
    expect(fetchEntries).toHaveBeenLastCalledWith({
      manageLoadingStart: false,
      skipPosterBackfill: true,
      skipScrubBackfill: true,
      joinColdInFlight: true,
    });
  });
});
