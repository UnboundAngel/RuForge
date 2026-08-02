import { describe, expect, it } from "vitest";
import {
  musicQueueSource,
  nextQueueRowIsEndless,
  queueNextSectionLabel,
  resolveQueueSourceLabel,
} from "./musicQueueSource";
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
  it("uses the play-time source label", () => {
    expect(
      resolveQueueSourceLabel(musicQueueSource("liked", "Liked Songs"), false),
    ).toBe("Liked Songs");
    expect(
      resolveQueueSourceLabel(musicQueueSource("album", "Legends Never Die"), false),
    ).toBe("Legends Never Die");
  });

  it("returns null when source is missing", () => {
    expect(resolveQueueSourceLabel(null, false)).toBeNull();
  });

  it("returns Library only when the next row is endless", () => {
    const source = musicQueueSource("album", "Legends Never Die");
    expect(resolveQueueSourceLabel(source, false)).toBe("Legends Never Die");
    expect(resolveQueueSourceLabel(source, true)).toBe("Library");
  });

  it("does not guess from track metadata", () => {
    expect(resolveQueueSourceLabel(null, false)).toBeNull();
    expect(resolveQueueSourceLabel(musicQueueSource("track", "War"), false)).toBe("War");
  });
});

describe("nextQueueRowIsEndless", () => {
  const album = [
    file({ path: "/a/1.mp3", album: "Paranoid (Just Raw)" }),
    file({ path: "/a/2.mp3", album: "Paranoid (Just Raw)" }),
  ];
  const endless = [
    file({ path: "/lib/x.mp3", album: "Other" }),
    file({ path: "/lib/y.mp3", album: "Other" }),
    file({ path: "/lib/z.mp3", album: "Other" }),
  ];
  const folder = [...album, ...endless];

  it("is false while real playlist tracks remain ahead", () => {
    expect(
      nextQueueRowIsEndless({
        manualQueueLength: 0,
        playlistIndex: 0,
        effectivePlaylist: folder,
        folderAudioPlaylist: folder,
        endlessFromIndex: 2,
      }),
    ).toBe(false);
  });

  it("is true once the next index is in the endless tail", () => {
    expect(
      nextQueueRowIsEndless({
        manualQueueLength: 0,
        playlistIndex: 1,
        effectivePlaylist: folder,
        folderAudioPlaylist: folder,
        endlessFromIndex: 2,
      }),
    ).toBe(true);
  });

  it("is true for single-track play with endless lookahead from index 1", () => {
    const single = [album[0]!, ...endless];
    expect(
      nextQueueRowIsEndless({
        manualQueueLength: 0,
        playlistIndex: 0,
        effectivePlaylist: single,
        folderAudioPlaylist: single,
        endlessFromIndex: 1,
      }),
    ).toBe(true);
    expect(
      resolveQueueSourceLabel(musicQueueSource("track", "Track"), true),
    ).toBe("Library");
  });

  it("is false when endlessFromIndex was wiped (neighbor scan regression)", () => {
    const single = [album[0]!, ...endless];
    expect(
      nextQueueRowIsEndless({
        manualQueueLength: 0,
        playlistIndex: 0,
        effectivePlaylist: single,
        folderAudioPlaylist: single,
        endlessFromIndex: null,
      }),
    ).toBe(false);
  });

  it("is false when manual queue owns the next row", () => {
    expect(
      nextQueueRowIsEndless({
        manualQueueLength: 2,
        playlistIndex: 1,
        effectivePlaylist: folder,
        folderAudioPlaylist: folder,
        endlessFromIndex: 2,
      }),
    ).toBe(false);
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
