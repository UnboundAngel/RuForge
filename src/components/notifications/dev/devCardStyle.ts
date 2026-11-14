import { OVERLAY_EASE } from "@/lib/overlayMotion";

/** A dev card speaks in two tones and two sizes: primary and muted, 13px title and 12px everything else. */
export const tone = (read: boolean) => ({
  primary: read ? "text-stone-300" : "text-stone-50",
  muted: read ? "text-stone-500" : "text-stone-400",
});

export const ROW_ENTER = {
  hidden: { opacity: 0, y: -6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: OVERLAY_EASE } },
};
