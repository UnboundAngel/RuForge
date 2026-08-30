import { describe, expect, it } from "vitest";
import { activeLineIndex, parseSyncedLyrics, payloadFromSidecar } from "@/lib/lyrics";

describe("parseSyncedLyrics", () => {
  it("parses LRC with centiseconds and milliseconds", () => {
    const lines = parseSyncedLyrics(
      "[00:12.00]First\n[00:17.234]Second\n[1:02.5]Third\n",
    );
    expect(lines).toEqual([
      { time: 12, text: "First" },
      { time: 17.234, text: "Second" },
      { time: 62.5, text: "Third" },
    ]);
  });

  it("skips blank and non-timed rows", () => {
    const lines = parseSyncedLyrics("[ti:Song]\n\n[00:01.00]Hi\n");
    expect(lines).toEqual([{ time: 1, text: "Hi" }]);
  });
});

describe("activeLineIndex", () => {
  const lines = [
    { time: 0, text: "a" },
    { time: 10, text: "b" },
    { time: 20, text: "c" },
  ];

  it("returns -1 before the first stamp", () => {
    expect(activeLineIndex(lines, -0.1)).toBe(-1);
  });

  it("holds the current line until the next stamp", () => {
    expect(activeLineIndex(lines, 0)).toBe(0);
    expect(activeLineIndex(lines, 9.9)).toBe(0);
    expect(activeLineIndex(lines, 10)).toBe(1);
    expect(activeLineIndex(lines, 25)).toBe(2);
  });
});

describe("payloadFromSidecar", () => {
  it("prefers synced over plain", () => {
    const payload = payloadFromSidecar({
      schemaVersion: 1,
      syncedLyrics: "[00:01.00]Hi",
      plainLyrics: "Hi\nThere",
      fetchedAt: "2026-01-01T00:00:00Z",
      source: "lrclib",
    });
    expect(payload.kind).toBe("synced");
  });

  it("falls back to plain when synced is empty", () => {
    const payload = payloadFromSidecar({
      schemaVersion: 1,
      syncedLyrics: "",
      plainLyrics: "just words",
      fetchedAt: "2026-01-01T00:00:00Z",
      source: "lrclib",
    });
    expect(payload).toEqual({ kind: "plain", text: "just words" });
  });

  it("treats miss sidecar as empty", () => {
    const payload = payloadFromSidecar({
      schemaVersion: 1,
      fetchedAt: "2026-01-01T00:00:00Z",
      source: "lrclib",
    });
    expect(payload.kind).toBe("empty");
  });
});
