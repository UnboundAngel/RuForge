import { describe, expect, it } from "vitest";
import { normalizeChapters } from "../chapters";
import {
  chaptersFromDescription,
  cleanChapterTitle,
  splitChapterLine,
  formatTimestamp,
  parseTimestamp,
  segmentDescription,
  linkDisplayText,
  isDividerLine,
  formatDescriptionMeta,
} from "./videoDescription";

describe("parseTimestamp", () => {
  it("reads m:ss, mm:ss and h:mm:ss", () => {
    expect(parseTimestamp("0:00")).toBe(0);
    expect(parseTimestamp("4:05")).toBe(245);
    expect(parseTimestamp("12:34")).toBe(754);
    expect(parseTimestamp("1:02:03")).toBe(3723);
  });

  it("rejects malformed values and values past the duration", () => {
    expect(parseTimestamp("1:60")).toBeNull();
    expect(parseTimestamp("1:2:03")).toBeNull();
    expect(parseTimestamp("1:75:00")).toBeNull();
    expect(parseTimestamp("10:00", 300)).toBeNull();
    expect(parseTimestamp("4:59", 300)).toBe(299);
  });

  it("formats back", () => {
    expect(formatTimestamp(245)).toBe("4:05");
    expect(formatTimestamp(3723)).toBe("1:02:03");
  });
});

describe("segmentDescription", () => {
  it("splits text, links and timestamps", () => {
    const segs = segmentDescription("Intro at 1:30, see https://example.com/a for more");
    expect(segs).toEqual([
      { kind: "text", text: "Intro at " },
      { kind: "timestamp", text: "1:30", seconds: 90 },
      { kind: "text", text: ", see " },
      { kind: "url", text: "https://example.com/a", url: "https://example.com/a" },
      { kind: "text", text: " for more" },
    ]);
  });

  it("drops trailing punctuation from links but keeps balanced parens", () => {
    const segs = segmentDescription(
      "Read https://example.com/x. Also (https://example.com/y) and https://en.wikipedia.org/wiki/Foo_(bar)!",
    );
    const urls = segs.filter((s) => s.kind === "url").map((s) => s.text);
    expect(urls).toEqual([
      "https://example.com/x",
      "https://example.com/y",
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ]);
    expect(segs.map((s) => s.text).join("")).toBe(
      "Read https://example.com/x. Also (https://example.com/y) and https://en.wikipedia.org/wiki/Foo_(bar)!",
    );
  });

  it("only links http(s)", () => {
    expect(segmentDescription("ftp://x.org and www.x.org").every((s) => s.kind === "text")).toBe(true);
  });

  it("leaves timestamps inside links, ratios and past-duration values as text", () => {
    const segs = segmentDescription("https://x.com/t?at=1:30 ratio 16:9 then 9:59", 300);
    expect(segs.filter((s) => s.kind === "timestamp")).toEqual([]);
    expect(segs[0]).toEqual({ kind: "url", text: "https://x.com/t?at=1:30", url: "https://x.com/t?at=1:30" });
  });
});

describe("chaptersFromDescription", () => {
  const basic = ["Thanks for watching!", "", "0:00 Intro", "1:15 - Setup", "4:30: Boss fight", "", "Follow me https://x.com"].join("\n");

  it("builds chapters normalizeChapters accepts", () => {
    const chapters = chaptersFromDescription(basic, 600);
    expect(chapters).toEqual([
      { start_time: 0, end_time: 75, title: "Intro" },
      { start_time: 75, end_time: 270, title: "Setup" },
      { start_time: 270, end_time: 600, title: "Boss fight" },
    ]);
    expect(normalizeChapters(chapters, 600)).toHaveLength(3);
  });

  it("requires the first chapter at 0:00", () => {
    expect(chaptersFromDescription("0:15 Intro\n1:15 Setup\n4:30 Boss", 600)).toBeNull();
  });

  it("rejects descending timestamps", () => {
    expect(chaptersFromDescription("0:00 Intro\n4:30 Boss\n1:15 Setup", 600)).toBeNull();
  });

  it("rejects gaps under 10 seconds and runs under three", () => {
    expect(chaptersFromDescription("0:00 Intro\n0:05 Oops\n1:15 Setup", 600)).toBeNull();
    expect(chaptersFromDescription("0:00 Intro\n1:15 Setup", 600)).toBeNull();
  });

  it("ignores one-off timestamps in prose", () => {
    const text = "At 3:45 he finally lands it, and again around 7:10.\nGreat run.";
    expect(chaptersFromDescription(text, 600)).toBeNull();
    const mixed = `Best part is at 3:45 honestly.\n\n${basic}`;
    expect(chaptersFromDescription(mixed, 600)?.map((c) => c.title)).toEqual(["Intro", "Setup", "Boss fight"]);
  });

  it("handles long videos with h:mm:ss and bracketed or trailing stamps", () => {
    const text = ["[0:00] Start", "(25:00) Midgame", "Late game - 1:05:30", "Credits 2:01:00"].join("\n");
    const chapters = chaptersFromDescription(text, 7500);
    expect(chapters?.map((c) => [c.start_time, c.title])).toEqual([
      [0, "Start"],
      [1500, "Midgame"],
      [3930, "Late game"],
      [7260, "Credits"],
    ]);
  });

  it("drops chapters that land past the duration", () => {
    expect(chaptersFromDescription("0:00 A\n1:00 B\n2:00 C\n9:00 D", 300)?.map((c) => c.title)).toEqual(["A", "B", "C"]);
  });
});

describe("cleanChapterTitle", () => {
  it("strips leading separators", () => {
    expect(cleanChapterTitle(" - False Knight")).toBe("False Knight");
    expect(cleanChapterTitle(": Mantis Lords")).toBe("Mantis Lords");
    expect(cleanChapterTitle(" | Soul Master")).toBe("Soul Master");
    expect(cleanChapterTitle(" – Hornet")).toBe("Hornet");
    expect(cleanChapterTitle(" — Hornet")).toBe("Hornet");
    expect(cleanChapterTitle(") Intro")).toBe("Intro");
  });

  it("leaves clean titles and inner hyphens alone", () => {
    expect(cleanChapterTitle("Intro and route")).toBe("Intro and route");
    expect(cleanChapterTitle("- Mantis-Lords")).toBe("Mantis-Lords");
    expect(cleanChapterTitle("Hornet (Greenpath)")).toBe("Hornet (Greenpath)");
  });
});

describe("splitChapterLine", () => {
  it("splits time and cleaned title", () => {
    expect(splitChapterLine("1:45 - False Knight")).toEqual({ time: "1:45", seconds: 105, title: "False Knight" });
    expect(splitChapterLine("Not a chapter 1:45")).toBeNull();
  });
});

describe("linkDisplayText", () => {
  it("drops scheme, www and a lone trailing slash", () => {
    expect(linkDisplayText("https://gamersupps.gg/")).toBe("gamersupps.gg");
    expect(linkDisplayText("http://example.com")).toBe("example.com");
    expect(linkDisplayText("https://www.youtube.com/@MoreCaseOh")).toBe("youtube.com/@MoreCaseOh");
    expect(linkDisplayText("https://starforgepc.com/CaseOh")).toBe("starforgepc.com/CaseOh");
  });
  it("keeps path, query and parens", () => {
    expect(linkDisplayText("https://a.com/watch?v=1&t=2")).toBe("a.com/watch?v=1&t=2");
    expect(linkDisplayText("https://en.wikipedia.org/wiki/Foo_(bar)")).toBe("en.wikipedia.org/wiki/Foo_(bar)");
  });
});

describe("isDividerLine", () => {
  it("matches box-drawing and dash rules", () => {
    for (const l of ["─".repeat(20), "━".repeat(6), "-----", "_____", "=====", "  -----  "]) {
      expect(isDividerLine(l)).toBe(true);
    }
  });
  it("rejects short or mixed-in-text lines", () => {
    expect(isDividerLine("----")).toBe(false);
    expect(isDividerLine("--- Game ---")).toBe(false);
    expect(isDividerLine("")).toBe(false);
  });
});

describe("formatDescriptionMeta", () => {
  it("joins views and date with two spaces", () => {
    expect(formatDescriptionMeta(1529501, "20261009", "en-US")).toBe("1,529,501 views  Oct 9, 2026");
  });
  it("handles partial and missing data", () => {
    expect(formatDescriptionMeta(1, null, "en-US")).toBe("1 view");
    expect(formatDescriptionMeta(null, "20261009", "en-US")).toBe("Oct 9, 2026");
    expect(formatDescriptionMeta(null, null)).toBeNull();
    expect(formatDescriptionMeta(undefined, "garbage")).toBeNull();
  });
});
