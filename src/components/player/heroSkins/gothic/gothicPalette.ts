import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { extractProminentColor, rgbToHsl } from "@/prominentColor";

const FALLBACK_HUE = 355;
const FALLBACK_SAT = 0.08;

type GothicVars = Record<`--goth-${string}`, string>;

function varsFor(hue: number, sat: number): GothicVars {
  const metalSat = Math.min(sat, 0.28);
  const deepSat = Math.max(0.45, Math.min(sat, 0.8));
  return {
    "--goth-metal": `hsl(${hue} ${Math.round(metalSat * 100)}% 62%)`,
    "--goth-deep": `hsl(${hue} ${Math.round(deepSat * 100)}% 22%)`,
    "--goth-frame": `hsl(${hue} ${Math.round(Math.min(sat, 0.3) * 100)}% 9%)`,
    "--goth-blood": "hsl(354 78% 28%)",
    "--goth-glow": "hsl(354 85% 30% / 0.55)",
  };
}

/**
 * Tints tarnished metal + frame from the cover's prominent color and writes the
 * vars onto the parent of `anchorRef`, so sibling layers (the disc) share them.
 */
export function useGothicPalette(coverSrc: string | null, anchorRef: RefObject<HTMLElement | null>) {
  const [vars, setVars] = useState<GothicVars>(() => varsFor(FALLBACK_HUE, FALLBACK_SAT));

  useEffect(() => {
    if (!coverSrc) return;
    let cancelled = false;
    void extractProminentColor(coverSrc).then((hex) => {
      if (cancelled) return;
      if (!hex) {
        setVars(varsFor(FALLBACK_HUE, FALLBACK_SAT));
        return;
      }
      const [h, s] = rgbToHsl(
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      );
      setVars(varsFor(Math.round(h * 360), s));
    });
    return () => {
      cancelled = true;
    };
  }, [coverSrc]);

  useLayoutEffect(() => {
    const host = anchorRef.current?.parentElement;
    if (!host) return;
    const entries = Object.entries(vars);
    for (const [k, v] of entries) host.style.setProperty(k, v);
    return () => {
      for (const [k] of entries) host.style.removeProperty(k);
    };
  }, [vars, anchorRef]);
}
