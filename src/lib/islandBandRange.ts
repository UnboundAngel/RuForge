/**
 * Per-bar adaptive range for the island waveform. Each band tracks its own recent quiet floor and
 * loud ceiling and reports where the current sample sits between them, so bars ride the middle and
 * move independently instead of all pinning at the top on loud tracks or the bottom on quiet ones.
 */
export type BandRange = { floor: number; ceil: number };

/** Floor drops quickly to a new quiet and creeps up slowly; ceiling does the opposite. */
const FLOOR_FALL = 0.3;
const FLOOR_RISE = 0.006;
const CEIL_RISE = 0.45;
const CEIL_FALL = 0.012;
/** Keeps near-silence from being stretched into full-height noise. */
const MIN_SPAN = 0.14;

export function createBandRanges(count: number): BandRange[] {
  return Array.from({ length: count }, () => ({ floor: 0.2, ceil: 0.6 }));
}

export function stepBandRange(range: BandRange, raw: number): number {
  range.floor += (raw - range.floor) * (raw < range.floor ? FLOOR_FALL : FLOOR_RISE);
  range.ceil += (raw - range.ceil) * (raw > range.ceil ? CEIL_RISE : CEIL_FALL);
  const span = Math.max(MIN_SPAN, range.ceil - range.floor);
  return Math.min(1, Math.max(0, (raw - range.floor) / span));
}
