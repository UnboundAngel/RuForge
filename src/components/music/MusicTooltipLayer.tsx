import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type TipPos = { top: number; left: number };

function clampTip(anchor: DOMRect, tip: DOMRect): TipPos {
  const pad = 8;
  const gap = 6;
  let top = anchor.top - tip.height - gap;
  if (top < pad) {
    top = anchor.bottom + gap;
  }

  let left = anchor.left + anchor.width / 2 - tip.width / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - tip.width - pad));

  return { top, left };
}

const ANCHOR_SELECTOR = ".rf-music-tooltip-anchor[data-tooltip]";

type Props = {
  /** Native Explore webview paints over DOM; hide tips while it is up. */
  disabled?: boolean;
};

/** Portal tooltips for music chrome anchors (data-tooltip on .rf-music-tooltip-anchor). */
export function MusicTooltipLayer({ disabled = false }: Props) {
  const tipRef = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const [label, setLabel] = useState<string | null>(null);
  const [pos, setPos] = useState<TipPos | null>(null);

  const updatePos = useCallback(() => {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    setPos(clampTip(anchor.getBoundingClientRect(), tip.getBoundingClientRect()));
  }, []);

  const show = useCallback((anchor: HTMLElement) => {
    if (disabledRef.current) return;
    const text = anchor.getAttribute("data-tooltip")?.trim();
    if (!text) return;
    anchorRef.current = anchor;
    setLabel(text);
  }, []);

  const hide = useCallback(() => {
    anchorRef.current = null;
    setLabel(null);
    setPos(null);
  }, []);

  useEffect(() => {
    const onPointerOver = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest(ANCHOR_SELECTOR);
      if (!(anchor instanceof HTMLElement)) return;
      if (anchorRef.current === anchor) return;
      show(anchor);
    };

    const onPointerOut = (e: PointerEvent) => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const related = e.relatedTarget;
      if (related instanceof Node && anchor.contains(related)) return;
      hide();
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest(ANCHOR_SELECTOR);
      if (anchor instanceof HTMLElement) show(anchor);
    };

    const onFocusOut = (e: FocusEvent) => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const related = e.relatedTarget;
      if (related instanceof Node && anchor.contains(related)) return;
      hide();
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [show, hide]);

  useEffect(() => {
    if (disabled) hide();
  }, [disabled, hide]);

  useLayoutEffect(() => {
    if (!label) return;
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [label, updatePos]);

  if (!label || typeof document === "undefined") return null;

  return createPortal(
    <span
      ref={tipRef}
      className={cn(
        "rf-icon-pill-tooltip rf-icon-pill-tooltip--floating rf-icon-pill-tooltip--normal-case",
      )}
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
      role="tooltip"
    >
      {label}
    </span>,
    document.body,
  );
}
