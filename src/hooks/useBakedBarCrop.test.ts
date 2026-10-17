import { describe, expect, it } from "vitest";
import { cropTransform, scanBakedBars } from "./useBakedBarCrop";

function frame(w: number, h: number, isBar: (x: number, y: number) => boolean) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const v = isBar(x, y) ? 2 : 90 + ((x * 37 + y * 11) % 120);
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

describe("scanBakedBars", () => {
  it("finds pillarbox bars", () => {
    const box = scanBakedBars(frame(64, 36, (x) => x < 22 || x >= 42));
    expect(box).not.toBeNull();
    expect(box!.left).toBeCloseTo(22 / 64);
    expect(box!.right).toBeCloseTo(22 / 64);
    expect(box!.top).toBe(0);
    expect(box!.bottom).toBe(0);
  });

  it("finds letterbox bars", () => {
    const box = scanBakedBars(frame(64, 36, (_x, y) => y < 5 || y >= 31));
    expect(box!.top).toBeCloseTo(5 / 36);
    expect(box!.bottom).toBeCloseTo(5 / 36);
  });

  it("ignores a one-sided dark band", () => {
    expect(scanBakedBars(frame(64, 36, (_x, y) => y < 12))).toBeNull();
    expect(scanBakedBars(frame(64, 36, (x) => x < 20))).toBeNull();
  });

  it("ignores lopsided opposite bars", () => {
    expect(scanBakedBars(frame(64, 36, (_x, y) => y < 12 || y >= 34))).toBeNull();
  });

  it("ignores a frame with no bars", () => {
    expect(scanBakedBars(frame(64, 36, () => false))).toBeNull();
  });

  it("ignores bars under the threshold", () => {
    expect(scanBakedBars(frame(64, 36, (x) => x < 2))).toBeNull();
  });

  it("ignores an all-black frame", () => {
    expect(scanBakedBars(frame(64, 36, () => true))).toBeNull();
  });
});

describe("cropTransform", () => {
  it("scales a centered pillarbox up to fill the frame", () => {
    const t = cropTransform({ top: 0, bottom: 0, left: 0.34, right: 0.34 });
    expect(t).toContain("scale(3.125)");
    expect(t).toContain("translate(0.00%, 0.00%)");
  });

  it("recenters an off-center box", () => {
    const t = cropTransform({ top: 0, bottom: 0, left: 0.4, right: 0.1 });
    expect(t).toMatch(/^translate\(-?\d/);
    expect(t).not.toContain("translate(0.00%");
  });

  it("returns nothing for a degenerate box", () => {
    expect(cropTransform({ top: 0, bottom: 0, left: 0.6, right: 0.5 })).toBeUndefined();
  });
});
