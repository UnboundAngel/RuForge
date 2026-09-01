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

const ANCHOR_SELECTOR = ".rf-rail-tooltip-anchor[data-rail-tooltip]";

function clampRailTip(anchor: DOMRect, tip: DOMRect): TipPos {
  const pad = 8;
  const gap = 10;
  let left = anchor.right + gap;
  let top = anchor.top + anchor.height / 2 - tip.height / 2;
  top = Math.max(pad, Math.min(top, window.innerHeight - tip.height - pad));
  if (left + tip.width > window.innerWidth - pad) {
    left = Math.max(pad, anchor.left - gap - tip.width);
  }
  return { top, left };
}

type RailTipState = {
  label: string;
  shortcut?: string;
};

type Props = {
  disabled?: boolean;
};

/** Portaled sidebar rail tooltips (data-rail-tooltip on .rf-rail-tooltip-anchor). */
export function RailTooltipLayer({ disabled = false }: Props) {
  const tipRef = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const [tip, setTip] = useState<RailTipState | null>(null);
  const [pos, setPos] = useState<TipPos | null>(null);

  const updatePos = useCallback(() => {
    const anchor = anchorRef.current;
    const el = tipRef.current;
    if (!anchor || !el) return;
    setPos(clampRailTip(anchor.getBoundingClientRect(), el.getBoundingClientRect()));
  }, []);

  const show = useCallback((anchor: HTMLElement) => {
    if (disabledRef.current) return;
    const label = anchor.getAttribute("data-rail-tooltip")?.trim();
    if (!label) return;
    const shortcut = anchor.getAttribute("data-rail-shortcut")?.trim() || undefined;
    anchorRef.current = anchor;
    setTip({ label, shortcut });
  }, []);

  const hide = useCallback(() => {
    anchorRef.current = null;
    setTip(null);
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
    if (!tip) return;
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [tip, updatePos]);

  if (!tip || typeof document === "undefined") return null;

  return createPortal(
    <span
      ref={tipRef}
      className={cn("rf-rail-tooltip rf-rail-tooltip--floating")}
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
      role="tooltip"
    >
      <span className="rf-rail-tooltip-label">{tip.label}</span>
      {tip.shortcut ? <kbd className="rf-rail-tooltip-kbd">{tip.shortcut}</kbd> : null}
    </span>,
    document.body,
  );
}
