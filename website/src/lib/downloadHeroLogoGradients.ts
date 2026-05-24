/** Base matrices + pointer multipliers (Obsidian download page pattern). Tune offsets after Figma export. */
export type HeroLogoGradientSpec = {
  id: string;
  matrix: [number, number, number, number, number, number];
  offsetX: { scale: number; base: number };
  offsetY: { scale: number; base: number };
};

export const HERO_LOGO_GRADIENTS: HeroLogoGradientSpec[] = [
  {
    id: 'logo-top-left',
    matrix: [-56, -288, 149, -29, 0, 0],
    offsetX: { scale: 1.75, base: 210 },
    offsetY: { scale: 1.75, base: 306 },
  },
  {
    id: 'logo-top-right',
    matrix: [50, -379, 280, 37, 0, 0],
    offsetX: { scale: 1.25, base: 460 },
    offsetY: { scale: 1.5, base: 334 },
  },
  {
    id: 'logo-bottom-right',
    matrix: [-77, -157, 180, -89, 0, 0],
    offsetX: { scale: -1.5, base: 346 },
    offsetY: { scale: -1.25, base: 526 },
  },
  {
    id: 'logo-bottom-left',
    matrix: [-29, -189, 126, -19, 0, 0],
    offsetX: { scale: -1.25, base: 134 },
    offsetY: { scale: -1.25, base: 452 },
  },
];

export function heroLogoGradientTransform(lx: number, ly: number, spec: HeroLogoGradientSpec): string {
  const [a, b, c, d] = spec.matrix;
  const tx = spec.offsetX.scale * lx + spec.offsetX.base;
  const ty = spec.offsetY.scale * ly + spec.offsetY.base;
  return `matrix(${a} ${b} ${c} ${d} ${tx} ${ty})`;
}

export function applyHeroLogoGradientLight(svgRoot: SVGSVGElement | null, lx: number, ly: number): void {
  if (!svgRoot) return;
  for (const spec of HERO_LOGO_GRADIENTS) {
    const node = svgRoot.querySelector(`#${spec.id}`);
    if (node) {
      node.setAttribute('gradientTransform', heroLogoGradientTransform(lx, ly, spec));
    }
  }
}

export function resetHeroLogoGradientLight(svgRoot: SVGSVGElement | null): void {
  applyHeroLogoGradientLight(svgRoot, 0, 0);
}
