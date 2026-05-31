import { describe, expect, it } from "vitest";
import { queueNextSectionLabel, resolveQueueSourceLabel } from "./musicQueueSource";
import type { MediaFile } from "@/types";

function file(overrides: Partial<MediaFile> & Pick<MediaFile, "path">): MediaFile {
  return {
    name: "Track",
    size: 1,
    created: "",
    modified: "",
    ...overrides,
  } as MediaFile;
}

describe("resolveQueueSourceLabel", () => {
  it("uses album tag for folder playlist context", () => {
    const playing = file({
      path: "/lib/Music/Departure/track.mp3",
      album: "Legends Never Die",
      artist: "Juice WRLD",
    });
    const folder = [playing];
    expect(resolveQueueSourceLabel(playing, folder)).toBe("Legends Never Die");
  });

  it("returns null for library fallback", () => {
    const playing = file({ path: "/lib/Music/a.mp3" });
    expect(resolveQueueSourceLabel(playing, [])).toBeNull();
  });
});

describe("queueNextSectionLabel", () => {
  it("formats Next from when source present", () => {
    expect(queueNextSectionLabel("Departure")).toBe("Next from: Departure");
  });

  it("uses Next up when no source", () => {
    expect(queueNextSectionLabel(null)).toBe("Next up");
  });
});
