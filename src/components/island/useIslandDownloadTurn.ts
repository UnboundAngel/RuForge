import { useEffect, useRef, useState } from "react";

import type { IslandDownload } from "./IslandDownloadContent";

/** Music holds the pill this long between download peeks. */
export const ISLAND_MUSIC_TURN_MS = 30_000;
/** A download peek lasts this long before music takes the pill back. */
export const ISLAND_DOWNLOAD_PEEK_MS = 5_000;
const CHECKPOINTS = [25, 50, 75] as const;

function checkpointReached(pct: number | null): number {
  if (pct == null) return 0;
  return CHECKPOINTS.filter((c) => pct >= c).length;
}

/** Changes whenever the download hits something worth a peek: new lead job, start, or a quarter of progress. */
export function islandDownloadMilestone(download: IslandDownload | null): string | null {
  if (!download) return null;
  return `${download.key}:${download.waiting ? "w" : checkpointReached(download.pct)}`;
}

/**
 * Whether the download holds the shared pill. A paused or held download stays up until it starts.
 * Otherwise music holds it and the download peeks in briefly on a timer and at each milestone.
 * `held` (pointer over the island) freezes whichever pill is showing.
 */
export function useIslandDownloadTurn(
  download: IslandDownload | null,
  enabled: boolean,
  held: boolean,
): boolean {
  const live = enabled && download != null;
  const waiting = download?.waiting ?? false;
  const milestone = islandDownloadMilestone(download);

  const [peek, setPeek] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const lastMilestoneRef = useRef<string | null>(null);

  useEffect(() => {
    if (!live) {
      lastMilestoneRef.current = null;
      setPeek(false);
      return;
    }
    if (lastMilestoneRef.current != null && lastMilestoneRef.current !== milestone) {
      setPeek(true);
      setEpoch((e) => e + 1);
    }
    lastMilestoneRef.current = milestone;
  }, [live, milestone]);

  useEffect(() => {
    if (!live || waiting || held) return;
    const timer = window.setTimeout(
      () => setPeek((v) => !v),
      peek ? ISLAND_DOWNLOAD_PEEK_MS : ISLAND_MUSIC_TURN_MS,
    );
    return () => window.clearTimeout(timer);
  }, [live, waiting, held, peek, epoch]);

  return live && (waiting || peek);
}
