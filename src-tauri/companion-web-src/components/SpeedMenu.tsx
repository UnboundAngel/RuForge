import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Check, RfIcon } from "./icons";
import { MORPH_TRANSITION } from "../motion";

type Props = {
  speed: number;
  speeds: readonly number[];
  /** Which way the list opens from the pill. */
  grow: "up" | "down";
  onSpeed: (s: number) => void;
};

function label(s: number): string {
  return `${s}×`;
}

/** Speed pill that morphs into the option list in place, like the desktop popovers. */
export function SpeedMenu({ speed, speeds, grow, onSpeed }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="ph-speed" data-grow={grow}>
      <span className="ph-util ph-speed-size" aria-hidden>
        <RfIcon name="gauge" size={16} />
        {label(speed)}
      </span>
      <m.div
        layout
        className={`ph-speed-panel${open ? " ph-speed-panel--open" : ""}`}
        style={{ borderRadius: 17 }}
        transition={MORPH_TRANSITION}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {open ? (
            <m.div
              key="list"
              className="ph-speed-list"
              role="listbox"
              aria-label="Playback speed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.16, delay: 0.08 } }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
            >
              {speeds.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="option"
                  aria-selected={s === speed}
                  className={`ph-speed-opt${s === speed ? " ph-speed-opt--on" : ""}`}
                  onClick={() => {
                    onSpeed(s);
                    setOpen(false);
                  }}
                >
                  <span className="ph-cap">{s === 1 ? "Normal" : label(s)}</span>
                  {s === speed ? <Check size={16} strokeWidth={2.5} /> : null}
                </button>
              ))}
            </m.div>
          ) : (
            <m.button
              key="pill"
              type="button"
              className="ph-util ph-speed-pill"
              aria-label={`Playback speed ${label(speed)}`}
              aria-haspopup="listbox"
              onClick={() => setOpen(true)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.14, delay: 0.1 } }}
              exit={{ opacity: 0, transition: { duration: 0.06 } }}
            >
              <RfIcon name="gauge" size={16} />
              <span className="ph-cap">{label(speed)}</span>
            </m.button>
          )}
        </AnimatePresence>
      </m.div>
    </div>
  );
}
