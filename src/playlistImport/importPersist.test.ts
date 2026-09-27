import { describe, expect, it } from "vitest";
import { hasPendingSearches, restoreImportSession, serializeImportSession, type SavedImportSession } from "./importPersist";
import type { ImportRow } from "./importSession";

const row = (title: string, state: ImportRow["state"]): ImportRow => ({
  source: { title, artists: ["Artist"], album: null, durationSec: 200, unclear: false },
  state,
  library: null,
  candidates: [],
  choice: -1,
  bucket: "missing",
  include: false,
});

const session = (over: Partial<SavedImportSession> = {}): SavedImportSession => ({
  phase: "review",
  name: "Late Night Drive",
  rows: [row("A", "done"), row("B", "searching"), row("C", "waiting")],
  notes: ["1 overlapping row merged"],
  stopped: null,
  draft: "{...}",
  ...over,
});

describe("import session persistence", () => {
  it("round-trips a review and puts the mid-search row back in line", () => {
    const back = restoreImportSession(serializeImportSession(session()));
    expect(back?.phase).toBe("review");
    expect(back?.name).toBe("Late Night Drive");
    expect(back?.rows.map((r) => r.state)).toEqual(["done", "waiting", "waiting"]);
    expect(back?.notes).toEqual(["1 overlapping row merged"]);
    expect(hasPendingSearches(back!.rows)).toBe(true);
  });

  it("keeps a paste-step draft on its own", () => {
    const back = restoreImportSession(serializeImportSession(session({ phase: "paste", rows: [], draft: "half a reply" })));
    expect(back).toMatchObject({ phase: "paste", rows: [], draft: "half a reply" });
  });

  it("writes nothing for an empty session so the key gets removed", () => {
    expect(serializeImportSession(session({ phase: "paste", rows: [], draft: "  " }))).toBeNull();
  });

  it("drops corrupt, foreign-version, or malformed saves", () => {
    expect(restoreImportSession("{not json")).toBeNull();
    expect(restoreImportSession(JSON.stringify({ v: 2, phase: "review", rows: [] }))).toBeNull();
    expect(restoreImportSession(JSON.stringify({ v: 1, phase: "review", rows: [{ source: {} }] }))).toBeNull();
    expect(restoreImportSession(null)).toBeNull();
  });

  it("falls back to the paste step when a review has no rows", () => {
    const raw = JSON.stringify({ v: 1, phase: "review", rows: [], draft: "x" });
    expect(restoreImportSession(raw)?.phase).toBe("paste");
  });
});
