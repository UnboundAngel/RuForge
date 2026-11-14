import { effectiveCursor } from "./cursorRules";
import { shapeForKeyword, type Shape } from "./cursorShapes";

const EDITABLE = "input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=color]), textarea, [contenteditable=''], [contenteditable=true]";

/** What the UA would pick for `cursor: auto`. */
function autoShape(el: Element): Shape {
  if (el.closest(EDITABLE)) return "text";
  if (el.closest("a[href]")) return "pointer";
  const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
  return hasText && getComputedStyle(el).userSelect !== "none" ? "text" : "default";
}

/** The cursor the app would show over `el`, read from stylesheet rules so the page is never restyled. */
export function resolveShape(el: Element | null, held: boolean): Shape {
  if (!el) return "default";
  let shape = shapeForKeyword(effectiveCursor(el));
  // Drag libraries set the cursor on body for the whole drag, even over elements with their own.
  if (held) {
    const bodyShape = shapeForKeyword(effectiveCursor(document.body));
    if (bodyShape !== "auto" && bodyShape !== "default") shape = bodyShape;
  }
  if (shape === "auto") shape = autoShape(el);
  if (held && shape === "grab") shape = "grabbing";
  return shape;
}
