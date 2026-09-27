import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPersistedDownloadJobs, type DownloadJob } from "./downloadQueue";

const job = (over: Partial<DownloadJob>): DownloadJob =>
  ({
    id: "dl-old",
    url: "https://www.youtube.com/watch?v=abc",
    status: "queued",
    approval: "auto",
    progress: null,
    error: null,
    createdAt: 1,
    options: { audioOnly: true },
    ...over,
  }) as DownloadJob;

function restore(jobs: DownloadJob[]): DownloadJob[] {
  const store = new Map([["ruforge-download-queue", JSON.stringify(jobs)]]);
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null });
  return loadPersistedDownloadJobs();
}

describe("download queue restore after a refresh", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("puts a music playlist song that was mid-download back in the auto pump with a new id", () => {
    const [back] = restore([job({ status: "downloading", enqueueSource: "musicPlaylistAdd", error: "x" })]);
    expect(back).toMatchObject({ status: "queued", approval: "auto", resumeOnStart: true, error: null, progress: null });
    expect(back.id).not.toBe("dl-old");
  });

  it("keeps waiting music playlist songs on auto", () => {
    const [back] = restore([job({ enqueueSource: "musicPlaylistAdd" })]);
    expect(back).toMatchObject({ status: "queued", approval: "auto" });
    expect(back.resumeOnStart).toBe(false);
  });

  it("still holds other downloads until the user resumes them", () => {
    const [queued, active] = restore([
      job({ id: "a", url: "https://www.youtube.com/watch?v=a" }),
      job({ id: "b", url: "https://www.youtube.com/watch?v=b", status: "downloading" }),
    ]);
    expect(queued).toMatchObject({ id: "a", status: "queued", approval: "held" });
    expect(active).toMatchObject({ id: "b", status: "paused", approval: "manual", resumeOnStart: true });
  });
});
