import { useCallback, useState, type CSSProperties, type SyntheticEvent } from "react";

const SAMPLE_W = 64;
const DARK_LUMA = 16;
const MAX_DARK_VARIANCE = 40;
/** Bars thinner than this fraction of a side are ordinary encoding noise, not worth a zoom. */
const MIN_BAR = 0.04;
/** Never zoom past this; a mostly black frame (night scene) must not blow up to a few pixels. */
const MAX_SCALE = 4;
/** Opposite bars must be within this fraction of the thicker one (or 2 sample px) to count. */
const SYMMETRY_TOLERANCE = 0.25;

export type ContentBox = { top: number; bottom: number; left: number; right: number };

type PixelData = { data: ArrayLike<number>; width: number; height: number };

function lineIsBar(px: PixelData, indices: number[]): boolean {
  let sum = 0;
  let sumSq = 0;
  for (const i of indices) {
    const o = i * 4;
    const l = 0.2126 * px.data[o]! + 0.7152 * px.data[o + 1]! + 0.0722 * px.data[o + 2]!;
    sum += l;
    sumSq += l * l;
  }
  const mean = sum / indices.length;
  const variance = sumSq / indices.length - mean * mean;
  return mean < DARK_LUMA && variance < MAX_DARK_VARIANCE;
}

/**
 * Scans in from each edge for near-black, flat rows and columns. Returns the bar thickness as a
 * fraction of each side, or null when no side has a bar worth cropping.
 */
export function scanBakedBars(px: PixelData): ContentBox | null {
  const { width: w, height: h } = px;
  if (w < 4 || h < 4) return null;
  const row = (y: number) => Array.from({ length: w }, (_, x) => y * w + x);
  const col = (x: number) => Array.from({ length: h }, (_, y) => y * w + x);

  let top = 0;
  while (top < h && lineIsBar(px, row(top))) top++;
  // Entirely black: nothing to crop to.
  if (top === h) return null;
  let bottom = 0;
  while (bottom < h - top && lineIsBar(px, row(h - 1 - bottom))) bottom++;
  let left = 0;
  while (left < w && lineIsBar(px, col(left))) left++;
  let right = 0;
  while (right < w - left && lineIsBar(px, col(w - 1 - right))) right++;

  // Baked bars are symmetric; a one-sided dark band is just a dark thumbnail.
  const vertical = symmetric(top / h, bottom / h, h);
  const horizontal = symmetric(left / w, right / w, w);
  if (!vertical && !horizontal) return null;
  return {
    top: vertical ? top / h : 0,
    bottom: vertical ? bottom / h : 0,
    left: horizontal ? left / w : 0,
    right: horizontal ? right / w : 0,
  };
}

function symmetric(a: number, b: number, samples: number): boolean {
  if (a <= MIN_BAR || b <= MIN_BAR) return false;
  const diff = Math.abs(a - b) * samples;
  return diff <= 2 || Math.abs(a - b) <= Math.max(a, b) * SYMMETRY_TOLERANCE;
}

/** Transform that makes the content box fill a frame the image already covers (object-cover). */
export function cropTransform(box: ContentBox): string | undefined {
  const cw = 1 - box.left - box.right;
  const ch = 1 - box.top - box.bottom;
  if (cw <= 0 || ch <= 0) return undefined;
  const scale = Math.min(MAX_SCALE, Math.max(1 / cw, 1 / ch));
  const cx = (box.left + (1 - box.right)) / 2 - 0.5;
  const cy = (box.top + (1 - box.bottom)) / 2 - 0.5;
  return `translate(${(-cx * scale * 100).toFixed(2)}%, ${(-cy * scale * 100).toFixed(2)}%) scale(${scale.toFixed(3)})`;
}

const cache = new Map<string, string | null>();

function transformFor(img: HTMLImageElement): string | null {
  try {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE_W;
      canvas.height = Math.max(4, Math.round((SAMPLE_W * img.naturalHeight) / img.naturalWidth));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const box = scanBakedBars(ctx.getImageData(0, 0, canvas.width, canvas.height));
        return box ? cropTransform(box) ?? null : null;
      }
    }
  } catch {
    // Tainted canvas: leave the image uncropped.
  }
  return null;
}

/** Reads pixels from an offscreen CORS copy so the visible img never needs crossOrigin. */
function measure(src: string, done: (t: string | null) => void): void {
  const hit = cache.get(src);
  if (hit !== undefined) {
    done(hit);
    return;
  }
  const probe = new Image();
  probe.crossOrigin = "anonymous";
  probe.onload = () => {
    const result = transformFor(probe);
    cache.set(src, result);
    done(result);
  };
  probe.onerror = () => cache.set(src, null);
  probe.src = src;
}

/**
 * Some thumbnails have black bars baked into the jpg, which object-cover cannot remove. Spread
 * `onLoad` and `style` on the img; the first paint is uncropped. The visible img needs no
 * crossOrigin: pixels are read from a separate offscreen CORS probe of the same src, and a failed
 * or tainted probe just means no crop. Hover zoom must use the separate `scale` property so it composes.
 */
export function useBakedBarCrop() {
  const [transform, setTransform] = useState<string | null>(null);
  const onLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    measure(img.currentSrc || img.src, setTransform);
  }, []);
  const style: CSSProperties | undefined = transform ? { transform } : undefined;
  return { onLoad, style };
}
