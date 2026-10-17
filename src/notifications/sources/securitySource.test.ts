import { describe, expect, it } from "vitest";
import type { NotificationItem } from "../types";
import { groupSecurityTrips, SECURITY_GROUP_ID } from "./securitySource";

function trip(id: string, subtitle: string, createdAt: number, read = false): NotificationItem {
  return {
    id: `security:${id}`,
    source: "security",
    kind: "security-blocked",
    title: "x",
    subtitle,
    thumbnail: null,
    channelId: null,
    createdAt,
    read,
    actions: [],
    ref: {},
  };
}

describe("groupSecurityTrips", () => {
  it("returns nothing without trips", () => {
    expect(groupSecurityTrips([])).toBeNull();
  });

  it("folds trips into one row, newest target first, decoys named once", () => {
    const row = groupSecurityTrips([
      trip("a", "tauri.localhost", 1),
      trip("b", "Tripwire: debug-shell", 4),
      trip("c", "Tripwire: export-cookies", 3),
      trip("d", "example.com", 2),
      trip("e", "asset.localhost", 0, true),
    ])!;
    expect(row.id).toBe(SECURITY_GROUP_ID);
    expect(row.title).toBe("Blocked 5 requests from YouTube pages");
    expect(row.subtitle).toBe("RuForge internals, example.com, tauri.localhost, +1 more");
    expect(row.createdAt).toBe(4);
    expect(row.read).toBe(false);
  });

  it("uses singular copy and reads as read only when every trip is read", () => {
    const row = groupSecurityTrips([trip("a", "example.com", 1, true)])!;
    expect(row.title).toBe("Blocked a request from a YouTube page");
    expect(row.read).toBe(true);
  });
});
