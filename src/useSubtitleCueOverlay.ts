import { type RefObject, useEffect } from "react";
import type { SubtitleTrack } from "./localVideoSubtitles";

const SUBTITLE_Y_KEY = "ruforge-subtitle-drag-y";
const SUBTITLE_Y_MIN = -80;
const SUBTITLE_Y_MAX = 200;

function readStoredSubtitleY(): number {
  try {
    const v = parseInt(localStorage.getItem(SUBTITLE_Y_KEY) ?? "", 10);
    if (!Number.isFinite(v)) return 0;
    return Math.min(SUBTITLE_Y_MAX, Math.max(SUBTITLE_Y_MIN, v));
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
  inactive: boolean;
  captionsEnabled: boolean;
  selectedLang: string;
  filePath: string;
  subtitleTracks: SubtitleTrack[];
};

/**
 * Hidden TextTracks + static cue line (swap on cuechange), vertical drag (persisted).
 */
export function useSubtitleCueOverlay({
  videoRef,
  textElRef,
  dragRowRef,
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
    const applyTransform = () => {
      row.style.transform = nudge !== 0 ? `translateY(${-nudge}px)` : "";
    };
    applyTransform();

    let dragging = false;
    let startY = 0;
    let startNudge = 0;

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
      nudge = Math.min(SUBTITLE_Y_MAX, Math.max(SUBTITLE_Y_MIN, startNudge + delta));
      applyTransform();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      try {
        row.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      storeSubtitleY(nudge);
    };

    row.addEventListener("pointerdown", onPointerDown);
    row.addEventListener("pointermove", onPointerMove);
    row.addEventListener("pointerup", onPointerUp);
    row.addEventListener("pointercancel", onPointerUp);

    return () => {
      row.removeEventListener("pointerdown", onPointerDown);
      row.removeEventListener("pointermove", onPointerMove);
      row.removeEventListener("pointerup", onPointerUp);
      row.removeEventListener("pointercancel", onPointerUp);
    };
  }, [inactive, captionsEnabled, filePath, dragRowRef]);
}
