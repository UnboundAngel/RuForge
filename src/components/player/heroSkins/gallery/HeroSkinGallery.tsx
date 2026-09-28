import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { OVERLAY_Z_CLASS } from "@/lib/overlayZIndex";
import { cn } from "@/lib/utils";
import { SECRET_SKINS, readFoundSkins, setHeroSkin, useHeroSkin, type HeroSkin } from "../heroSkin";
import { GALLERY_ENTRIES } from "./galleryEntries";
import { SkinPreview } from "./SkinPreview";
import { SkinSpotlightInfo } from "./SkinSpotlightInfo";
import { SkinStrip } from "./SkinStrip";
import { SkinThumb } from "./SkinThumb";

const CAPTION_PX = 110;

export default function HeroSkinGallery({
  open,
  theme,
  coverSrc,
  onClose,
}: {
  open: boolean;
  theme: "app" | "music";
  coverSrc: string | null;
  onClose: () => void;
}) {
  const current = useHeroSkin(false);
  const reduceMotion = useReducedMotion() ?? false;
  const [found, setFound] = useState<HeroSkin[]>(readFoundSkins);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!open) return;
    setFound(readFoundSkins());
    setSelected(Math.max(0, GALLERY_ENTRIES.findIndex((e) => e.skin === current)));
    // Only on open; later skin changes should not yank the selection.
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setSelected((i) => (i + 1) % GALLERY_ENTRIES.length);
      else if (e.key === "ArrowLeft") setSelected((i) => (i - 1 + GALLERY_ENTRIES.length) % GALLERY_ENTRIES.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isKnown = (skin: HeroSkin) => skin === "classic" || found.includes(skin);
  const foundCount = SECRET_SKINS.filter((s) => found.includes(s.skin)).length;
  const entry = GALLERY_ENTRIES[selected];
  const known = isKnown(entry.skin);

  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="hero-skin-gallery"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hero-skin-gallery-title"
          data-music-mode={theme === "music" ? "true" : undefined}
          className={cn(
            "fixed inset-0 flex items-center justify-center bg-black/90 p-[clamp(24px,4vw,64px)] backdrop-blur-md",
            OVERLAY_Z_CLASS.settings,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
        >
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close gallery" onClick={onClose} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-5 right-5 z-10 rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </button>

          <motion.div
            className="pointer-events-none relative flex h-full max-h-[1100px] w-full max-w-[1600px] flex-col gap-[clamp(14px,2vh,24px)]"
            initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.32, ease: [0.33, 1, 0.68, 1] }}
          >
            <header className="flex items-end justify-between gap-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">Secret collection</p>
                <h2 id="hero-skin-gallery-title" className="text-3xl font-black tracking-tight text-white">
                  Skins
                </h2>
              </div>
              <div className="flex items-center gap-3 pb-1">
                <div className="flex gap-1">
                  {SECRET_SKINS.map((s) => (
                    <span
                      key={s.skin}
                      className={cn("h-1 w-7 rounded-full", found.includes(s.skin) ? "bg-[color:var(--accent)]" : "bg-white/15")}
                    />
                  ))}
                </div>
                <span className="text-[12px] tabular-nums text-white/45">
                  {foundCount} of {SECRET_SKINS.length} found
                </span>
              </div>
            </header>

            <section className="pointer-events-auto relative flex min-h-0 flex-1 overflow-hidden rounded-3xl bg-black ring-1 ring-white/10">
              <AnimatePresence initial={false}>
                <motion.div
                  key={entry.skin}
                  className="absolute inset-0"
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <SkinPreview
                    skin={entry.skin}
                    coverSrc={coverSrc}
                    locked={!known}
                    live={!reduceMotion}
                    spin
                  />
                </motion.div>
              </AnimatePresence>
              <div
                className="absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/45 to-transparent px-[clamp(20px,3vw,40px)] pb-[clamp(16px,2.4vw,32px)]"
                style={{ height: CAPTION_PX + 40 }}
              >
                <SkinSpotlightInfo
                  entry={entry}
                  index={selected}
                  total={GALLERY_ENTRIES.length}
                  known={known}
                  wearing={current === entry.skin}
                  theme={theme}
                  onWear={() => setHeroSkin(entry.skin)}
                />
              </div>
            </section>

            <SkinStrip selected={selected}>
              {GALLERY_ENTRIES.map((e, i) => (
                <SkinThumb
                  key={e.skin}
                  entry={e}
                  known={isKnown(e.skin)}
                  selected={i === selected}
                  wearing={current === e.skin}
                  coverSrc={coverSrc}
                  onSelect={() => setSelected(i)}
                />
              ))}
            </SkinStrip>

            <p className="text-center text-[11px] text-white/35">Arrow keys to browse. Esc to close.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(overlay, document.body);
}
