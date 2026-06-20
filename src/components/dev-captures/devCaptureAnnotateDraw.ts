import type { DevCaptureAnnotation, DevCaptureSegment } from "../../lib/devCapturesTypes";
import type { AnnotationRef } from "./devCaptureAnnotateHit";
import { getHandlePositions } from "./devCaptureAnnotateHit";
import { MARK_SCREEN } from "./devCaptureAnnotateMarks";
import { textLabelBounds } from "./devCaptureTextBounds";

const ACCENT = "#e85d4c";
const PIN_INK = "#1c1512";
function inImageUnits(screenPx: number, displayScale: number) {
  return screenPx / displayScale;
}

function segmentBox(seg: DevCaptureSegment) {
  const x = Math.min(seg.x1, seg.x2);
  const y = Math.min(seg.y1, seg.y2);
  return {
    x,
    y,
    w: Math.abs(seg.x2 - seg.x1),
    h: Math.abs(seg.y2 - seg.y1),
  };
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  headLen: number,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const wing = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - wing), y2 - headLen * Math.sin(angle - wing));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle + wing), y2 - headLen * Math.sin(angle + wing));
  ctx.stroke();
}

export function drawDevCaptureAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: DevCaptureAnnotation,
  displayScale: number,
  draft?: {
    segment: DevCaptureSegment | null;
    segmentTool: "line" | "arrow" | "box" | null;
  },
) {
  const stroke = inImageUnits(MARK_SCREEN.stroke, displayScale);
  const pinRadius = inImageUnits(MARK_SCREEN.pinRadius, displayScale);
  const pinFont = inImageUnits(MARK_SCREEN.pinFont, displayScale);
  const arrowHead = inImageUnits(MARK_SCREEN.arrowHead, displayScale);

  ctx.lineWidth = stroke;
  ctx.strokeStyle = ACCENT;
  ctx.fillStyle = ACCENT;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const line of annotation.lines) {
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }

  for (const arrow of annotation.arrows) {
    ctx.beginPath();
    ctx.moveTo(arrow.x1, arrow.y1);
    ctx.lineTo(arrow.x2, arrow.y2);
    ctx.stroke();
    drawArrowHead(ctx, arrow.x1, arrow.y1, arrow.x2, arrow.y2, arrowHead);
  }

  for (const box of annotation.boxes) {
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const label of annotation.texts) {
    const { fontSize } = textLabelBounds(label, displayScale, ctx);
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    ctx.fillText(label.text, label.x, label.y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${pinFont}px system-ui, sans-serif`;
  for (const pin of annotation.pins) {
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, pinRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PIN_INK;
    ctx.fillText(String(pin.n), pin.x, pin.y);
    ctx.fillStyle = ACCENT;
  }

  if (draft?.segment && draft.segmentTool === "line") {
    const seg = draft.segment;
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
  }

  if (draft?.segment && draft.segmentTool === "arrow") {
    const seg = draft.segment;
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
    drawArrowHead(ctx, seg.x1, seg.y1, seg.x2, seg.y2, arrowHead);
  }

  if (draft?.segment && draft.segmentTool === "box") {
    const box = segmentBox(draft.segment);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  }
}

export function drawSelectionHandles(
  ctx: CanvasRenderingContext2D,
  annotation: DevCaptureAnnotation,
  selection: AnnotationRef | null,
  displayScale: number,
) {
  if (!selection) return;
  const handles = getHandlePositions(annotation, selection);
  const r = inImageUnits(5, displayScale);
  ctx.fillStyle = "#f5f5f4";
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = inImageUnits(2, displayScale);
  for (const h of handles) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
export function mapPointerToImage(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  imageWidth: number,
  imageHeight: number,
) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = imageWidth / rect.width;
  const scaleY = imageHeight / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}
