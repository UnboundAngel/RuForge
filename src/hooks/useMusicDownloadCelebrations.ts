import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DownloadJob } from "@/downloadQueue";
import { jobHasDownloadTransferStarted } from "@/downloadQueue";
import { jobWasActive } from "@/lib/musicExploreDownloadStatus";
import { takeMusicDownloadManualCancel } from "@/lib/musicDownloadManualCancel";
import { extractYouTubeVideoId, youtubeUrlsMatch } from "@/youtubeUrl";
import type { CollapsedCelebrate } from "@/components/music/MusicExploreDownloadCollapsed";

export const MUSIC_DOWNLOAD_CELEBRATE_HOLD_MS = 2100;

function clampStartPct(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(99, Math.max(0, raw));
}

function thumbForJob(job: DownloadJob): string | null {
  const fromMeta = job.metadata?.thumbnail?.trim();
  if (fromMeta) return fromMeta;
  const videoId = extractYouTubeVideoId(job.url);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

function jobShowedIndeterminateProgress(job: DownloadJob): boolean {
  const pct = job.progress?.percentage ?? 0;
  if (pct >= 100) return false;
  return (
    job.status === "queued" ||
    job.status === "paused" ||
    (job.status === "downloading" && !jobHasDownloadTransferStarted(job))
  );
}

function terminalPayload(prevJob: DownloadJob, kind: CollapsedCelebrate["kind"]): CollapsedCelebrate {
  const holdIndeterminate = kind === "cancel" && jobShowedIndeterminateProgress(prevJob);
  return {
    kind,
    url: prevJob.url,
    title: prevJob.title?.trim() || prevJob.metadata?.title?.trim() || "Track",
    thumbnail: thumbForJob(prevJob),
    startPct: clampStartPct(prevJob.progress?.percentage ?? 0),
    ...(holdIndeterminate ? { holdIndeterminate: true } : {}),
  };
}

export function detectDownloadJobCelebrations(
  prev: DownloadJob[],
  next: DownloadJob[],
): CollapsedCelebrate[] {
  const out: CollapsedCelebrate[] = [];
  const handled = new Set<string>();

  for (const prevJob of prev) {
    if (!jobWasActive(prevJob)) continue;

    const key = extractYouTubeVideoId(prevJob.url) ?? prevJob.url;
    if (handled.has(key)) continue;

    if (next.some((j) => youtubeUrlsMatch(j.url, prevJob.url) && jobWasActive(j))) {
      continue;
    }

    const cur = next.find((j) => youtubeUrlsMatch(j.url, prevJob.url));
    if (cur?.status === "failed") continue;
    if (cur?.status === "timed_out") {
      if (prev.some((j) => j.id === cur.id && j.status === "timed_out")) continue;
    }

    handled.add(key);

    if (takeMusicDownloadManualCancel(prevJob.url)) {
      out.push(terminalPayload(prevJob, "cancel"));
      continue;
    }

    out.push({
      ...terminalPayload(prevJob, "complete"),
      warning: cur?.status === "timed_out",
    });
  }

  return out;
}

export function useMusicDownloadCelebrations(downloadJobs: DownloadJob[]) {
  const prevRef = useRef(downloadJobs);
  const pendingRef = useRef<CollapsedCelebrate[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [celebrating, setCelebrating] = useState<CollapsedCelebrate | null>(null);

  const processNextRef = useRef<() => void>(() => {});

  const processNext = useCallback(() => {
    if (timerRef.current) return;
    const next = pendingRef.current.shift();
    if (!next) {
      setCelebrating(null);
      return;
    }
    setCelebrating(next);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setCelebrating(null);
      processNextRef.current();
    }, MUSIC_DOWNLOAD_CELEBRATE_HOLD_MS);
  }, []);

  processNextRef.current = processNext;

  const enqueue = useCallback(
    (items: CollapsedCelebrate[]) => {
      if (items.length === 0) return;
      pendingRef.current.push(...items);
      if (!timerRef.current) {
        processNext();
      }
    },
    [processNext],
  );

  useLayoutEffect(() => {
    const prev = prevRef.current;
    prevRef.current = downloadJobs;
    enqueue(detectDownloadJobCelebrations(prev, downloadJobs));
  }, [downloadJobs, enqueue]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return celebrating;
}
