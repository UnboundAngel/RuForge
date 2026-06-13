import { invoke } from "@tauri-apps/api/core";
import type { MediaFile } from "@/types";
import { primaryArtist } from "@/components/music/musicArtist";
import { musicTrackIdentityKey } from "@/components/music/musicShelfDedup";
import { refreshListenSnapshot } from "./musicListenSnapshot";
import type {
  ListenEndReason,
  ListenSurface,
  ListenTrackMeta,
  PlaySource,
} from "./musicListenTypes";

const ACCUMULATE_FLUSH_SEC = 15;

let pendingEndReason: ListenEndReason | null = null;

export function setPendingListenEndReason(reason: ListenEndReason | null): void {
  pendingEndReason = reason;
}

export function takePendingListenEndReason(): ListenEndReason {
  const r = pendingEndReason ?? "manual_switch";
  pendingEndReason = null;
  return r;
}

let activeEventId: string | null = null;
let activeIdentityKey: string | null = null;
let listenAccumSec = 0;
let lastListenTickMs: number | null = null;
let handoffEventId: string | null = null;

export function trackMetaFromFile(file: MediaFile): ListenTrackMeta {
  const artist = file.artist ?? file.albumArtist ?? "";
  return {
    identityKey: musicTrackIdentityKey(file, primaryArtist),
    path: file.path,
    title: file.name ?? "",
    artist,
  };
}

export function getActiveListenEventId(): string | null {
  return activeEventId;
}

export function peekHandoffListenEventId(): string | null {
  return handoffEventId;
}

export function takeHandoffListenEventId(): string | null {
  const id = handoffEventId;
  handoffEventId = null;
  return id;
}

export function stageHandoffListenEventId(eventId: string): void {
  handoffEventId = eventId;
}

export function resetListenAccumulator(): void {
  listenAccumSec = 0;
  lastListenTickMs = null;
}

export function tickListenAccumulator(): void {
  const now = performance.now();
  if (lastListenTickMs != null) {
    const deltaSec = (now - lastListenTickMs) / 1000;
    if (deltaSec > 0 && deltaSec < 4) {
      listenAccumSec += deltaSec;
    }
  }
  lastListenTickMs = now;
}

export function pauseListenAccumulator(): void {
  lastListenTickMs = null;
}

function clearStaleListenSessionState(): void {
  activeEventId = null;
  activeIdentityKey = null;
  resetListenAccumulator();
}

function isNoActiveListenSessionError(e: unknown): boolean {
  return String(e).includes("No active listen session");
}

async function persistAccumulate(force: boolean): Promise<void> {
  if (!activeEventId) return;
  if (listenAccumSec <= 0) return;
  if (!force && listenAccumSec < ACCUMULATE_FLUSH_SEC) return;
  const lastTickAt = Date.now();
  try {
    await invoke("music_listen_accumulate", {
      eventId: activeEventId,
      listenedSec: listenAccumSec,
      lastTickAt,
    });
  } catch (e) {
    if (isNoActiveListenSessionError(e)) {
      clearStaleListenSessionState();
      return;
    }
    console.warn("music_listen_accumulate failed", e);
  }
}

export async function adoptListenSession(
  eventId: string,
  identityKey: string,
): Promise<void> {
  activeEventId = eventId;
  activeIdentityKey = identityKey;
  resetListenAccumulator();
  try {
    await invoke("music_listen_transfer", { surface: "music_mini" });
    await refreshListenSnapshot();
  } catch (e) {
    console.warn("music_listen_transfer failed", e);
  }
}

export async function beginListenSession(
  file: MediaFile,
  surface: ListenSurface,
  opts?: { source?: PlaySource; wasLiked?: boolean },
): Promise<string | null> {
  const meta = trackMetaFromFile(file);
  const staged = takeHandoffListenEventId();
  if (staged) {
    activeEventId = staged;
    activeIdentityKey = meta.identityKey;
    resetListenAccumulator();
    try {
      await invoke("music_listen_transfer", { surface });
      await refreshListenSnapshot();
      return activeEventId;
    } catch (e) {
      if (!isNoActiveListenSessionError(e)) {
        console.warn("music_listen_transfer on adopt failed", e);
      }
      activeEventId = null;
      activeIdentityKey = null;
      resetListenAccumulator();
    }
  }

  if (activeEventId && activeIdentityKey === meta.identityKey) {
    return activeEventId;
  }

  if (activeEventId) {
    await endListenSession("manual_switch");
  }

  try {
    const result = await invoke<{ eventId: string }>("music_listen_begin", {
      meta,
      surface,
      source: opts?.source ?? "unknown",
      wasLiked: opts?.wasLiked,
      startedAt: Date.now(),
    });
    activeEventId = result.eventId;
    activeIdentityKey = meta.identityKey;
    resetListenAccumulator();
    await refreshListenSnapshot();
    return activeEventId;
  } catch (e) {
    console.warn("music_listen_begin failed", e);
    return null;
  }
}

export async function transferListenSession(surface: ListenSurface): Promise<void> {
  if (!activeEventId) return;
  await persistAccumulate(true);
  const id = activeEventId;
  try {
    await invoke("music_listen_transfer", { surface });
    stageHandoffListenEventId(id);
    activeEventId = null;
    activeIdentityKey = null;
    resetListenAccumulator();
  } catch (e) {
    console.warn("music_listen_transfer failed", e);
  }
}

export async function flushListenSessionAccum(force = false): Promise<void> {
  await persistAccumulate(force);
  if (force && listenAccumSec > 0) {
    listenAccumSec = 0;
  }
}

export async function endListenSession(
  endReason: ListenEndReason,
  opts?: { flush?: boolean },
): Promise<void> {
  if (!activeEventId) return;
  const flush = opts?.flush !== false;
  if (flush) {
    await persistAccumulate(true);
    listenAccumSec = 0;
  }
  const eventId = activeEventId;
  activeEventId = null;
  activeIdentityKey = null;
  resetListenAccumulator();
  try {
    await invoke("music_listen_end", {
      eventId,
      endReason,
      endedAt: Date.now(),
    });
    await refreshListenSnapshot();
  } catch (e) {
    if (isNoActiveListenSessionError(e)) {
      return;
    }
    console.warn("music_listen_end failed", e);
  }
}

export async function abandonListenSession(): Promise<void> {
  await endListenSession("abandoned_paused");
}

/** Call on timeupdate while playing; returns true when a 15s batch was flushed. */
export async function onListenTimeUpdateTick(): Promise<boolean> {
  tickListenAccumulator();
  if (listenAccumSec >= ACCUMULATE_FLUSH_SEC) {
    const sec = listenAccumSec;
    await persistAccumulate(true);
    listenAccumSec = 0;
    return sec > 0;
  }
  return false;
}
