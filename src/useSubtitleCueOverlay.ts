import { type RefObject, useEffect } from "react";
import type { SubtitleTrack } from "./localVideoSubtitles";

const SUBTITLE_Y_KEY = "ruforge-subtitle-drag-y";
/** Vertical nudge UX range (persisted): positive = move captions up toward center. */
const SUBTITLE_Y_MIN = -100;
const SUBTITLE_Y_MAX = 340;
/** Safety cap — layout correction alone may briefly need slightly more upward travel for tall cues. */
const SUBTITLE_Y_LAYOUT_CAP = 520;
const SUBTITLE_CLAMP_GAP_PX = 10;

function readStoredSubtitleY(): number {
  try {
    const v = parseInt(localStorage.getItem(SUBTITLE_Y_KEY) ?? "", 10);
    if (!Number.isFinite(v)) return 0;
    return Math.min(SUBTITLE_Y_LAYOUT_CAP, Math.max(SUBTITLE_Y_MIN, v));
  } catch {
    return 0;
  }
}

function storeSubtitleY(px: number): void {
  try {
    localStorage.setItem(SUBTITLE_Y_KEY, String(px));
  } catch {
    /* ignore */
  }
}

function stripVttMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

/** Decode `&gt;`, `&#62;`, etc. VTT often ships HTML entities in plain cue text. */
function decodeHtmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  try {
    const ta = document.createElement("textarea");
    ta.innerHTML = text;
    return ta.value;
  } catch {
    return text;
  }
}

/**
 * YouTube-style speaker markers (`>>`, `>>>`, `»`) — strip everywhere and collapse whitespace.
 */
function stripSpeakerMarkers(text: string): string {
  return text
    .replace(/(?:>{2,}|»+)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCuePlainText(raw: string): string {
  const noTags = stripVttMarkup(raw);
  const decoded = decodeHtmlEntities(noTags);
  return stripSpeakerMarkers(decoded);
}

function plainTextFromActiveCues(track: TextTrack): string {
  const list = track.activeCues;
  if (!list || list.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const cue = list[i] as VTTCue;
    if (!cue?.text) continue;
    const line = normalizeCuePlainText(cue.text);
    if (line.length > 0) parts.push(line);
  }
  return parts.join(" ");
}

type Args = {
  videoRef: RefObject<HTMLVideoElement | null>;
  textElRef: RefObject<HTMLElement | null>;
  dragRowRef: RefObject<HTMLElement | null>;
  /**
   * Top edge of interactive scrub zone; caption row bottom stays above here so it never
   * slides under overlapping controls (higher z-index) where pointer capture is lost.
   */
  layoutLimitRef?: RefObject<HTMLElement | null>;
  /** When scrub is absent (e.g. UI hidden), cap bottom roughly within the shell. */
  layoutContainerRef?: RefObject<HTMLElement | null>;
  inactive: boolean;
  captionsEnabled: boolean;
  selectedLang: string;
  filePath: string;
  subtitleTracks: SubtitleTrack[];
};

function clampNudgeToLayout(opts: {
  row: HTMLElement;
  nudge: number;
  setNudgeApply: (n: number) => void;
  limitRef?: RefObject<HTMLElement | null> | undefined;
  containerRef?: RefObject<HTMLElement | null> | undefined;
}): number {
  const gap = SUBTITLE_CLAMP_GAP_PX;
  const limitEl = opts.limitRef?.current ?? null;
  const maxBottom = limitEl
    ? limitEl.getBoundingClientRect().top - gap
    : opts.containerRef?.current
      ? opts.containerRef.current.getBoundingClientRect().bottom - gap * 4
      : Number.POSITIVE_INFINITY;

  let current = opts.nudge;
  /** Keep within hard sanity bounds; UX drag range handled by callers — layout may push farther up toward LAYOUT_CAP. */
  current = Math.min(SUBTITLE_Y_LAYOUT_CAP, Math.max(SUBTITLE_Y_MIN, current));

  if (!Number.isFinite(maxBottom)) {
    opts.setNudgeApply(current);
    return current;
  }

  for (let i = 0; i < 22; i++) {
    opts.setNudgeApply(current);
    const bottom = opts.row.getBoundingClientRect().bottom;
    if (bottom <= maxBottom) break;
    const next = current + (bottom - maxBottom);
    if (next <= current + 0.5) break;
    current = Math.min(SUBTITLE_Y_LAYOUT_CAP, next);
  }

  opts.setNudgeApply(current);
  current = Math.min(SUBTITLE_Y_LAYOUT_CAP, Math.max(SUBTITLE_Y_MIN, current));
  opts.setNudgeApply(current);
  return current;
}

/**
 * Hidden TextTracks + static cue line (swap on cuechange), vertical drag (persisted).
 */
export function useSubtitleCueOverlay({
  videoRef,
  textElRef,
  dragRowRef,
  layoutLimitRef,
  layoutContainerRef,
  inactive,
  captionsEnabled,
  selectedLang,
  filePath,
  subtitleTracks,
}: Args): void {
  useEffect(() => {
    const clear = () => {
      const el = textElRef.current;
      if (el) el.textContent = "";
    };

    if (inactive || !captionsEnabled) {
      clear();
      return;
    }

    const v = videoRef.current;
    if (!v) {
      clear();
      return;
    }

    let attached: TextTrack | null = null;

    const onCueChange = () => {
      const out = textElRef.current;
      if (!out || !attached) return;
      const text = plainTextFromActiveCues(attached);
      out.textContent = text;
      void out.offsetWidth;
      out.scrollLeft = Math.max(0, out.scrollWidth - out.clientWidth);
    };

    const detach = () => {
      if (attached) {
        attached.removeEventListener("cuechange", onCueChange);
        attached = null;
      }
    };

    const bindMatchingTrack = () => {
      detach();
      clear();
      if (!captionsEnabled) return;
      const want = selectedLang.toLowerCase();
      for (let i = 0; i < v.textTracks.length; i++) {
        const t = v.textTracks[i];
        if (t.language.toLowerCase() === want) {
          attached = t;
          t.addEventListener("cuechange", onCueChange);
          onCueChange();
          return;
        }
      }
    };

    const onAddTrack = () => bindMatchingTrack();

    v.textTracks.addEventListener("addtrack", onAddTrack);
    bindMatchingTrack();

    return () => {
      v.textTracks.removeEventListener("addtrack", onAddTrack);
      detach();
      clear();
    };
  }, [
    inactive,
    captionsEnabled,
    selectedLang,
    filePath,
    subtitleTracks,
    videoRef,
    textElRef,
  ]);

  useEffect(() => {
    const row = dragRowRef.current;
    if (!row || inactive || !captionsEnabled) return;

    let nudge = readStoredSubtitleY();

    const applyTransform = (value: number) => {
      row.style.transform = value !== 0 ? `translateY(${-value}px)` : "";
    };

    const commitNudgeFromLayout = (candidate: number) => {
      nudge = clampNudgeToLayout({
        row,
        nudge: candidate,
        setNudgeApply: (v) => applyTransform(v),
        limitRef: layoutLimitRef,
        containerRef: layoutContainerRef,
      });
    };

    let dragging = false;
    let startY = 0;
    let startNudge = 0;

    /** First tick after mount / cues may reflow — align with scrub after layout settles. */
    const raf = requestAnimationFrame(() => commitNudgeFromLayout(nudge));
    let resizeRaf: number | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        if (dragging) return;
        commitNudgeFromLayout(nudge);
      });
    });
    ro.observe(row);

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      startY = e.clientY;
      startNudge = nudge;
      row.setPointerCapture(e.pointerId);
      e.stopPropagation();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const delta = startY - e.clientY;
      let next = Math.min(SUBTITLE_Y_MAX, Math.max(SUBTITLE_Y_MIN, startNudge + delta));
      nudge = clampNudgeToLayout({
        row,
        nudge: next,
        setNudgeApply: (v) => applyTransform(v),
        limitRef: layoutLimitRef,
        containerRef: layoutContainerRef,
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      try {
        row.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      nudge = clampNudgeToLayout({
        row,
        nudge,
        setNudgeApply: (v) => applyTransform(v),
        limitRef: layoutLimitRef,
        containerRef: layoutContainerRef,
      });
      storeSubtitleY(nudge);
    };

    row.addEventListener("pointerdown", onPointerDown);
    row.addEventListener("pointermove", onPointerMove);
    row.addEventListener("pointerup", onPointerUp);
    row.addEventListener("pointercancel", onPointerUp);

    return () => {
      cancelAnimationFrame(raf);
      if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
      ro.disconnect();
      row.removeEventListener("pointerdown", onPointerDown);
      row.removeEventListener("pointermove", onPointerMove);
      row.removeEventListener("pointerup", onPointerUp);
      row.removeEventListener("pointercancel", onPointerUp);
    };
  }, [inactive, captionsEnabled, filePath, dragRowRef, layoutLimitRef, layoutContainerRef]);
}
