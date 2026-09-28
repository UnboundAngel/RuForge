import { lazy, Suspense } from "react";
import { ClassicVinylDisc } from "./classic/ClassicVinylDisc";
import type { HeroSkin } from "./heroSkin";

const CartoonDoodles = lazy(() => import("./cartoon/CartoonDoodles"));
const CartoonVinylDisc = lazy(() => import("./cartoon/CartoonVinylDisc"));
const GothicOrnaments = lazy(() => import("./gothic/GothicOrnaments"));
const GothicVinylDisc = lazy(() => import("./gothic/GothicVinylDisc"));
const CountryOrnaments = lazy(() => import("./country/CountryOrnaments"));
const CountryVinylDisc = lazy(() => import("./country/CountryVinylDisc"));
const ElectroOrnaments = lazy(() => import("./electro/ElectroOrnaments"));
const ElectroVinylDisc = lazy(() => import("./electro/ElectroVinylDisc"));
const ElectroBackdrop = lazy(() => import("./electro/ElectroBackdrop"));
const StreetOrnaments = lazy(() => import("./street/StreetOrnaments"));
const StreetVinylDisc = lazy(() => import("./street/StreetVinylDisc"));
const StreetBackdrop = lazy(() => import("./street/StreetBackdrop"));
const MuseumOrnaments = lazy(() => import("./museum/MuseumOrnaments"));
const MuseumVinylDisc = lazy(() => import("./museum/MuseumVinylDisc"));
const MuseumBackdrop = lazy(() => import("./museum/MuseumBackdrop"));
const AeroOrnaments = lazy(() => import("./aero/AeroOrnaments"));
const AeroCdDisc = lazy(() => import("./aero/AeroCdDisc"));
const AeroBackdrop = lazy(() => import("./aero/AeroBackdrop"));
const PunkOrnaments = lazy(() => import("./punk/PunkOrnaments"));
const PunkVinylDisc = lazy(() => import("./punk/PunkVinylDisc"));
const PunkBackdrop = lazy(() => import("./punk/PunkBackdrop"));
const LofiOrnaments = lazy(() => import("./lofi/LofiOrnaments"));
const LofiReelDisc = lazy(() => import("./lofi/LofiReelDisc"));
const LofiBackdrop = lazy(() => import("./lofi/LofiBackdrop"));

const SCENE_SKINS: ReadonlySet<HeroSkin> = new Set(["electro", "street", "museum", "aero", "punk", "lofi"]);

export const COVER_FACE_FRAME: Record<HeroSkin, string> = {
  classic:
    "relative z-10 block h-full w-full overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl ring-1 ring-white/10",
  // Right/bottom inset leaves room for the hard shadow inside the jacket clip.
  cartoon:
    "relative z-10 block h-[calc(100%-8px)] w-[calc(100%-8px)] overflow-hidden rounded-[22px] border-[4px] border-[#f4ecdc] bg-black shadow-[8px_8px_0_0_rgba(0,0,0,0.9)]",
  gothic: "relative z-10 block h-full w-full overflow-hidden bg-black",
  country: "relative z-10 block h-full w-full overflow-hidden bg-black",
  electro: "relative z-10 block h-full w-full overflow-hidden bg-black",
  street: "relative z-10 block h-full w-full overflow-hidden bg-black",
  museum: "relative z-10 block h-full w-full overflow-hidden bg-black",
  aero: "relative z-10 block h-full w-full overflow-hidden rounded-[18px] bg-black",
  punk: "relative z-10 block h-full w-full overflow-hidden bg-black",
  lofi: "relative z-10 block h-full w-full overflow-hidden rounded-[10px] bg-black",
};

export const SKIN_BACKDROP: Partial<Record<HeroSkin, string>> = {
  gothic:
    "bg-[radial-gradient(ellipse_at_center,rgba(40,0,4,0.25)_20%,rgba(18,0,2,0.7)_65%,rgba(0,0,0,0.92)_100%)]",
  country:
    "bg-[radial-gradient(ellipse_at_center,rgba(120,75,30,0.2)_20%,rgba(45,25,10,0.65)_68%,rgba(12,7,3,0.9)_100%)]",
  electro:
    "bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.55)_10%,rgba(0,0,0,0.88)_55%,#000_100%)]",
};

export const SKIN_DISC: Record<HeroSkin, React.ComponentType<{ coverSrc: string | null }>> = {
  classic: ClassicVinylDisc,
  cartoon: CartoonVinylDisc,
  gothic: GothicVinylDisc,
  country: CountryVinylDisc,
  electro: ElectroVinylDisc,
  street: StreetVinylDisc,
  museum: MuseumVinylDisc,
  aero: AeroCdDisc,
  punk: PunkVinylDisc,
  lofi: LofiReelDisc,
};

/** Full-bleed scene layers for skins that replace the blurred-cover backdrop. */
export function SkinScene({ skin, coverSrc }: { skin: HeroSkin; coverSrc: string | null }) {
  if (!SCENE_SKINS.has(skin)) return null;
  return (
    <Suspense fallback={null}>
      {skin === "electro" && <ElectroBackdrop coverSrc={coverSrc} />}
      {skin === "street" && <StreetBackdrop coverSrc={coverSrc} />}
      {skin === "museum" && <MuseumBackdrop />}
      {skin === "aero" && <AeroBackdrop />}
      {skin === "punk" && <PunkBackdrop />}
      {skin === "lofi" && <LofiBackdrop />}
    </Suspense>
  );
}

/** Decoration around the jacket; must sit inside the sized art box so sibling layers share its vars. */
export function SkinOrnaments({
  skin,
  coverSrc,
  animate,
  bobbing,
}: {
  skin: HeroSkin;
  coverSrc: string | null;
  animate: boolean;
  bobbing: boolean;
}) {
  return (
    <Suspense fallback={null}>
      {skin === "cartoon" && <CartoonDoodles bobbing={bobbing} />}
      {skin === "gothic" && <GothicOrnaments animate={animate} coverSrc={coverSrc} />}
      {skin === "country" && <CountryOrnaments animate={animate} />}
      {skin === "electro" && <ElectroOrnaments />}
      {skin === "street" && <StreetOrnaments />}
      {skin === "museum" && <MuseumOrnaments />}
      {skin === "aero" && <AeroOrnaments animate={animate} coverSrc={coverSrc} />}
      {skin === "punk" && <PunkOrnaments />}
      {skin === "lofi" && <LofiOrnaments />}
    </Suspense>
  );
}
