import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaFile } from "./types";
import {
  buildCleanupCandidates,
  cleanupWatchProgressPct,
  groupCleanupCandidates,
} from "./cleanupCandidates";
import { writePlaybackPos } from "./playbackStorage";
import {
  resetListenSnapshotForTests,
  setListenSnapshotForTests,
} from "./lib/musicListenSnapshot";
import { RUFORGE_INTERNAL_DIR } from "./store/types";

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
    duration: 200,
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
  resetListenSnapshotForTests();
  store = {};
});

describe("cleanupWatchProgressPct", () => {
  it("uses listen snapshot for audio, not playbackStorage", () => {
    const file = mediaFile({
      path: `${RUFORGE_INTERNAL_DIR}/Music/revival.mp3`,
      name: "The Revival",
      artist: "Artist",
      sourceId: "revival-id",
      duration: 200,
    });
    setListenSnapshotForTests({
      v: 2,
      stats: [
        {
          identityKey: "id:revival-id",
          path: file.path,
          title: file.name,
          artist: "Artist",
          playCount: 3,
          listenTimeSec: 100,
          lastPlayed: Date.now(),
        },
      ],
      history: [],
    });
    expect(cleanupWatchProgressPct(file)).toBe(50);
  });

  it("returns 0 for audio with missing snapshot row or zero duration", () => {
    const noRow = mediaFile({
      path: `${RUFORGE_INTERNAL_DIR}/Music/never.mp3`,
      name: "Never",
      sourceId: "missing",
      duration: 200,
    });
    expect(cleanupWatchProgressPct(noRow)).toBe(0);

    const noDuration = mediaFile({
      path: `${RUFORGE_INTERNAL_DIR}/Music/unknown.mp3`,
      name: "Unknown",
      sourceId: "u1",
      duration: 0,
    });
    setListenSnapshotForTests({
      v: 2,
      stats: [
        {
          identityKey: "id:u1",
          path: noDuration.path,
          title: noDuration.name,
          artist: "",
          playCount: 1,
          listenTimeSec: 60,
          lastPlayed: Date.now(),
        },
      ],
      history: [],
    });
    expect(cleanupWatchProgressPct(noDuration)).toBe(0);
  });

  it("keeps video progress from playbackStorage", () => {
    const file = mediaFile({
      path: `${RUFORGE_INTERNAL_DIR}/Videos/clip.mp4`,
      name: "Clip",
      duration: 100,
    });
    writePlaybackPos(file.path, 45, 100);
    expect(cleanupWatchProgressPct(file)).toBe(45);
  });
});

describe("buildCleanupCandidates filters", () => {
  it("sorts least_watched using audio listen %", () => {
    const low = mediaFile({
      path: `${RUFORGE_INTERNAL_DIR}/Music/low.mp3`,
      name: "Low",
      sourceId: "low",
      duration: 100,
      created: 1,
    });
    const high = mediaFile({
      path: `${RUFORGE_INTERNAL_DIR}/Music/high.mp3`,
      name: "High",
      sourceId: "high",
      duration: 100,
      created: 2,
    });
    setListenSnapshotForTests({
      v: 2,
      stats: [
        {
          identityKey: "id:low",
          path: low.path,
          title: "Low",
          artist: "",
          playCount: 1,
          listenTimeSec: 10,
          lastPlayed: Date.now(),
        },
        {
          identityKey: "id:high",
          path: high.path,
          title: "High",
          artist: "",
          playCount: 1,
          listenTimeSec: 80,
          lastPlayed: Date.now(),
        },
      ],
      history: [],
    });
    const result = buildCleanupCandidates(
      [
        { kind: "media", ...high },
        { kind: "media", ...low },
      ],
      "least_watched",
    );
    expect(result.map((c) => c.file.sourceId)).toEqual(["low", "high"]);
    expect(result[0]!.watchProgressPct).toBe(10);
    expect(result[1]!.watchProgressPct).toBe(80);
  });

  it("lists a file once when it also sits inside a playlist", () => {
    const clip = mediaFile({ path: `${RUFORGE_INTERNAL_DIR}/Videos/clip.mp4`, name: "Clip", created: 1 });
    const result = buildCleanupCandidates(
      [
        { kind: "media", ...clip },
        {
          kind: "playlist",
          title: "Mix",
          path: `${RUFORGE_INTERNAL_DIR}/Playlists/Mix`,
          itemCount: 1,
          combinedDuration: 0,
          stackThumbnailPath: null,
          items: [{ ...clip, path: clip.path.toUpperCase() }],
        },
      ],
      "least_watched",
    );
    expect(result).toHaveLength(1);
  });
});

describe("groupCleanupCandidates", () => {
  const candidate = (file: MediaFile) => ({ file, watchProgressPct: 0, sizeBytes: 1, created: 1 });

  it("orders music, videos, livestreams, keeps order inside, drops empty groups", () => {
    const vodA = candidate(mediaFile({ path: "a.mp4", name: "a.mp4", youtube: { channelVerified: false, wasLive: true } }));
    const song = candidate(mediaFile({ path: "s.m4a", name: "s.m4a" }));
    const clipB = candidate(mediaFile({ path: "b.mp4", name: "b.mp4" }));
    const clipC = candidate(mediaFile({ path: "c.webm", name: "c.webm" }));

    const groups = groupCleanupCandidates([vodA, clipB, song, clipC]);
    expect(groups.map((g) => g.category)).toEqual(["music", "videos", "livestreams"]);
    expect(groups[1].items).toEqual([clipB, clipC]);
    expect(groupCleanupCandidates([clipB]).map((g) => g.category)).toEqual(["videos"]);
  });
});
