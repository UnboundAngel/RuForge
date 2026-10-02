import { beforeEach, describe, expect, it, vi } from "vitest";

let store: Record<string, string> = {};
let quotaFull = false;
let fileContents: string | null = null;

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    if (quotaFull && k === "ruforge-virtual-playlists") throw new DOMException("full", "QuotaExceededError");
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args?: { contents: string }) => {
    if (cmd === "read_music_playlists_file") return fileContents;
    if (cmd === "write_music_playlists_file") fileContents = args!.contents;
    return null;
  },
}));

async function boot() {
  vi.resetModules();
  const vp = await import("./virtualPlaylists");
  const sync = await import("./musicPlaylistsFileSync");
  await sync.startMusicPlaylistsFileSync(() => {});
  return vp;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function musicPaths(vp: typeof import("./virtualPlaylists")): string[] {
  return vp.loadVirtualPlaylistRecords().find((r) => r.id === "mix")?.items.map((i) => i.path) ?? [];
}

describe("playlist state when localStorage is over quota", () => {
  beforeEach(() => {
    store = {};
    quotaFull = false;
    fileContents = null;
  });

  it("keeps every edit in the session and after restart", async () => {
    let vp = await boot();
    vp.mutateVirtualRecords((rs) => [
      ...rs,
      { id: "mix", title: "Mix", items: [], updatedAt: 1, kind: "music" },
    ]);
    await flush();

    quotaFull = true;
    vp.mutateVirtualRecords((rs) => rs.map((r) => (r.id === "mix" ? vp.addPathsToRecord(r, ["C:\\A.mp3"]) : r)));
    vp.mutateVirtualRecords((rs) => rs.map((r) => (r.id === "mix" ? vp.addPathsToRecord(r, ["C:\\B.mp3"]) : r)));
    await flush();
    expect(musicPaths(vp)).toEqual(["C:\\A.mp3", "C:\\B.mp3"]);
    expect(JSON.parse(store["ruforge-virtual-playlists"]).find((r: { id: string }) => r.id === "mix").items).toEqual([]);

    vp = await boot();
    expect(musicPaths(vp)).toEqual(["C:\\A.mp3", "C:\\B.mp3"]);
    expect(store["ruforge-music-playlists-saved-at"]).toBeUndefined();

    quotaFull = false;
    vp = await boot();
    expect(musicPaths(vp)).toEqual(["C:\\A.mp3", "C:\\B.mp3"]);
  });

  it("keeps Watch later edits across restart when localStorage is full", async () => {
    let vp = await boot();
    const watchLaterPaths = () =>
      vp.loadVirtualPlaylistRecords().find((r) => r.id === vp.WATCH_LATER_ID)?.items.map((i) => i.path);
    vp.mutateVirtualRecords((rs) => rs.map((r) => (r.id === vp.WATCH_LATER_ID ? vp.addPathsToRecord(r, ["C:\\v1.mp4"]) : r)));
    await flush();

    quotaFull = true;
    vp.mutateVirtualRecords((rs) => rs.map((r) => (r.id === vp.WATCH_LATER_ID ? vp.addPathsToRecord(r, ["C:\\v2.mp4"]) : r)));
    await flush();

    vp = await boot();
    expect(watchLaterPaths()).toEqual(["C:\\v1.mp4", "C:\\v2.mp4"]);
    quotaFull = false;
    vp = await boot();
    expect(watchLaterPaths()).toEqual(["C:\\v1.mp4", "C:\\v2.mp4"]);
  });

  it("a file written before the video fallback keeps localStorage video playlists", async () => {
    store["ruforge-virtual-playlists"] = JSON.stringify([
      { id: "watch-later", title: "Watch later", items: [{ path: "C:\\v1.mp4", addedAt: 1 }], updatedAt: 1, system: true },
    ]);
    fileContents = JSON.stringify({ version: 1, savedAt: 5, playlists: [] });
    const vp = await boot();
    expect(vp.loadVirtualPlaylistRecords().find((r) => r.id === vp.WATCH_LATER_ID)?.items).toHaveLength(1);
  });

  it("a stale key with an older stamp never beats a newer file", async () => {
    let vp = await boot();
    vp.mutateVirtualRecords((rs) => [
      ...rs,
      { id: "mix", title: "Mix", items: [], updatedAt: 1, kind: "music" },
    ]);
    await flush();
    quotaFull = true;
    vp.mutateVirtualRecords((rs) => rs.map((r) => (r.id === "mix" ? vp.addPathsToRecord(r, ["C:\\A.mp3"]) : r)));
    await flush();
    quotaFull = false;
    vp = await boot();
    expect(musicPaths(vp)).toEqual(["C:\\A.mp3"]);
  });
});
