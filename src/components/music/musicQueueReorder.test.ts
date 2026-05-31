import { describe, expect, it } from "vitest";
import {
  buildCombinedQueuePaths,
  manualQueueFromCombinedReorder,
  reorderManualQueuePaths,
} from "./musicQueueReorder";

describe("reorderManualQueuePaths", () => {
  it("moves an item down", () => {
    expect(reorderManualQueuePaths(["/a", "/b", "/c"], 0, 2)).toEqual([
      "/b",
      "/c",
      "/a",
    ]);
  });

  it("no-ops on invalid indices", () => {
    const q = ["/a"];
    expect(reorderManualQueuePaths(q, -1, 0)).toEqual(q);
    expect(reorderManualQueuePaths(q, 0, 5)).toEqual(q);
  });
});

describe("buildCombinedQueuePaths", () => {
  it("dedupes next-up paths already in manual queue", () => {
    expect(buildCombinedQueuePaths(["/a"], ["/a", "/b"])).toEqual(["/a", "/b"]);
  });
});

describe("manualQueueFromCombinedReorder", () => {
  it("promotes reordered next-up paths into manual queue", () => {
    expect(
      manualQueueFromCombinedReorder(["/b", "/a", "/c"]),
    ).toEqual(["/b", "/a", "/c"]);
  });

  it("dedupes duplicate paths in one reorder", () => {
    expect(
      manualQueueFromCombinedReorder(["/a", "/a", "/b"]),
    ).toEqual(["/a", "/b"]);
  });
});
