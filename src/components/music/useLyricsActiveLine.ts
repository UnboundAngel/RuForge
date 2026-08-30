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

    let raf = 0;
    const tick = () => {
      const list = linesRef.current;
      if (!list || list.length === 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const next = activeLineIndex(list, audioEl.currentTime);
      if (next !== indexRef.current) {
        indexRef.current = next;
        setIndex(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioEl, enabled, lines]);

  return index;
}
