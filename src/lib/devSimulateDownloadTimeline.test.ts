import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ls = vi.hoisted(() => {
  let data: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    clear: () => {
      data = {};
    },
    get length() {
      return Object.keys(data).length;
    },
    key: () => null,
  });
  return {
    clear: () => {
      data = {};
    },
    set: (k: string, v: string) => {
      data[k] = v;
    },
  };
});

import type { DownloadJob } from "../downloadQueue";
import type { RuforgeStore } from "../store/ruforgeStore";
import type { ProgressPayload } from "../types";
import {
  DEV_SIMULATE_DOWNLOAD_MAX_MS,
  DEV_SIMULATE_DOWNLOAD_MIN_MS,
  DEV_SIMULATE_PROCESSING_MS,
  getDevSimulateDownloadMs,
  rollDevSimulateDownloadMs,
} from "./devLastDownloadBatch";
import { runDevSimulatedDownload } from "./devSimulateDownloadTimeline";

function ts(): string {
  return new Date().toISOString();
}

function makeJob(partial: Partial<DownloadJob> & Pick<DownloadJob, "id" | "url">): DownloadJob {
  return {
    title: partial.title ?? "Test",
    status: "downloading",
    approval: "auto",
    progress: null,
    options: {
      audioOnly: false,
      format: "",
      outputDir: "",
      filenameTemplate: "",
      subLangs: "",
      audioFormat: "",
      browserCookies: "",
      cookieFile: "",
      autoScrubberPreviews: true,
      stampArtistTags: true,
      downloadComments: false,
      ...partial.options,
    },
    createdAt: Date.now(),
    metadata: partial.metadata ?? {
      title: "Test",
      thumbnail: "",
      duration: 120,
      isPlaylist: false,
      fileSizeBytes: 10 * 1024 * 1024,
    },
    ...partial,
  };
}

function createMockGet(
  jobs: DownloadJob[],
  videoInfo?: RuforgeStore["videoInfo"],
): {
  get: () => RuforgeStore;
  progressLog: Array<{ at: string; payload: ProgressPayload }>;
  finished: string[];
} {
  const progressLog: Array<{ at: string; payload: ProgressPayload }> = [];
  const finished: string[] = [];

  const get = () =>
    ({
      downloadJobs: jobs,
      videoInfo: videoInfo ?? null,
      applyDownloadProgress: (payload: ProgressPayload) => {
        progressLog.push({ at: ts(), payload: { ...payload } });
        const j = jobs.find((x) => x.id === payload.jobId);
        if (j) j.progress = payload;
      },
      onDownloadJobFinished: (p: { jobId: string; success: boolean }) => {
        finished.push(p.jobId);
        const j = jobs.find((x) => x.id === p.jobId);
        if (j) j.status = "completed";
      },
    }) as unknown as RuforgeStore;

  return { get, progressLog, finished };
}

describe("devSimulateDownloadTimeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ls.clear();
    vi.spyOn(Math, "random").mockRestore();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rollDevSimulateDownloadMs stays within 4-8s", () => {
    for (let i = 0; i < 50; i++) {
      const ms = rollDevSimulateDownloadMs();
      expect(ms).toBeGreaterThanOrEqual(DEV_SIMULATE_DOWNLOAD_MIN_MS);
      expect(ms).toBeLessThanOrEqual(DEV_SIMULATE_DOWNLOAD_MAX_MS);
    }
  });

  it("localStorage override skips randomization", () => {
    ls.set("ruforge-dev-simulate-ms", "600");
    expect(getDevSimulateDownloadMs()).toBe(600);
    expect(getDevSimulateDownloadMs() ?? rollDevSimulateDownloadMs()).toBe(600);
  });

  it("logs progress over randomized per-item durations (playlist batch)", async () => {
    const rolled = [4120, 5870, 7310];
    let rollIdx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      const t = (rolled[rollIdx]! - DEV_SIMULATE_DOWNLOAD_MIN_MS) / (DEV_SIMULATE_DOWNLOAD_MAX_MS - DEV_SIMULATE_DOWNLOAD_MIN_MS);
      rollIdx += 1;
      return Math.min(0.999999, Math.max(0, t));
    });

    const folder = "test-playlist";
    const jobs = [1, 2, 3].map((n) =>
      makeJob({
        id: `job-${n}`,
        url: `https://www.youtube.com/watch?v=item${n}`,
        options: {
          audioOnly: false,
          format: "",
          outputDir: "/out",
          filenameTemplate: "",
          subLangs: "",
          audioFormat: "",
          browserCookies: "",
          cookieFile: "",
          autoScrubberPreviews: true,
          stampArtistTags: true,
          downloadComments: false,
          playlistOutputFolder: folder,
          playlistIndex: n,
        },
      }),
    );

    const videoInfo = {
      title: "Playlist",
      thumbnail: "",
      duration: 360,
      isPlaylist: true,
      playlistItems: jobs.map((j, i) => ({
        title: `Item ${i + 1}`,
        thumbnail: "",
        duration: 120,
        webpageUrl: j.url,
        id: j.id,
      })),
    } as RuforgeStore["videoInfo"];

    const durationsMs: number[] = [];

    for (const job of jobs) {
      job.status = "downloading";
      const { get, progressLog, finished } = createMockGet(jobs, videoInfo);
      const started = Date.now();

      const run = runDevSimulatedDownload(get, job.id, job.url);
      await vi.runAllTimersAsync();
      await run;

      const wallMs = Date.now() - started;
      durationsMs.push(wallMs);

      const first = progressLog[0];
      const lastDl = [...progressLog].reverse().find((e) => e.payload.status === "downloading");
      const proc = progressLog.find((e) => e.payload.status === "processing");

      console.info(
        `[${ts()}] item ${job.options.playlistIndex} rolled=${rolled[job.options.playlistIndex! - 1]}ms wall=${wallMs}ms ` +
          `firstPct=${first?.payload.percentage.toFixed(1)} ` +
          `lastDlPct=${lastDl?.payload.percentage.toFixed(1)} ` +
          `idx=${proc?.payload.currentIndex}/${proc?.payload.totalItems} finished=${finished.includes(job.id)}`,
      );
    }

    expect(new Set(durationsMs).size).toBeGreaterThan(1);
    expect(durationsMs[0]).toBeGreaterThanOrEqual(Math.floor(4120 * 0.85));
    expect(durationsMs[1]).toBeGreaterThanOrEqual(Math.floor(5870 * 0.85));
    expect(durationsMs[2]).toBeGreaterThanOrEqual(Math.floor(7310 * 0.85) + DEV_SIMULATE_PROCESSING_MS - 200);
  });

  it("single download: processing phase then finish", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const job = makeJob({ id: "single", url: "https://www.youtube.com/watch?v=single" });
    const { get, progressLog, finished } = createMockGet([job]);

    const run = runDevSimulatedDownload(get, job.id, job.url);
    await vi.runAllTimersAsync();
    await run;

    expect(progressLog.some((e) => e.payload.status === "processing")).toBe(true);
    expect(finished).toEqual(["single"]);
    console.info(`[${ts()}] single wall~${4000}ms ticks=${progressLog.length} finished=true`);
  });

  it("explorer batch jobs get independent rolls", async () => {
    const rolled = [4500, 7900];
    let rollIdx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      const t = (rolled[rollIdx]! - DEV_SIMULATE_DOWNLOAD_MIN_MS) / (DEV_SIMULATE_DOWNLOAD_MAX_MS - DEV_SIMULATE_DOWNLOAD_MIN_MS);
      rollIdx += 1;
      return Math.min(0.999999, t);
    });

    const durations: number[] = [];
    for (let i = 0; i < 2; i++) {
      const job = makeJob({ id: `explorer-${i}`, url: `https://www.youtube.com/watch?v=e${i}` });
      const { get } = createMockGet([job]);
      const started = Date.now();
      const run = runDevSimulatedDownload(get, job.id, job.url);
      await vi.runAllTimersAsync();
      await run;
      durations.push(Date.now() - started);
      console.info(`[${ts()}] explorer item ${i + 1} rolled=${rolled[i]}ms wall=${durations[i]}ms`);
    }

    expect(durations[0]).not.toBe(durations[1]);
  });
});
