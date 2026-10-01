import { describe, expect, it } from "vitest";

import type { IslandDownload } from "./IslandDownloadContent";
import { islandDownloadMilestone } from "./useIslandDownloadTurn";

function dl(patch: Partial<IslandDownload>): IslandDownload {
  return { key: "a", title: "Song", thumbnail: null, pct: null, waiting: false, remaining: 0, jobs: [], ...patch };
}

describe("islandDownloadMilestone", () => {
  it("only moves at a quarter of progress", () => {
    expect(islandDownloadMilestone(dl({ pct: 10 }))).toBe(islandDownloadMilestone(dl({ pct: 24 })));
    expect(islandDownloadMilestone(dl({ pct: 24 }))).not.toBe(islandDownloadMilestone(dl({ pct: 25 })));
    expect(islandDownloadMilestone(dl({ pct: 51 }))).not.toBe(islandDownloadMilestone(dl({ pct: 76 })));
  });

  it("moves when the download starts or the lead job changes", () => {
    expect(islandDownloadMilestone(dl({ waiting: true }))).not.toBe(islandDownloadMilestone(dl({})));
    expect(islandDownloadMilestone(dl({ key: "a" }))).not.toBe(islandDownloadMilestone(dl({ key: "b" })));
    expect(islandDownloadMilestone(null)).toBeNull();
  });
});
