import { describe, expect, it } from "vitest";
import { feedCookieSource, feedWithoutLibrary, formatAge, formatViewCount, mergeFeedPages, type FeedVideo } from "./youtubeFeed";
import { videoPreviewStartSec } from "./youtubeFeed";
import { gridColumnsFor } from "./useGridColumns";

const video = (videoId: string): FeedVideo => ({
  videoId,
  title: videoId,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  channel: null,
  thumbnail: null,
  duration: null,
  viewCount: null,
  timestamp: null,
});

describe("feedCookieSource", () => {
  it("prefers a cookie file, then a picked browser, then the signed-in Explorer", () => {
    expect(feedCookieSource({ cookieFile: " c.txt ", browserContext: "firefox" }, "signed-out")).toEqual({
      browserCookies: null,
      cookieFile: "c.txt",
    });
    expect(feedCookieSource({ cookieFile: "", browserContext: "firefox" }, "signed-out")).toEqual({
      browserCookies: "firefox",
      cookieFile: null,
    });
    expect(feedCookieSource({ cookieFile: "", browserContext: "chrome" }, "signed-in")).toEqual({
      browserCookies: "ruforge",
      cookieFile: null,
    });
  });

  it("has nothing to offer signed out", () => {
    expect(feedCookieSource({ cookieFile: "", browserContext: "chrome" }, "signed-out")).toBeNull();
    expect(feedCookieSource({ cookieFile: "", browserContext: "" }, "pending")).toBeNull();
  });
});

describe("feed lists", () => {
  it("drops videos the library already has", () => {
    expect(feedWithoutLibrary([video("a"), video("b")], new Set(["a"])).map((v) => v.videoId)).toEqual(["b"]);
  });

  it("appends a later page without repeats", () => {
    const merged = mergeFeedPages([video("a"), video("b")], [video("b"), video("c"), video("c")]);
    expect(merged.map((v) => v.videoId)).toEqual(["a", "b", "c"]);
  });
});

describe("formatting", () => {
  it("shortens view counts the way YouTube does", () => {
    expect(formatViewCount(1)).toBe("1 view");
    expect(formatViewCount(999)).toBe("999 views");
    expect(formatViewCount(1000)).toBe("1K views");
    expect(formatViewCount(1234)).toBe("1.2K views");
    expect(formatViewCount(45_600)).toBe("45K views");
    expect(formatViewCount(3_400_000)).toBe("3.4M views");
    expect(formatViewCount(null)).toBeNull();
  });

  it("words ages in whole units", () => {
    const now = 1_800_000_000_000;
    const ago = (s: number) => formatAge(now / 1000 - s, now);
    expect(ago(20)).toBe("just now");
    expect(ago(60)).toBe("1 minute ago");
    expect(ago(3 * 3600)).toBe("3 hours ago");
    expect(ago(86400)).toBe("1 day ago");
    expect(ago(15 * 86400)).toBe("2 weeks ago");
    expect(ago(400 * 86400)).toBe("1 year ago");
  });
});

describe("videoPreviewStartSec", () => {
  it("starts short videos at the top", () => {
    expect(videoPreviewStartSec(45, 30)).toBe(0);
    expect(videoPreviewStartSec(null, null)).toBe(0);
  });

  it("uses the most replayed moment but keeps a full window", () => {
    expect(videoPreviewStartSec(600, 200)).toBe(200);
    expect(videoPreviewStartSec(600, 590)).toBe(570);
  });

  it("guesses past the intro when there is no hook", () => {
    expect(videoPreviewStartSec(100, null)).toBe(20);
    expect(videoPreviewStartSec(3600, null)).toBe(120);
    expect(videoPreviewStartSec(70, null)).toBe(15);
  });
});

describe("gridColumnsFor", () => {
  it("fits as many cards as the minimum width allows", () => {
    expect(gridColumnsFor(1247, "Default")).toBe(3);
    expect(gridColumnsFor(1248, "Default")).toBe(4);
    expect(gridColumnsFor(200, "Cozy")).toBe(1);
    expect(gridColumnsFor(1300, "Compact")).toBe(5);
  });
});
