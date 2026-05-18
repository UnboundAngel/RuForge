function pickProminentHex(imageData: Uint8ClampedArray): string | null {
  let bestColor: { r: number; g: number; b: number } | null = null;
  let maxScore = -1;

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const a = imageData[i + 3];
    if (a < 200) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const sat = max === 0 ? 0 : (max - min) / max;
    const lumWeight = 1 - Math.abs(lum - 0.5) * 2;
    const score = sat * lumWeight;

    if (score > maxScore && lum > 0.15 && lum < 0.85) {
      maxScore = score;
      bestColor = { r, g, b };
    }
  }

  if (!bestColor) {
    let tr = 0;
    let tg = 0;
    let tb = 0;
    let tc = 0;
    for (let i = 0; i < imageData.length; i += 4) {
      if (imageData[i + 3] < 200) continue;
      tr += imageData[i];
      tg += imageData[i + 1];
      tb += imageData[i + 2];
      tc++;
    }
    if (tc > 0) bestColor = { r: tr / tc, g: tg / tc, b: tb / tc };
  }

  if (!bestColor) return null;

  let { r, g, b } = bestColor;
  const finalLum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (finalLum < 0.4) {
    const boost = 0.4 / finalLum;
    r = Math.min(255, r * boost);
    g = Math.min(255, g * boost);
    b = Math.min(255, b * boost);
  }

  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function isNearBlackOrWhite(r: number, g: number, b: number): boolean {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return lum < 0.08 || lum > 0.92 || sat < 0.08;
}

export function hexIsNearBlackOrWhite(hex: string | null): boolean {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return isNearBlackOrWhite(r, g, b);
}

export function extractProminentColorFromImageData(imageData: Uint8ClampedArray): string | null {
  return pickProminentHex(imageData);
}

export async function extractProminentColor(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 32, 32);
        resolve(pickProminentHex(ctx.getImageData(0, 0, 32, 32).data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function extractProminentColorFromVideo(video: HTMLVideoElement): string | null {
  if (video.videoWidth === 0 || video.readyState < 2) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, 32, 32);
    return pickProminentHex(ctx.getImageData(0, 0, 32, 32).data);
  } catch {
    return null;
  }
}
