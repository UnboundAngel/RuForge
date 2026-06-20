import type { DevCaptureTextLabel } from "../../lib/devCapturesTypes";
import { MARK_SCREEN } from "./devCaptureAnnotateMarks";

export function textLabelBounds(
  label: DevCaptureTextLabel,
  displayScale: number,
  ctx?: CanvasRenderingContext2D,
) {
  const fontSize = MARK_SCREEN.textFont / displayScale;
  if (label.w != null && label.h != null) {
    return { x: label.x, y: label.y, w: label.w, h: label.h, fontSize: label.h / 1.2 };
  }
  let w = label.text.length * fontSize * 0.55;
  if (ctx) {
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    w = ctx.measureText(label.text).width;
  }
  const h = fontSize * 1.2;
  return { x: label.x, y: label.y, w, h, fontSize };
}

export function measureTextLabel(
  text: string,
  displayScale: number,
  ctx?: CanvasRenderingContext2D,
) {
  const fontSize = MARK_SCREEN.textFont / displayScale;
  let w = text.length * fontSize * 0.55;
  if (ctx) {
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    w = ctx.measureText(text).width;
  }
  const h = fontSize * 1.2;
  return { w: Math.max(w, 24), h, fontSize };
}
