import { describe, expect, it } from "vitest";
import { pickResume } from "./sideData";
import { ago } from "./storage";

const payload = { positionSecs: 90, durationSecs: 300, playbackState: "paused" as const };

describe("pickResume", () => {
  it("prefers a local write the PC has not seen", () => {
    const local = { id: "a", payload, at: 1, pending: true };
    expect(pickResume(local, { positionSecs: 10 })).toEqual(payload);
  });

  it("uses the PC position once local is synced", () => {
    const local = { id: "a", payload, at: 1, pending: false };
    expect(pickResume(local, { positionSecs: 10 })).toEqual({ positionSecs: 10 });
  });

  it("falls back to local when the PC is unreachable", () => {
    const local = { id: "a", payload, at: 1, pending: false };
    expect(pickResume(local, null)).toEqual(payload);
    expect(pickResume(null, null)).toBeNull();
  });
});

describe("ago", () => {
  it("words the age", () => {
    const now = 10_000_000_000;
    expect(ago(now - 30_000, now)).toBe("just now");
    expect(ago(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(ago(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(ago(now - 72 * 3_600_000, now)).toBe("3 days ago");
  });
});
