import type {
  DownloadEnqueueSource,
  DownloadJob,
  DownloadJobApproval,
  DownloadJobMediaSnapshot,
  DownloadJobOptions,
} from "../downloadQueue";
import { useRuforgeStore } from "../store/ruforgeStore";

const LS_KEY = "ruforge-dev-last-batch-v1";
const REPLAY_MODE_KEY = "ruforge-dev-replay-mode";
const DEV_SIMULATE_MS_LS_KEY = "ruforge-dev-simulate-ms";

export const DEV_SIMULATE_DOWNLOAD_MIN_MS = 4000;
export const DEV_SIMULATE_DOWNLOAD_MAX_MS = 8000;
export const DEV_SIMULATE_PROCESSING_MS = 350;

/** Fixed duration override from localStorage; null means roll per job. */
export function getDevSimulateDownloadMs(): number | null {
  try {
    const raw = localStorage.getItem(DEV_SIMULATE_MS_LS_KEY);
    if (raw != null) {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 200) return n;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function rollDevSimulateDownloadMs(): number {
  const span = DEV_SIMULATE_DOWNLOAD_MAX_MS - DEV_SIMULATE_DOWNLOAD_MIN_MS;
  return DEV_SIMULATE_DOWNLOAD_MIN_MS + Math.floor(Math.random() * (span + 1));
}

export type LastBatchItem = {
  url: string;
  source: DownloadEnqueueSource;
  approval: DownloadJobApproval;
  snapshot?: DownloadJobMediaSnapshot | null;
  options?: Pick<
    DownloadJobOptions,
    "playlistOutputFolder" | "playlistIndex" | "audioOnly"
  >;
};

export type LastDownloadBatchRecord = {
  v: 1;
  capturedAt: number;
  batchKind: "heldRelease" | "playlist" | "single" | "quick" | "mixed";
  heroUrl?: string | null;
  heroVideoInfo?: DownloadJobMediaSnapshot | null;
  playlistItemAudioOverrides?: Record<string, boolean>;
  items: LastBatchItem[];
  outputPathsByUrl?: Record<string, string>;
};

export type DevReplayMode = "real" | "simulate";

export function devBatchToolsEnabled(): boolean {
  return (
    import.meta.env.DEV &&
    useRuforgeStore.getState().settings.showDebuggingSettings === true
  );
}

export function readLastDownloadBatchRecord(): LastDownloadBatchRecord | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastDownloadBatchRecord;
    if (parsed?.v !== 1 || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLastDownloadBatchRecord(record: LastDownloadBatchRecord): void {
  localStorage.setItem(LS_KEY, JSON.stringify(record));
}

export function clearLastDownloadBatchRecord(): void {
  localStorage.removeItem(LS_KEY);
}

export function getDevReplayMode(): DevReplayMode {
  try {
    const raw = localStorage.getItem(REPLAY_MODE_KEY);
    return raw === "simulate" ? "simulate" : "real";
  } catch {
    return "real";
  }
}

export function setDevReplayMode(mode: DevReplayMode): void {
  localStorage.setItem(REPLAY_MODE_KEY, mode);
}

let devReplaySimulateActive = false;

export function isDevReplaySimulateActive(): boolean {
  return devReplaySimulateActive;
}

export function setDevReplaySimulateActive(active: boolean): void {
  devReplaySimulateActive = active;
}

let devReplayOutputCaptureActive = false;
let replayOutputPaths: Record<string, string> = {};

export function beginReplayOutputCapture(): void {
  devReplayOutputCaptureActive = true;
  replayOutputPaths = {};
}

export function endReplayOutputCapture(): Record<string, string> {
  devReplayOutputCaptureActive = false;
  const out = replayOutputPaths;
  replayOutputPaths = {};
  return out;
}

export function isDevReplayOutputCaptureActive(): boolean {
  return devReplayOutputCaptureActive;
}

export function appendReplayOutputPath(url: string, outputPath: string): void {
  if (!devReplayOutputCaptureActive) return;
  const trimmed = url.trim();
  const path = outputPath.trim();
  if (!trimmed || !path) return;
  replayOutputPaths[trimmed] = path;
}

export function appendOutputPathToLastBatch(
  url: string,
  outputPath: string,
): void {
  if (!devBatchToolsEnabled()) return;
  const record = readLastDownloadBatchRecord();
  if (!record) return;
  const trimmedUrl = url.trim();
  const trimmedPath = outputPath.trim();
  if (!trimmedUrl || !trimmedPath) return;
  const next: LastDownloadBatchRecord = {
    ...record,
    outputPathsByUrl: {
      ...(record.outputPathsByUrl ?? {}),
      [trimmedUrl]: trimmedPath,
    },
  };
  writeLastDownloadBatchRecord(next);
}

function jobToBatchItem(job: DownloadJob): LastBatchItem {
  const { playlistOutputFolder, playlistIndex, audioOnly } = job.options;
  return {
    url: job.url,
    source: job.enqueueSource ?? "heroSingleDownload",
    approval: job.approval,
    snapshot: job.metadata ?? null,
    options: {
      playlistOutputFolder: playlistOutputFolder ?? undefined,
      playlistIndex: playlistIndex ?? undefined,
      audioOnly,
    },
  };
}

function computeBatchKind(
  sources: DownloadEnqueueSource[],
): LastDownloadBatchRecord["batchKind"] {
  const uniq = new Set(sources);
  if (uniq.size > 1) return "mixed";
  const only = [...uniq][0];
  switch (only) {
    case "explorerAdd":
      return "heldRelease";
    case "heroPlaylistDownload":
      return "playlist";
    case "quickEnqueueClipboard":
      return "quick";
    default:
      return "single";
  }
}

type BatchCaptureInput = {
  batchKind?: LastDownloadBatchRecord["batchKind"];
  heroUrl?: string | null;
  heroVideoInfo?: DownloadJobMediaSnapshot | null;
  playlistItemAudioOverrides?: Record<string, boolean>;
  items: LastBatchItem[];
};

export function commitLastDownloadBatchRecord(input: BatchCaptureInput): void {
  if (!devBatchToolsEnabled()) return;
  if (input.items.length === 0) return;

  const sources = input.items.map((i) => i.source);
  const batchKind = input.batchKind ?? computeBatchKind(sources);

  const record: LastDownloadBatchRecord = {
    v: 1,
    capturedAt: Date.now(),
    batchKind,
    heroUrl: input.heroUrl ?? null,
    heroVideoInfo: input.heroVideoInfo ?? null,
    playlistItemAudioOverrides: input.playlistItemAudioOverrides,
    items: input.items,
    outputPathsByUrl: readLastDownloadBatchRecord()?.outputPathsByUrl,
  };
  writeLastDownloadBatchRecord(record);
}

export function commitLastDownloadBatchFromJobs(
  jobs: DownloadJob[],
  ctx?: {
    batchKind?: LastDownloadBatchRecord["batchKind"];
    heroUrl?: string | null;
    heroVideoInfo?: DownloadJobMediaSnapshot | null;
    playlistItemAudioOverrides?: Record<string, boolean>;
  },
): void {
  const sorted = [...jobs].sort((a, b) => a.createdAt - b.createdAt);
  commitLastDownloadBatchRecord({
    ...ctx,
    items: sorted.map(jobToBatchItem),
  });
}

export function formatLastBatchSummary(
  record: LastDownloadBatchRecord | null,
): string {
  if (!record) return "No batch captured yet.";
  const ageMin = Math.max(0, Math.round((Date.now() - record.capturedAt) / 60_000));
  const sources = [...new Set(record.items.map((i) => i.source))].join(", ");
  const ageLabel = ageMin < 1 ? "just now" : `${ageMin}m ago`;
  return `${record.items.length} item(s), ${record.batchKind}, ${ageLabel}. Sources: ${sources}`;
}
