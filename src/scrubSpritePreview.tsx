import { convertFileSrc } from "@tauri-apps/api/core";

/** Matches `extract_frames` in `lib.rs`: fps=1/5, scale=160:90, tile=10x10 */
export const SECONDS_PER_THUMB = 5;
export const SPRITE_GRID = 10;
export const CELL_W = 160;
export const CELL_H = 90;
export const SHEET_W = CELL_W * SPRITE_GRID;
export const SHEET_H = CELL_H * SPRITE_GRID;

export function pickSpriteCell(
  hoverTimeSec: number,
  videoDurationSec: number,
  spritePaths: string[],
): { path: string; col: number; row: number } | null {
  if (spritePaths.length === 0 || !Number.isFinite(videoDurationSec) || videoDurationSec <= 0) {
    return null;
  }
  const sorted = [...spritePaths].sort();
  const maxFrame = sorted.length * 100 - 1;
  if (maxFrame < 0) return null;
  const frameIdx = Math.min(
    Math.max(0, Math.floor(hoverTimeSec / SECONDS_PER_THUMB)),
    maxFrame,
  );
  const sheetIdx = Math.floor(frameIdx / 100);
  const cell = frameIdx % 100;
  const col = cell % SPRITE_GRID;
  const row = Math.floor(cell / SPRITE_GRID);
  if (sheetIdx >= sorted.length) return null;
  return { path: sorted[sheetIdx], col, row };
}

/** Hover preview: one cell from the ffmpeg sprite sheet, scaled to `displayWidth` px wide. */
export function ScrubberHoverThumb({
  hoverTimeSec,
  duration,
  spritePaths,
  displayWidth,
  className = "",
}: {
  hoverTimeSec: number;
  duration: number;
  spritePaths: string[];
  displayWidth: number;
  className?: string;
}) {
  const picked = pickSpriteCell(hoverTimeSec, duration, spritePaths);
  if (!picked) return null;
  const { path, col, row } = picked;
  const scale = displayWidth / CELL_W;
  const displayHeight = CELL_H * scale;
  const url = convertFileSrc(path);

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-black ${className}`}
      style={{ width: displayWidth, height: displayHeight }}
    >
      <img
        src={url}
        alt=""
        width={SHEET_W * scale}
        height={SHEET_H * scale}
        className="max-w-none select-none pointer-events-none"
        style={{
          transform: `translate(${-col * CELL_W * scale}px, ${-row * CELL_H * scale}px)`,
          transformOrigin: "0 0",
        }}
        draggable={false}
      />
    </div>
  );
}
