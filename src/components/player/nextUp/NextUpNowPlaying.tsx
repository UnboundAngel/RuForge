import { useRef, useState } from "react";
import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import type { MediaFile } from "../../../types";
import { NextUpThumb, nextUpMeta, nextUpTitle } from "./NextUpCard";

export const SECTION_LABEL = "text-[10px] font-bold uppercase tracking-widest text-white/40";

/** The item that is playing: a full-width frame with its title underneath. No hover plate, it is not a target. */
export function NextUpNowPlaying({ item }: { item: MediaFile }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [clipped, setClipped] = useState(false);
  const title = nextUpTitle(item);
  const meta = nextUpMeta(item, true);

  return (
    <section className="px-4 pb-1" aria-label="Now playing">
      <p className={`${SECTION_LABEL} px-1`}>Now playing</p>
      <NextUpThumb item={item} radius={14} className="mt-2 w-full" />
      <h3
        ref={titleRef}
        onMouseEnter={() => {
          const el = titleRef.current;
          setClipped(!!el && el.scrollHeight > el.clientHeight + 1);
        }}
        data-tooltip={clipped ? title : undefined}
        className="mt-2.5 line-clamp-2 px-1 text-[15px] font-semibold leading-snug text-stone-50"
      >
        {title}
      </h3>
      {meta ? (
        <div className="mt-0.5 px-1">
          <HoverMarqueeText text={meta} className="text-[11px] text-stone-500" />
        </div>
      ) : null}
    </section>
  );
}
