import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

import {
  __activityLogTestBuffers,
  __activityLogTestReset,
  bumpCounter,
  flushActivityLog,
  recordActivity,
} from "./activityLog";

describe("activityLog buffer", () => {
  beforeEach(() => {
    __activityLogTestReset();
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __activityLogTestReset();
  });

  it("buffers events until flush", async () => {
    recordActivity({ kind: "app_session_start" });
    recordActivity({ kind: "app_session_end", activeMinutes: 3 });
    expect(__activityLogTestBuffers().events).toHaveLength(2);
    await flushActivityLog();
    expect(__activityLogTestBuffers().events).toHaveLength(0);
    expect(invoke).toHaveBeenCalledWith("activity_record", {
      events: expect.arrayContaining([
        expect.objectContaining({ kind: "app_session_start" }),
        expect.objectContaining({ kind: "app_session_end", activeMinutes: 3 }),
      ]),
    });
  });

  it("buffers counters until flush", async () => {
    bumpCounter("hotkey:player.playPause");
    bumpCounter("feature:cleanup");
    expect(__activityLogTestBuffers().counters).toEqual([
      "hotkey:player.playPause",
      "feature:cleanup",
    ]);
    await flushActivityLog();
    expect(invoke).toHaveBeenCalledWith("activity_bump_counters", {
      ids: ["hotkey:player.playPause", "feature:cleanup"],
    });
  });

  it("swallows invoke failures", async () => {
    invoke.mockRejectedValueOnce(new Error("boom"));
    recordActivity({ kind: "tag_created", tagId: "t1" });
    await expect(flushActivityLog()).resolves.toBeUndefined();
  });
});
