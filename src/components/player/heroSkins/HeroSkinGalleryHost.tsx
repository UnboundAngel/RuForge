import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { GALLERY_EVENT } from "./heroSkin";

const HeroSkinGallery = lazy(() => import("./gallery/HeroSkinGallery"));

/** Mounts the secret skin gallery on demand; nothing loads until the gallery word is typed. */
export function HeroSkinGalleryHost({ coverSrc }: { coverSrc: string | null }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const [theme, setTheme] = useState<"app" | "music">("app");
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onOpen = () => {
      setTheme(anchorRef.current?.closest("[data-music-mode]") ? "music" : "app");
      setRequested(true);
      setOpen(true);
    };
    window.addEventListener(GALLERY_EVENT, onOpen);
    return () => window.removeEventListener(GALLERY_EVENT, onOpen);
  }, []);

  return (
    <>
      <span ref={anchorRef} hidden />
      {requested && (
        <Suspense fallback={null}>
          <HeroSkinGallery open={open} theme={theme} coverSrc={coverSrc} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
