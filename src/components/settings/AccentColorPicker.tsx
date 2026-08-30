import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pipette, RotateCcw } from "lucide-react";
import { OVERLAY_Z_CLASS } from "../../lib/overlayZIndex";
import { motionDuration, overlayPanelTransition } from "../../lib/overlayMotion";
import { cn } from "../../lib/utils";

const DEFAULT_ACCENT = "#EDCF9B";

const PRESETS: readonly string[] = [
  "#EDCF9B",
  "#F0A070",
  "#E07A5F",
  "#A8C686",
  "#7EB8C9",
  "#8FA8D8",
  "#C4A1E0",
  "#E8D5C4",
];

type Hsv = { h: number; s: number; v: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function parseHex(raw: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(raw.trim());
  if (!m) return null;
  return `#${m[1].toUpperCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const parsed = parseHex(hex);
  if (!parsed) return null;
  const n = parseInt(parsed.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (c: number) =>
    clamp(Math.round(c), 0, 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function hsvToHex(hsv: Hsv): string {
  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
  return rgbToHex(r, g, b);
}

function hexToHsv(hex: string): Hsv {
  const rgb = hexToRgb(hex) ?? { r: 237, g: 207, b: 155 };
  return rgbToHsv(rgb.r, rgb.g, rgb.b);
}

function hueCss(h: number): string {
  const { r, g, b } = hsvToRgb(h, 1, 1);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

type AccentColorPickerProps = {
  value: string;
  onChange: (hex: string) => void;
};

export function AccentColorPicker({ value, onChange }: AccentColorPickerProps) {
  const safeValue = parseHex(value) ?? DEFAULT_ACCENT;
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(safeValue));
  const [hexDraft, setHexDraft] = useState(safeValue.slice(1));
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [placed, setPlaced] = useState(false);
  /** Enter/exit nudge: beside the swatch slides on X, above/below on Y. */
  const [slide, setSlide] = useState<{ x: number; y: number }>({ x: 8, y: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const reduceMotion = useReducedMotion();
  const labelId = useId();
  const canEyedrop =
    typeof window !== "undefined" && "EyeDropper" in window;

  useEffect(() => {
    if (open) return;
    const next = hexToHsv(safeValue);
    setHsv(next);
    setHexDraft(safeValue.slice(1));
  }, [safeValue, open]);

  const commitHsv = useCallback(
    (next: Hsv) => {
      setHsv(next);
      const hex = hsvToHex(next);
      setHexDraft(hex.slice(1));
      onChange(hex);
    },
    [onChange],
  );

  const commitHex = useCallback(
    (raw: string) => {
      const parsed = parseHex(raw);
      if (!parsed) return;
      setHsv(hexToHsv(parsed));
      setHexDraft(parsed.slice(1));
      onChange(parsed);
    },
    [onChange],
  );

  const hex = hsvToHex(hsv);
  const isDefault = hex === DEFAULT_ACCENT;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) {
      setPlaced(false);
      return;
    }
    const trigger = triggerRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    const pad = 10;
    const gap = 10;
    const spaceLeft = trigger.left - pad;
    const spaceRight = window.innerWidth - trigger.right - pad;
    const spaceAbove = trigger.top - pad;
    const spaceBelow = window.innerHeight - trigger.bottom - pad;

    // Sit in the Accent Color row: left of the swatch, vertically centered on it.
    let left: number;
    let top: number;
    let nextSlide = { x: 8, y: 0 };

    const centerTop = trigger.top + trigger.height / 2 - panel.height / 2;
    const fitsLeft = spaceLeft >= panel.width + gap;
    const fitsRight = spaceRight >= panel.width + gap;

    if (fitsLeft || (spaceLeft >= spaceRight && spaceLeft >= panel.width * 0.7)) {
      left = trigger.left - panel.width - gap;
      top = centerTop;
      nextSlide = { x: 8, y: 0 };
      if (left < pad) {
        left = trigger.right + gap;
        nextSlide = { x: -8, y: 0 };
      }
    } else if (fitsRight) {
      left = trigger.right + gap;
      top = centerTop;
      nextSlide = { x: -8, y: 0 };
    } else if (spaceBelow >= panel.height + gap || spaceBelow >= spaceAbove) {
      left = trigger.right - panel.width;
      top = trigger.bottom + gap;
      nextSlide = { x: 0, y: 8 };
    } else {
      left = trigger.right - panel.width;
      top = trigger.top - panel.height - gap;
      nextSlide = { x: 0, y: -8 };
    }

    left = clamp(left, pad, window.innerWidth - panel.width - pad);
    top = clamp(top, pad, window.innerHeight - panel.height - pad);
    setSlide(nextSlide);
    setPos({ left, top });
    setPlaced(true);
  }, [open, isDefault, canEyedrop]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown, true);
    };
  }, [open]);

  const bindDrag = useCallback(
    (
      area: HTMLDivElement,
      map: (nx: number, ny: number) => void,
    ) => {
      const read = (clientX: number, clientY: number) => {
        const rect = area.getBoundingClientRect();
        const nx = clamp((clientX - rect.left) / rect.width, 0, 1);
        const ny = clamp((clientY - rect.top) / rect.height, 0, 1);
        map(nx, ny);
      };
      return (e: ReactPointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        area.setPointerCapture(e.pointerId);
        read(e.clientX, e.clientY);
        const onMove = (ev: PointerEvent) => read(ev.clientX, ev.clientY);
        const onUp = (ev: PointerEvent) => {
          area.releasePointerCapture(ev.pointerId);
          area.removeEventListener("pointermove", onMove);
          area.removeEventListener("pointerup", onUp);
          area.removeEventListener("pointercancel", onUp);
        };
        area.addEventListener("pointermove", onMove);
        area.addEventListener("pointerup", onUp);
        area.addEventListener("pointercancel", onUp);
      };
    },
    [],
  );

  const onSvPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!svRef.current) return;
      bindDrag(svRef.current, (nx, ny) => {
        commitHsv({ h: hsvRef.current.h, s: nx, v: 1 - ny });
      })(e);
    },
    [bindDrag, commitHsv],
  );

  const onHuePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!hueRef.current) return;
      bindDrag(hueRef.current, (nx) => {
        commitHsv({ h: nx * 360, s: hsvRef.current.s, v: hsvRef.current.v });
      })(e);
    },
    [bindDrag, commitHsv],
  );

  const pickEyedrop = async () => {
    try {
      // WebView2 / Chromium EyeDropper when available
      const EyeDropperCtor = (
        window as unknown as {
          EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> };
        }
      ).EyeDropper;
      const result = await new EyeDropperCtor().open();
      commitHex(result.sRGBHex);
    } catch {
      // user cancel
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? labelId : undefined}
        aria-label="Pick accent color"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "rounded-2xl border border-white/5 bg-[#261d18] p-1.5 transition-colors",
          "hover:bg-[#322620]",
          open && "bg-[#322620]",
        )}
      >
        <span
          className="block h-10 w-10 rounded-xl border border-white/10"
          style={{ backgroundColor: safeValue }}
        />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open ? (
              <motion.div
                ref={panelRef}
                id={labelId}
                role="dialog"
                aria-label="Accent color"
                initial={{ opacity: 0, x: slide.x, y: slide.y, scale: 0.98 }}
                animate={{
                  opacity: placed ? 1 : 0,
                  x: placed ? 0 : slide.x,
                  y: placed ? 0 : slide.y,
                  scale: placed ? 1 : 0.98,
                }}
                exit={{
                  opacity: 0,
                  x: slide.x * 0.75,
                  y: slide.y * 0.75,
                  scale: 0.98,
                }}
                transition={motionDuration(reduceMotion, overlayPanelTransition)}
                style={{ left: pos.left, top: pos.top }}
                className={cn(
                  "fixed w-[248px] rounded-[20px] bg-[#271C18] p-2.5",
                  "shadow-[0_10px_28px_rgba(0,0,0,0.45)]",
                  OVERLAY_Z_CLASS.menus,
                )}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col gap-2.5">
                  <div
                    ref={svRef}
                    role="slider"
                    aria-label="Saturation and brightness"
                    aria-valuetext={`${Math.round(hsv.s * 100)}% sat, ${Math.round(hsv.v * 100)}% bright`}
                    tabIndex={0}
                    onPointerDown={onSvPointerDown}
                    className="relative h-[112px] w-full cursor-crosshair touch-none overflow-hidden rounded-[14px]"
                    style={{
                      backgroundColor: hueCss(hsv.h),
                      backgroundImage:
                        "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
                    }}
                  >
                    <span
                      className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.45)]"
                      style={{
                        left: `${hsv.s * 100}%`,
                        top: `${(1 - hsv.v) * 100}%`,
                        backgroundColor: hex,
                      }}
                    />
                  </div>

                  <div
                    ref={hueRef}
                    role="slider"
                    aria-label="Hue"
                    aria-valuemin={0}
                    aria-valuemax={360}
                    aria-valuenow={Math.round(hsv.h)}
                    tabIndex={0}
                    onPointerDown={onHuePointerDown}
                    className="relative h-3 w-full cursor-ew-resize touch-none rounded-full"
                    style={{
                      background:
                        "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
                    }}
                  >
                    <span
                      className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#271C18] shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
                      style={{
                        left: `${(hsv.h / 360) * 100}%`,
                        backgroundColor: hueCss(hsv.h),
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {canEyedrop ? (
                      <button
                        type="button"
                        aria-label="Sample color from screen"
                        onClick={() => void pickEyedrop()}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#1D1613] text-stone-400 transition-colors hover:bg-[#322620] hover:text-stone-200"
                      >
                        <Pipette className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    ) : null}

                    <div className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-[12px] bg-[#1D1613] px-3">
                      <span className="text-[11px] font-semibold text-stone-500">#</span>
                      <input
                        value={hexDraft}
                        spellCheck={false}
                        aria-label="Hex color"
                        maxLength={6}
                        onChange={(e) => {
                          const next = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                          setHexDraft(next);
                          if (next.length === 6) commitHex(`#${next}`);
                        }}
                        onBlur={() => {
                          if (hexDraft.length === 6) commitHex(`#${hexDraft}`);
                          else setHexDraft(hex.slice(1));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                        className="min-w-0 flex-1 bg-transparent font-mono text-[12px] font-semibold uppercase tracking-wider text-stone-200 outline-none"
                      />
                    </div>

                    <span
                      className="h-9 w-9 shrink-0 rounded-[12px] border border-white/10"
                      style={{ backgroundColor: hex }}
                      aria-hidden
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((preset) => {
                      const active = hex === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          aria-label={`Preset ${preset}`}
                          aria-pressed={active}
                          onClick={() => commitHex(preset)}
                          className={cn(
                            "h-7 w-7 rounded-full border transition-transform active:scale-95",
                            active
                              ? "border-stone-100 scale-105"
                              : "border-white/10 hover:border-white/25",
                          )}
                          style={{ backgroundColor: preset }}
                        />
                      );
                    })}
                  </div>

                  {!isDefault ? (
                    <button
                      type="button"
                      onClick={() => commitHex(DEFAULT_ACCENT)}
                      className="inline-flex items-center gap-1.5 self-start text-[10px] font-black uppercase tracking-widest text-stone-500 transition-colors hover:text-stone-300"
                    >
                      <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
                      Default
                    </button>
                  ) : null}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
