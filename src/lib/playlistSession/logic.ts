import { shuffledCopy } from "../playlistPlayback";

/** What the app remembers about one playlist watched like a season. */
export type PlaylistSession = {
  /** Video that Resume continues. Null before the first play and after the last item ended. */
  currentKey: string | null;
  /** Played order, kept only while `shuffled` (an unshuffled playlist follows its own order). */
  order: string[];
  shuffled: boolean;
  /** Start over begins here; null means the first item. */
  startKey: string | null;
  lastPlayedAt: number | null;
  /** Null until something from the playlist played or it was shuffled. */
  startedAt: number | null;
};

export type PlaylistSessions = Record<string, PlaylistSession>;

export const EMPTY_SESSION: PlaylistSession = {
  currentKey: null,
  order: [],
  shuffled: false,
  startKey: null,
  lastPlayedAt: null,
  startedAt: null,
};

export function sessionOf(sessions: PlaylistSessions, id: string): PlaylistSession {
  return sessions[id] ?? EMPTY_SESSION;
}

export function isStarted(session: PlaylistSession): boolean {
  return session.startedAt != null;
}

/** Shuffled order with items added since the shuffle appended and removed items dropped. */
export function reconcileOrder(order: readonly string[], keys: readonly string[]): string[] {
  const live = new Set(keys);
  const kept = order.filter((k) => live.has(k));
  const seen = new Set(kept);
  return [...kept, ...keys.filter((k) => !seen.has(k))];
}

/** The order playback follows right now. */
export function effectiveOrder(session: PlaylistSession, keys: readonly string[]): string[] {
  return session.shuffled ? reconcileOrder(session.order, keys) : [...keys];
}

export type PlaybackPlan = { order: string[]; currentKey: string; shuffled: boolean };

/** Continue the current video in the same order, shuffled or not. */
export function planResume(session: PlaylistSession, keys: readonly string[]): PlaybackPlan | null {
  if (keys.length === 0) return null;
  const order = effectiveOrder(session, keys);
  const pick = [session.currentKey, session.startKey].find((k) => k != null && order.includes(k));
  return { order, currentKey: pick ?? order[0]!, shuffled: session.shuffled };
}

/** Begin at the start video in playlist order and drop any shuffle. */
export function planStartOver(session: PlaylistSession, keys: readonly string[]): PlaybackPlan | null {
  if (keys.length === 0) return null;
  const start = session.startKey != null && keys.includes(session.startKey) ? session.startKey : keys[0]!;
  return { order: [...keys], currentKey: start, shuffled: false };
}

/** A fresh shuffled order; the first item becomes current. */
export function planShuffle(keys: readonly string[], random?: () => number): PlaybackPlan | null {
  if (keys.length === 0) return null;
  const order = shuffledCopy(keys, random);
  return { order, currentKey: order[0]!, shuffled: true };
}

/** Play one item, keeping the shuffled order when the playlist is shuffled. */
export function planPlayFrom(
  session: PlaylistSession,
  keys: readonly string[],
  key: string,
): PlaybackPlan | null {
  if (!keys.includes(key)) return null;
  return { order: effectiveOrder(session, keys), currentKey: key, shuffled: session.shuffled };
}

/** Record that the plan started playing. */
export function applyPlan(session: PlaylistSession, plan: PlaybackPlan, now: number): PlaylistSession {
  return {
    ...session,
    currentKey: plan.currentKey,
    shuffled: plan.shuffled,
    order: plan.shuffled ? plan.order : [],
    lastPlayedAt: now,
    startedAt: session.startedAt ?? now,
  };
}

/** A video from the playlist started playing: it is now the resume point. */
export function applyWatch(session: PlaylistSession, key: string, now: number): PlaylistSession {
  return { ...session, currentKey: key, lastPlayedAt: now, startedAt: session.startedAt ?? now };
}

/** An item really ended: the next one in order becomes current (null after the last). */
export function applyEnded(
  session: PlaylistSession,
  keys: readonly string[],
  endedKey: string,
  now: number,
): PlaylistSession {
  const order = effectiveOrder(session, keys);
  const i = order.indexOf(endedKey);
  if (i < 0) return session;
  return { ...session, currentKey: order[i + 1] ?? null, lastPlayedAt: now };
}

export function setStartKey(session: PlaylistSession, key: string | null): PlaylistSession {
  return { ...session, startKey: key };
}

/**
 * Which playlist a plain play of `key` belongs to: the one it was launched from, else the most
 * recently played started playlist that contains it. Never starts a playlist on its own.
 */
export function pickWatchTarget(
  sessions: PlaylistSessions,
  containing: readonly string[],
  activeId: string | null,
): string | null {
  if (activeId != null && containing.includes(activeId)) return activeId;
  let best: string | null = null;
  let bestAt = -1;
  for (const id of containing) {
    const s = sessions[id];
    if (!s || !isStarted(s)) continue;
    const at = s.lastPlayedAt ?? 0;
    if (at > bestAt) {
      best = id;
      bestAt = at;
    }
  }
  return best;
}

/** Drop-in shape for the file on disk; tolerant of hand edits and older versions. */
export function parseSessions(raw: unknown): PlaylistSessions {
  const src = raw && typeof raw === "object" ? (raw as { sessions?: unknown }).sessions : null;
  if (!src || typeof src !== "object") return {};
  const out: PlaylistSessions = {};
  for (const [id, v] of Object.entries(src as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const s = v as Partial<PlaylistSession>;
    const str = (x: unknown) => (typeof x === "string" && x ? x : null);
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
    out[id] = {
      currentKey: str(s.currentKey),
      order: Array.isArray(s.order) ? s.order.filter((k): k is string => typeof k === "string") : [],
      shuffled: s.shuffled === true,
      startKey: str(s.startKey),
      lastPlayedAt: num(s.lastPlayedAt),
      startedAt: num(s.startedAt),
    };
  }
  return out;
}
