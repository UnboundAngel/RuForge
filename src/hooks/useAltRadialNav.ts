import { useCallback, useEffect, useRef, useState } from "react";
import { clampRadialMenuCenter } from "@/lib/radialMenuAnchor";

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
  const lastPointer = useRef(
    clampRadialMenuCenter(
      typeof window !== "undefined" ? window.innerWidth / 2 : 0,
      typeof window !== "undefined" ? window.innerHeight / 2 : 0,
    ),
  );
  const [anchor, setAnchor] = useState(lastPointer.current);

  const close = useCallback(() => setOpen(false), []);

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
      setOpen(false);
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || e.repeat) return;
      if (isTypingTarget()) return;
      e.preventDefault();
      setAnchor(
        clampRadialMenuCenter(
          lastPointer.current.x,
          lastPointer.current.y,
        ),
      );
      setOpen(true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") setOpen(false);
    };

    const onWindowBlur = () => setOpen(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [disabled]);

  return { open, close, anchor };
}
