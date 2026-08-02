import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaFile } from "@/types";
import { resetListenSnapshotForTests } from "@/lib/musicListenSnapshot";
import { clearListenStats } from "./musicListenStats";
import {
  ensureMusicEndlessLookahead,
  MUSIC_ENDLESS_LOOKAHEAD,
  remainingQueueCount,
  resolveMusicEndlessNext,
  selectMusicEndlessPool,
} from "./musicEndlessNext";
import { buildCombinedQueuePaths } from "./musicQueueReorder";
import { nextQueueRowIsEndless } from "./musicQueueSource";
import { resolveMusicPrevTrack } from "./musicAdvanceQueue";
import { pickSmartNextTrack } from "./musicSmartShuffle";
import { musicTrackIdentityKey } from "./musicShelfDedup";
import { primaryArtist } from "./musicArtist";

let store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { store = {}; },
});

function track(id: string, artist = "A"): MediaFile {
  return {
    path: `/${id}.mp3`,
    name: `Track ${id}`,
    artist,
    size: 0,
    created: 0,
    duration: 0,
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: null,
    sourceId: id,
  };
}

beforeEach(() => {
  resetListenSnapshotForTests();
  clearListenStats();
  store = {};
});

describe("selectMusicEndlessPool", () => {
  it("uses folder playlist when multi-track and not endless-extended", () => {
    const folder = [track("1"), track("2"), track("3")];
    const library = [track("1"), track("2"), track("3"), track("4")];
    const pool = selectMusicEndlessPool({
      libraryAudio: library,
      folderAudioPlaylist: folder,
      current: folder[2]!,
      endlessExtended: false,
    });
    expect(pool).toEqual(folder);
  });

  it("does not use folder playlist after endless extension", () => {
    const folder = [track("1"), track("2"), track("x")];
    const library = [track("1"), track("2"), track("3"), track("4"), track("x")];
    const pool = selectMusicEndlessPool({
      libraryAudio: library,
      folderAudioPlaylist: folder,
      current: folder[2]!,
      endlessExtended: true,
    });
    expect(pool).toEqual(library);
  });
});

describe("remainingQueueCount", () => {
  it("counts playlist ahead plus manual", () => {
    expect(remainingQueueCount(0, 4, 2)).toBe(5);
    expect(remainingQueueCount(3, 4, 0)).toBe(0);
    expect(remainingQueueCount(-1, 4, 1)).toBe(1);
  });
});

describe("ensureMusicEndlessLookahead", () => {
  it("stages up to MUSIC_ENDLESS_LOOKAHEAD from a single-track playlist", () => {
    const library = Array.from({ length: 20 }, (_, i) => track(String(i + 1)));
    const folder = [library[0]!];
    const result = ensureMusicEndlessLookahead({
      libraryAudio: library,
      folderAudioPlaylist: folder,
      current: folder[0]!,
      endlessExtended: false,
      endlessFromIndex: null,
      effectivePlaylist: folder,
      playlistIndex: 0,
      manualQueueLength: 0,
      likedKeys: [],
      sessionRecentKeys: [],
      seed: 11,
    });
    expect(result).not.toBeNull();
    expect(result!.folderAudioPlaylistAfter).toHaveLength(1 + MUSIC_ENDLESS_LOOKAHEAD);
    expect(result!.endlessFromIndex).toBe(1);
    expect(result!.folderAudioPlaylistAfter[0]!.path).toBe("/1.mp3");
  });

  it("tops up from 4 remaining to full depth in one fill (not +1)", () => {
    const library = Array.from({ length: 30 }, (_, i) => track(String(i + 1)));
    const folder = library.slice(0, 5);
    const result = ensureMusicEndlessLookahead({
      libraryAudio: library,
      folderAudioPlaylist: folder,
      current: folder[0]!,
      endlessExtended: true,
      endlessFromIndex: 1,
      effectivePlaylist: folder,
      playlistIndex: 0,
      manualQueueLength: 0,
      seed: 19,
    });
    expect(remainingQueueCount(0, folder.length, 0)).toBe(4);
    expect(result).not.toBeNull();
    expect(
      remainingQueueCount(0, result!.folderAudioPlaylistAfter.length, 0),
    ).toBe(MUSIC_ENDLESS_LOOKAHEAD);
  });

  it("is a no-op when remaining is already at lookahead", () => {
    const library = Array.from({ length: 20 }, (_, i) => track(String(i + 1)));
    const folder = library.slice(0, 1 + MUSIC_ENDLESS_LOOKAHEAD);
    const result = ensureMusicEndlessLookahead({
      libraryAudio: library,
      folderAudioPlaylist: folder,
      current: folder[0]!,
      endlessExtended: false,
      endlessFromIndex: null,
      effectivePlaylist: folder,
      playlistIndex: 0,
      manualQueueLength: 0,
      likedKeys: [],
      sessionRecentKeys: [],
      seed: 11,
    });
    expect(result).toBeNull();
  });

  it("keeps album tracks ahead and only appends past the end", () => {
    const library = Array.from({ length: 20 }, (_, i) => track(String(i + 1)));
    const album = library.slice(0, 4);
    const result = ensureMusicEndlessLookahead({
      libraryAudio: library,
      folderAudioPlaylist: album,
      current: album[2]!,
      endlessExtended: false,
      endlessFromIndex: null,
      effectivePlaylist: album,
      playlistIndex: 2,
      manualQueueLength: 0,
      likedKeys: [],
      sessionRecentKeys: [],
      seed: 3,
    });
    expect(result).not.toBeNull();
    expect(result!.endlessFromIndex).toBe(4);
    expect(result!.folderAudioPlaylistAfter.slice(0, 4).map((f) => f.path)).toEqual([
      "/1.mp3",
      "/2.mp3",
      "/3.mp3",
      "/4.mp3",
    ]);
    expect(result!.folderAudioPlaylistAfter).toHaveLength(4 + (MUSIC_ENDLESS_LOOKAHEAD - 1));
  });

  it("second call with filled playlist returns null", () => {
    const library = Array.from({ length: 20 }, (_, i) => track(String(i + 1)));
    const first = ensureMusicEndlessLookahead({
      libraryAudio: library,
      folderAudioPlaylist: [library[0]!],
      current: library[0]!,
      endlessExtended: false,
      endlessFromIndex: null,
      effectivePlaylist: [library[0]!],
      playlistIndex: 0,
      manualQueueLength: 0,
      seed: 9,
    });
    expect(first).not.toBeNull();
    const second = ensureMusicEndlessLookahead({
      libraryAudio: library,
      folderAudioPlaylist: first!.folderAudioPlaylistAfter,
      current: library[0]!,
      endlessExtended: true,
      endlessFromIndex: first!.endlessFromIndex,
      effectivePlaylist: first!.folderAudioPlaylistAfter,
      playlistIndex: 0,
      manualQueueLength: 0,
      seed: 9,
    });
    expect(second).toBeNull();
  });

  it("does not require session-recent to include staged paths", () => {
    const library = Array.from({ length: 20 }, (_, i) => track(String(i + 1)));
    const result = ensureMusicEndlessLookahead({
      libraryAudio: library,
      folderAudioPlaylist: [library[0]!],
      current: library[0]!,
      endlessExtended: false,
      endlessFromIndex: null,
      effectivePlaylist: [library[0]!],
      playlistIndex: 0,
      manualQueueLength: 0,
      sessionRecentKeys: [musicTrackIdentityKey(library[0]!, primaryArtist)],
      seed: 21,
    });
    expect(result).not.toBeNull();
    expect(result!.folderAudioPlaylistAfter.length).toBe(1 + MUSIC_ENDLESS_LOOKAHEAD);
  });

  it("does not refill when stepping prev through staged tracks", () => {
    const library = Array.from({ length: 20 }, (_, i) => track(String(i + 1)));
    const filled = ensureMusicEndlessLookahead({
      libraryAudio: library,
      folderAudioPlaylist: [library[0]!],
      current: library[0]!,
      endlessExtended: false,
      endlessFromIndex: null,
      effectivePlaylist: [library[0]!],
      playlistIndex: 0,
      manualQueueLength: 0,
      seed: 5,
    });
    expect(filled).not.toBeNull();
    const atSecond = filled!.folderAudioPlaylistAfter[1]!;
    const afterPrev = ensureMusicEndlessLookahead({
      libraryAudio: library,
      folderAudioPlaylist: filled!.folderAudioPlaylistAfter,
      current: atSecond,
      endlessExtended: true,
      endlessFromIndex: filled!.endlessFromIndex,
      effectivePlaylist: filled!.folderAudioPlaylistAfter,
      playlistIndex: 0,
      manualQueueLength: 0,
      seed: 5,
    });
    expect(afterPrev).toBeNull();
    expect(filled!.folderAudioPlaylistAfter).toHaveLength(1 + MUSIC_ENDLESS_LOOKAHEAD);
  });
});

describe("queue panel + prev through staged tracks", () => {
  it("exposes upcoming rows and keeps prev index stable without refill loop", () => {
    const library = Array.from({ length: 30 }, (_, i) => track(String(i + 1)));
    let playlist = [library[0]!];
    let endlessFromIndex: number | null = null;
    let endlessExtended = false;
    let playlistIndex = 0;

    const fill = () => {
      const result = ensureMusicEndlessLookahead({
        libraryAudio: library,
        folderAudioPlaylist: playlist,
        current: playlist[playlistIndex]!,
        endlessExtended,
        endlessFromIndex,
        effectivePlaylist: playlist,
        playlistIndex,
        manualQueueLength: 0,
        seed: 44 + playlistIndex,
      });
      if (!result) return false;
      playlist = result.folderAudioPlaylistAfter;
      endlessFromIndex = result.endlessFromIndex;
      endlessExtended = true;
      return true;
    };

    expect(fill()).toBe(true);
    const nextUp = playlist.slice(playlistIndex + 1).map((f) => f.path);
    const combined = buildCombinedQueuePaths([], nextUp);
    expect(combined.length).toBe(MUSIC_ENDLESS_LOOKAHEAD);
    expect(
      nextQueueRowIsEndless({
        manualQueueLength: 0,
        playlistIndex,
        effectivePlaylist: playlist,
        folderAudioPlaylist: playlist,
        endlessFromIndex,
      }),
    ).toBe(true);

    playlistIndex = 1;
    expect(fill()).toBe(true);
    const lenAfterAdvanceFill = playlist.length;

    const prev = resolveMusicPrevTrack({
      manualQueue: [],
      effectivePlaylist: playlist,
      playlistIndex,
      playingFromManualQueue: false,
      manualQueueContextIndex: null,
    });
    expect(prev?.path).toBe(playlist[0]!.path);
    playlistIndex = playlist.findIndex((f) => f.path === prev!.path);
    expect(playlistIndex).toBe(0);
    expect(fill()).toBe(false);
    expect(playlist).toHaveLength(lenAfterAdvanceFill);
  });

  it("holds near MUSIC_ENDLESS_LOOKAHEAD across 7 skips from a single", () => {
    const library = Array.from({ length: 40 }, (_, i) => track(String(i + 1)));
    let playlist = [library[0]!];
    let endlessFromIndex: number | null = null;
    let endlessExtended = false;
    let playlistIndex = 0;
    const counts: number[] = [];

    const fill = () => {
      const result = ensureMusicEndlessLookahead({
        libraryAudio: library,
        folderAudioPlaylist: playlist,
        current: playlist[playlistIndex]!,
        endlessExtended,
        endlessFromIndex,
        effectivePlaylist: playlist,
        playlistIndex,
        manualQueueLength: 0,
        seed: 100 + playlistIndex,
      });
      if (!result) return;
      playlist = result.folderAudioPlaylistAfter;
      endlessFromIndex = result.endlessFromIndex;
      endlessExtended = true;
    };

    fill();
    counts.push(remainingQueueCount(playlistIndex, playlist.length, 0));

    for (let skip = 0; skip < 7; skip++) {
      expect(playlistIndex).toBeLessThan(playlist.length - 1);
      playlistIndex += 1;
      const mid = remainingQueueCount(playlistIndex, playlist.length, 0);
      expect(mid).toBe(MUSIC_ENDLESS_LOOKAHEAD - 1);
      fill();
      counts.push(remainingQueueCount(playlistIndex, playlist.length, 0));
    }

    expect(counts[0]).toBe(MUSIC_ENDLESS_LOOKAHEAD);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i], `after skip ${i}`).toBe(MUSIC_ENDLESS_LOOKAHEAD);
    }
    expect(counts).toEqual([
      MUSIC_ENDLESS_LOOKAHEAD,
      MUSIC_ENDLESS_LOOKAHEAD,
      MUSIC_ENDLESS_LOOKAHEAD,
      MUSIC_ENDLESS_LOOKAHEAD,
      MUSIC_ENDLESS_LOOKAHEAD,
      MUSIC_ENDLESS_LOOKAHEAD,
      MUSIC_ENDLESS_LOOKAHEAD,
      MUSIC_ENDLESS_LOOKAHEAD,
    ]);
  });
});

describe("resolveMusicEndlessNext", () => {
  it("records endlessFromIndex at append boundary", () => {
    const library = [track("1"), track("2"), track("3"), track("4")];
    const folder = [track("1")];
    const result = resolveMusicEndlessNext({
      libraryAudio: library,
      folderAudioPlaylist: folder,
      current: folder[0]!,
      endlessExtended: false,
      endlessFromIndex: null,
      effectivePlaylist: folder,
      likedKeys: [],
      sessionRecentKeys: [],
      seed: 7,
    });
    expect(result).not.toBeNull();
    expect(result!.endlessFromIndex).toBe(1);
  });
});

describe("pickSmartNextTrack starvation", () => {
  it("relaxes session-recent when every candidate weight is 0", () => {
    const pool = [track("1"), track("2"), track("3")];
    const current = pool[0]!;
    const sessionRecentKeys = pool.map((f) => musicTrackIdentityKey(f, primaryArtist));
    const next = pickSmartNextTrack({
      pool,
      current,
      sessionRecentKeys,
      seed: 42,
    });
    expect(next).not.toBeNull();
    expect(next!.path).not.toBe(current.path);
  });
});
