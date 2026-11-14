import { describe, expect, it } from "vitest";
import { applyCustomOrder, fileNameOf } from "./diskPlaylistMeta";

const f = (name: string) => ({ path: `D:\\Playlists\\mc farms\\${name}` });

describe("applyCustomOrder", () => {
  it("puts listed files first, in the saved order", () => {
    const out = applyCustomOrder([f("a.mp4"), f("b.mp4"), f("c.mp4")], ["c.mp4", "a.mp4", "b.mp4"]);
    expect(out.map((x) => fileNameOf(x.path))).toEqual(["c.mp4", "a.mp4", "b.mp4"]);
  });

  it("appends files the order does not know, keeping their scan order", () => {
    const out = applyCustomOrder(
      [f("a.mp4"), f("new1.mp4"), f("b.mp4"), f("new2.mp4")],
      ["b.mp4", "a.mp4"],
    );
    expect(out.map((x) => fileNameOf(x.path))).toEqual(["b.mp4", "a.mp4", "new1.mp4", "new2.mp4"]);
  });

  it("ignores names whose file is gone", () => {
    const out = applyCustomOrder([f("a.mp4"), f("b.mp4")], ["zzz.mp4", "b.mp4", "a.mp4"]);
    expect(out.map((x) => fileNameOf(x.path))).toEqual(["b.mp4", "a.mp4"]);
  });

  it("returns the input untouched with no saved order", () => {
    const items = [f("a.mp4"), f("b.mp4")];
    expect(applyCustomOrder(items, [])).toBe(items);
  });

  it("matches file names without regard to case", () => {
    const out = applyCustomOrder([f("A.mp4"), f("B.mp4")], ["b.mp4", "a.mp4"]);
    expect(out.map((x) => fileNameOf(x.path))).toEqual(["B.mp4", "A.mp4"]);
  });
});
