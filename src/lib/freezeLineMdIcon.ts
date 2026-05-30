/**
 * line-md icons use SVG SMIL with fill="freeze". CSS `animation:none` has no
 * effect on SMIL. Setting begin="indefinite" leaves the icon at t=0, which is
 * invisible for most line-md icons (paths start with full dashoffset).
 *
 * The correct idle approach: seek to t=9999 so every animation lands on its
 * fill="freeze" end state, which is the fully-drawn glyph.
 */
export function seekLineMdToEnd(root: HTMLElement | null): boolean {
  if (!root) return false;
  const svgs = root.querySelectorAll<SVGSVGElement>("svg");
  if (!svgs.length) return false;
  svgs.forEach((svg) => {
    try {
      svg.setCurrentTime(9999);
    } catch {
      /* WebView2 is Chromium and supports setCurrentTime; ignore edge cases */
    }
  });
  return true;
}

/** Cap line-md SMIL step duration so hover animations finish within ~maxDurSec. */
export function accelerateLineMdAnimations(
  root: HTMLElement | null,
  maxDurSec = 0.28,
): void {
  if (!root) return;
  const dur = `${maxDurSec}s`;
  root.querySelectorAll<SVGAnimationElement>("animate, animateTransform, set").forEach((node) => {
    if (node.getAttribute("dur")) node.setAttribute("dur", dur);
  });
}
