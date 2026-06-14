import type { CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

type ResizeDirection =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthEast"
  | "NorthWest"
  | "SouthEast"
  | "SouthWest";

const EDGE_PX = 6;
const CORNER_PX = 10;

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

function startResize(direction: ResizeDirection) {
  void getCurrentWindow().startResizeDragging(direction).catch(console.error);
}

type EdgeProps = {
  direction: ResizeDirection;
  className: string;
  style?: CSSProperties;
};

function ResizeHit({ direction, className, style }: EdgeProps) {
  return (
    <div
      className={className}
      style={{ ...noDragStyle, ...style }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startResize(direction);
      }}
      aria-hidden
    />
  );
}

/** Borderless main window: native edge resize breaks when `shadow: false`; these strips restore it. */
export function WindowResizeEdges({ active = true }: { active?: boolean }) {
  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[198]" aria-hidden>
      <ResizeHit
        direction="North"
        className="pointer-events-auto fixed left-0 right-0 top-0 cursor-ns-resize"
        style={{ height: EDGE_PX }}
      />
      <ResizeHit
        direction="South"
        className="pointer-events-auto fixed bottom-0 left-0 right-0 cursor-ns-resize"
        style={{ height: EDGE_PX }}
      />
      <ResizeHit
        direction="West"
        className="pointer-events-auto fixed bottom-0 left-0 top-0 cursor-ew-resize"
        style={{ width: EDGE_PX }}
      />
      <ResizeHit
        direction="East"
        className="pointer-events-auto fixed bottom-0 right-0 top-0 cursor-ew-resize"
        style={{ width: EDGE_PX }}
      />
      <ResizeHit
        direction="NorthWest"
        className="pointer-events-auto fixed left-0 top-0 cursor-nwse-resize"
        style={{ width: CORNER_PX, height: CORNER_PX }}
      />
      <ResizeHit
        direction="NorthEast"
        className="pointer-events-auto fixed right-0 top-0 cursor-nesw-resize"
        style={{ width: CORNER_PX, height: CORNER_PX }}
      />
      <ResizeHit
        direction="SouthWest"
        className="pointer-events-auto fixed bottom-0 left-0 cursor-nesw-resize"
        style={{ width: CORNER_PX, height: CORNER_PX }}
      />
      <ResizeHit
        direction="SouthEast"
        className="pointer-events-auto fixed bottom-0 right-0 cursor-nwse-resize"
        style={{ width: CORNER_PX, height: CORNER_PX }}
      />
    </div>
  );
}
