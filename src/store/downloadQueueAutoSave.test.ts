import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const mk = () => {
    let store: Record<string, string> = {};
    return {
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
    };
  };
  vi.stubGlobal("localStorage", mk());
  vi.stubGlobal("sessionStorage", mk());
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "get_disk_space") return [];
    if (cmd === "get_video_info") return new Promise(() => {});
    throw new Error(`no backend for ${cmd} in tests`);
  }),
}));
vi.mock("@/lib/mainPlaybackClaim", () => ({
  claimMainPlayback: vi.fn(),
  closeVideoMiniWindow: vi.fn(),
  stopMusicMiniForMainClaim: vi.fn(),
}));

const { useRuforgeStore } = await import("@/store/ruforgeStore");
const { buildDownloadJobOptions } = await import("@/downloadQueue");
const autoSave = await import("@/lib/musicExploreAutoSave");
const { musicExploreAutoSaveQueue } = await import("@/lib/musicExploreAutoSaveQueue");

const TRACK = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
const OTHER = "https://www.youtube.com/watch?v=bbbbbbbbbbb";

function opts(extra: Record<string, unknown> = {}) {
  return { ...buildDownloadJobOptions(useRuforgeStore.getState().settings, "C:\\out"), audioOnly: true, ...extra };
}

function jobsFor(url: string) {
  return useRuforgeStore.getState().downloadJobs.filter((j) => j.url === url);
}

beforeEach(() => {
  sessionStorage.clear();
  useRuforgeStore.setState({ downloadJobs: [], entries: [] });
  autoSave.resetMusicExploreAutoSaveMemory();
});

describe("D3: enqueueing a queued URL keeps the existing job's options", () => {
  it("a single enqueue never rewrites a playlist track's destination", () => {
    const s = useRuforgeStore.getState();
    s.enqueueDownload(TRACK, opts({ playlistOutputFolder: "Road Trip", playlistIndex: 3 }), { approval: "held" });
    s.enqueueDownload(TRACK, opts({ audioFormat: "opus" }), { approval: "auto" });
    const [job] = jobsFor(TRACK);
    expect(jobsFor(TRACK)).toHaveLength(1);
    expect(job?.options.playlistOutputFolder).toBe("Road Trip");
    expect(job?.options.playlistIndex).toBe(3);
    expect(job?.approval).toBe("held");
  });

  it("re-enqueueing into the same playlist keeps the original options", () => {
    const s = useRuforgeStore.getState();
    s.enqueueDownload(TRACK, opts({ playlistOutputFolder: "Road Trip", playlistIndex: 3 }), { approval: "held" });
    s.enqueueDownload(TRACK, opts({ playlistOutputFolder: "Road Trip", playlistIndex: 9, audioFormat: "opus" }), {
      approval: "held",
    });
    expect(jobsFor(TRACK)).toHaveLength(1);
    expect(jobsFor(TRACK)[0]?.options.playlistIndex).toBe(3);
  });

  it("two playlists sharing a track both keep their membership through completion", () => {
    const s = useRuforgeStore.getState();
    s.enqueueDownload(TRACK, opts({ playlistOutputFolder: "Road Trip", playlistIndex: 3 }), { approval: "held" });
    s.enqueueDownload(TRACK, opts({ playlistOutputFolder: "Gym", playlistIndex: 1 }), { approval: "held" });
    expect(jobsFor(TRACK).map((j) => j.options.playlistOutputFolder).sort()).toEqual(["Gym", "Road Trip"]);

    const roadTrip = jobsFor(TRACK).find((j) => j.options.playlistOutputFolder === "Road Trip")!;
    useRuforgeStore.getState().onDownloadJobFinished({ jobId: roadTrip.id, url: TRACK, success: true });
    expect(jobsFor(TRACK).map((j) => j.options.playlistOutputFolder)).toEqual(["Gym"]);
  });
});

describe("D4: auto-save only releases its own job", () => {
  it("held jobs from Explorer stay held when auto-save queues a song", () => {
    useRuforgeStore.getState().enqueueDownload(OTHER, opts(), { approval: "held", enqueueSource: "explorerAdd" });
    expect(autoSave.runMusicExploreAutoSave("aaaaaaaaaaa", musicExploreAutoSaveQueue("aaaaaaaaaaa", "Song"))).toBe(true);
    expect(jobsFor(OTHER)[0]?.approval).toBe("held");
    expect(jobsFor(TRACK)[0]?.approval).toBe("auto");
  });

  it("a song already held from Explorer is left exactly as it was", () => {
    useRuforgeStore.getState().enqueueDownload(TRACK, opts(), { approval: "held", enqueueSource: "explorerAdd" });
    expect(autoSave.runMusicExploreAutoSave("aaaaaaaaaaa", musicExploreAutoSaveQueue("aaaaaaaaaaa"))).toBe(false);
    expect(jobsFor(TRACK)).toHaveLength(1);
    expect(jobsFor(TRACK)[0]?.approval).toBe("held");
  });
});

describe("D7: auto-save never re-downloads a cancelled or finished track", () => {
  const save = () => autoSave.runMusicExploreAutoSave("aaaaaaaaaaa", musicExploreAutoSaveQueue("aaaaaaaaaaa"));

  it("a cancelled track stays cancelled when the same song is announced again", async () => {
    expect(save()).toBe(true);
    const job = jobsFor(TRACK)[0]!;
    await useRuforgeStore.getState().removeDownloadJob(job.id, { manual: true });
    autoSave.noteMusicExploreJobRemoved(job);
    expect(jobsFor(TRACK)).toHaveLength(0);
    expect(save()).toBe(false);
    expect(jobsFor(TRACK)).toHaveLength(0);
  });

  it("a finished track is not queued again, even after its row leaves the queue", () => {
    expect(save()).toBe(true);
    const job = jobsFor(TRACK)[0]!;
    useRuforgeStore.getState().onDownloadJobFinished({ jobId: job.id, url: TRACK, success: true });
    autoSave.noteMusicExploreJobRemoved({ url: TRACK, status: "downloading" });
    expect(save()).toBe(false);
  });

  it("a track already in the library is never auto-queued", () => {
    useRuforgeStore.setState({
      entries: [
        {
          kind: "media",
          name: "Song",
          path: "C:\\out\\Music\\Song.mp3",
          size: 1,
          created: 1,
          duration: 1,
          thumbnailPath: null,
          ruforgePosterPath: null,
          subtitlePath: null,
          chapters: null,
          downloadMetadataHint: null,
          sourceUrl: TRACK,
          sourceId: "aaaaaaaaaaa",
        },
      ],
    } as never);
    expect(save()).toBe(false);
    expect(jobsFor(TRACK)).toHaveLength(0);
  });

  it("only a failed attempt is retried on replay", () => {
    expect(save()).toBe(true);
    autoSave.noteMusicExploreJobRemoved({ url: TRACK, status: "failed" });
    useRuforgeStore.setState({ downloadJobs: [] });
    expect(save()).toBe(true);
  });
});
