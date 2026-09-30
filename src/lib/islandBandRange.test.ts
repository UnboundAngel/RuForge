import { describe, expect, it } from "vitest";

import { createBandRanges, stepBandRange } from "./islandBandRange";

function run(values: number[]): number[] {
  const [range] = createBandRanges(1);
  return values.map((v) => stepBandRange(range!, v));
}

describe("stepBandRange", () => {
  it("keeps a loud band moving instead of pinning at the top", () => {
    const loud = Array.from({ length: 600 }, (_, i) => 0.85 + 0.1 * Math.sin(i / 4));
    const tail = run(loud).slice(-120);
    expect(Math.max(...tail)).toBeGreaterThan(0.85);
    expect(Math.min(...tail)).toBeLessThan(0.15);
  });

  it("keeps a quiet band moving instead of sitting flat", () => {
    const quiet = Array.from({ length: 600 }, (_, i) => 0.15 + 0.08 * Math.sin(i / 4));
    const tail = run(quiet).slice(-120);
    expect(Math.max(...tail) - Math.min(...tail)).toBeGreaterThan(0.6);
  });

  it("does not stretch near-silence into full-height noise", () => {
    const hiss = Array.from({ length: 600 }, (_, i) => 0.05 + 0.01 * Math.sin(i / 3));
    const tail = run(hiss).slice(-120);
    expect(Math.max(...tail)).toBeLessThan(0.3);
  });
});
