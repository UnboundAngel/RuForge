import { describe, expect, it, vi } from "vitest";
import type { MediaFile, PlaylistCollection } from "@/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));

import { applyDiskPlaylistMeta, linkToDiskPlaylist, unlinkFromDiskPlaylist } from "./diskPlaylistMeta";

const FOLDER = "D:\Playlists\mc farms";
const file = (path: string, duration = 60) => ({ path, name: path, duration }) as MediaFile;
const own = file(`${FOLDER}\a.mp4`);
const loose = file("D:\Videos\loose.mp4", 30);
const playlist: PlaylistCollection = {
  kind: "playlist",
  title: "mc farms",
  path: FOLDER,
  itemCount: 1,
  combinedDuration: 60,
  stackThumbnailPath: null,
  items: [own],
} as PlaylistCollection;
const find = (p: string) => (p.toLowerCase() === loose.path.toLowerCase() ? loose : undefined);

describe("disk playlist links", () => {
  it("adds a linked video after the folder's own and counts it", async () => {
    await linkToDiskPlaylist(FOLDER, [loose.path]);
    const out = applyDiskPlaylistMeta(playlist, find);
    expect(out.items.map((f) => f.path)).toEqual([own.path, loose.path]);
    expect(out.itemCount).toBe(2);
    expect(out.combinedDuration).toBe(90);
  });

  it("does not double up when merged entries are merged again", () => {
    const once = applyDiskPlaylistMeta(playlist, find);
    const twice = applyDiskPlaylistMeta(once, find);
    expect(twice.items).toHaveLength(2);
    expect(twice.itemCount).toBe(2);
  });

  it("drops an unlinked video from an already merged entry", async () => {
    const merged = applyDiskPlaylistMeta(playlist, find);
    await unlinkFromDiskPlaylist(FOLDER, [loose.path]);
    const out = applyDiskPlaylistMeta(merged, find);
    expect(out.items.map((f) => f.path)).toEqual([own.path]);
    expect(out.itemCount).toBe(1);
    expect(out.combinedDuration).toBe(60);
  });
});
