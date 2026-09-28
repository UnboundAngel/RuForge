import { Suspense, useLayoutEffect, useRef, useState } from "react";
import { Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClassicVinylDisc } from "../classic/ClassicVinylDisc";
import { COVER_FACE_FRAME, SKIN_BACKDROP, SKIN_DISC, SkinOrnaments, SkinScene } from "../skinParts";
import type { HeroSkin } from "../heroSkin";

/** Rendered at hero size then scaled to the box, so px-sized ornaments keep their proportions. */
const ART = 360;
/**
 * Footprint relative to ART, centered on the jacket: the disc peeks ~0.45 left,
 * and the tallest ornaments (street crown, country sign) reach ~0.3 above.
 */
const FOOT_W = 2.1;
const FOOT_H = 1.75;
function useFitScale(ref: React.RefObject<HTMLElement | null>) {
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(width / (ART * FOOT_W), height / (ART * FOOT_H)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

function Backdrop({ skin, coverSrc }: { skin: HeroSkin | null; coverSrc: string | null }) {
  return (
    <>
      {coverSrc && (
        <img
          src={coverSrc}
          alt=""
          className={cn(
            "absolute inset-0 size-full scale-125 object-cover blur-2xl",
            skin ? "opacity-60" : "opacity-20 grayscale",
          )}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 to-black/75" />
      {skin && SKIN_BACKDROP[skin] && <div className={`absolute inset-0 ${SKIN_BACKDROP[skin]}`} />}
      {skin && <SkinScene skin={skin} coverSrc={coverSrc} />}
    </>
  );
}

function Stage({ skin, coverSrc, live, spin }: { skin: HeroSkin; coverSrc: string | null; live: boolean; spin: boolean }) {
  const Disc = SKIN_DISC[skin];
  return (
    <>
      <SkinOrnaments skin={skin} coverSrc={coverSrc} animate={live} bobbing={live} />
      <div className="relative size-full" style={{ clipPath: "inset(0 0 0 -62%)" }}>
        <div className="absolute top-0 size-full" style={{ left: "-40%" }}>
          <div
            className={cn(
              "size-full overflow-hidden rounded-full",
              spin
                ? "motion-safe:animate-spin motion-safe:[animation-duration:3s]"
                : "motion-safe:group-hover:animate-spin motion-safe:group-hover:[animation-duration:3s]",
            )}
          >
            <Suspense fallback={<ClassicVinylDisc coverSrc={coverSrc} />}>
              <Disc coverSrc={coverSrc} />
            </Suspense>
          </div>
        </div>
        <div className="relative z-10 size-full">
          <div className={COVER_FACE_FRAME[skin]}>
            {coverSrc ? (
              <img src={coverSrc} alt="" className="block size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center bg-white/5">
                <Music className="size-24 text-[color:var(--accent)] opacity-35" strokeWidth={1} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Silhouette() {
  return (
    <div className="relative size-full">
      <div className="absolute top-0 size-full rounded-full bg-black/75 ring-1 ring-white/[0.06]" style={{ left: "-40%" }} />
      <div className="relative flex size-full items-center justify-center rounded-2xl bg-[#0a0a0a] ring-1 ring-white/10">
        <span className="text-[150px] font-black leading-none text-white/10">?</span>
      </div>
    </div>
  );
}

/** Locked skins render a silhouette and never load their chunk. */
export function SkinPreview({
  skin,
  coverSrc,
  locked,
  live = false,
  spin = false,
  reserveBottom = 0,
  bare = false,
}: {
  skin: HeroSkin;
  coverSrc: string | null;
  locked: boolean;
  live?: boolean;
  spin?: boolean;
  /** Px kept clear at the bottom for an overlaid label; the backdrop still fills it. */
  reserveBottom?: number;
  /** No scene behind the skin, and ornaments may overflow the box. */
  bare?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale(stageRef);
  return (
    <div className={cn("absolute inset-0", !bare && "overflow-hidden")} aria-hidden>
      {!bare && <Backdrop skin={locked ? null : skin} coverSrc={coverSrc} />}
      <div
        ref={stageRef}
        className="absolute inset-x-0 top-0 transition-[scale] duration-300 ease-out group-hover:scale-[1.04]"
        style={{ bottom: reserveBottom }}
      >
        {scale > 0 && (
          <div
            className="absolute"
            style={{
              width: ART,
              height: ART,
              left: `calc(50% - ${ART / 2}px)`,
              top: `calc(50% - ${ART / 2}px)`,
              scale,
            }}
          >
            {locked ? <Silhouette /> : <Stage skin={skin} coverSrc={coverSrc} live={live} spin={spin} />}
          </div>
        )}
      </div>
    </div>
  );
}
