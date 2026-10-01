import { describe, expect, it } from "vitest";
import type { DownloadJob } from "@/downloadQueue";
import { upsertItem } from "../notificationCenterStore";
import {
  STORAGE_FULL_NOTIFICATION_ID,
  buildDownloadNotification,
  collapseDownloadAttempts,
  withLiveDownloadActions,
} from "./downloadItems";

describe("collapseDownloadAttempts", () => {
  it("keeps only the newest outcome per video across job ids and URL forms", () => {
    const failed = buildDownloadNotification(
      "download-failed",
      { jobId: "a", url: "https://www.youtube.com/watch?v=Y4gQFJ_EeWA", error: "x" },
      1,
    );
    const done = buildDownloadNotification("download-finished", { jobId: "b", url: "https://youtu.be/Y4gQFJ_EeWA" }, 2);
    const other = buildDownloadNotification("download-failed", { jobId: "c", url: "https://youtu.be/dQw4w9WgXcQ" }, 3);
    const blocked = buildDownloadNotification("download-blocked", { error: "full" }, 0);
    const collapsed = collapseDownloadAttempts([failed, done, other, blocked]);
    expect(collapsed.map((i) => i.id)).toEqual(["download:c", "download:b", STORAGE_FULL_NOTIFICATION_ID]);
    expect(collapsed[1].ref.failedAttempts).toBe(1);
    expect(collapsed[0].ref.failedAttempts).toBeUndefined();
  });

  it("returns the same array when nothing collapses", () => {
    const list = [buildDownloadNotification("download-finished", { jobId: "a", url: "https://youtu.be/dQw4w9WgXcQ" })];
    expect(collapseDownloadAttempts(list)).toBe(list);
  });
});

describe("buildDownloadNotification", () => {
  it("builds a finished item with play and show in folder", () => {
    const n = buildDownloadNotification("download-finished", {
      jobId: "j1",
      title: "My video",
      outputPath: "C:\\vault\\My video.mp4",
    });
    expect(n.id).toBe("download:j1");
    expect(n.subtitle).toBe("My video.mp4");
    expect(n.actions).toEqual(["play", "show-in-folder"]);
  });

  it("keeps the first error line only", () => {
    const n = buildDownloadNotification("download-failed", { jobId: "j2", error: "boom\nstack" });
    expect(n.subtitle).toBe("boom");
    expect(n.title).toBe("Download failed");
    expect(n.actions).toEqual(["retry"]);
  });

  it("coalesces storage-full refusals into one row", () => {
    const a = buildDownloadNotification("download-blocked", { error: "full" }, 1);
    const b = buildDownloadNotification("download-blocked", { error: "full" }, 2);
    expect(a.id).toBe(STORAGE_FULL_NOTIFICATION_ID);
    const list = upsertItem(upsertItem([], { ...a, read: true }), b);
    expect(list).toHaveLength(1);
    expect(list[0].createdAt).toBe(2);
    expect(list[0].read).toBe(false);
    expect(list[0].actions).toEqual(["open-storage-settings"]);
  });

  it("keys a storage hold by its jobs", () => {
    const n = buildDownloadNotification("download-blocked", { jobIds: ["a", "b"] });
    expect(n.id).toBe("download:storage-block:a,b");
  });
});

describe("withLiveDownloadActions", () => {
  const failed = buildDownloadNotification("download-failed", { jobId: "j3" });
  const job = (status: DownloadJob["status"]) => ({ id: "j3", status }) as DownloadJob;

  it("offers retry while the failed job is still queued", () => {
    expect(withLiveDownloadActions([failed], [job("failed")])[0].actions).toEqual(["retry"]);
  });

  it("drops retry once the job is running again", () => {
    expect(withLiveDownloadActions([failed], [job("downloading")])[0].actions).toEqual([]);
  });

  it("drops retry when the job is gone and there is no URL to re-queue", () => {
    expect(withLiveDownloadActions([failed], [])[0].actions).toEqual([]);
  });

  it("keeps retry for a removed job that still has its URL", () => {
    const withUrl = buildDownloadNotification("download-failed", {
      jobId: "gone",
      url: "https://www.youtube.com/watch?v=3D7tcrMYo5M",
    });
    expect(withLiveDownloadActions([withUrl], [])[0].actions).toEqual(["retry"]);
  });

  it("drops retry while the same video is queued under a new job", () => {
    const withUrl = buildDownloadNotification("download-failed", {
      jobId: "old",
      url: "https://youtu.be/3D7tcrMYo5M",
    });
    const retried = {
      id: "new",
      status: "queued",
      url: "https://www.youtube.com/watch?v=3D7tcrMYo5M",
    } as DownloadJob;
    expect(withLiveDownloadActions([withUrl], [retried])[0].actions).toEqual([]);
  });
});
