import { describe, expect, it } from "vitest";
import {
  ZOOM_IDENTITY,
  ZOOM_MAX,
  clampPan,
  containRect,
  formatZoom,
  panBy,
  zoomAt,
  type ZoomState,
} from "./freezeFrameZoom";

const toContent = (s: ZoomState, p: { x: number; y: number }) => ({
  x: (p.x - s.x) / s.scale,
  y: (p.y - s.y) / s.scale,
});

describe("zoomAt", () => {
  it("keeps the point under the cursor fixed", () => {
    const cursor = { x: 300, y: 120 };
    const before = toContent(ZOOM_IDENTITY, cursor);
    const once = zoomAt(ZOOM_IDENTITY, cursor, -300);
    expect(once.scale).toBeGreaterThan(1);
    const afterOnce = toContent(once, cursor);
    expect(afterOnce.x).toBeCloseTo(before.x, 9);
    expect(afterOnce.y).toBeCloseTo(before.y, 9);

    const cursor2 = { x: 50, y: 400 };
    const anchor = toContent(once, cursor2);
    const twice = zoomAt(once, cursor2, -200);
    const afterTwice = toContent(twice, cursor2);
    expect(afterTwice.x).toBeCloseTo(anchor.x, 9);
    expect(afterTwice.y).toBeCloseTo(anchor.y, 9);
  });

  it("clamps scale between 1x and 8x", () => {
    let s = ZOOM_IDENTITY;
    for (let i = 0; i < 100; i++) s = zoomAt(s, { x: 10, y: 10 }, -500);
    expect(s.scale).toBe(ZOOM_MAX);
    for (let i = 0; i < 100; i++) s = zoomAt(s, { x: 10, y: 10 }, 500);
    expect(s).toEqual(ZOOM_IDENTITY);
  });

  it("returns the same object when the scale cannot move", () => {
    expect(zoomAt(ZOOM_IDENTITY, { x: 5, y: 5 }, 100)).toBe(ZOOM_IDENTITY);
  });
});

describe("clampPan", () => {
  const viewport = { width: 800, height: 600 };
  const full = { x: 0, y: 0, width: 800, height: 600 };

  it("never lets the frame edges pull inside the viewport", () => {
    const s = { scale: 2, x: 0, y: 0 };
    expect(clampPan(panBy(s, 500, 500), viewport, full)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(clampPan(panBy(s, -5000, -5000), viewport, full)).toEqual({ scale: 2, x: -800, y: -600 });
    expect(clampPan(panBy(s, -100, -50), viewport, full)).toEqual({ scale: 2, x: -100, y: -50 });
  });

  it("resets to identity at 1x", () => {
    expect(clampPan({ scale: 1, x: 40, y: -20 }, viewport, full)).toEqual(ZOOM_IDENTITY);
  });

  it("uses the letterboxed frame, not the element box", () => {
    const content = containRect(viewport, { width: 1920, height: 800 });
    expect(content.x).toBe(0);
    expect(content.width).toBe(800);
    expect(content.height).toBeCloseTo(333.333, 2);
    expect(content.y).toBeCloseTo(133.333, 2);

    // Height still fits at 1.5x: centered vertically, horizontal edges clamped.
    const mid = clampPan({ scale: 1.5, x: 200, y: 0 }, viewport, content);
    expect(mid.x).toBe(0);
    expect(mid.y + content.y * 1.5).toBeCloseTo((600 - content.height * 1.5) / 2, 9);

    // At 3x the frame is taller than the viewport, so its top edge clamps to 0.
    const tall = clampPan({ scale: 3, x: 0, y: 0 }, viewport, content);
    expect(tall.y + content.y * 3).toBeCloseTo(0, 9);
    const bottom = clampPan({ scale: 3, x: 0, y: -10_000 }, viewport, content);
    expect(bottom.y + (content.y + content.height) * 3).toBeCloseTo(600, 9);
  });
});

describe("formatZoom", () => {
  it("drops the decimal on whole steps", () => {
    expect(formatZoom(2)).toBe("2x");
    expect(formatZoom(2.46)).toBe("2.5x");
    expect(formatZoom(8)).toBe("8x");
  });
});
