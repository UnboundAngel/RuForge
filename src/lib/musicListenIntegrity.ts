import { invoke } from "@tauri-apps/api/core";

export type ListenIntegrity = {
  v: number;
  statsTrustworthyAfterMs: number;
};

let cached: ListenIntegrity | null = null;

export function getCachedListenIntegrity(): ListenIntegrity | null {
  return cached;
}

export function getStatsTrustworthyAfterMs(): number | null {
  return cached?.statsTrustworthyAfterMs ?? null;
}

export async function refreshListenIntegrity(): Promise<ListenIntegrity> {
  try {
    const integrity = await invoke<ListenIntegrity>("music_listen_get_integrity");
    cached = integrity;
    return integrity;
  } catch {
    if (cached) return cached;
    throw new Error("music_listen_get_integrity failed");
  }
}

/** Scoring-only: zero listen-time weight for pre-cutover plays. */
export function trustedListenTimeSecForScoring(
  listenTimeSec: number,
  lastPlayed: number,
): number {
  const cutover = getStatsTrustworthyAfterMs();
  if (cutover == null || lastPlayed < cutover) return 0;
  return listenTimeSec;
}
