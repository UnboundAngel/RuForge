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

const SHORTCUT_SUFFIX = /^(.*\S)\s*\(((?:Ctrl|Alt|Shift|Meta)\+[^)]+)\)$/;

function splitShortcut(text: string): { label: string; shortcut: string | null } {
  const m = SHORTCUT_SUFFIX.exec(text);
  return m ? { label: m[1], shortcut: m[2] } : { label: text, shortcut: null };
}

function clampTip(anchor: DOMRect, tip: DOMRect): TipPos {
  const pad = 8;
  const gap = 8;
  let top = anchor.top - tip.height - gap;
  if (top < pad) {
    top = anchor.bottom + gap;
  }

  let left = anchor.left + anchor.width / 2 - tip.width / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - tip.width - pad));

  return { top, left };
}

/** Labels longer than this wrap onto a second line instead of running past the pill. */
const WRAP_AFTER_CHARS = 36;

/** Music chrome anchors; the Music shell mounts its own layer so it can hide tips under Explore. */
export const MUSIC_TOOLTIP_SELECTOR = ".rf-music-tooltip-anchor[data-tooltip]";
/** Every other `data-tooltip` in the app. Use it instead of the native `title` attribute. */
export const APP_TOOLTIP_SELECTOR = "[data-tooltip]:not(.rf-music-tooltip-anchor)";

type Props = {
  /** Which anchors this layer serves (`closest()` selector; the anchor carries `data-tooltip`). */
  selector: string;
  /** Native Explore webview paints over DOM; hide tips while it is up. */
  disabled?: boolean;
  variant?: "app" | "music";
};

/** Portal tooltips: hover or focus any anchor matching `selector` to show its `data-tooltip`. */
export function TooltipLayer({ selector, disabled = false, variant = "app" }: Props) {
  const tipRef = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const [label, setLabel] = useState<string | null>(null);
  const [pos, setPos] = useState<TipPos | null>(null);
  const [shownAnchor, setShownAnchor] = useState<HTMLElement | null>(null);

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
    setShownAnchor(anchor);
    setLabel(text);
  }, []);

  const hide = useCallback(() => {
    anchorRef.current = null;
    setShownAnchor(null);
    setLabel(null);
    setPos(null);
  }, []);

  useEffect(() => {
    const onPointerOver = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest(selector);
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
      const anchor = target.closest(selector);
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
  }, [selector, show, hide]);

  useEffect(() => {
    if (disabled) hide();
  }, [disabled, hide]);

  // Toggle buttons swap their label on click while the pointer is still on them.
  useEffect(() => {
    const anchor = shownAnchor;
    if (!anchor) return;
    const sync = () => {
      const text = anchor.getAttribute("data-tooltip")?.trim();
      if (text) setLabel(text);
      else hide();
    };
    const observer = new MutationObserver(sync);
    observer.observe(anchor, { attributes: true, attributeFilter: ["data-tooltip"] });
    // The label may have changed in the same commit that showed the tip, before we were watching.
    sync();
    return () => observer.disconnect();
  }, [shownAnchor, hide]);

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

  const wrap = label.length > WRAP_AFTER_CHARS;
  const style = pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 };

  if (variant === "music") {
    const { label: text, shortcut } = splitShortcut(label);
    return createPortal(
      <span
        key={label}
        ref={tipRef}
        className={cn("rf-music-tooltip", wrap && "rf-music-tooltip--wrap")}
        style={style}
        role="tooltip"
      >
        <span className="rf-music-tooltip-label">{text}</span>
        {shortcut && <kbd className="rf-music-tooltip-kbd">{shortcut}</kbd>}
      </span>,
      document.body,
    );
  }

  return createPortal(
    <span
      ref={tipRef}
      className={cn(
        "rf-icon-pill-tooltip rf-icon-pill-tooltip--floating rf-icon-pill-tooltip--normal-case",
        wrap && "rf-icon-pill-tooltip--wrap",
      )}
      style={style}
      role="tooltip"
    >
      {label}
    </span>,
    document.body,
  );
}

export function MusicTooltipLayer({ disabled = false }: { disabled?: boolean }) {
  return <TooltipLayer selector={MUSIC_TOOLTIP_SELECTOR} disabled={disabled} variant="music" />;
}

export function AppTooltipLayer() {
  return <TooltipLayer selector={APP_TOOLTIP_SELECTOR} />;
}
