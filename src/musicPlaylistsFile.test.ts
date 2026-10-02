import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MUSIC_PLAYLISTS_SAVED_AT_LS_KEY,
  classifyFileRead,
  parseMusicPlaylistsFile,
  planMusicPlaylistsHydration,
  readLocalSavedAt,
  replaceMusicRecords,
  serializeMusicPlaylistsFile,
  writeLocalSavedAt,
} from "./musicPlaylistsFile";
import {
  WATCH_LATER_ID,
  loadVirtualPlaylistRecords,
  normalizeRecord,
  saveVirtualPlaylistRecords,
  setRecordDetails,
  setVirtualPlaylistsPersistHook,
  type VirtualPlaylistRecord,
} from "./virtualPlaylists";

let store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
});

beforeEach(() => {
  store = {};
  setVirtualPlaylistsPersistHook(null);
});

const watchLater: VirtualPlaylistRecord = {
  id: WATCH_LATER_ID,
  title: "Watch later",
  items: [{ path: "C:\\v\\clip.mp4", addedAt: 1 }],
  updatedAt: 1,
  system: true,
};

function music(id: string, paths: string[], extra: Partial<VirtualPlaylistRecord> = {}): VirtualPlaylistRecord {
  return {
    id,
    title: `Mix ${id}`,
    kind: "music",
    updatedAt: 5,
    items: paths.map((path, i) => ({ path, addedAt: i + 1 })),
    ...extra,
  };
}

describe("music playlists file format", () => {
  it("round-trips music records only", () => {
    const records = [watchLater, music("a", ["C:\\m\\1.mp3"], { description: "Late night" })];
    const raw = serializeMusicPlaylistsFile(records, 42);
    const parsed = parseMusicPlaylistsFile(raw);
    expect(parsed?.savedAt).toBe(42);
    expect(parsed?.playlists.map((p) => p.id)).toEqual(["a"]);
    expect(parsed?.playlists[0]?.description).toBe("Late night");
  });

  it("treats bad JSON and wrong shapes as unreadable, null as missing", () => {
    expect(classifyFileRead("{nope").kind).toBe("unreadable");
    expect(classifyFileRead(JSON.stringify({ playlists: "x" })).kind).toBe("unreadable");
    expect(classifyFileRead(null).kind).toBe("missing");
    expect(classifyFileRead("{}", true).kind).toBe("unreadable");
    expect(classifyFileRead(serializeMusicPlaylistsFile([], 1)).kind).toBe("ok");
  });

  it("replaces music records but keeps video ones", () => {
    const next = replaceMusicRecords([watchLater, music("old", [])], [music("new", [])]);
    expect(next.map((r) => r.id)).toEqual([WATCH_LATER_ID, "new"]);
  });
});

describe("hydration plan", () => {
  const local = [watchLater, music("a", ["C:\\m\\1.mp3"])];
  const fileWith = (savedAt: number, playlists: VirtualPlaylistRecord[]) =>
    classifyFileRead(
      serializeMusicPlaylistsFile([watchLater, ...playlists.filter((p) => p.id !== WATCH_LATER_ID)], savedAt),
    );

  it("takes video playlists from the file's fallback copy when the file wins", () => {
    const fileWatchLater = { ...watchLater, items: [{ path: "C:\\v\\new.mp4", addedAt: 9 }] };
    const read = classifyFileRead(serializeMusicPlaylistsFile([fileWatchLater, music("b", [])], 100));
    const plan = planMusicPlaylistsHydration([watchLater], null, read);
    expect(plan.records.find((r) => r.id === WATCH_LATER_ID)?.items.map((i) => i.path)).toEqual(["C:\\v\\new.mp4"]);
  });

  it("migrates localStorage into a missing file once", () => {
    const plan = planMusicPlaylistsHydration(local, null, { kind: "missing" });
    expect(plan).toMatchObject({ source: "migrated", writeFile: true, writeLocal: false });
    expect(plan.records).toBe(local);
  });

  it("falls back to localStorage when the file is unreadable and leaves it alone", () => {
    const plan = planMusicPlaylistsHydration(local, 10, { kind: "unreadable" });
    expect(plan).toMatchObject({ source: "fallback", writeFile: false, writeLocal: false });
    expect(plan.records).toBe(local);
  });

  it("restores from the file when localStorage was wiped", () => {
    const plan = planMusicPlaylistsHydration([watchLater], null, fileWith(100, [music("b", ["C:\\m\\2.mp3"])]));
    expect(plan.source).toBe("file");
    expect(plan.writeLocal).toBe(true);
    expect(plan.records.map((r) => r.id)).toEqual([WATCH_LATER_ID, "b"]);
  });

  it("keeps a newer localStorage copy and pushes it to the file", () => {
    const plan = planMusicPlaylistsHydration(local, 200, fileWith(100, [music("b", [])]));
    expect(plan).toMatchObject({ source: "local", writeFile: true, writeLocal: false });
  });

  it("does not rewrite the file when both copies carry the same stamp", () => {
    const plan = planMusicPlaylistsHydration(local, 100, fileWith(100, local));
    expect(plan).toMatchObject({ source: "local", writeFile: false });
  });

  it("does not bring back a playlist deleted in the newer copy", () => {
    const plan = planMusicPlaylistsHydration([watchLater, music("gone", [])], 50, fileWith(100, []));
    expect(plan.records.map((r) => r.id)).toEqual([WATCH_LATER_ID]);
  });
});

describe("localStorage stamp and persist hook", () => {
  it("reads back the saved-at stamp", () => {
    expect(readLocalSavedAt()).toBeNull();
    writeLocalSavedAt(1234);
    expect(store[MUSIC_PLAYLISTS_SAVED_AT_LS_KEY]).toBe("1234");
    expect(readLocalSavedAt()).toBe(1234);
  });

  it("still writes localStorage when no file hook is registered (mini windows)", () => {
    saveVirtualPlaylistRecords([music("solo", [])]);
    expect(loadVirtualPlaylistRecords().some((r) => r.id === "solo")).toBe(true);
  });

  it("writes localStorage and hands every save to the file hook", () => {
    const seen: VirtualPlaylistRecord[][] = [];
    setVirtualPlaylistsPersistHook((r) => seen.push(r));
    saveVirtualPlaylistRecords([music("a", ["C:\\m\\1.mp3"])]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.some((r) => r.id === "a")).toBe(true);
    expect(loadVirtualPlaylistRecords().some((r) => r.id === "a")).toBe(true);
  });
});

describe("record fields", () => {
  it("keeps identityKey and a trimmed description, and old records still load", () => {
    const withKey = normalizeRecord({
      ...music("a", ["C:\\m\\1.mp3"]),
      description: "  hi  ",
      items: [{ path: "C:\\m\\1.mp3", addedAt: 1, identityKey: "id:abc" }],
    });
    expect(withKey?.items[0]?.identityKey).toBe("id:abc");
    expect(withKey?.description).toBe("hi");
    const old = normalizeRecord(music("b", ["C:\\m\\2.mp3"]));
    expect(old?.items[0]).toEqual({ path: "C:\\m\\2.mp3", addedAt: 1 });
    expect(old?.description).toBeUndefined();
  });

  it("setRecordDetails updates title and description, clears an empty one, keeps no-ops", () => {
    const base = music("a", [], { description: "old" });
    const next = setRecordDetails(base, { title: " New ", description: "  " }, 99);
    expect(next.title).toBe("New");
    expect(next.description).toBeUndefined();
    expect(next.updatedAt).toBe(99);
    expect(setRecordDetails(base, { title: base.title, description: "old" })).toBe(base);
    expect(setRecordDetails(base, { title: "", description: "old" }).title).toBe(base.title);
  });
});
