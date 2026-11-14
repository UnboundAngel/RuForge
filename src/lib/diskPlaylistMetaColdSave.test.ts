import { describe, expect, it, vi } from "vitest";

const FOLDER = "D:/Playlists/saved";
const disk: Record<string, unknown> = {
  [FOLDER]: { order: ["b.mp4", "a.mp4"], title: "My mix", added: ["D:/x.mp4"] },
};
const writes: unknown[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args: { folders?: string[]; meta?: unknown }) => {
    if (cmd === "read_disk_playlist_user_meta") {
      const hits = (args.folders ?? []).filter((f) => disk[f]).map((f) => [f, disk[f]]);
      return Promise.resolve(Object.fromEntries(hits));
    }
    writes.push(args.meta);
    return Promise.resolve();
  }),
}));

import { getDiskPlaylistMeta, linkToDiskPlaylist } from "./diskPlaylistMeta";

describe("saving a folder playlist before its settings load", () => {
  it("keeps the saved title, order and links", async () => {
    await linkToDiskPlaylist(FOLDER, ["D:/y.mp4"]);
    const expected = { order: ["b.mp4", "a.mp4"], title: "My mix", added: ["D:/x.mp4", "D:/y.mp4"] };
    expect(writes[writes.length - 1]).toEqual(expected);
    expect(getDiskPlaylistMeta(FOLDER)).toEqual(expected);
  });
});
