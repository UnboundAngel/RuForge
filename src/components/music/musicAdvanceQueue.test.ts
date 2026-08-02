import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import {
  hasMusicNextTrack,
  hasMusicPrevTrack,
  resolveMusicNextTrack,
  resolveMusicPrevTrack,
} from "./musicAdvanceQueue";

function file(path: string): MediaFile {
  return {
    name: path,
    path,
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
  };
}

const playlist = [file("/a.mp3"), file("/b.mp3"), file("/c.mp3")];
const resolvePath = (p: string): MediaFile | null =>
  playlist.find((f) => f.path === p) ?? null;

describe("musicAdvanceQueue", () => {
  it("drains manual queue before effective playlist", () => {
    const r = resolveMusicNextTrack(
      {
        manualQueue: ["/b.mp3", "/c.mp3"],
        effectivePlaylist: playlist,
        playlistIndex: 0,
        playingFromManualQueue: false,
        manualQueueContextIndex: null,
      },
      resolvePath,
    );
    expect(r?.file.path).toBe("/b.mp3");
    expect(r?.manualQueueAfter).toEqual(["/c.mp3"]);
    expect(r?.playingFromManualQueue).toBe(true);
    expect(r?.manualQueueContextIndex).toBe(0);
  });

  it("advances effective playlist when manual queue is empty", () => {
    const r = resolveMusicNextTrack(
      {
        manualQueue: [],
        effectivePlaylist: playlist,
        playlistIndex: 0,
        playingFromManualQueue: false,
        manualQueueContextIndex: null,
      },
      resolvePath,
    );
    expect(r?.file.path).toBe("/b.mp3");
    expect(r?.playingFromManualQueue).toBe(false);
    expect(r?.manualQueueContextIndex).toBeNull();
  });

  it("skips unresolvable manual paths and uses next resolvable one", () => {
    const r = resolveMusicNextTrack(
      {
        manualQueue: ["/missing.mp3", "/c.mp3"],
        effectivePlaylist: playlist,
        playlistIndex: 0,
        playingFromManualQueue: false,
        manualQueueContextIndex: null,
      },
      resolvePath,
    );
    expect(r?.file.path).toBe("/c.mp3");
    expect(r?.manualQueueAfter).toEqual([]);
  });

  it("returns null when nothing follows", () => {
    const r = resolveMusicNextTrack(
      {
        manualQueue: [],
        effectivePlaylist: playlist,
        playlistIndex: 2,
        playingFromManualQueue: false,
        manualQueueContextIndex: null,
      },
      resolvePath,
    );
    expect(r).toBeNull();
  });

  it("prev from manual uses context index, not manual path index", () => {
    const prev = resolveMusicPrevTrack({
      manualQueue: [],
      effectivePlaylist: playlist,
      playlistIndex: -1,
      playingFromManualQueue: true,
      manualQueueContextIndex: 2,
    });
    expect(prev?.path).toBe("/b.mp3");
  });

  it("prev from manual with contextIndex 0 returns null", () => {
    const prev = resolveMusicPrevTrack({
      manualQueue: [],
      effectivePlaylist: playlist,
      playlistIndex: -1,
      playingFromManualQueue: true,
      manualQueueContextIndex: 0,
    });
    expect(prev).toBeNull();
  });

  it("prev from manual with null context returns null without crash", () => {
    const prev = resolveMusicPrevTrack({
      manualQueue: [],
      effectivePlaylist: playlist,
      playlistIndex: -1,
      playingFromManualQueue: true,
      manualQueueContextIndex: null,
    });
    expect(prev).toBeNull();
  });

  it("hasMusicNextTrack true when manual queue non-empty", () => {
    expect(
      hasMusicNextTrack({
        manualQueue: ["/x.mp3"],
        effectivePlaylist: playlist,
        playlistIndex: 2,
        playingFromManualQueue: false,
        manualQueueContextIndex: null,
      }),
    ).toBe(true);
  });

  it("hasMusicPrevTrack safe when contextIndex null", () => {
    expect(
      hasMusicPrevTrack(
        {
          manualQueue: [],
          effectivePlaylist: playlist,
          playlistIndex: -1,
          playingFromManualQueue: true,
          manualQueueContextIndex: null,
        },
        0,
      ),
    ).toBe(false);
  });

  it("wraps to first track when loopMode is all at playlist end", () => {
    const r = resolveMusicNextTrack(
      {
        manualQueue: [],
        effectivePlaylist: playlist,
        playlistIndex: 2,
        playingFromManualQueue: false,
        manualQueueContextIndex: null,
      },
      resolvePath,
      { loopMode: "all" },
    );
    expect(r?.file.path).toBe("/a.mp3");
  });

  it("wraps prev to last track when loopMode is all at playlist start", () => {
    const prev = resolveMusicPrevTrack(
      {
        manualQueue: [],
        effectivePlaylist: playlist,
        playlistIndex: 0,
        playingFromManualQueue: false,
        manualQueueContextIndex: null,
      },
      { loopMode: "all" },
    );
    expect(prev?.path).toBe("/c.mp3");
  });

  it("hasMusicNextTrack true at end when loopMode is all", () => {
    expect(
      hasMusicNextTrack(
        {
          manualQueue: [],
          effectivePlaylist: playlist,
          playlistIndex: 2,
          playingFromManualQueue: false,
          manualQueueContextIndex: null,
        },
        { loopMode: "all" },
      ),
    ).toBe(true);
  });
});
