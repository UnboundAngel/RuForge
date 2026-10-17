import { useEffect, useState } from "react";
import { artUrl } from "./components/LazyThumb";
import type { CompanionItem } from "./types";

type Rgb = [number, number, number];

const cache = new Map<string, Rgb | null>();

function sample(url: string): Promise<Rgb | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const size = 16;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i]!, pg = data[i + 1]!, pb = data[i + 2]!;
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          // Favor saturated mid-tones so a white border or black bars do not win.
          const weight = 1 + ((max - min) / 255) * 6 * (max > 24 && min < 232 ? 1 : 0.1);
          r += pr * weight; g += pg * weight; b += pb * weight; w += weight;
        }
        resolve([r / w, g / w, b / w]);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const MIN_SATURATION = 0.18;

function toHsl([r, g, b]: Rgb): Rgb {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

// Washed-out covers (greyscale art, white borders) would tint the player beige,
// so only clearly colored art gets a tint, at a fixed dark lightness.
function tone(rgb: Rgb, lightness: number): string | null {
  const [h, s] = toHsl(rgb);
  if (s < MIN_SATURATION) return null;
  return `hsl(${Math.round(h)} ${Math.round(Math.min(s, 0.55) * 100)}% ${Math.round(lightness * 100)}%)`;
}

export type ArtTint = { deep: string; mini: string } | null;

/** Solid fills sampled from the cover, darkened toward the page tone. */
export function useArtTint(item: CompanionItem | null): ArtTint {
  const [rgb, setRgb] = useState<Rgb | null>(() => (item ? cache.get(item.id) ?? null : null));

  useEffect(() => {
    if (!item?.hasThumb) {
      setRgb(null);
      return;
    }
    if (cache.has(item.id)) {
      setRgb(cache.get(item.id) ?? null);
      return;
    }
    let cancelled = false;
    void sample(artUrl(item.id, item.thumbV)).then((value) => {
      cache.set(item.id, value);
      if (!cancelled) setRgb(value);
    });
    return () => { cancelled = true; };
  }, [item?.id, item?.hasThumb]);

  if (!rgb) return null;
  const deep = tone(rgb, 0.17);
  const mini = tone(rgb, 0.26);
  return deep && mini ? { deep, mini } : null;
}
