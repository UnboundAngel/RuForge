import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaFile } from "./types";
import { writePlaybackPos } from "./playbackStorage";
import { pickVideoEndScreenSuggestions } from "./videoEndScreenSuggestions";

let store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    store = {};
  },
});

function mediaFile(
  partial: Partial<MediaFile> & Pick<MediaFile, "path" | "name">,
): MediaFile {
  return {
    size: 1,
    created: 1000,
    duration: 100,
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: null,
    sourceId: null,
    ...partial,
  };
}

beforeEach(() => {
  store = {};
});

describe("pickVideoEndScreenSuggestions", () => {
  it("excludes the current path", () => {
    const current = mediaFile({ path: "/v/current.mp4", name: "Current" });
    const other = mediaFile({ path: "/v/other.mp4", name: "Other" });
    const picked = pickVideoEndScreenSuggestions(current.path, [current, other], 2, () => 0);
    expect(picked.map((f) => f.path)).toEqual(["/v/other.mp4"]);
  });

  it("prefers unwatched over watched", () => {
    const current = mediaFile({ path: "/v/current.mp4", name: "Current" });
    const watchedA = mediaFile({ path: "/v/watched-a.mp4", name: "Watched A" });
    const watchedB = mediaFile({ path: "/v/watched-b.mp4", name: "Watched B" });
    const fresh = mediaFile({ path: "/v/fresh.mp4", name: "Fresh" });
    writePlaybackPos(watchedA.path, 95, 100);
    writePlaybackPos(watchedB.path, 95, 100);

    const picked = pickVideoEndScreenSuggestions(
      current.path,
      [current, watchedA, watchedB, fresh],
      2,
      () => 0,
    );
    expect(picked[0]?.path).toBe("/v/fresh.mp4");
    expect(picked).toHaveLength(2);
    expect(picked.some((f) => f.path === "/v/fresh.mp4")).toBe(true);
  });

  it("fills from watched when unwatched is short", () => {
    const current = mediaFile({ path: "/v/current.mp4", name: "Current" });
    const fresh = mediaFile({ path: "/v/fresh.mp4", name: "Fresh" });
    const watched = mediaFile({ path: "/v/watched.mp4", name: "Watched" });
    writePlaybackPos(watched.path, 95, 100);

    const picked = pickVideoEndScreenSuggestions(
      current.path,
      [current, fresh, watched],
      2,
      () => 0,
    );
    expect(picked.map((f) => f.path)).toEqual(["/v/fresh.mp4", "/v/watched.mp4"]);
  });

  it("returns at most the limit", () => {
    const current = mediaFile({ path: "/v/current.mp4", name: "Current" });
    const library = [
      current,
      mediaFile({ path: "/v/a.mp4", name: "A" }),
      mediaFile({ path: "/v/b.mp4", name: "B" }),
      mediaFile({ path: "/v/c.mp4", name: "C" }),
    ];
    expect(pickVideoEndScreenSuggestions(current.path, library, 2, () => 0)).toHaveLength(2);
  });

  it("returns empty when library has only the current file", () => {
    const current = mediaFile({ path: "/v/current.mp4", name: "Current" });
    expect(pickVideoEndScreenSuggestions(current.path, [current])).toEqual([]);
  });
});
