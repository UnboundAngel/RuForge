/** Keeps `index.css` `--accent` / `--accent-glow` in sync with RuForge appearance settings. */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function syncRuforgeAccentCss(hex: string, returnRgb?: boolean): { r: number, g: number, b: number } | void {
  const safe = hex?.trim() || "#EDCF9B";
  const root = document.documentElement;
  root.style.setProperty("--accent", safe);
  const rgb = hexToRgb(safe);
  
  if (rgb) {
    root.style.setProperty("--accent-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    root.style.setProperty("--accent-glow", `rgba(${rgb.r},${rgb.g},${rgb.b},0.28)`);
    if (returnRgb) return rgb;
  } else {
    root.style.setProperty("--accent-rgb", "237, 207, 155");
    root.style.setProperty("--accent-glow", "rgba(237, 207, 155, 0.28)");
    if (returnRgb) return { r: 237, g: 207, b: 155 };
  }
}
