/** Dropped videos still downloading, by video id, and the video playlist each should join. */
export type PendingJoins = Record<string, { recordId: string; at: number }>;

export const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Drops entries older than the cutoff. */
export function prunePending(pending: PendingJoins, now: number): PendingJoins {
  const out: PendingJoins = {};
  for (const [id, p] of Object.entries(pending)) {
    if (now - p.at <= PENDING_MAX_AGE_MS) out[id] = p;
  }
  return out;
}
