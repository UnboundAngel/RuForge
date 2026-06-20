import type {
  DevCaptureAnnotation,
  DevCaptureBox,
  DevCaptureSegment,
} from "../../lib/devCapturesTypes";
import { MARK_SCREEN } from "./devCaptureAnnotateMarks";
import { textLabelBounds } from "./devCaptureTextBounds";

export type AnnotationKind = "line" | "arrow" | "box" | "text" | "pin";

export type AnnotationRef = {
  kind: AnnotationKind;
  index: number;
};

export type HitHandle =
  | "body"
  | "start"
  | "end"
  | "nw"
  | "ne"
  | "sw"
  | "se";

export type HitTarget = AnnotationRef & { handle: HitHandle };

function hitSlop(displayScale: number) {
  return Math.max(8, MARK_SCREEN.pinRadius / displayScale);
}

function dist(px: number, py: number, x: number, y: number) {
  return Math.hypot(px - x, py - y);
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

function boxCorners(box: DevCaptureBox) {
  return {
    nw: { x: box.x, y: box.y },
    ne: { x: box.x + box.w, y: box.y },
    sw: { x: box.x, y: box.y + box.h },
    se: { x: box.x + box.w, y: box.y + box.h },
  };
}

function hitBox(px: number, py: number, box: DevCaptureBox, slop: number): HitHandle | null {
  const corners = boxCorners(box);
  for (const handle of ["nw", "ne", "sw", "se"] as const) {
    const c = corners[handle];
    if (dist(px, py, c.x, c.y) <= slop * 1.2) return handle;
  }
  if (px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h) {
    return "body";
  }
  return null;
}

function hitSegment(
  px: number,
  py: number,
  seg: DevCaptureSegment,
  slop: number,
): HitHandle | null {
  if (dist(px, py, seg.x1, seg.y1) <= slop) return "start";
  if (dist(px, py, seg.x2, seg.y2) <= slop) return "end";
  if (distToSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2) <= slop) return "body";
  return null;
}

export function hitTestAnnotation(
  annotation: DevCaptureAnnotation,
  px: number,
  py: number,
  displayScale: number,
  ctx?: CanvasRenderingContext2D,
): HitTarget | null {
  const slop = hitSlop(displayScale);

  const layers: HitTarget[] = [];

  annotation.pins.forEach((pin, index) => {
    const handle = dist(px, py, pin.x, pin.y) <= slop * 1.4 ? "body" : null;
    if (handle) layers.push({ kind: "pin", index, handle });
  });

  annotation.texts.forEach((label, index) => {
    const bounds = textLabelBounds(label, displayScale, ctx);
    const handle = hitBox(px, py, bounds, slop);
    if (handle) layers.push({ kind: "text", index, handle });
  });

  annotation.boxes.forEach((box, index) => {
    const handle = hitBox(px, py, box, slop);
    if (handle) layers.push({ kind: "box", index, handle });
  });

  annotation.arrows.forEach((seg, index) => {
    const handle = hitSegment(px, py, seg, slop);
    if (handle) layers.push({ kind: "arrow", index, handle });
  });

  annotation.lines.forEach((seg, index) => {
    const handle = hitSegment(px, py, seg, slop);
    if (handle) layers.push({ kind: "line", index, handle });
  });

  const top = layers[layers.length - 1];
  return top ? { kind: top.kind, index: top.index, handle: top.handle } : null;
}

export function cloneAnnotation(annotation: DevCaptureAnnotation): DevCaptureAnnotation {
  return {
    lines: annotation.lines.map((s) => ({ ...s })),
    arrows: annotation.arrows.map((s) => ({ ...s })),
    boxes: annotation.boxes.map((b) => ({ ...b })),
    texts: annotation.texts.map((t) => ({ ...t })),
    pins: annotation.pins.map((p) => ({ ...p })),
  };
}

export function applyDrag(
  base: DevCaptureAnnotation,
  hit: HitTarget,
  pointerX: number,
  pointerY: number,
  originX: number,
  originY: number,
): DevCaptureAnnotation {
  const dx = pointerX - originX;
  const dy = pointerY - originY;
  const next = cloneAnnotation(base);
  const { kind, index, handle } = hit;

  if (kind === "line" || kind === "arrow") {
    const arr = kind === "line" ? next.lines : next.arrows;
    const seg = arr[index];
    if (!seg) return next;
    if (handle === "body") {
      seg.x1 += dx;
      seg.y1 += dy;
      seg.x2 += dx;
      seg.y2 += dy;
    } else if (handle === "start") {
      seg.x1 = pointerX;
      seg.y1 = pointerY;
    } else if (handle === "end") {
      seg.x2 = pointerX;
      seg.y2 = pointerY;
    }
    return next;
  }

  if (kind === "box") {
    const box = next.boxes[index];
    if (!box) return next;
    if (handle === "body") {
      box.x += dx;
      box.y += dy;
      return next;
    }
    const right = box.x + box.w;
    const bottom = box.y + box.h;
    if (handle === "se") {
      box.w = Math.max(1, pointerX - box.x);
      box.h = Math.max(1, pointerY - box.y);
    } else if (handle === "nw") {
      const nr = right;
      const nb = bottom;
      box.x = pointerX;
      box.y = pointerY;
      box.w = Math.max(1, nr - pointerX);
      box.h = Math.max(1, nb - pointerY);
    } else if (handle === "ne") {
      const nb = bottom;
      box.y = pointerY;
      box.w = Math.max(1, pointerX - box.x);
      box.h = Math.max(1, nb - pointerY);
    } else if (handle === "sw") {
      const nr = right;
      box.x = pointerX;
      box.w = Math.max(1, nr - pointerX);
      box.h = Math.max(1, pointerY - box.y);
    }
    return next;
  }

  if (kind === "text") {
    const label = next.texts[index];
    if (!label) return next;
    const bounds = textLabelBounds(label, 1);
    if (handle === "body") {
      label.x += dx;
      label.y += dy;
      return next;
    }
    const box = {
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
    };
    const right = box.x + box.w;
    const bottom = box.y + box.h;
    if (handle === "se") {
      label.w = Math.max(24, pointerX - box.x);
      label.h = Math.max(12, pointerY - box.y);
    } else if (handle === "nw") {
      label.x = pointerX;
      label.y = pointerY;
      label.w = Math.max(24, right - pointerX);
      label.h = Math.max(12, bottom - pointerY);
    } else if (handle === "ne") {
      label.y = pointerY;
      label.w = Math.max(24, pointerX - box.x);
      label.h = Math.max(12, bottom - pointerY);
    } else if (handle === "sw") {
      label.x = pointerX;
      label.w = Math.max(24, right - pointerX);
      label.h = Math.max(12, pointerY - box.y);
    }
    return next;
  }

  if (kind === "pin") {
    const pin = next.pins[index];
    if (pin) {
      pin.x += dx;
      pin.y += dy;
    }
  }

  return next;
}

export function getHandlePositions(
  annotation: DevCaptureAnnotation,
  ref: AnnotationRef,
): { handle: HitHandle; x: number; y: number }[] {
  const { kind, index } = ref;
  if (kind === "line" || kind === "arrow") {
    const seg = (kind === "line" ? annotation.lines : annotation.arrows)[index];
    if (!seg) return [];
    return [
      { handle: "start", x: seg.x1, y: seg.y1 },
      { handle: "end", x: seg.x2, y: seg.y2 },
    ];
  }
  if (kind === "box") {
    const box = annotation.boxes[index];
    if (!box) return [];
    const c = boxCorners(box);
    return [
      { handle: "nw", x: c.nw.x, y: c.nw.y },
      { handle: "ne", x: c.ne.x, y: c.ne.y },
      { handle: "sw", x: c.sw.x, y: c.sw.y },
      { handle: "se", x: c.se.x, y: c.se.y },
    ];
  }
  if (kind === "text") {
    const label = annotation.texts[index];
    if (!label) return [];
    const bounds = textLabelBounds(label, 1);
    const c = boxCorners(bounds);
    return [
      { handle: "nw", x: c.nw.x, y: c.nw.y },
      { handle: "ne", x: c.ne.x, y: c.ne.y },
      { handle: "sw", x: c.sw.x, y: c.sw.y },
      { handle: "se", x: c.se.x, y: c.se.y },
    ];
  }
  if (kind === "pin") {
    const pin = annotation.pins[index];
    return pin ? [{ handle: "body", x: pin.x, y: pin.y }] : [];
  }
  return [];
}
