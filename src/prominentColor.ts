import { readFile } from "@tauri-apps/plugin-fs";

function mimeFromPath(filePath: string): string {
  const ext = filePath.replace(/^.*[/\\]/, "").split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "avif":
      return "image/avif";
    default:
      return "image/jpeg";
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function toHexByte(v: number): string {
  return Math.round(v).toString(16).padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

function vibrantHexForDisplay(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  let [h, s, l] = rgbToHsl(r, g, b);
  s = Math.min(1, Math.max(0.42, s * 1.3 + 0.12));
  l = Math.max(0.46, Math.min(0.68, l < 0.38 ? 0.52 : l));
  const [nr, ng, nb] = hslToRgb(h, s, l);
  return rgbToHex(nr, ng, nb);
}

function pickProminentHex(imageData: Uint8ClampedArray): string | null {
  const buckets = new Map<
    number,
    { r: number; g: number; b: number; count: number; score: number }
  >();

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const a = imageData[i + 3];
    if (a < 128) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const sat = max === 0 ? 0 : (max - min) / max;
    if (lum < 0.1 || lum > 0.9 || sat < 0.12) continue;

    const qr = (r >> 4) << 4;
    const qg = (g >> 4) << 4;
    const qb = (b >> 4) << 4;
    const key = (qr << 16) | (qg << 8) | qb;
    const pixelScore = sat * (1 - Math.abs(lum - 0.55) * 1.6);

    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.score += pixelScore;
    } else {
      buckets.set(key, { r, g, b, count: 1, score: pixelScore });
    }
  }

  let best: { r: number; g: number; b: number; total: number } | null = null;

  for (const bucket of buckets.values()) {
    const total = bucket.score * Math.sqrt(bucket.count);
    if (!best || total > best.total) {
      best = {
        r: bucket.r / bucket.count,
        g: bucket.g / bucket.count,
        b: bucket.b / bucket.count,
        total,
      };
    }
  }

  if (!best) {
    let tr = 0;
    let tg = 0;
    let tb = 0;
    let tc = 0;
    for (let i = 0; i < imageData.length; i += 4) {
      if (imageData[i + 3] < 128) continue;
      tr += imageData[i];
      tg += imageData[i + 1];
      tb += imageData[i + 2];
      tc++;
    }
    if (tc === 0) return null;
    best = { r: tr / tc, g: tg / tc, b: tb / tc, total: 0 };
  }

  return vibrantHexForDisplay(rgbToHex(best.r, best.g, best.b));
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

async function loadImageDataFromSrc(src: string): Promise<Uint8ClampedArray | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      void (async () => {
        try {
          if (img.decode) await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = EDGE_SAMPLE_W;
          canvas.height = EDGE_SAMPLE_H;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, EDGE_SAMPLE_W, EDGE_SAMPLE_H);
          resolve(ctx.getImageData(0, 0, EDGE_SAMPLE_W, EDGE_SAMPLE_H).data);
        } catch {
          resolve(null);
        }
      })();
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function parseHex(hex: string): [number, number, number] | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const EDGE_SAMPLE_W = 48;
const EDGE_SAMPLE_H = 48;

function pixelAt(data: Uint8ClampedArray, w: number, x: number, y: number): [number, number, number, number] {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function pixelLuminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function isExtremeBackdropHex(hex: string | null): boolean {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = pixelLuminance(r, g, b);
  return lum < 0.035 || lum > 0.985;
}

function averagePatch(
  imageData: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  size: number,
): string | null {
  let tr = 0;
  let tg = 0;
  let tb = 0;
  let tc = 0;
  for (let y = y0; y < y0 + size; y += 1) {
    for (let x = x0; x < x0 + size; x += 1) {
      const [r, g, b, a] = pixelAt(imageData, w, x, y);
      if (a < 128) continue;
      tr += r;
      tg += g;
      tb += b;
      tc += 1;
    }
  }
  if (tc === 0) return null;
  return rgbToHex(tr / tc, tg / tc, tb / tc);
}

function pickCornerBackdropHex(imageData: Uint8ClampedArray): string | null {
  const w = EDGE_SAMPLE_W;
  const h = EDGE_SAMPLE_H;
  const patch = 8;
  const corners = [
    averagePatch(imageData, w, 0, 0, patch),
    averagePatch(imageData, w, w - patch, 0, patch),
    averagePatch(imageData, w, 0, h - patch, patch),
    averagePatch(imageData, w, w - patch, h - patch, patch),
  ].filter((c): c is string => Boolean(c));

  if (corners.length === 0) return null;

  let best = corners[0]!;
  let bestLum = -1;
  for (const corner of corners) {
    const rgb = parseHex(corner);
    if (!rgb) continue;
    const lum = pixelLuminance(rgb[0], rgb[1], rgb[2]);
    if (lum > bestLum) {
      bestLum = lum;
      best = corner;
    }
  }
  return best;
}

function pickEdgeBackdropHex(imageData: Uint8ClampedArray): string | null {
  const w = EDGE_SAMPLE_W;
  const h = EDGE_SAMPLE_H;
  let tr = 0;
  let tg = 0;
  let tb = 0;
  let tc = 0;

  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (imageData[i + 3] < 128) return;
    tr += imageData[i];
    tg += imageData[i + 1];
    tb += imageData[i + 2];
    tc += 1;
  };

  const band = Math.max(2, Math.floor(Math.min(w, h) * 0.14));
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < band; y += 1) add(x, y);
    for (let y = h - band; y < h; y += 1) add(x, y);
  }
  for (let y = band; y < h - band; y += 1) {
    for (let x = 0; x < band; x += 1) add(x, y);
    for (let x = w - band; x < w; x += 1) add(x, y);
  }

  if (tc === 0) return null;
  return rgbToHex(tr / tc, tg / tc, tb / tc);
}

function pickPaperBackdropHex(imageData: Uint8ClampedArray): string | null {
  let tr = 0;
  let tg = 0;
  let tb = 0;
  let tc = 0;

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const a = imageData[i + 3];
    if (a < 128) continue;

    const lum = pixelLuminance(r, g, b);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (lum < 0.28 || lum > 0.96 || sat > 0.42) continue;

    tr += r;
    tg += g;
    tb += b;
    tc += 1;
  }

  if (tc === 0) return null;
  return rgbToHex(tr / tc, tg / tc, tb / tc);
}

function pickBackdropHex(imageData: Uint8ClampedArray): string | null {
  const candidates = [
    pickCornerBackdropHex(imageData),
    pickPaperBackdropHex(imageData),
    pickEdgeBackdropHex(imageData),
  ].filter((c): c is string => Boolean(c) && !isExtremeBackdropHex(c));

  if (candidates.length === 0) {
    const raw = pickPaperBackdropHex(imageData)
      ?? pickCornerBackdropHex(imageData)
      ?? pickEdgeBackdropHex(imageData);
    return raw && !isExtremeBackdropHex(raw) ? raw : null;
  }

  return candidates.reduce((best, hex) => {
    const rgb = parseHex(hex);
    const bestRgb = parseHex(best);
    if (!rgb || !bestRgb) return best;
    const lum = pixelLuminance(rgb[0], rgb[1], rgb[2]);
    const bestLum = pixelLuminance(bestRgb[0], bestRgb[1], bestRgb[2]);
    return lum > bestLum ? hex : best;
  });
}

export type CoverAmbienceTheme = {
  canvasColor: string;
  headerScrim: string;
  onCanvasPrimary: string;
  onCanvasMuted: string;
  rowHoverBg: string;
  chipBg: string;
};

const FALLBACK_AMBIENCE: CoverAmbienceTheme = {
  canvasColor: "#161010",
  headerScrim: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 38%, #161010 94%)",
  onCanvasPrimary: "#ffffff",
  onCanvasMuted: "rgba(255, 255, 255, 0.55)",
  rowHoverBg: "rgba(255, 255, 255, 0.08)",
  chipBg: "rgba(255, 255, 255, 0.14)",
};

function headerScrimForCanvas(canvas: string): string {
  const rgb = parseHex(canvas);
  const lum = rgb ? pixelLuminance(rgb[0], rgb[1], rgb[2]) : 0.15;
  if (lum > 0.55) {
    return `linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 42%, ${canvas} 94%)`;
  }
  return `linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 36%, ${canvas} 94%)`;
}

function primaryTextForCanvas(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#ffffff";
  return pixelLuminance(rgb[0], rgb[1], rgb[2]) > 0.55 ? "#111111" : "#ffffff";
}

function hoverOverlayForCanvas(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "rgba(255, 255, 255, 0.1)";
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return lum > 0.58 ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.1)";
}

function chipOverlayForCanvas(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "rgba(255, 255, 255, 0.14)";
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return lum > 0.58 ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.16)";
}

function mutedTextForCanvas(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "rgba(255, 255, 255, 0.55)";
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return lum > 0.58 ? "rgba(0, 0, 0, 0.52)" : "rgba(255, 255, 255, 0.58)";
}

export function buildCoverAmbienceTheme(hex: string | null): CoverAmbienceTheme {
  if (!hex || isExtremeBackdropHex(hex)) return FALLBACK_AMBIENCE;

  const rgb = parseHex(hex);
  if (!rgb) return FALLBACK_AMBIENCE;

  const canvas = hex;

  return {
    canvasColor: canvas,
    headerScrim: headerScrimForCanvas(canvas),
    onCanvasPrimary: primaryTextForCanvas(canvas),
    onCanvasMuted: mutedTextForCanvas(canvas),
    rowHoverBg: hoverOverlayForCanvas(canvas),
    chipBg: chipOverlayForCanvas(canvas),
  };
}

export async function extractCoverBackdropFromPath(filePath: string): Promise<string | null> {
  try {
    const bytes = await readFile(filePath);
    const blob = new Blob([bytes], { type: mimeFromPath(filePath) });
    const url = URL.createObjectURL(blob);
    try {
      return await extractCoverBackdropColor(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

export async function extractCoverBackdropColor(src: string): Promise<string | null> {
  const data = await loadImageDataFromSrc(src);
  return data ? pickBackdropHex(data) : null;
}

export async function extractProminentColor(src: string): Promise<string | null> {
  const data = await loadImageDataFromSrc(src);
  return data ? pickProminentHex(data) : null;
}

export async function extractProminentColorFromPath(filePath: string): Promise<string | null> {
  try {
    const bytes = await readFile(filePath);
    const blob = new Blob([bytes], { type: mimeFromPath(filePath) });
    const url = URL.createObjectURL(blob);
    try {
      return await extractProminentColor(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
