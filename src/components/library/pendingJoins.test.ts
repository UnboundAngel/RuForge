import { describe, expect, it } from "vitest";
import { PENDING_MAX_AGE_MS, prunePending } from "./pendingJoinsRules";

describe("prunePending", () => {
  it("keeps recent waits and drops ones older than 7 days", () => {
    const now = 10 * PENDING_MAX_AGE_MS;
    const out = prunePending(
      {
        fresh: { recordId: "a", at: now - 1000 },
        edge: { recordId: "a", at: now - PENDING_MAX_AGE_MS },
        stale: { recordId: "a", at: now - PENDING_MAX_AGE_MS - 1 },
      },
      now,
    );
    expect(Object.keys(out).sort()).toEqual(["edge", "fresh"]);
  });
});
