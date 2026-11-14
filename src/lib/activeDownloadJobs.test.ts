import { describe, expect, it } from "vitest";
import type { DownloadJob } from "@/downloadQueue";
import {
  activeDownloadJobs,
  activeDownloadsLabel,
  averageDownloadPct,
  noneTransferStarted,
} from "./activeDownloadJobs";

function job(id: string, status: DownloadJob["status"], pct?: number): DownloadJob {
  return {
    id,
    status,
    progress: pct == null ? undefined : { percentage: pct },
  } as unknown as DownloadJob;
}

describe("activeDownloadJobs", () => {
  it("keeps only downloading jobs", () => {
    const jobs = [job("a", "downloading"), job("b", "queued"), job("c", "downloading")];
    expect(activeDownloadJobs(jobs).map((j) => j.id)).toEqual(["a", "c"]);
  });

  it("averages fractions and clamps", () => {
    expect(averageDownloadPct([job("a", "downloading", 20), job("b", "downloading", 60)])).toBe(40);
    expect(averageDownloadPct([job("a", "downloading", 250)])).toBe(100);
    expect(averageDownloadPct([])).toBe(0);
  });

  it("reports preparing only when no job has bytes", () => {
    expect(noneTransferStarted([job("a", "downloading"), job("b", "downloading", 0)])).toBe(true);
    expect(noneTransferStarted([job("a", "downloading"), job("b", "downloading", 5)])).toBe(false);
  });

  it("labels one job by title and several by count", () => {
    const one = [job("a", "downloading")];
    const two = [job("a", "downloading"), job("b", "downloading")];
    expect(activeDownloadsLabel(one, () => "Song")).toBe("Song");
    expect(activeDownloadsLabel(two, () => "Song")).toBe("2 downloading");
    expect(activeDownloadsLabel([], () => "Song")).toBeNull();
  });
});
