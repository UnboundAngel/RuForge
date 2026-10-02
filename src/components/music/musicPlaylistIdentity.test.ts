import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import { reconcilePlaylistIdentities, relocationCandidates } from "./musicPlaylistIdentity";
import { musicTrackIdentityKey } from "./musicShelfDedup";
import { primaryArtist } from "./musicArtist";

function file(path: string, extra: Partial<MediaFile> = {}): MediaFile {
  return {
    name: path.slice(path.lastIndexOf("\\") + 1).replace(/\.[^.]+$/, ""),
    path,
    size: 1,
    created: 1,
    duration: 100,
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: null,
    sourceId: null,
    ...extra,
  };
}

const keyFor = (f: MediaFile) => musicTrackIdentityKey(f, primaryArtist);

function playlist(items: VirtualPlaylistRecord["items"], extra: Partial<VirtualPlaylistRecord> = {}): VirtualPlaylistRecord {
  return { id: "p", title: "P", kind: "music", updatedAt: 7, items, ...extra };
}

describe("reconcilePlaylistIdentities", () => {
  it("stamps identity keys on old records whose files are present", () => {
    const song = file("C:\\m\\Song.mp3", { sourceId: "abc" });
    const rec = playlist([{ path: song.path, addedAt: 3 }]);
    const out = reconcilePlaylistIdentities([rec], [song], keyFor);
    expect(out.changed).toBe(true);
    expect(out.records[0]?.items[0]).toEqual({ path: song.path, addedAt: 3, identityKey: "id:abc" });
    expect(out.records[0]?.updatedAt).toBe(7);
  });

  it("follows a moved file by identity key and keeps addedAt and the cover", () => {
    const moved = file("D:\\music\\Song (1).mp3", { sourceId: "abc" });
    const oldPath = "C:\\m\\Song.mp3";
    const rec = playlist([{ path: oldPath, addedAt: 3, identityKey: "id:abc" }], { thumbnailPath: oldPath });
    const out = reconcilePlaylistIdentities([rec], [moved], keyFor, () => true);
    expect(out.changed).toBe(true);
    expect(out.records[0]?.items[0]).toEqual({ path: moved.path, addedAt: 3, identityKey: "id:abc" });
    expect(out.records[0]?.thumbnailPath).toBe(moved.path);
  });

  it("never re-points while the original drive is unavailable", () => {
    const other = file("D:\\B\\Song.mp3", { sourceId: "abc" });
    const rec = playlist([{ path: "E:\\A\\Song.mp3", addedAt: 3, identityKey: "id:abc" }]);
    const offline = reconcilePlaylistIdentities([rec], [other], keyFor, () => false);
    expect(offline.changed).toBe(false);
    expect(offline.records[0]).toBe(rec);
    expect(reconcilePlaylistIdentities([rec], [other], keyFor).records[0]).toBe(rec);
  });

  it("an untagged title-only match never re-points, even when the drive is mounted", () => {
    const other = file("D:\\B\\01 Intro.mp3");
    const key = keyFor(other);
    expect(key).toBe("song:|01 intro");
    const rec = playlist([{ path: "E:\\A\\01 Intro.mp3", addedAt: 1, identityKey: key }]);
    const out = reconcilePlaylistIdentities([rec], [other], keyFor, () => true);
    expect(out.changed).toBe(false);
    expect(relocationCandidates([rec], [other], keyFor)).toEqual([]);
  });

  it("asks the disk only about strong-key items with a library match", () => {
    const tagged = file("D:\\B\\Song.mp3", { sourceId: "abc" });
    const rec = playlist([
      { path: "E:\\A\\Song.mp3", addedAt: 1, identityKey: "id:abc" },
      { path: "E:\\A\\Other.mp3", addedAt: 2, identityKey: "id:zzz" },
      { path: tagged.path, addedAt: 3, identityKey: "id:abc" },
    ]);
    expect(relocationCandidates([rec], [tagged], keyFor)).toEqual(["E:\\A\\Song.mp3"]);
  });

  it("leaves a missing item without a key alone (old record, offline drive)", () => {
    const rec = playlist([{ path: "E:\\gone.mp3", addedAt: 1 }]);
    const out = reconcilePlaylistIdentities([rec], [file("C:\\m\\other.mp3")], keyFor);
    expect(out.changed).toBe(false);
    expect(out.records[0]).toBe(rec);
  });

  it("does not point two items at the same library file", () => {
    const present = file("C:\\m\\a.mp3", { sourceId: "x" });
    const rec = playlist([
      { path: present.path, addedAt: 1, identityKey: "id:x" },
      { path: "C:\\old\\a.mp3", addedAt: 2, identityKey: "id:x" },
    ]);
    const out = reconcilePlaylistIdentities([rec], [present], keyFor);
    expect(out.changed).toBe(false);
    expect(out.records[0]?.items[1]?.path).toBe("C:\\old\\a.mp3");
  });

  it("ignores video playlists and an empty library", () => {
    const video: VirtualPlaylistRecord = { id: "v", title: "V", updatedAt: 1, items: [{ path: "C:\\v.mp4", addedAt: 1 }] };
    expect(reconcilePlaylistIdentities([video], [file("C:\\v.mp4")], keyFor).changed).toBe(false);
    const rec = playlist([{ path: "C:\\m\\a.mp3", addedAt: 1, identityKey: "id:x" }]);
    expect(reconcilePlaylistIdentities([rec], [], keyFor).records[0]).toBe(rec);
  });
});
