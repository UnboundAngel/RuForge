import type { MediaFile } from "@/types";
import { primaryArtist } from "./musicArtist";
import { getAllListenStats } from "./musicListenStats";
import { musicTrackIdentityKey } from "./musicShelfDedup";

export type SmartShuffleContext = {
  pool: MediaFile[];
  current?: MediaFile | null;
  likedKeys?: string[];
  sessionRecentKeys?: string[];
  seed?: number;
};

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hoursSince(ts: number): number {
  if (!ts) return Number.POSITIVE_INFINITY;
  return (Date.now() - ts) / 3_600_000;
}

/** Weight for weighted pick; 0 excludes the track. */
export function smartShuffleWeight(
  file: MediaFile,
  ctx: {
    statsByKey: Map<string, { playCount: number; listenTimeSec: number; lastPlayed: number }>;
    likedSet: Set<string>;
    sessionRecent: Set<string>;
    current?: MediaFile | null;
  },
): number {
  const key = musicTrackIdentityKey(file, primaryArtist);
  if (ctx.sessionRecent.has(key)) return 0;

  let w = 1;

  if (ctx.likedSet.has(key)) w *= 2.5;

  const stat = ctx.statsByKey.get(key);
  if (stat) {
    w *= 1 + Math.log1p(stat.playCount) * 0.12;
    w *= 1 + Math.min(stat.listenTimeSec / 3600, 1) * 0.25;
    const hrs = hoursSince(stat.lastPlayed);
    if (hrs < 0.5) w *= 0.12;
    else if (hrs < 6) w *= 0.35;
    else if (hrs < 24) w *= 0.55;
    else if (hrs < 72) w *= 0.8;
  } else {
    w *= 1.35;
  }

  if (ctx.current) {
    const curKey = primaryArtist(
      ctx.current.artist ?? ctx.current.albumArtist ?? "",
    ).toLowerCase();
    const nextKey = primaryArtist(file.artist ?? file.albumArtist ?? "").toLowerCase();
    if (curKey && curKey === nextKey) w *= 0.3;
  }

  return w;
}

function buildWeightContext(ctx: SmartShuffleContext) {
  const statsByKey = new Map(
    getAllListenStats().map((s) => [
      s.identityKey,
      { playCount: s.playCount, listenTimeSec: s.listenTimeSec, lastPlayed: s.lastPlayed },
    ]),
  );
  return {
    statsByKey,
    likedSet: new Set(ctx.likedKeys ?? []),
    sessionRecent: new Set(ctx.sessionRecentKeys ?? []),
    current: ctx.current ?? null,
  };
}

/** Weighted order without replacement (smart shuffle playlist). */
export function buildSmartShuffleOrder(ctx: SmartShuffleContext): MediaFile[] {
  const pool = [...ctx.pool];
  if (pool.length <= 1) return pool;

  const rand = mulberry32(ctx.seed ?? (Date.now() & 0xffffffff));
  const weightCtx = buildWeightContext(ctx);
  const out: MediaFile[] = [];
  const remaining = [...pool];

  while (remaining.length > 0) {
    const weights = remaining.map((f) => smartShuffleWeight(f, weightCtx));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      const i = Math.floor(rand() * remaining.length);
      const pick = remaining.splice(i, 1)[0]!;
      out.push(pick);
      weightCtx.sessionRecent.add(musicTrackIdentityKey(pick, primaryArtist));
      continue;
    }
    let r = rand() * total;
    let pickedIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]!;
      if (r <= 0) {
        pickedIdx = i;
        break;
      }
    }
    const pick = remaining.splice(pickedIdx, 1)[0]!;
    out.push(pick);
    weightCtx.sessionRecent.add(musicTrackIdentityKey(pick, primaryArtist));
    weightCtx.current = pick;
  }

  return out;
}

function pickWeightedFromPool(
  pool: MediaFile[],
  weights: number[],
  total: number,
  seed: number,
): MediaFile | null {
  if (pool.length === 0 || total <= 0) return null;
  const rand = mulberry32(seed);
  let r = rand() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return pool[i] ?? null;
  }
  return pool[pool.length - 1] ?? null;
}

/** One weighted next track for endless autoplay. */
export function pickSmartNextTrack(ctx: SmartShuffleContext): MediaFile | null {
  const pool = ctx.pool.filter((f) => f.path !== ctx.current?.path);
  if (pool.length === 0) return null;

  const seed = ctx.seed ?? (Date.now() & 0xffffffff);
  const weightCtx = buildWeightContext(ctx);
  const weights = pool.map((f) => smartShuffleWeight(f, weightCtx));
  const total = weights.reduce((a, b) => a + b, 0);
  const first = pickWeightedFromPool(pool, weights, total, seed);
  if (first) return first;

  if ((ctx.sessionRecentKeys?.length ?? 0) > 0) {
    const relaxedCtx = buildWeightContext({ ...ctx, sessionRecentKeys: [] });
    const relaxedWeights = pool.map((f) => smartShuffleWeight(f, relaxedCtx));
    const relaxedTotal = relaxedWeights.reduce((a, b) => a + b, 0);
    const second = pickWeightedFromPool(pool, relaxedWeights, relaxedTotal, seed ^ 0x9e3779b9);
    if (second) return second;
  }

  const rand = mulberry32(seed ^ 0x85ebca6b);
  return pool[Math.floor(rand() * pool.length)] ?? null;
}
