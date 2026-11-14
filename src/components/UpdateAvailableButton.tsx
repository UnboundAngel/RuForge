import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { UpdateReadyIcon } from "@/components/icons/UpdateReadyIcon";
import { overlayFadeTransition, overlayPanelTransition } from "@/lib/overlayMotion";
import { cn } from "@/lib/utils";
import { useUpdateAvailableStore } from "@/store/updateAvailableStore";

/** `rail` is the default-mode rail; `music-rail` the collapsed Music library; `music-panel` the expanded one. */
type Surface = "rail" | "music-rail" | "music-panel";

type Props = { surface: Surface; className?: string };

type Anchor = { left: number; top: number; color: string };

/**
 * Rest button and hover pill share one box so the pill lands exactly over the icon.
 * Each mode keeps its own palette: rail tokens follow Legacy colors, Music uses its tooltip surface and red.
 */
const COMPACT = {
  rail: {
    box: "h-9 rounded-xl px-[9px]",
    icon: 18,
    rest: "w-9 text-[color:var(--accent)] hover:bg-[var(--rf-field)]",
    pill: "bg-[var(--rf-popover-bg)] text-xs font-semibold text-stone-100 shadow-[0_8px_24px_rgb(0_0_0/0.5),0_0_0_1px_rgb(255_255_255/0.06)]",
    version: "text-stone-400",
  },
  "music-rail": {
    box: "h-10 rounded-full px-[10px]",
    icon: 20,
    rest: "w-10 text-[color:var(--music-accent)] hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,#1f1f1f)]",
    pill: "bg-[#282828] text-[13px] font-semibold text-white/95 shadow-[0_8px_24px_rgb(0_0_0/0.5)]",
    version: "font-medium text-white/50",
  },
} as const;

/** Quiet persistent nudge while an update is pending. Click installs the update and restarts. */
export function UpdateAvailableButton({ surface, className }: Props) {
  const version = useUpdateAvailableStore((s) => s.previewVersion ?? s.version);
  const open = useUpdateAvailableStore((s) => s.open);
  const label = version ? `Install v${version} and restart` : undefined;

  return (
    <AnimatePresence initial={false}>
      {version ? (
        <motion.div
          key="update-available"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={overlayFadeTransition}
          className={cn("flex w-full shrink-0", surface === "music-panel" ? "" : "justify-center", className)}
        >
          {surface === "music-panel" ? (
            <button
              type="button"
              onClick={open}
              aria-label={label}
              data-tooltip={label}
              className="rf-music-tooltip-anchor rf-music-press-soft group/update flex h-10 w-full min-w-0 items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-white/[0.07]"
            >
              <UpdateReadyIcon size={20} className="shrink-0 text-[color:var(--music-accent)]" />
              <span className="truncate text-sm font-semibold text-white/80 group-hover/update:text-white">
                Update available
              </span>
              <span className="ml-auto shrink-0 text-xs tabular-nums text-white/50">v{version}</span>
            </button>
          ) : (
            <CompactUpdateButton surface={surface} version={version} label={label} onOpen={open} />
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function CompactUpdateButton({
  surface,
  version,
  label,
  onOpen,
}: {
  surface: "rail" | "music-rail";
  version: string;
  label: string | undefined;
  onOpen: () => void;
}) {
  const s = COMPACT[surface];
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);

  const expand = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    // The portal leaves the Music scope where --music-accent lives, so carry the rest icon's resolved colour.
    setAnchor({ left: r.left, top: r.top, color: getComputedStyle(el).color });
  };

  // pointerleave misses layout shifts (rail collapse, mode switch), so any pointer outside both buttons closes it.
  useEffect(() => {
    if (!anchor) return;
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (iconRef.current?.contains(t) || pillRef.current?.contains(t));
    const onMove = (e: PointerEvent) => {
      if (!inside(e.target)) setAnchor(null);
    };
    const close = () => setAnchor(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close);
    };
  }, [anchor]);

  return (
    <>
      <button
        ref={iconRef}
        type="button"
        onClick={onOpen}
        onPointerEnter={(e) => expand(e.currentTarget)}
        onFocus={(e) => expand(e.currentTarget)}
        onBlur={() => setAnchor(null)}
        aria-label={label}
        className={cn("flex items-center justify-center transition-colors", s.box, s.rest)}
      >
        <UpdateReadyIcon size={s.icon} className="shrink-0" />
      </button>
      {/* Rail ancestors clip overflow, so the expanded pill is portaled over the icon and grows rightward from it. */}
      {createPortal(
        <AnimatePresence>
          {anchor ? (
            <motion.button
              key="update-pill"
              ref={pillRef}
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={onOpen}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={overlayFadeTransition}
              style={{ left: anchor.left, top: anchor.top }}
              className={cn("fixed z-[60] flex items-center", s.box, s.pill)}
            >
              <UpdateReadyIcon size={s.icon} className="shrink-0" style={{ color: anchor.color }} />
              <motion.span
                initial={{ maxWidth: 0 }}
                animate={{ maxWidth: 160 }}
                exit={{ maxWidth: 0 }}
                transition={overlayPanelTransition}
                className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap pl-2 pr-1"
              >
                <span>Update</span>
                <span className={cn("tabular-nums", s.version)}>v{version}</span>
              </motion.span>
            </motion.button>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
