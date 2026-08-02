import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaFile } from "@/types";
import { musicQueueSource, resolveQueueSourceLabel } from "./musicQueueSource";

vi.hoisted(() => {
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
});

vi.mock("@/lib/mainPlaybackClaim", () => ({
  claimMainPlayback: vi.fn(),
  closeVideoMiniWindow: vi.fn(),
  stopMusicMiniForMainClaim: vi.fn(),
}));

const { useRuforgeStore } = await import("@/store/ruforgeStore");

function media(partial: Partial<MediaFile> & Pick<MediaFile, "path" | "name">): MediaFile {
  return {
    size: 0,
    created: 0,
    duration: 120,
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

describe("musicQueueSource store wiring", () => {
  beforeEach(() => {
    localStorage.clear();
    useRuforgeStore.setState({
      playingFile: null,
      folderAudioPlaylist: [],
      musicQueueSource: null,
      musicEndlessFromIndex: null,
      musicEndlessExtended: false,
    });
  });

  it("tags Liked Songs, album, and single-track plays", () => {
    const a = media({ path: "C:/m/a.m4a", name: "A", album: "Album X" });
    const b = media({ path: "C:/m/b.m4a", name: "B", album: "Album X" });

    useRuforgeStore.getState().playMusicQueue(
      a,
      [a, b],
      musicQueueSource("liked", "Liked Songs"),
    );
    expect(useRuforgeStore.getState().musicQueueSource?.label).toBe("Liked Songs");
    expect(
      resolveQueueSourceLabel(useRuforgeStore.getState().musicQueueSource, false),
    ).toBe("Liked Songs");

    useRuforgeStore.getState().playMusicQueue(
      a,
      [a, b],
      musicQueueSource("album", "Album X"),
    );
    expect(
      resolveQueueSourceLabel(useRuforgeStore.getState().musicQueueSource, false),
    ).toBe("Album X");

    useRuforgeStore.getState().playMusicQueue(
      a,
      [a],
      musicQueueSource("track", "A"),
    );
    expect(
      resolveQueueSourceLabel(useRuforgeStore.getState().musicQueueSource, false),
    ).toBe("A");
  });

  it("keeps origin on neighbor skip and clears on explicit null play", () => {
    const a = media({ path: "C:/m/a.m4a", name: "A" });
    const b = media({ path: "C:/m/b.m4a", name: "B" });
    useRuforgeStore.getState().playMusicQueue(
      a,
      [a, b],
      musicQueueSource("liked", "Liked Songs"),
    );

    useRuforgeStore.getState().handlePlayFolderNeighbor(b);
    expect(useRuforgeStore.getState().musicQueueSource?.label).toBe("Liked Songs");
    expect(useRuforgeStore.getState().playingFile?.path).toBe(b.path);

    useRuforgeStore.getState().playMusicQueue(a, [a], null);
    expect(useRuforgeStore.getState().musicQueueSource).toBeNull();
    expect(
      resolveQueueSourceLabel(useRuforgeStore.getState().musicQueueSource, false),
    ).toBeNull();
  });
});
