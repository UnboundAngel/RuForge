import { afterEach, beforeEach, expect, it, vi } from "vitest";

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

const BAD = "https://www.youtube.com/watch?v=badbadbadba";
const GOOD = "https://www.youtube.com/watch?v=goodgoodgoo";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: { url?: string }) => {
    if (cmd === "get_disk_space") return [];
    if (cmd === "get_video_info") {
      if (args?.url?.includes("badbad")) throw new Error("Video unavailable");
      return { title: "Good Song", thumbnail: "https://i.ytimg.com/good.jpg", duration: 200 };
    }
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

type RejectionListener = (reason: unknown) => void;
const process = (
  globalThis as unknown as {
    process: {
      on(event: "unhandledRejection", fn: RejectionListener): void;
      off(event: "unhandledRejection", fn: RejectionListener): void;
    };
  }
).process;

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  sessionStorage.clear();
  useRuforgeStore.setState({ downloadJobs: [], entries: [] });
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});

function job(id: string, url: string) {
  const s = useRuforgeStore.getState();
  return {
    id,
    url,
    status: "queued" as const,
    approval: "held" as const,
    options: buildDownloadJobOptions(s.settings, "C:\\out"),
    progress: null,
    error: null,
    createdAt: Date.now(),
  };
}

it("a failed get_video_info during rehydration fails that job visibly and leaves the rest hydrating", async () => {
  useRuforgeStore.setState({
    downloadJobs: [job("bad", BAD), job("good", GOOD)] as never,
  });

  useRuforgeStore.getState().queueHydrateOrphanMetadata();

  await vi.waitFor(() => {
    const jobs = useRuforgeStore.getState().downloadJobs;
    expect(jobs.find((j) => j.id === "good")?.metadata?.title).toBe("Good Song");
  });
  await new Promise((r) => setTimeout(r, 0));

  const jobs = useRuforgeStore.getState().downloadJobs;
  const bad = jobs.find((j) => j.id === "bad");
  expect(bad?.status).toBe("failed");
  expect(bad?.error).toContain("Video unavailable");
  expect(jobs.find((j) => j.id === "good")?.status).toBe("queued");
  expect(unhandled).toEqual([]);
});
