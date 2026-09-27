import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Icon } from "@iconify/react";

const FADE = { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const };

export function MusicArtistAboutHero({ images }: { images: string[][] }) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const list = useMemo(() => {
    const out: string[] = [];
    for (const chain of images) {
      const src = chain.find((s) => !broken.has(s));
      if (src && !out.includes(src)) out.push(src);
    }
    return out;
  }, [images, broken]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= list.length && list.length > 0) setIndex(list.length - 1);
  }, [index, list.length]);

  const src = list[index] ?? null;
  const step = (dir: 1 | -1) => setIndex((i) => (i + dir + list.length) % list.length);

  return (
    <div className="group/hero relative h-[min(46vh,360px)] w-full overflow-hidden bg-black">
      <AnimatePresence initial={false}>
        {src ? (
          <motion.img
            key={src}
            src={src}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            onError={() => setBroken((prev) => new Set(prev).add(src))}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/25">
            <Icon icon="solar:music-note-bold" width={56} height={56} aria-hidden />
          </div>
        )}
      </AnimatePresence>
      {list.length > 1 && (
        <>
          <HeroArrow side="left" onClick={() => step(-1)} />
          <HeroArrow side="right" onClick={() => step(1)} />
          <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {list.map((s, i) => (
              <span
                key={s}
                className="h-1.5 w-1.5 rounded-full bg-white transition-opacity duration-200"
                style={{ opacity: i === index ? 0.9 : 0.3 }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HeroArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Chevron = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={`rf-music-press absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-3" : "right-3"} flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white/80 opacity-0 transition-opacity duration-150 hover:text-white group-hover/hero:opacity-100 focus-visible:opacity-100`}
    >
      <Chevron size={20} aria-hidden />
    </button>
  );
}
