import { invoke } from "@tauri-apps/api/core";
import type { GalleryEntry } from "@/types";
import type { DownloadEnqueueSource } from "@/downloadQueue";
import { isAudioOnlyPath } from "@/mediaKind";

const FLUSH_MS = 10_000;
const DAILY_SNAPSHOT_KEY = "ruforge-activity-library-snapshot-day";

export type MediaKind = "video" | "audio";
export type DownloadEntryPoint =
  | "paste"
  | "explorer"
  | "playlist_import"
  | "channel"
  | "cli"
  | "other";
export type WatchSurface = "main" | "mini";
export type WatchEndReason = "completed" | "switched" | "closed" | "abandoned";

/** Mirrors Rust ActivityBody (camelCase). Media type fields use `mediaKind` (tag is `kind`). */
export type ActivityEventInput =
  | { kind: "app_session_start" }
  | { kind: "app_session_end"; activeMinutes: number }
  | { kind: "download_queued"; entryPoint?: DownloadEntryPoint }
  | {
      kind: "download_finished";
      /** Library item id (YouTube `sourceId` when known). */
      itemId?: string;
      /** Queue job id. */
      jobId?: string;
      videoId?: string;
      title?: string;
      channelId?: string;
      channelName?: string;
      mediaKind?: MediaKind;
      /** Readable label: `2160p` / `1440p` / `1080p` / `720p` / `480p` / `360p` / `audio`. */
      quality?: string;
      /** Raw yt-dlp `-f` string. */
      formatSpec?: string;
      container?: string;
      bytes?: number;
      mediaDurationSec?: number;
      elapsedMs?: number;
      avgBps?: number;
      peakBps?: number;
      entryPoint?: DownloadEntryPoint;
      resumed?: boolean;
      resumedBytes?: number;
      retries?: number;
    }
  | {
      kind: "download_failed";
      errorClass: string;
      entryPoint?: DownloadEntryPoint;
      retries?: number;
    }
  | { kind: "download_canceled"; entryPoint?: DownloadEntryPoint }
  | { kind: "playlist_imported"; trackCount: number; source: string }
  | { kind: "playlist_downloaded"; itemCount: number }
  | {
      kind: "watch_session";
      itemId?: string;
      title?: string;
      channelName?: string;
      startedAt: number;
      /** Wall seconds spent watching while playing. */
      secondsWatched: number;
      /** Media seconds covered while playing. */
      mediaSecondsWatched: number;
      mediaDurationSec?: number;
      completed: boolean;
      effectiveSpeed: number;
      surface: WatchSurface;
      endReason: WatchEndReason;
      sponsorSkips: number;
      sponsorSecondsSkipped: number;
    }
  | { kind: "music_liked"; identityKey?: string }
  | { kind: "music_unliked"; identityKey?: string }
  | { kind: "music_playlist_created"; playlistId?: string }
  | { kind: "music_playlist_deleted"; playlistId?: string }
  | { kind: "music_tracks_added"; count: number; playlistId?: string }
  | { kind: "item_deleted"; bytes: number; mediaKind: MediaKind }
  | { kind: "cleanup_run"; items: number; bytes: number }
  | { kind: "tag_created"; tagId?: string }
  | {
      kind: "library_snapshot";
      items: number;
      bytes: number;
      hours: number;
      videoCount: number;
      audioCount: number;
    }
  | {
      kind: "game_session";
      gameId: string;
      gameName: string;
      startedAt: number;
      durationSec: number;
      /** Checkpoint chunk of a session already counted: adds time, not a session. */
      continued?: boolean;
    }
  | { kind: "guide_opened"; gameId: string; guideId: string };

let eventBuffer: Record<string, unknown>[] = [];
let counterBuffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersWired = false;

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushActivityLog();
  }, FLUSH_MS);
}

function toWire(event: ActivityEventInput): Record<string, unknown> {
  const wire: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) {
    if (v !== undefined) wire[k] = v;
  }
  return wire;
}

export function recordActivity(event: ActivityEventInput): void {
  try {
    eventBuffer.push(toWire(event));
    scheduleFlush();
  } catch (e) {
    console.warn("[activityLog] recordActivity failed", e);
  }
}

export function bumpCounter(id: string): void {
  try {
    if (!id.trim()) return;
    counterBuffer.push(id);
    scheduleFlush();
  } catch (e) {
    console.warn("[activityLog] bumpCounter failed", e);
  }
}

export async function flushActivityLog(): Promise<void> {
  const events = eventBuffer;
  const ids = counterBuffer;
  eventBuffer = [];
  counterBuffer = [];
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    if (events.length > 0) {
      await invoke("activity_record", { events });
    }
  } catch (e) {
    console.warn("[activityLog] activity_record failed", e);
  }
  try {
    if (ids.length > 0) {
      await invoke("activity_bump_counters", { ids });
    }
  } catch (e) {
    console.warn("[activityLog] activity_bump_counters failed", e);
  }
}

export function initActivityLog(): void {
  if (listenersWired || typeof document === "undefined") return;
  listenersWired = true;
  const onHide = () => {
    void flushActivityLog();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
  });
  window.addEventListener("pagehide", onHide);
  window.addEventListener("beforeunload", onHide);
}

export function mapEnqueueSourceToEntryPoint(
  source: DownloadEnqueueSource | undefined,
): DownloadEntryPoint {
  switch (source) {
    case "heroClipboardPaste":
    case "heroSingleDownload":
    case "heroUrlStaging":
    case "quickEnqueueClipboard":
    case "urlDrop":
      return "paste";
    case "explorerAdd":
      return "explorer";
    case "heroPlaylistDownload":
    case "musicPlaylistAdd":
      return "playlist_import";
    case "watchlistAdd":
    case "watchlistAuto":
    case "libraryFeedAdd":
      return "channel";
    case "notificationRetry":
      return "other";
    default:
      return "other";
  }
}

export function classifyDownloadError(error: string | null | undefined): string {
  const e = (error ?? "").toLowerCase();
  if (!e.trim()) return "unknown";
  if (e.includes("rate") || e.includes("429") || e.includes("too many")) return "rate_limit";
  if (e.includes("sign in") || e.includes("login") || e.includes("cookie") || e.includes("auth"))
    return "auth";
  if (e.includes("private") || e.includes("unavailable") || e.includes("removed"))
    return "unavailable";
  if (e.includes("stall") || e.includes("timed out") || e.includes("timeout")) return "timeout";
  if (e.includes("disk") || e.includes("space") || e.includes("nospace")) return "disk";
  if (e.includes("network") || e.includes("connection") || e.includes("resolve")) return "network";
  if (e.includes("ffmpeg") || e.includes("merge") || e.includes("postprocess")) return "process";
  return "other";
}

export function maybeRecordDailyLibrarySnapshot(entries: GalleryEntry[]): void {
  try {
    const day = new Date();
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    if (typeof localStorage !== "undefined" && localStorage.getItem(DAILY_SNAPSHOT_KEY) === key) {
      return;
    }
    let items = 0;
    let bytes = 0;
    let seconds = 0;
    let videoCount = 0;
    let audioCount = 0;
    const visit = (path: string, size: number, duration: number) => {
      items += 1;
      bytes += size;
      seconds += Math.max(0, duration);
      if (isAudioOnlyPath(path)) audioCount += 1;
      else videoCount += 1;
    };
    for (const entry of entries) {
      if (entry.kind === "media") {
        visit(entry.path, entry.size, entry.duration);
      } else {
        for (const f of entry.items) visit(f.path, f.size, f.duration);
      }
    }
    recordActivity({
      kind: "library_snapshot",
      items,
      bytes,
      hours: seconds / 3600,
      videoCount,
      audioCount,
    });
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DAILY_SNAPSHOT_KEY, key);
    }
  } catch (e) {
    console.warn("[activityLog] library snapshot failed", e);
  }
}

let watchEventId: string | null = null;
let watchLastTickMs: number | null = null;

export async function beginWatchSession(input: {
  itemId?: string;
  title?: string;
  channelName?: string;
  mediaDurationSec?: number;
  surface: WatchSurface;
}): Promise<void> {
  try {
    const res = await invoke<{ eventId: string }>("activity_watch_begin", {
      input: {
        itemId: input.itemId,
        title: input.title,
        channelName: input.channelName,
        mediaDurationSec: input.mediaDurationSec,
        surface: input.surface,
      },
    });
    watchEventId = res.eventId;
    watchLastTickMs = null;
  } catch (e) {
    console.warn("[activityLog] watch begin failed", e);
  }
}

export function tickWatchSession(speed = 1): void {
  if (!watchEventId) return;
  const now = performance.now();
  if (watchLastTickMs != null) {
    const deltaSec = (now - watchLastTickMs) / 1000;
    if (deltaSec > 0 && deltaSec < 4) {
      const id = watchEventId;
      const spd = speed > 0 && Number.isFinite(speed) ? speed : 1;
      void invoke("activity_watch_accumulate", {
        eventId: id,
        deltaSec,
        speed: spd,
        lastTickAt: Date.now(),
      }).catch((e) => {
        if (String(e).includes("No active watch session")) {
          watchEventId = null;
          watchLastTickMs = null;
          return;
        }
        console.warn("[activityLog] watch accumulate failed", e);
      });
    }
  }
  watchLastTickMs = now;
}

export function pauseWatchTick(): void {
  watchLastTickMs = null;
}

export function noteWatchSponsorSkip(seconds: number): void {
  if (!watchEventId) return;
  void invoke("activity_watch_sponsor_skip", {
    eventId: watchEventId,
    seconds: Math.max(0, seconds),
  }).catch((e) => console.warn("[activityLog] sponsor skip failed", e));
}

export async function transferWatchSession(surface: WatchSurface): Promise<void> {
  try {
    await invoke("activity_watch_transfer", { surface });
  } catch (e) {
    console.warn("[activityLog] watch transfer failed", e);
  }
}

export async function endWatchSession(endReason: WatchEndReason): Promise<void> {
  const id = watchEventId;
  watchEventId = null;
  watchLastTickMs = null;
  if (!id) return;
  try {
    await invoke("activity_watch_end", { eventId: id, endReason });
  } catch (e) {
    console.warn("[activityLog] watch end failed", e);
  }
}

export function getActiveWatchEventId(): string | null {
  return watchEventId;
}

/** @internal test helpers */
export function __activityLogTestReset(): void {
  eventBuffer = [];
  counterBuffer = [];
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  watchEventId = null;
  watchLastTickMs = null;
}

export function __activityLogTestBuffers(): {
  events: Record<string, unknown>[];
  counters: string[];
} {
  return { events: [...eventBuffer], counters: [...counterBuffer] };
}
