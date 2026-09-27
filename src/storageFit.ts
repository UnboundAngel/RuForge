import type { DownloadJob } from "./downloadQueue";
import { downloadJobDisplayFileSizeBytes } from "./downloadJobFileSizes";
import { mediaPathsMatch } from "./lib/mediaPathMatch";

export const NOT_ENOUGH_STORAGE_LABEL = "Not enough storage";

/** yt-dlp size hints miss muxing overhead and some formats run over, so pad every estimate. */
export const STORAGE_ESTIMATE_MARGIN = 1.1;

/** Never plan to fill a disk to the last byte; the OS, temp files and ffmpeg need room too. */
export const FREE_DISK_FLOOR_BYTES = 1024 ** 3;

/**
 * - **disk**: the target volume lacks free space.
 * - **cap**: the internal vault would pass the user's storage limit.
 */
export type StorageBlockReason = "disk" | "cap";

/** Mirrors Rust `get_disk_space`. */
export type DiskSpaceProbe = {
  dir: string;
  volume: string | null;
  freeBytes: number | null;
};

export type VaultCap = {
  dir: string;
  usedBytes: number;
  limitBytes: number;
};

export type StorageFitContext = {
  disks: DiskSpaceProbe[];
  /** Null when the vault is not the save target or no limit applies. */
  vaultCap: VaultCap | null;
};

export function downloadJobEstimateBytes(job: DownloadJob): number | null {
  return downloadJobDisplayFileSizeBytes(job.metadata, job.options.audioOnly);
}

function normDir(dir: string): string {
  return dir.trim().replace(/[\\/]+$/, "");
}

function findProbe(disks: DiskSpaceProbe[], dir: string): DiskSpaceProbe | null {
  const d = normDir(dir);
  return disks.find((p) => mediaPathsMatch(normDir(p.dir), d)) ?? null;
}

function volumeKey(disks: DiskSpaceProbe[], dir: string): string {
  return findProbe(disks, dir)?.volume ?? `dir:${normDir(dir).toLowerCase()}`;
}

function remainingFraction(job: DownloadJob): number {
  const pct = job.progress?.percentage;
  if (typeof pct !== "number" || !Number.isFinite(pct)) return 1;
  return Math.min(1, Math.max(0, 1 - pct / 100));
}

const CANDIDATE_RANK: Record<string, number> = { auto: 0, pending: 1, held: 2 };

/**
 * Decides which queued jobs cannot fit. Jobs already downloading reserve their remaining bytes
 * first, then queued jobs claim space in the order the pump would start them. Jobs with no size
 * estimate are never blocked and reserve nothing, since blocking on a guess would stall every
 * link whose metadata has not hydrated yet.
 */
export function planStorageFit(
  jobs: DownloadJob[],
  ctx: StorageFitContext,
): Map<string, StorageBlockReason> {
  const blocked = new Map<string, StorageBlockReason>();
  const diskReserved = new Map<string, number>();
  let capReserved = 0;
  const cap = ctx.vaultCap && ctx.vaultCap.limitBytes > 0 ? ctx.vaultCap : null;
  const inVault = (job: DownloadJob) => !!cap && mediaPathsMatch(normDir(job.options.outputDir), normDir(cap.dir));

  for (const job of jobs) {
    if (job.status !== "downloading" && job.status !== "paused") continue;
    const est = downloadJobEstimateBytes(job);
    if (est == null) continue;
    const key = volumeKey(ctx.disks, job.options.outputDir);
    const padded = est * STORAGE_ESTIMATE_MARGIN;
    diskReserved.set(key, (diskReserved.get(key) ?? 0) + padded * remainingFraction(job));
    // Stats skip .part files, so the whole in-flight file still counts against the cap.
    if (inVault(job)) capReserved += padded;
  }

  const candidates = jobs
    .map((job, index) => ({ job, index }))
    .filter(({ job }) => job.status === "queued" && job.approval !== "manual")
    .sort(
      (a, b) =>
        (CANDIDATE_RANK[a.job.approval] ?? 3) - (CANDIDATE_RANK[b.job.approval] ?? 3) ||
        a.index - b.index,
    );

  for (const { job } of candidates) {
    const est = downloadJobEstimateBytes(job);
    if (est == null) continue;
    const need = est * STORAGE_ESTIMATE_MARGIN;
    const probe = findProbe(ctx.disks, job.options.outputDir);
    const key = volumeKey(ctx.disks, job.options.outputDir);
    const reserved = diskReserved.get(key) ?? 0;
    const free = probe?.freeBytes;
    if (typeof free === "number" && reserved + need > free - FREE_DISK_FLOOR_BYTES) {
      blocked.set(job.id, "disk");
      continue;
    }
    if (cap && inVault(job) && cap.usedBytes + capReserved + need > cap.limitBytes) {
      blocked.set(job.id, "cap");
      continue;
    }
    diskReserved.set(key, reserved + need);
    if (inVault(job)) capReserved += need;
  }

  return blocked;
}

/**
 * Writes `storageBlock` onto jobs from a fresh plan. Returns the same array when nothing changed
 * so store updates stay cheap, plus the jobs the user asked to start that just became blocked.
 */
export function applyStorageFit(
  jobs: DownloadJob[],
  ctx: StorageFitContext,
): { jobs: DownloadJob[]; newlyBlocked: DownloadJob[] } {
  const plan = planStorageFit(jobs, ctx);
  const newlyBlocked: DownloadJob[] = [];
  let changed = false;
  const next = jobs.map((job) => {
    const reason = plan.get(job.id) ?? null;
    if ((job.storageBlock ?? null) === reason) return job;
    changed = true;
    const updated = { ...job, storageBlock: reason };
    if (reason && !job.storageBlock && job.approval !== "held") newlyBlocked.push(updated);
    return updated;
  });
  return { jobs: changed ? next : jobs, newlyBlocked };
}
