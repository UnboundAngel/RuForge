import { invoke } from "@tauri-apps/api/core";

export type StatValue<T> = {
  value: T;
  liveOnly: boolean;
  sampleSize: number;
};

export type StatsRange =
  | "7d"
  | "30d"
  | "year"
  | "all"
  | { from: number; to: number };

export type AreaTotals = {
  downloads: StatValue<number>;
  downloadBytes: StatValue<number>;
  downloadMediaSec: StatValue<number>;
  watchSec: StatValue<number>;
  listenSec: StatValue<number>;
  activeMinutes: StatValue<number>;
  resumedBytes: StatValue<number>;
  sponsorSecondsSkipped: StatValue<number>;
  speedSavedSec: StatValue<number>;
  playlistImports: StatValue<number>;
  gameSec: StatValue<number>;
};

export type StatsSummary = {
  current: AreaTotals;
  previous: AreaTotals;
};

export type TopRow = {
  key: string;
  label: string;
  count: StatValue<number>;
  bytes?: StatValue<number> | null;
  seconds?: StatValue<number> | null;
};

export type CalendarDay = {
  date: string;
  downloads: StatValue<number>;
  watchSec: StatValue<number>;
  listenSec: StatValue<number>;
  activeMinutes: StatValue<number>;
};

export type ClockMatrix = {
  cells: StatValue<number>[][];
};

export type StatsStreaks = {
  currentDayStreak: StatValue<number>;
  bestDayStreak: StatValue<number>;
  currentDownloadStreak: StatValue<number>;
  bestDownloadStreak: StatValue<number>;
  daysActive: StatValue<number>;
  memberSince: StatValue<number | null>;
};

export type FastestDownload = {
  peakBps: number;
  title?: string | null;
  ts: number;
};

export type BiggestDay = {
  date: string;
  downloads: number;
};

export type LongestBinge = {
  seconds: number;
  startedAt: number;
  endedAt: number;
  titles: string[];
};

export type StatsBests = {
  fastestDownload: StatValue<FastestDownload | null>;
  biggestDownloadDay: StatValue<BiggestDay | null>;
  longestBinge: StatValue<LongestBinge | null>;
  longestGameSession: StatValue<number | null>;
  mostPlaysOneTrackDay: StatValue<number | null>;
  largestFile: StatValue<number | null>;
};

export type StatsItemQuery = {
  itemId?: string;
  identityKey?: string;
  channel?: string;
  gameId?: string;
};

export type StatsItemDetail = {
  count: StatValue<number>;
  firstTs: StatValue<number | null>;
  lastTs: StatValue<number | null>;
  timeline: { date: string; count: number }[];
};

export type MilestoneRow = {
  id: string;
  title: string;
  subtitle: string;
  crossedAt: number;
};

export type MilestoneNote = {
  id: string;
  title: string;
  subtitle: string;
  createdAt: number;
  /** Personal-best rows only: bytes/s or seconds. */
  value?: number;
  previous?: number;
  titles?: string[];
};

export function isStatValue(v: unknown): v is StatValue<unknown> {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    "value" in o &&
    typeof o.liveOnly === "boolean" &&
    typeof o.sampleSize === "number" &&
    Number.isFinite(o.sampleSize)
  );
}

export function isStatsSummary(v: unknown): v is StatsSummary {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return isAreaTotals(o.current) && isAreaTotals(o.previous);
}

function isAreaTotals(v: unknown): v is AreaTotals {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isStatValue(o.downloads) &&
    isStatValue(o.downloadBytes) &&
    isStatValue(o.watchSec) &&
    isStatValue(o.listenSec)
  );
}

export function isMilestoneNote(v: unknown): v is MilestoneNote {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.subtitle === "string" &&
    typeof o.createdAt === "number"
  );
}

export function statsSummary(range: StatsRange): Promise<StatsSummary> {
  return invoke("stats_summary", { range });
}

export function statsTop(
  area: string,
  metric: string,
  range: StatsRange,
  limit?: number,
): Promise<TopRow[]> {
  return invoke("stats_top", { area, metric, range, limit });
}

export function statsCalendar(year: number): Promise<CalendarDay[]> {
  return invoke("stats_calendar", { year });
}

export function statsClock(area: string, range: StatsRange): Promise<ClockMatrix> {
  return invoke("stats_clock", { area, range });
}

export function statsStreaks(): Promise<StatsStreaks> {
  return invoke("stats_streaks");
}

export function statsBests(): Promise<StatsBests> {
  return invoke("stats_bests");
}

export function statsItem(query: StatsItemQuery): Promise<StatsItemDetail> {
  return invoke("stats_item", { query });
}

export function statsMilestones(): Promise<MilestoneRow[]> {
  return invoke("stats_milestones");
}

export function statsTakeMilestoneNotes(): Promise<MilestoneNote[]> {
  return invoke("stats_take_milestone_notes");
}
