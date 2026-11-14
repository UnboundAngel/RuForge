import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DownloadJob } from "@/downloadQueue";

// The module pulls in the whole store, which reads localStorage at import time.
let notice: typeof import("./pausedQueueNotice");
beforeAll(async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  });
  notice = await import("./pausedQueueNotice");
});

const job = (p: Partial<DownloadJob>) => p as DownloadJob;

describe("isResumableAfterLaunch", () => {
  it("resumes paused jobs", () => {
    expect(notice.isResumableAfterLaunch(job({ status: "paused" }))).toBe(true);
  });
  it("resumes held queued jobs the user started, not staged ones", () => {
    expect(notice.isResumableAfterLaunch(job({ status: "queued", approval: "held", enqueueSource: "heroPlaylistDownload" }))).toBe(true);
    expect(notice.isResumableAfterLaunch(job({ status: "queued", approval: "held" }))).toBe(false);
  });
  it("ignores finished jobs", () => {
    expect(notice.isResumableAfterLaunch(job({ status: "completed" }))).toBe(false);
  });
});

describe("buildPausedQueueNotification", () => {
  it("pluralises and offers resume", () => {
    expect(notice.buildPausedQueueNotification(1, 5).title).toBe("1 download paused");
    const many = notice.buildPausedQueueNotification(3, 5);
    expect(many.title).toBe("3 downloads paused");
    expect(many.actions).toEqual(["resume-queue"]);
  });
});
