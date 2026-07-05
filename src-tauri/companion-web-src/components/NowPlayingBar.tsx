import { useCallback, useEffect, useRef, useState } from "react";
import { ScrubBar } from "./ScrubBar";
import { LazyThumb } from "./LazyThumb";
import type { CompanionItem, SponsorSegment } from "../types";
import { fmtDuration } from "../types";

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

type Props = {
  item: CompanionItem | null;
  paused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  loop: boolean;
  speed: number;
  sbEnabled: boolean;
  sbSegments: SponsorSegment[];
  spriteCount: number;
  activeSbSegment: SponsorSegment | null;
  hasPrev: boolean;
  hasNext: boolean;
  rightPanelOpen: boolean;
  onTogglePlay: () => void;
  onSkipPrev: () => void;
  onSkipNext: () => void;
  onSeekStart: () => void;
  onSeek: (t: number) => void;
  onVolume: (v: number) => void;
  onMuted: (m: boolean) => void;
  onLoop: (l: boolean) => void;
  onSpeed: (s: number) => void;
  onSbEnabled: (e: boolean) => void;
  onSkipSegment: () => void;
  onToggleQueue: () => void;
};

export function NowPlayingBar({
  item,
  paused,
  currentTime,
  duration,
  volume,
  muted,
  loop,
  speed,
  sbEnabled,
  sbSegments,
  spriteCount,
  activeSbSegment,
  hasPrev,
  hasNext,
  rightPanelOpen,
  onTogglePlay,
  onSkipPrev,
  onSkipNext,
  onSeekStart,
  onSeek,
  onVolume,
  onMuted,
  onLoop,
  onSpeed,
  onSbEnabled,
  onSkipSegment,
  onToggleQueue,
}: Props) {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSpeedMenu) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setShowSpeedMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSpeedMenu]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const next = Math.max(0, Math.min(1, volume + (e.deltaY > 0 ? -0.05 : 0.05)));
      onVolume(next);
      if (muted && next > 0) onMuted(false);
    },
    [volume, muted, onVolume, onMuted],
  );

  if (!item) return null;

  return (
    <div
      className="now-playing-bar"
      onWheel={handleWheel}
      style={{ position: "relative" }}
    >
      {/* Skip segment button - floats above bar */}
      {activeSbSegment && (
        <button
          type="button"
          className="skip-segment-btn"
          onClick={onSkipSegment}
          style={{ position: "absolute", bottom: "calc(100% + 8px)", right: 16 }}
        >
          Skip
        </button>
      )}

      {/* Left: track info */}
      <div className="npb-track">
        <LazyThumb
          id={item.id}
          hasThumb={item.hasThumb}
          className="npb-art"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--music-text-muted)" }}>
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </LazyThumb>
        <div className="npb-info">
          <div className="npb-title">{item.title}</div>
          {item.artist && <div className="npb-artist">{item.artist}</div>}
        </div>
      </div>

      {/* Center: transport + scrub */}
      <div className="npb-transport">
        <div className="npb-controls">
          <button
            type="button"
            className="npb-btn"
            onClick={onSkipPrev}
            disabled={!hasPrev && currentTime <= 3}
            aria-label="Previous"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
            </svg>
          </button>

          <button
            type="button"
            className="npb-play-btn"
            onClick={onTogglePlay}
            aria-label={paused ? "Play" : "Pause"}
          >
            {paused ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="npb-btn"
            onClick={onSkipNext}
            disabled={!hasNext}
            aria-label="Next"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        <ScrubBar
          duration={duration}
          currentTime={currentTime}
          activeId={item.id}
          spriteCount={spriteCount}
          sbSegments={sbSegments}
          dragging={dragging}
          onSeekStart={() => { setDragging(true); onSeekStart(); }}
          onSeek={(t) => { setDragging(false); onSeek(t); }}
        />
      </div>

      {/* Right: utilities */}
      <div className="npb-utilities">
        <button
          type="button"
          className={`npb-btn ${loop ? "active" : ""}`}
          onClick={() => onLoop(!loop)}
          aria-label={loop ? "Loop on" : "Loop off"}
          title={loop ? "Loop on" : "Loop off"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 1l4 4-4 4" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>

        <button
          type="button"
          className={`npb-btn ${sbEnabled ? "active" : ""}`}
          onClick={() => onSbEnabled(!sbEnabled)}
          aria-label={sbEnabled ? "SponsorBlock on" : "SponsorBlock off"}
          title={sbEnabled ? "SponsorBlock: on" : "SponsorBlock: off"}
          style={{ fontSize: 11, fontWeight: 700, width: 28, color: sbEnabled ? "var(--music-accent)" : "var(--music-text-muted)" }}
        >
          SB
        </button>

        {/* Volume */}
        <button
          type="button"
          className="npb-btn"
          onClick={() => onMuted(!muted)}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted || volume === 0 ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          ) : volume < 0.5 ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </button>
        <input
          type="range"
          className="volume-slider"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onVolume(v);
            if (muted && v > 0) onMuted(false);
          }}
          aria-label="Volume"
        />

        {/* Speed */}
        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            type="button"
            className="npb-btn"
            onClick={() => setShowSpeedMenu((s) => !s)}
            style={{ fontSize: 11, fontWeight: 700, width: 36, opacity: showSpeedMenu ? 1 : 0.65 }}
          >
            {speed}x
          </button>
          {showSpeedMenu && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 4px)",
                right: 0,
                background: "var(--music-surface)",
                border: "1px solid var(--music-border)",
                borderRadius: 8,
                padding: "4px 0",
                minWidth: 80,
                zIndex: 50,
                boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
              }}
            >
              {PLAYBACK_SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { onSpeed(s); setShowSpeedMenu(false); }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "7px 16px",
                    fontSize: 13,
                    textAlign: "left",
                    color: speed === s ? "var(--music-accent)" : "var(--music-text-primary)",
                    fontWeight: speed === s ? 700 : 400,
                    background: "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => ((e.target as HTMLElement).style.background = "var(--music-surface-raised)")}
                  onMouseLeave={(e) => ((e.target as HTMLElement).style.background = "transparent")}
                >
                  {s}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Queue toggle */}
        <button
          type="button"
          className={`npb-btn ${rightPanelOpen ? "active" : ""}`}
          onClick={onToggleQueue}
          aria-label={rightPanelOpen ? "Close queue" : "Open queue"}
          title={rightPanelOpen ? "Close queue" : "Open queue"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 9h2v2H3zm0-4h2v2H3zm0 8h2v2H3zm4-4h14v2H7zm0-4h14v2H7zm0 8h14v2H7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
