import { convertFileSrc } from "@tauri-apps/api/core";

/** Matches `extract_frames` in `lib.rs`: fps=1/5, scale=160:90, tile=10x10 */
export const SECONDS_PER_THUMB = 5;
export const SPRITE_GRID = 10;
export const CELL_W = 160;
export const CELL_H = 90;
export const SHEET_W = CELL_W * SPRITE_GRID;
export const SHEET_H = CELL_H * SPRITE_GRID;

export function spriteSheetIndexForHover(
  hoverTimeSec: number,
  spritePathCount: number,
): number {
  if (spritePathCount <= 0) return 0;
  const maxFrame = spritePathCount * 100 - 1;
  if (maxFrame < 0) return 0;
  const frameIdx = Math.min(
    Math.max(0, Math.floor(hoverTimeSec / SECONDS_PER_THUMB)),
    maxFrame,
  );
  return Math.floor(frameIdx / 100);
}

export function pickSpriteCell(
  hoverTimeSec: number,
  videoDurationSec: number,
  spritePaths: string[],
): { path: string; col: number; row: number } | null {
  if (spritePaths.length === 0 || !Number.isFinite(videoDurationSec) || videoDurationSec <= 0) {
    return null;
  }
  const sheetIdx = spriteSheetIndexForHover(hoverTimeSec, spritePaths.length);
  const maxFrame = spritePaths.length * 100 - 1;
  if (maxFrame < 0) return null;
  const frameIdx = Math.min(
    Math.max(0, Math.floor(hoverTimeSec / SECONDS_PER_THUMB)),
    maxFrame,
  );
  const cell = frameIdx % 100;
  const col = cell % SPRITE_GRID;
  const row = Math.floor(cell / SPRITE_GRID);
  if (sheetIdx >= spritePaths.length) return null;
  return { path: spritePaths[sheetIdx], col, row };
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
      className={`overflow-hidden rounded-xl bg-black ${className}`}
      style={{
        width: displayWidth,
        height: displayHeight,
        backgroundImage: `url(${url})`,
        backgroundSize: `${SHEET_W * scale}px ${SHEET_H * scale}px`,
        backgroundPosition: `${-col * CELL_W * scale}px ${-row * CELL_H * scale}px`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
