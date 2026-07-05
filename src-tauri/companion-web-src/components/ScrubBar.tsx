import { useCallback, useEffect, useRef, useState } from "react";
import type { SponsorSegment } from "../types";
import { fetchStreamToken } from "../api";
import { fmtDuration } from "../types";

const SPRITE_COLS = 10;
const SPRITE_ROWS = 10;
const SPRITE_CELL_W = 160;
const SPRITE_CELL_H = 90;
const SPRITE_SECS_PER_CELL = 5;
const SPRITE_CELLS_PER_SHEET = SPRITE_COLS * SPRITE_ROWS;

const SB_COLORS: Record<string, string> = {
  sponsor: "#00d400",
  selfpromo: "#ffff00",
  interaction: "#cc00ff",
  intro: "#00ffff",
  outro: "#0202ed",
  preview: "#008fd6",
  filler: "#7300ff",
  music_offtopic: "#ff9900",
};

function spriteSheetIndex(timeSec: number): number {
  const cellIdx = Math.floor(timeSec / SPRITE_SECS_PER_CELL);
  return Math.floor(cellIdx / SPRITE_CELLS_PER_SHEET);
}

function spriteBgPos(timeSec: number): { x: number; y: number } {
  const cellIdx = Math.floor(timeSec / SPRITE_SECS_PER_CELL);
  const cellInSheet = cellIdx % SPRITE_CELLS_PER_SHEET;
  const col = cellInSheet % SPRITE_COLS;
  const row = Math.floor(cellInSheet / SPRITE_COLS);
  return { x: -col * SPRITE_CELL_W, y: -row * SPRITE_CELL_H };
}

type Props = {
  duration: number;
  currentTime: number;
  activeId: string | null;
  spriteCount: number;
  sbSegments: SponsorSegment[];
  dragging: boolean;
  onSeekStart: () => void;
  onSeek: (seconds: number) => void;
};

export function ScrubBar({
  duration,
  currentTime,
  activeId,
  spriteCount,
  sbSegments,
  dragging,
  onSeekStart,
  onSeek,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const spriteTokens = useRef<Map<number, string | null | "pending">>(new Map());
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    spriteTokens.current.clear();
    if (!activeId || spriteCount === 0) return;
    for (let i = 0; i < spriteCount; i++) {
      const idx = i;
      spriteTokens.current.set(idx, "pending");
      void fetchStreamToken(activeId, { kind: "sprite", idx }).then((url) => {
        spriteTokens.current.set(idx, url);
        forceUpdate((n) => n + 1);
      });
    }
  }, [activeId, spriteCount]);

  const pctFromX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || !duration) return 0;
      const rect = track.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    },
    [duration],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onSeekStart();
      draggingRef.current = true;
      const pct = pctFromX(e.clientX);
      onSeek(pct * duration);

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const p = pctFromX(ev.clientX);
        onSeek(p * duration);
      };
      const onUp = (ev: MouseEvent) => {
        draggingRef.current = false;
        const p = pctFromX(ev.clientX);
        onSeek(p * duration);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [duration, onSeekStart, onSeek, pctFromX],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pct = pctFromX(e.clientX);
      const t = pct * duration;
      setHoverTime(t);
      const track = trackRef.current;
      if (track) {
        const rect = track.getBoundingClientRect();
        setHoverX(e.clientX - rect.left);
      }
    },
    [duration, pctFromX],
  );

  const handleMouseLeave = () => {
    if (!draggingRef.current) setHoverTime(null);
  };

  const fillPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const spriteNode = (() => {
    if (spriteCount === 0 || hoverTime === null) return null;
    const sheetIdx = spriteSheetIndex(hoverTime);
    const tokenKey = spriteTokens.current.get(sheetIdx);
    if (!tokenKey || tokenKey === "pending") return null;
    const pos = spriteBgPos(hoverTime);
    return (
      <div
        className="sprite-preview"
        style={{
          left: hoverX,
          width: SPRITE_CELL_W,
          height: SPRITE_CELL_H,
          backgroundImage: `url(${tokenKey})`,
          backgroundPosition: `${pos.x}px ${pos.y}px`,
          backgroundSize: `${SPRITE_COLS * SPRITE_CELL_W}px ${SPRITE_ROWS * SPRITE_CELL_H}px`,
        }}
      />
    );
  })();

  return (
    <div className="scrub-wrap">
      <div
        ref={trackRef}
        className="scrub-track"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fillPct)}
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onKeyDown={(e) => {
          if (!duration) return;
          if (e.key === "ArrowRight") onSeek(Math.min(duration, currentTime + 5));
          if (e.key === "ArrowLeft") onSeek(Math.max(0, currentTime - 5));
        }}
        style={{ position: "relative" }}
      >
        {sbSegments
          .filter((s) => s.actionType === "skip" && duration > 0)
          .map((s, i) => (
            <div
              key={i}
              className="scrub-sb-segment"
              style={{
                left: `${(s.segment[0] / duration) * 100}%`,
                width: `${((s.segment[1] - s.segment[0]) / duration) * 100}%`,
                background: SB_COLORS[s.category] ?? "#888",
              }}
            />
          ))}
        <div className="scrub-fill" style={{ width: `${fillPct}%` }} />
        <div className="scrub-knob" style={{ left: `${fillPct}%` }} />
        {spriteNode}
        {hoverTime !== null && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 4px)",
              left: hoverX,
              transform: "translateX(-50%)",
              fontSize: 11,
              color: "var(--music-text-muted)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {fmtDuration(hoverTime)}
          </div>
        )}
      </div>
      <div className="scrub-time-label">
        {fmtDuration(currentTime)} / {duration > 0 ? fmtDuration(duration) : "0:00"}
      </div>
    </div>
  );
}
