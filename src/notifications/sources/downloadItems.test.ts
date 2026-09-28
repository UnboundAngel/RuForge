import { describe, expect, it } from "vitest";
import type { DownloadJob } from "@/downloadQueue";
import { upsertItem } from "../notificationCenterStore";
import {
  STORAGE_FULL_NOTIFICATION_ID,
  buildDownloadNotification,
  withLiveDownloadActions,
} from "./downloadItems";

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

  it("drops retry once the job is gone or running again", () => {
    expect(withLiveDownloadActions([failed], [])[0].actions).toEqual([]);
    expect(withLiveDownloadActions([failed], [job("downloading")])[0].actions).toEqual([]);
  });
});
