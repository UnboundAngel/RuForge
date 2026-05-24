/** Radial fills exported from Figma (`public/RuForgeLogo.svg`). */

export type DownloadHeroLogoGradient = {
  gradientId: string;
  tx: number;
  ty: number;
  rotate: number;
  sx: number;
  sy: number;
  /** Pointer offset multipliers (Obsidian-style, lx/ly roughly -50..50). */
  mx: number;
  my: number;
};

export const DOWNLOAD_HERO_LOGO_GRADIENTS: DownloadHeroLogoGradient[] = [
  {
    gradientId: 'paint2_radial_0_1',
    tx: 86.5,
    ty: 101,
    rotate: 42.8591,
    sx: 75.7133,
    sy: 75.7133,
    mx: 1.75,
    my: 1.75,
  },
  {
    gradientId: 'paint0_radial_0_1',
    tx: 147.5,
    ty: 98.5,
    rotate: 145.114,
    sx: 66.4398,
    sy: 58.8635,
    mx: 1.25,
    my: 1.5,
  },
  {
    gradientId: 'paint1_radial_0_1',
    tx: 105.5,
    ty: 151,
    rotate: -39.4547,
    sx: 73.1745,
    sy: 65.7074,
    mx: -1.25,
    my: -1.25,
  },
  {
    gradientId: 'paint3_radial_0_1',
    tx: 154,
    ty: 152,
    rotate: -124.216,
    sx: 75.5811,
    sy: 84.4156,
    mx: -1.5,
    my: -1.25,
  },
];

/** Match Obsidian download page: lx/ly shift gradient origin in viewBox units. */
const POINTER_SCALE = 1;

export function applyDownloadHeroLogoLight(
  svg: ParentNode,
  lx: number,
  ly: number,
  gradients: DownloadHeroLogoGradient[] = DOWNLOAD_HERO_LOGO_GRADIENTS,
) {
  for (const gradient of gradients) {
    const node = svg.querySelector(`#${CSS.escape(gradient.gradientId)}`);
    if (!node) continue;
    const tx = gradient.tx + lx * gradient.mx * POINTER_SCALE;
    const ty = gradient.ty + ly * gradient.my * POINTER_SCALE;
    node.setAttribute(
      'gradientTransform',
      `translate(${tx} ${ty}) rotate(${gradient.rotate}) scale(${gradient.sx} ${gradient.sy})`,
    );
  }
}
