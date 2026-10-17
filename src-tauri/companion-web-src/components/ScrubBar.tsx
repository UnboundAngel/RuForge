import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { SponsorSegment } from "../types";
import { fetchStreamToken } from "../api";
import { fmtDuration } from "../types";
import { useClock } from "../playbackClock";
import { cachedSpriteUrl } from "../offlineSprites";

const SPRITE_COLS = 10;
const SPRITE_ROWS = 10;
const SPRITE_CELL_W = 160;
const SPRITE_CELL_H = 90;
const SPRITE_SECS_PER_CELL = 5;
const SPRITE_CELLS_PER_SHEET = SPRITE_COLS * SPRITE_ROWS;
const SPRITE_URL_TTL_MS = 240_000;
// Desktop's ScrubHoverPreview uses a 192px thumb in an 8px-padded card; scaled to fit a phone picture.
const THUMB_W = 128;
const THUMB_H = (THUMB_W * SPRITE_CELL_H) / SPRITE_CELL_W;
const CARD_PAD = 8;
const CARD_W = THUMB_W + CARD_PAD * 2;
const BUBBLE_HALF_W = 28;

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

type Props = {
  duration: number;
  activeId: string | null;
  spriteCount: number;
  sbSegments: SponsorSegment[];
  /** `video` sits on the bottom edge of the picture with no time row; the overlay shows times. */
  variant?: "music" | "video";
  /** Video only: the knob shows while the overlay controls are up. */
  showKnob?: boolean;
  onSeek: (seconds: number) => void;
  onScrubbing?: (active: boolean) => void;
};

type SpriteUrl = { url: string | null; at: number };

/** Desktop scrubber: thin track, white fill; hovering or dragging shows the frame and the time there. */
export function ScrubBar({
  duration,
  activeId,
  spriteCount,
  sbSegments,
  variant = "music",
  showKnob = true,
  onSeek,
  onScrubbing,
}: Props) {
  const currentTime = useClock();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragT, setDragT] = useState<number | null>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [trackW, setTrackW] = useState(0);
  const sprites = useRef<Map<number, SpriteUrl>>(new Map());
  const [, bump] = useState(0);

  useEffect(() => {
    sprites.current.clear();
  }, [activeId, spriteCount]);

  const refreshSprites = () => {
    if (!activeId || spriteCount === 0) return;
    const now = Date.now();
    for (let idx = 0; idx < spriteCount; idx++) {
      const cur = sprites.current.get(idx);
      if (cur && now - cur.at < SPRITE_URL_TTL_MS) continue;
      sprites.current.set(idx, { url: cur?.url ?? null, at: now });
      // A saved video carries its own sheets, so previews work with no PC in reach.
      void cachedSpriteUrl(activeId, idx)
        .then((local) => local ?? fetchStreamToken(activeId, { kind: "sprite", idx }))
        .then((url) => {
          sprites.current.set(idx, { url, at: Date.now() });
          bump((n) => n + 1);
        });
    }
  };

  const measure = () => {
    const r = trackRef.current?.getBoundingClientRect();
    setTrackW(r ? r.width : 0);
  };

  const timeAt = (clientX: number) => {
    const track = trackRef.current;
    if (!track || !duration) return 0;
    const rect = track.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, frac)) * duration;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    measure();
    refreshSprites();
    setHoverT(null);
    setDragT(timeAt(e.clientX));
    onScrubbing?.(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragT !== null) {
      setDragT(timeAt(e.clientX));
      return;
    }
    if (e.pointerType === "mouse" && duration) {
      if (hoverT === null) {
        measure();
        refreshSprites();
      }
      setHoverT(timeAt(e.clientX));
    }
  };
  const endDrag = (seekTo: number | null) => {
    if (dragT === null) return;
    if (seekTo !== null) onSeek(seekTo);
    setDragT(null);
    onScrubbing?.(false);
  };

  const shown = dragT ?? currentTime;
  const pct = duration > 0 ? Math.min(1, Math.max(0, shown / duration)) : 0;
  const peekT = dragT ?? hoverT;
  const peekPct = peekT !== null && duration > 0 ? Math.min(1, Math.max(0, peekT / duration)) : 0;

  let sprite: CSSProperties | null = null;
  let spriteX = 0;
  if (peekT !== null && spriteCount > 0 && trackW > 0) {
    const cell = Math.floor(peekT / SPRITE_SECS_PER_CELL);
    const url = sprites.current.get(Math.floor(cell / SPRITE_CELLS_PER_SHEET))?.url;
    if (url) {
      const inSheet = cell % SPRITE_CELLS_PER_SHEET;
      spriteX = Math.max(0, Math.min(trackW - CARD_W, peekPct * trackW - CARD_W / 2));
      const k = THUMB_W / SPRITE_CELL_W;
      sprite = {
        width: THUMB_W,
        height: THUMB_H,
        backgroundImage: `url(${url})`,
        backgroundPosition: `${-(inSheet % SPRITE_COLS) * SPRITE_CELL_W * k}px ${-Math.floor(inSheet / SPRITE_COLS) * SPRITE_CELL_H * k}px`,
        backgroundSize: `${SPRITE_COLS * SPRITE_CELL_W * k}px ${SPRITE_ROWS * SPRITE_CELL_H * k}px`,
      };
    }
  }

  const bubbleX = trackW > 0
    ? Math.max(BUBBLE_HALF_W, Math.min(trackW - BUBBLE_HALF_W, peekPct * trackW))
    : 0;

  const cls = [
    "ph-scrub",
    `ph-scrub--${variant}`,
    dragT !== null ? "ph-scrub--drag" : "",
    hoverT !== null ? "ph-scrub--hover" : "",
    showKnob ? "" : "ph-scrub--noknob",
  ].filter(Boolean).join(" ");

  return (
    <div className={cls}>
      {peekT !== null && sprite ? (
        <div className="ph-scrub-preview" style={{ transform: `translateX(${spriteX}px)` }}>
          <div className="ph-scrub-card">
            <div className="ph-scrub-sprite" style={sprite} />
          </div>
          <span className="ph-scrub-preview-time">{fmtDuration(peekT)}</span>
        </div>
      ) : null}
      {peekT !== null && !sprite ? (
        <span className="ph-scrub-bubble" style={{ left: bubbleX }}>
          {fmtDuration(peekT)}
        </span>
      ) : null}
      <div
        className="ph-scrub-hit"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={fmtDuration(shown)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverT(null)}
        onPointerUp={(e) => endDrag(timeAt(e.clientX))}
        onPointerCancel={() => endDrag(null)}
        onKeyDown={(e) => {
          if (!duration) return;
          if (e.key === "ArrowRight") onSeek(Math.min(duration, currentTime + 10));
          if (e.key === "ArrowLeft") onSeek(Math.max(0, currentTime - 10));
        }}
      >
        <div ref={trackRef} className="ph-scrub-track">
          <div className="ph-scrub-groove">
            {duration > 0
              ? sbSegments
                  .filter((s) => s.actionType === "skip")
                  .map((s, i) => (
                    <span
                      key={s.UUID ?? i}
                      className="ph-scrub-seg"
                      style={{
                        left: `${(s.segment[0] / duration) * 100}%`,
                        width: `${((s.segment[1] - s.segment[0]) / duration) * 100}%`,
                        background: SB_COLORS[s.category] ?? "#888",
                      }}
                    />
                  ))
              : null}
            {hoverT !== null && dragT === null ? (
              <span className="ph-scrub-ghost" style={{ transform: `scaleX(${peekPct})` }} />
            ) : null}
            <span className="ph-scrub-fill" style={{ transform: `scaleX(${pct})` }} />
          </div>
          <span className="ph-scrub-rail" style={{ transform: `translateX(${pct * 100}%)` }}>
            <span className="ph-scrub-knob" />
          </span>
        </div>
      </div>
      {variant === "music" ? (
        <div className="ph-scrub-times">
          <span>{fmtDuration(shown)}</span>
          <span>{duration > 0 ? `-${fmtDuration(Math.max(0, duration - shown))}` : "--:--"}</span>
        </div>
      ) : null}
    </div>
  );
}
