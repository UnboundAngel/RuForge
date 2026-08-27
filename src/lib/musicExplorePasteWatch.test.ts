import { describe, expect, it } from "vitest";
import type { DownloadJob } from "@/downloadQueue";
import type { GalleryEntry, MediaFile } from "@/types";
import { decidePastedExploreWatch } from "./musicExplorePasteWatch";

const WATCH = "https://www.youtube.com/watch?v=Gao3xSDSibk";

function media(partial: Partial<MediaFile> & Pick<MediaFile, "path" | "name">): GalleryEntry {
  return {
    kind: "media",
    size: 0,
    created: 0,
    duration: 0,
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

function job(url: string, status: DownloadJob["status"]): DownloadJob {
  return { url, status } as DownloadJob;
}

describe("decidePastedExploreWatch", () => {
  it("enqueues when the track is not in the library or queue", () => {
    expect(
      decidePastedExploreWatch({ url: WATCH, entries: [], jobs: [] }),
    ).toBe("enqueue");
  });

  it("skips when the video id is already in the library", () => {
    expect(
      decidePastedExploreWatch({
        url: WATCH,
        entries: [media({ path: "/a.mp3", name: "A", sourceId: "Gao3xSDSibk" })],
        jobs: [],
      }),
    ).toBe("library");
  });

  it("skips when the same watch is already queued", () => {
    expect(
      decidePastedExploreWatch({
        url: WATCH,
        entries: [],
        jobs: [job(WATCH, "queued")],
      }),
    ).toBe("active");
  });
});
