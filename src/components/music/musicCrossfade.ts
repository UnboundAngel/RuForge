import {
  MUSIC_CROSSFADE_MIN_SOLO_SEC,
  MUSIC_CROSSFADE_PRELOAD_LEAD_SEC,
} from "./musicCrossfadeStorage";

export function equalPowerOutGain(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return Math.cos((x * Math.PI) / 2);
}

export function equalPowerInGain(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return Math.sin((x * Math.PI) / 2);
}

/** min(configured, duration - min solo); 0 skips crossfade. */
export function musicCrossfadeEffectiveSec(
  durationSec: number,
  crossfadeSec: number,
): number {
  if (crossfadeSec <= 0) return 0;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  const room = durationSec - MUSIC_CROSSFADE_MIN_SOLO_SEC;
  if (room <= 0) return 0;
  return Math.min(crossfadeSec, room);
}

export function musicCrossfadeEligible(
  durationSec: number,
  crossfadeSec: number,
  loopOne: boolean,
): boolean {
  if (loopOne) return false;
  return musicCrossfadeEffectiveSec(durationSec, crossfadeSec) > 0;
}

export function musicCrossfadeArmWindowBlown(
  remainingSec: number,
  fadeSec: number,
): boolean {
  if (fadeSec <= 0) return true;
  if (!Number.isFinite(remainingSec)) return true;
  return remainingSec < MUSIC_CROSSFADE_PRELOAD_LEAD_SEC;
}
