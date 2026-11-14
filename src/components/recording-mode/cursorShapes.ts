import allScroll from "@/assets/recording-cursors/all-scroll.svg";
import crosshair from "@/assets/recording-cursors/crosshair.svg";
import defaultArrow from "@/assets/recording-cursors/default.svg";
import ewResize from "@/assets/recording-cursors/ew-resize.svg";
import grab from "@/assets/recording-cursors/grab.svg";
import grabbing from "@/assets/recording-cursors/grabbing.svg";
import neswResize from "@/assets/recording-cursors/nesw-resize.svg";
import noDrop from "@/assets/recording-cursors/no-drop.svg";
import notAllowed from "@/assets/recording-cursors/not-allowed.svg";
import nsResize from "@/assets/recording-cursors/ns-resize.svg";
import nwseResize from "@/assets/recording-cursors/nwse-resize.svg";
import pointer from "@/assets/recording-cursors/pointer.svg";
import text from "@/assets/recording-cursors/text.svg";

export type Shape =
  | "default" | "pointer" | "text" | "grab" | "grabbing" | "not-allowed" | "no-drop"
  | "all-scroll" | "ew-resize" | "ns-resize" | "nesw-resize" | "nwse-resize" | "crosshair" | "none";

/** Artboard is 256 units; hotspots come from the theme's x.build.toml (centre where it lists none). */
export const ARTBOARD = 256;
/** On-screen size in px; the theme's glyphs fill about half of the artboard. */
export const CURSOR_PX = 40;

export const SHAPES: Record<Exclude<Shape, "none">, { url: string; hx: number; hy: number }> = {
  default: { url: defaultArrow, hx: 80, hy: 38 },
  pointer: { url: pointer, hx: 92, hy: 53 },
  text: { url: text, hx: 129, hy: 136 },
  grab: { url: grab, hx: 134, hy: 81 },
  grabbing: { url: grabbing, hx: 139, hy: 86 },
  "not-allowed": { url: notAllowed, hx: 56, hy: 17 },
  "no-drop": { url: noDrop, hx: 128, hy: 128 },
  "all-scroll": { url: allScroll, hx: 128, hy: 128 },
  "ew-resize": { url: ewResize, hx: 128, hy: 128 },
  "ns-resize": { url: nsResize, hx: 128, hy: 128 },
  "nesw-resize": { url: neswResize, hx: 128, hy: 128 },
  "nwse-resize": { url: nwseResize, hx: 128, hy: 128 },
  crosshair: { url: crosshair, hx: 128, hy: 128 },
};

const BY_KEYWORD: Record<string, Shape> = {
  default: "default", pointer: "pointer", text: "text", "vertical-text": "text",
  grab: "grab", grabbing: "grabbing", "not-allowed": "not-allowed", "no-drop": "no-drop",
  move: "all-scroll", "all-scroll": "all-scroll",
  "col-resize": "ew-resize", "ew-resize": "ew-resize", "e-resize": "ew-resize", "w-resize": "ew-resize",
  "row-resize": "ns-resize", "ns-resize": "ns-resize", "n-resize": "ns-resize", "s-resize": "ns-resize",
  "nesw-resize": "nesw-resize", "ne-resize": "nesw-resize", "sw-resize": "nesw-resize",
  "nwse-resize": "nwse-resize", "nw-resize": "nwse-resize", "se-resize": "nwse-resize",
  crosshair: "crosshair", cell: "crosshair", none: "none",
};

/** The last token of a computed cursor list is its keyword fallback; unknown ones (wait, help) read as the arrow. */
export function shapeForKeyword(computed: string): Shape | "auto" {
  const parts = computed.split(",");
  const kw = parts[parts.length - 1].trim().toLowerCase();
  if (kw === "auto") return "auto";
  return BY_KEYWORD[kw] ?? "default";
}
