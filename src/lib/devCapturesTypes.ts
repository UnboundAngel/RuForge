export type DevCaptureEntry = {
  path: string;
  name: string;
  modifiedMs: number;
};

export type DevCaptureSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type DevCaptureBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DevCaptureTextLabel = {
  x: number;
  y: number;
  text: string;
  /** Image-space box width; optional for labels created before resize support. */
  w?: number;
  /** Image-space box height; font size derives from h / 1.2 when drawing. */
  h?: number;
};

export type DevCapturePin = {
  x: number;
  y: number;
  n: number;
};

export type DevCaptureAnnotation = {
  lines: DevCaptureSegment[];
  arrows: DevCaptureSegment[];
  boxes: DevCaptureBox[];
  texts: DevCaptureTextLabel[];
  pins: DevCapturePin[];
};

export type DevCaptureAnnotateTool =
  | "select"
  | "line"
  | "arrow"
  | "box"
  | "text"
  | "pin";

export function emptyDevCaptureAnnotation(): DevCaptureAnnotation {
  return { lines: [], arrows: [], boxes: [], texts: [], pins: [] };
}
