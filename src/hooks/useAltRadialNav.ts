import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { clampRadialMenuCenter } from "@/lib/radialMenuAnchor";
import {
  RADIAL_NAV_ALT_EVENT,
  type RadialNavAltPayload,
} from "@/lib/radialNavOverlayEvents";
import {
  activeRadialNavSurface,
  radialNavCursorClientPoint,
} from "@/lib/radialNavOverlayHost";

/** `overlay` paints in its own child webview because the YouTube webviews cover main-window DOM. */
export type RadialNavPresentation = "dom" | "overlay";

function isTypingTarget(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

export function useAltRadialNav(disabled: boolean) {
  const [open, setOpen] = useState(false);
  const [presentation, setPresentation] = useState<RadialNavPresentation>("dom");
  const lastPointer = useRef(
    clampRadialMenuCenter(
      typeof window !== "undefined" ? window.innerWidth / 2 : 0,
      typeof window !== "undefined" ? window.innerHeight / 2 : 0,
    ),
  );
  const [anchor, setAnchor] = useState(lastPointer.current);
  const openSeq = useRef(0);
  const openRef = useRef(false);
  const presentationRef = useRef<RadialNavPresentation>("dom");

  const close = useCallback(() => {
    openSeq.current += 1;
    openRef.current = false;
    setOpen(false);
  }, []);

  const beginOpen = useCallback(async () => {
    if (openRef.current) return;
    openRef.current = true;
    const seq = ++openSeq.current;
    const overlay = activeRadialNavSurface() !== null;
    let point = lastPointer.current;
    if (overlay) {
      point = (await radialNavCursorClientPoint()) ?? point;
      if (seq !== openSeq.current) return;
    }
    presentationRef.current = overlay ? "overlay" : "dom";
    setPresentation(presentationRef.current);
    setAnchor(clampRadialMenuCenter(point.x, point.y));
    setOpen(true);
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  useEffect(() => {
    if (!open || disabled) return;

    const reclamp = () => {
      setAnchor((prev) => clampRadialMenuCenter(prev.x, prev.y));
    };

    window.addEventListener("resize", reclamp);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", reclamp);
    vv?.addEventListener("scroll", reclamp);
    return () => {
      window.removeEventListener("resize", reclamp);
      vv?.removeEventListener("resize", reclamp);
      vv?.removeEventListener("scroll", reclamp);
    };
  }, [open, disabled]);

  useEffect(() => {
    if (disabled) {
      close();
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || e.repeat) return;
      if (isTypingTarget()) return;
      e.preventDefault();
      void beginOpen();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") close();
    };

    // Focus moving into the overlay or a YouTube webview blurs this document without leaving the app.
    const onDocumentBlur = () => {
      if (presentationRef.current === "dom") close();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onDocumentBlur);

    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const keep = (off: () => void) => {
      if (disposed) off();
      else unlisteners.push(off);
    };
    void listen<RadialNavAltPayload>(RADIAL_NAV_ALT_EVENT, (event) => {
      if (event.payload.down) void beginOpen();
      else close();
    }).then(keep);
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) close();
      })
      .then(keep);

    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onDocumentBlur);
      for (const off of unlisteners) off();
    };
  }, [disabled, beginOpen, close]);

  return { open, close, anchor, presentation };
}
