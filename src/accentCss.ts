/** Keeps `index.css` `--accent` / `--accent-glow` in sync with RuForge appearance settings. */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function syncRuforgeAccentCss(hex: string): void {
  const safe = hex?.trim() || "#f59e0b";
  const root = document.documentElement;
  root.style.setProperty("--accent", safe);
  const rgb = hexToRgb(safe);
  const glow = rgb
    ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.28)`
    : "rgba(245, 158, 11, 0.28)";
  root.style.setProperty("--accent-glow", glow);
}
