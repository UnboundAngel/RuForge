import { beforeEach, describe, expect, it, vi } from "vitest";

const recorded: unknown[] = [];
vi.mock("@/notifications/recordNotification", () => ({
  recordNotification: (item: unknown) => recorded.push(item),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(), emitTo: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const { navigationTripText, recordSecurityTrip } = await import("./securityTripwires");

describe("security tripwires", () => {
  beforeEach(() => {
    recorded.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("records one bell row per key per session", () => {
    expect(recordSecurityTrip("nav:evil.test", "t", "evil.test", 1)).toBe(true);
    expect(recordSecurityTrip("nav:evil.test", "t", "evil.test", 2)).toBe(false);
    expect(recordSecurityTrip("nav:other.test", "t", "other.test", 3)).toBe(true);
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({
      id: "security:nav:evil.test",
      source: "security",
      kind: "security-blocked",
      actions: [],
      read: false,
    });
  });

  it("names the surface and shows the host only", () => {
    const music = navigationTripText({ kind: "navigation", surface: "Music", target: "LOCALHOST" });
    expect(music.title).toBe("A page in Music tried to open a blocked address");
    expect(music.subtitle).toBe("LOCALHOST");
    expect(music.key).toBe("nav:localhost");
    const other = navigationTripText({ kind: "navigation", surface: "<b>spoof</b>", target: "x".repeat(500) });
    expect(other.title).toBe("A page in Explorer tried to open a blocked address");
    expect(other.subtitle).toHaveLength(120);
  });
});
