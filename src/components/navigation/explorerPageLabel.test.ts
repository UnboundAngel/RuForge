import { describe, expect, it } from "vitest";
import { explorerPageLabel, resolveExplorerPasteUrl } from "./explorerPageLabel";

const ID = "dQw4w9WgXcQ";

describe("explorerPageLabel", () => {
  it("names the common YouTube pages", () => {
    expect(explorerPageLabel("https://www.youtube.com/")).toBe("Home");
    expect(explorerPageLabel(`https://www.youtube.com/watch?v=${ID}`)).toBe("Video");
    expect(explorerPageLabel("https://www.youtube.com/results?search_query=lofi+beats")).toBe("Search · lofi beats");
    expect(explorerPageLabel("https://www.youtube.com/@CaseOh")).toBe("Channel");
    expect(explorerPageLabel("https://www.youtube.com/feed/subscriptions")).toBe("Subscriptions");
    expect(explorerPageLabel("not a url")).toBe("YouTube");
  });
});

describe("resolveExplorerPasteUrl", () => {
  it("turns short and watch links into a youtube.com page", () => {
    expect(resolveExplorerPasteUrl(`https://youtu.be/${ID}`)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(resolveExplorerPasteUrl("https://www.youtube.com/playlist?list=PL1234567890abcdef")).toBe(
      "https://www.youtube.com/playlist?list=PL1234567890abcdef",
    );
    expect(resolveExplorerPasteUrl("hello")).toBeNull();
  });
});
