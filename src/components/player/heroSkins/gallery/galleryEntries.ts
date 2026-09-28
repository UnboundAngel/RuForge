import { SECRET_SKINS, type HeroSkin, type SecretSkin } from "../heroSkin";

export type GalleryEntry = {
  skin: HeroSkin;
  label: string;
  word?: string;
  blurb: string;
  hint: string;
};

const COPY: Record<SecretSkin["skin"], { blurb: string; hint: string }> = {
  cartoon: { blurb: "Ink outlines and bouncing doodles.", hint: "Saturday mornings. Four letters." },
  gothic: { blurb: "Iron molding, spikes, candlelight.", hint: "Black lace and candle smoke. Four letters." },
  country: { blurb: "Barn boards and a wanted poster.", hint: "How a cowboy says hello." },
  electro: { blurb: "LED wall and a glass record.", hint: "Just name the genre." },
  street: { blurb: "Wheat paste, a chain, and the decks.", hint: "What a verse is made of. Four letters." },
  museum: { blurb: "Gilded frame, gallery light, a 78 on shellac.", hint: "A composer's numbered work. Four letters." },
  aero: { blurb: "Glass, gloss, bubbles, and a burned CD.", hint: "Glossy, bubbly, very 2007. Four letters." },
  punk: { blurb: "Cut paper, halftone, ransom-note letters.", hint: "Safety pins and three chords. Four letters." },
  lofi: { blurb: "Late night desk, rain on the window, city asleep.", hint: "Beats to relax and study to. Four letters." },
};

export const GALLERY_ENTRIES: readonly GalleryEntry[] = [
  { skin: "classic", label: "Classic", blurb: "The house record.", hint: "" },
  ...SECRET_SKINS.map((s): GalleryEntry => ({ ...s, ...COPY[s.skin] })),
];
