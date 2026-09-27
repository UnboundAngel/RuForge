import { describe, expect, it } from "vitest";
import type { DownloadJob, DownloadJobApproval, DownloadJobStatus } from "./downloadQueue";
import {
  applyStorageFit,
  FREE_DISK_FLOOR_BYTES,
  STORAGE_ESTIMATE_MARGIN,
  planStorageFit,
  type DiskSpaceProbe,
} from "./storageFit";

const MB = 1024 ** 2;
const GB = 1024 ** 3;

function job(
  id: string,
  sizeBytes: number | null,
  opts: {
    status?: DownloadJobStatus;
    approval?: DownloadJobApproval;
    outputDir?: string;
    pct?: number;
    audioOnly?: boolean;
  } = {},
): DownloadJob {
  return {
    id,
    url: `https://youtu.be/${id}`,
    status: opts.status ?? "queued",
    approval: opts.approval ?? "auto",
    progress:
      opts.pct == null ? null : ({ percentage: opts.pct } as unknown as DownloadJob["progress"]),
    createdAt: 0,
    metadata:
      sizeBytes == null
        ? null
        : ({
            title: id,
            thumbnail: "t",
            duration: 1,
            fileSizeBytes: null,
            fileSizeBytesVideo: sizeBytes,
            fileSizeBytesAudio: Math.round(sizeBytes / 10),
          } as unknown as DownloadJob["metadata"]),
    options: {
      format: "best",
      outputDir: opts.outputDir ?? "D:\\Media",
      filenameTemplate: "",
      browserCookies: "",
      cookieFile: "",
      subLangs: "",
      audioOnly: opts.audioOnly ?? false,
      audioFormat: "mp3",
      autoScrubberPreviews: false,
      stampArtistTags: false,
      downloadComments: false,
    },
  };
}

function disk(dir: string, freeBytes: number | null, volume = "D:"): DiskSpaceProbe {
  return { dir, volume, freeBytes };
}

describe("planStorageFit", () => {
  it("lets a job through when the padded estimate fits above the floor", () => {
    const free = FREE_DISK_FLOOR_BYTES + 500 * MB * STORAGE_ESTIMATE_MARGIN + 1;
    const out = planStorageFit([job("a", 500 * MB)], {
      disks: [disk("D:\\Media", free)],
      vaultCap: null,
    });
    expect(out.size).toBe(0);
  });

  it("blocks a job that only fits without the safety margin", () => {
    const free = FREE_DISK_FLOOR_BYTES + 500 * MB;
    const out = planStorageFit([job("a", 500 * MB)], {
      disks: [disk("D:\\Media", free)],
      vaultCap: null,
    });
    expect(out.get("a")).toBe("disk");
  });

  it("never blocks jobs without a size estimate", () => {
    const out = planStorageFit([job("a", null)], {
      disks: [disk("D:\\Media", 0)],
      vaultCap: null,
    });
    expect(out.size).toBe(0);
  });

  it("does not block when free space is unknown", () => {
    const out = planStorageFit([job("a", 50 * GB)], {
      disks: [disk("D:\\Media", null)],
      vaultCap: null,
    });
    expect(out.size).toBe(0);
  });

  it("enqueues what fits in pump order and marks the rest", () => {
    const free = FREE_DISK_FLOOR_BYTES + 2.5 * GB;
    const jobs = [
      job("held", 1 * GB, { approval: "held" }),
      job("a1", 1 * GB),
      job("a2", 1 * GB),
    ];
    const out = planStorageFit(jobs, { disks: [disk("D:\\Media", free)], vaultCap: null });
    expect([...out.entries()]).toEqual([["held", "disk"]]);
  });

  it("reserves only the remaining bytes of in-flight jobs on the same volume", () => {
    const free = FREE_DISK_FLOOR_BYTES + 1.2 * GB;
    const running = job("run", 2 * GB, { status: "downloading", pct: 75 });
    const next = job("next", 500 * MB);
    const out = planStorageFit([running, next], {
      disks: [disk("D:\\Media", free)],
      vaultCap: null,
    });
    expect(out.size).toBe(0);

    const early = job("run", 2 * GB, { status: "downloading", pct: 10 });
    expect(
      planStorageFit([early, next], { disks: [disk("D:\\Media", free)], vaultCap: null }).get(
        "next",
      ),
    ).toBe("disk");
  });

  it("pools different folders that share a volume, but not separate volumes", () => {
    const free = FREE_DISK_FLOOR_BYTES + 1.5 * GB;
    const jobs = [
      job("a", 1 * GB, { outputDir: "D:\\Media" }),
      job("b", 1 * GB, { outputDir: "D:\\Other" }),
      job("c", 1 * GB, { outputDir: "E:\\Media" }),
    ];
    const out = planStorageFit(jobs, {
      disks: [
        disk("D:\\Media", free),
        disk("D:\\Other", free),
        disk("E:\\Media", free, "E:"),
      ],
      vaultCap: null,
    });
    expect([...out.keys()]).toEqual(["b"]);
  });

  it("blocks vault jobs past the user cap even with free disk", () => {
    const vault = "C:\\Users\\me\\AppData\\RuForge";
    const jobs = [job("a", 1 * GB, { outputDir: vault }), job("b", 1 * GB, { outputDir: "D:\\Media" })];
    const out = planStorageFit(jobs, {
      disks: [disk(vault, 500 * GB, "C:"), disk("D:\\Media", 500 * GB)],
      vaultCap: { dir: vault, usedBytes: 9.5 * GB, limitBytes: 10 * GB },
    });
    expect([...out.entries()]).toEqual([["a", "cap"]]);
  });

  it("counts whole in-flight vault files against the cap since stats skip partial files", () => {
    const vault = "C:/vault/";
    const running = job("run", 1 * GB, { outputDir: "C:\\vault", status: "downloading", pct: 90 });
    const next = job("next", 400 * MB, { outputDir: "C:\\vault" });
    const out = planStorageFit([running, next], {
      disks: [disk(vault, 500 * GB, "C:")],
      vaultCap: { dir: vault, usedBytes: 8.8 * GB, limitBytes: 10 * GB },
    });
    expect(out.get("next")).toBe("cap");
  });

  it("uses the audio estimate for audio-only jobs", () => {
    const free = FREE_DISK_FLOOR_BYTES + 200 * MB;
    const out = planStorageFit([job("a", 1 * GB, { audioOnly: true })], {
      disks: [disk("D:\\Media", free)],
      vaultCap: null,
    });
    expect(out.size).toBe(0);
  });

  it("ignores manual, completed and failed jobs", () => {
    const jobs = [
      job("m", 5 * GB, { approval: "manual" }),
      job("c", 5 * GB, { status: "completed" }),
      job("f", 5 * GB, { status: "failed" }),
    ];
    const out = planStorageFit(jobs, { disks: [disk("D:\\Media", 0)], vaultCap: null });
    expect(out.size).toBe(0);
  });
});

describe("applyStorageFit", () => {
  it("keeps the array identity when nothing changes", () => {
    const jobs = [job("a", 1 * MB)];
    const out = applyStorageFit(jobs, { disks: [disk("D:\\Media", 50 * GB)], vaultCap: null });
    expect(out.jobs).toBe(jobs);
    expect(out.newlyBlocked).toEqual([]);
  });

  it("flags blocked rows, reports only started ones, and clears flags once space returns", () => {
    const jobs = [job("held", 5 * GB, { approval: "held" }), job("auto", 5 * GB)];
    const full = applyStorageFit(jobs, { disks: [disk("D:\\Media", 2 * GB)], vaultCap: null });
    expect(full.jobs.map((j) => j.storageBlock)).toEqual(["disk", "disk"]);
    expect(full.newlyBlocked.map((j) => j.id)).toEqual(["auto"]);

    const again = applyStorageFit(full.jobs, { disks: [disk("D:\\Media", 2 * GB)], vaultCap: null });
    expect(again.newlyBlocked).toEqual([]);

    const roomy = applyStorageFit(full.jobs, { disks: [disk("D:\\Media", 50 * GB)], vaultCap: null });
    expect(roomy.jobs.map((j) => j.storageBlock)).toEqual([null, null]);
  });
});
