import { describe, expect, it } from "vitest";
import {
  equalPowerInGain,
  equalPowerOutGain,
  musicCrossfadeArmWindowBlown,
  musicCrossfadeEffectiveSec,
  musicCrossfadeEligible,
} from "./musicCrossfade";
import {
  clampMusicCrossfadeSec,
  MUSIC_CROSSFADE_MAX_SEC,
  MUSIC_CROSSFADE_MIN_SOLO_SEC,
  MUSIC_CROSSFADE_PRELOAD_LEAD_SEC,
} from "./musicCrossfadeStorage";

describe("equalPower gains", () => {
  it("starts fully on outgoing and ends fully on incoming", () => {
    expect(equalPowerOutGain(0)).toBeCloseTo(1);
    expect(equalPowerInGain(0)).toBeCloseTo(0);
    expect(equalPowerOutGain(1)).toBeCloseTo(0);
    expect(equalPowerInGain(1)).toBeCloseTo(1);
  });

  it("keeps power near constant at the midpoint", () => {
    const out = equalPowerOutGain(0.5);
    const inn = equalPowerInGain(0.5);
    expect(out).toBeCloseTo(Math.SQRT1_2);
    expect(inn).toBeCloseTo(Math.SQRT1_2);
    expect(out * out + inn * inn).toBeCloseTo(1);
  });
});

describe("musicCrossfadeEffectiveSec", () => {
  it("skips when solo floor cannot clear, shortens when room is under configured fade", () => {
    expect(musicCrossfadeEffectiveSec(MUSIC_CROSSFADE_MIN_SOLO_SEC, 10)).toBe(0);
    expect(musicCrossfadeEffectiveSec(MUSIC_CROSSFADE_MIN_SOLO_SEC + 4, 10)).toBe(4);
    expect(musicCrossfadeEffectiveSec(MUSIC_CROSSFADE_MIN_SOLO_SEC + 10, 10)).toBe(10);
    expect(musicCrossfadeEffectiveSec(180, 10)).toBe(10);
    expect(musicCrossfadeEffectiveSec(180, 0)).toBe(0);
  });
});

describe("musicCrossfadeEligible", () => {
  it("rejects loop-one, off, and tracks that cannot clear the solo floor", () => {
    expect(musicCrossfadeEligible(180, 10, true)).toBe(false);
    expect(musicCrossfadeEligible(180, 0, false)).toBe(false);
    expect(musicCrossfadeEligible(MUSIC_CROSSFADE_MIN_SOLO_SEC, 10, false)).toBe(false);
    expect(musicCrossfadeEligible(MUSIC_CROSSFADE_MIN_SOLO_SEC + 0.01, 10, false)).toBe(true);
  });
});

describe("musicCrossfadeArmWindowBlown", () => {
  it("is true when remaining is under the preload lead", () => {
    expect(musicCrossfadeArmWindowBlown(MUSIC_CROSSFADE_PRELOAD_LEAD_SEC - 0.01, 10)).toBe(true);
    expect(musicCrossfadeArmWindowBlown(MUSIC_CROSSFADE_PRELOAD_LEAD_SEC, 10)).toBe(false);
    expect(musicCrossfadeArmWindowBlown(12, 10)).toBe(false);
  });
});

describe("clampMusicCrossfadeSec", () => {
  it("clamps to 0..max", () => {
    expect(clampMusicCrossfadeSec(-1)).toBe(0);
    expect(clampMusicCrossfadeSec(0)).toBe(0);
    expect(clampMusicCrossfadeSec(10)).toBe(10);
    expect(clampMusicCrossfadeSec(MUSIC_CROSSFADE_MAX_SEC + 5)).toBe(MUSIC_CROSSFADE_MAX_SEC);
  });
});
