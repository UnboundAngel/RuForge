import { useEffect, useRef, useState } from "react";
import { activeLineIndex, type LyricsLine } from "@/lib/lyrics";

/**
 * Drive the active synced line from the live audio element via rAF.
 * Only re-renders when the line index changes (not every frame / timeupdate).
 */
export function useLyricsActiveLine(
  audioEl: HTMLAudioElement | null,
  lines: LyricsLine[] | null,
  enabled: boolean,
): number {
  const [index, setIndex] = useState(-1);
  const indexRef = useRef(-1);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    indexRef.current = -1;
    setIndex(-1);
  }, [lines]);

  useEffect(() => {
    if (!enabled || !audioEl || !lines || lines.length === 0) {
      if (indexRef.current !== -1) {
        indexRef.current = -1;
        setIndex(-1);
      }
      return;
    }

    // The loop parks itself while paused or hidden, where the line can only move on a seek,
    // and any event that can move it again runs one more frame to catch up and maybe resume.
    let raf = 0;
    const running = () => !audioEl.paused && document.visibilityState === "visible";
    const tick = () => {
      raf = 0;
      const list = linesRef.current;
      if (list && list.length > 0) {
        const next = activeLineIndex(list, audioEl.currentTime);
        if (next !== indexRef.current) {
          indexRef.current = next;
          setIndex(next);
        }
      }
      if (running()) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const events = ["play", "playing", "pause", "seeked", "timeupdate"] as const;
    for (const type of events) audioEl.addEventListener(type, wake);
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      cancelAnimationFrame(raf);
      for (const type of events) audioEl.removeEventListener(type, wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [audioEl, enabled, lines]);

  return index;
}
