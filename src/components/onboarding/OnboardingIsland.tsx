import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import logo from "@/assets/ruforgeAppIcon.png";
import { mainWindowPortalRoot } from "@/lib/mainWindowFrame";
import type { OnboardingIslandStep } from "@/lib/onboardingSteps";
import {
  setOnboardingIslandOccupied,
  subscribeOnboardingModeSwap,
} from "@/lib/onboardingRadialBridge";
import { AltKeyIcon } from "./AltKeyIcon";
import { useAltHoldProgress } from "./useAltHoldProgress";

const ISLAND_SPRING = {
  type: "spring" as const,
  stiffness: 350,
  damping: 27,
  mass: 0.8,
};

const SHRINK_EASE = [0.16, 1, 0.3, 1] as const;

/** Matches DynamicIsland idle dimensions. */
const ONBOARDING_ISLAND_DIMENSIONS = {
  compact: { width: 268, height: 36, borderRadius: 18 },
  idle: { width: 120, height: 36, borderRadius: 18 },
  expanded: { width: 350, height: 268, borderRadius: 40 },
};

const COMPACT_SLIDE_TRANSITION = {
  duration: 0.32,
  ease: SHRINK_EASE,
} as const;

const CELEBRATE_TEXT_MS = 1000;
const DISMISS_AFTER_IDLE_MS = 120;
const COLLAPSE_BEFORE_CELEBRATE_MS = 360;

type IslandPhase = "active" | "celebrate" | "idle";

type OnboardingIslandProps = OnboardingIslandStep & {
  onDismiss: () => void;
};

function IslandProgressShell({
  ringRef,
  borderRadius,
  width,
  height,
  children,
  className,
  onClick,
  ariaExpanded,
  ariaLabel,
  interactive,
  showProgress,
}: {
  ringRef: React.RefObject<SVGRectElement | null>;
  borderRadius: number;
  width: number;
  height: number;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  ariaExpanded: boolean;
  ariaLabel: string;
  interactive: boolean;
  showProgress: boolean;
}) {
  const innerRadius = Math.max(0, borderRadius - 2);
  const strokeWidth = 2;
  const inset = strokeWidth / 2;
  const pathRadius = Math.max(0, borderRadius - inset);

  const ShellTag = interactive ? "button" : "div";

  return (
    <ShellTag
      type={interactive ? "button" : undefined}
      className={`relative block h-full w-full border-0 bg-transparent p-0 text-left ${
        interactive ? "cursor-pointer" : "cursor-default"
      } ${className ?? ""}`}
      style={{ borderRadius, WebkitAppRegion: "no-drag" } as CSSProperties}
      onClick={interactive ? onClick : undefined}
      aria-expanded={interactive ? ariaExpanded : undefined}
      aria-label={interactive ? ariaLabel : undefined}
    >
      {showProgress ? (
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden
        >
          <rect
            x={inset}
            y={inset}
            width={Math.max(0, width - strokeWidth)}
            height={Math.max(0, height - strokeWidth)}
            rx={pathRadius}
            ry={pathRadius}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={strokeWidth}
          />
          <rect
            ref={ringRef}
            x={inset}
            y={inset}
            width={Math.max(0, width - strokeWidth)}
            height={Math.max(0, height - strokeWidth)}
            rx={pathRadius}
            ry={pathRadius}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1}
            style={{ transition: "stroke-dashoffset 80ms linear" }}
          />
        </svg>
      ) : null}
      <div
        className="absolute inset-[2px] overflow-hidden bg-black"
        style={{ borderRadius: innerRadius }}
      >
        {children}
      </div>
    </ShellTag>
  );
}

function CompactPillContent({
  children,
  exit = false,
}: {
  children: ReactNode;
  exit?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.18, ease: SHRINK_EASE } }}
      exit={
        exit
          ? { opacity: 0, transition: { duration: 0.14, ease: SHRINK_EASE } }
          : { opacity: 0, scale: 0.96, transition: { duration: 0.14, ease: SHRINK_EASE } }
      }
      className="absolute inset-0 flex h-full items-center justify-center gap-2 px-3"
    >
      {children}
    </motion.div>
  );
}

function RuForgeIconChip() {
  return (
    <img
      src={logo}
      alt=""
      aria-hidden
      draggable={false}
      className="h-4 w-4 shrink-0 rounded-[4px] object-cover"
    />
  );
}

function CompactHint({
  purpose,
  followUp,
  holdComplete,
}: {
  purpose: string;
  followUp: string;
  holdComplete: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const showSwapHint = holdComplete;
  const slideClass =
    "absolute inset-0 flex h-full items-center justify-center gap-1.5 px-3";
  const slideTransition = reducedMotion
    ? { duration: 0 }
    : COMPACT_SLIDE_TRANSITION;

  return (
    <CompactPillContent exit>
      <div className="relative h-full w-full overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {showSwapHint ? (
            <motion.div
              key="swap"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: slideTransition }}
              exit={{ opacity: 0, y: -10, transition: slideTransition }}
              className={slideClass}
            >
              <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-stone-100">
                Click
              </span>
              <RuForgeIconChip />
              <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-stone-100">
                {followUp}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="hold"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: slideTransition }}
              exit={{ opacity: 0, y: -10, transition: slideTransition }}
              className={slideClass}
            >
              <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-stone-100">
                {purpose}
              </span>
              <span className="whitespace-nowrap text-[12px] font-medium text-stone-400">· hold</span>
              <AltKeyIcon />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </CompactPillContent>
  );
}

function CelebrateHint() {
  return (
    <CompactPillContent exit>
      <span className="text-[13px] font-semibold tracking-tight text-stone-100">nice!</span>
    </CompactPillContent>
  );
}

function IdleHint() {
  return (
    <motion.div
      key="idle"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.14, ease: SHRINK_EASE } }}
      exit={{ opacity: 0, transition: { duration: 0.12, ease: SHRINK_EASE } }}
      className="absolute inset-0 pointer-events-none"
      aria-hidden
    />
  );
}

function ExpandedDemo({
  mediaSrc,
  mediaAlt,
  caption,
}: {
  mediaSrc: string;
  mediaAlt: string;
  caption: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.25, delay: 0.08 } }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      className="absolute inset-0 flex flex-col items-center justify-between p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full overflow-hidden rounded-2xl bg-black/40">
        <img
          src={mediaSrc}
          alt={mediaAlt}
          className="h-[230px] w-full object-cover"
          draggable={false}
        />
      </div>
      <p className="px-1 pb-0.5 text-center text-[13px] font-medium leading-snug text-stone-300">
        {caption}
      </p>
    </motion.div>
  );
}

export function OnboardingIsland({
  compactPurpose,
  compactFollowUp,
  expandedCaption,
  mediaSrc,
  mediaAlt,
  defaultExpanded = false,
  onDismiss,
}: OnboardingIslandProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [phase, setPhase] = useState<IslandPhase>("active");
  const expandedRef = useRef(false);
  const defaultExpandedRef = useRef(defaultExpanded);
  expandedRef.current = expanded;
  defaultExpandedRef.current = defaultExpanded;

  const ringRef = useRef<SVGRectElement>(null);

  const paintProgress = useCallback((p: number) => {
    const el = ringRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(1, p));
    el.style.transition = clamped === 0 ? "none" : "stroke-dashoffset 80ms linear";
    el.style.strokeDashoffset = String(1 - clamped);
  }, []);

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const beginCelebrate = useCallback(() => {
    setPhase("celebrate");
  }, []);

  useEffect(() => {
    setOnboardingIslandOccupied(phase !== "idle");
    return () => setOnboardingIslandOccupied(false);
  }, [phase]);

  const { holdComplete } = useAltHoldProgress(paintProgress);

  useEffect(() => {
    if (phase !== "active") return;
    return subscribeOnboardingModeSwap(() => {
      if (expandedRef.current && !defaultExpandedRef.current) {
        setExpanded(false);
        window.setTimeout(beginCelebrate, COLLAPSE_BEFORE_CELEBRATE_MS);
        return;
      }
      beginCelebrate();
    });
  }, [phase, beginCelebrate]);

  const dims =
    phase === "celebrate" || phase === "idle"
      ? ONBOARDING_ISLAND_DIMENSIONS.idle
      : expanded
        ? ONBOARDING_ISLAND_DIMENSIONS.expanded
        : ONBOARDING_ISLAND_DIMENSIONS.compact;

  const showProgress = phase === "active" && !expanded && !holdComplete;

  const collapse = useCallback(() => {
    if (phase !== "active") return;
    setExpanded(false);
  }, [phase]);

  useEffect(() => {
    if (phase !== "celebrate") return;
    const t = window.setTimeout(() => setPhase("idle"), CELEBRATE_TEXT_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "idle") return;
    const t = window.setTimeout(() => onDismissRef.current(), DISMISS_AFTER_IDLE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (!expanded || phase !== "active") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") collapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, phase, collapse]);

  const handleShellClick = () => {
    if (phase !== "active") return;
    if (expanded) {
      collapse();
      return;
    }
    setExpanded(true);
  };

  const contentKey =
    phase === "celebrate"
      ? "celebrate"
      : phase === "idle"
        ? "idle"
        : expanded
          ? "expanded"
          : "compact";

  const morphing = phase === "celebrate" || phase === "idle";

  const shellTransition = morphing
    ? { duration: 0.4, ease: SHRINK_EASE }
    : ISLAND_SPRING;

  return createPortal(
    <>
      {expanded && phase === "active" ? (
        <button
          type="button"
          className="pointer-events-auto fixed inset-0 z-[109] bg-transparent"
          aria-label="Collapse onboarding hint"
          onClick={collapse}
        />
      ) : null}

      <motion.div
        className="pointer-events-none fixed top-0 left-1/2 z-[110] flex w-full max-w-lg -translate-x-1/2 justify-center overflow-visible pt-[6px]"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        initial={false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          initial={false}
          animate={dims}
          transition={shellTransition}
          style={{ originY: 0, WebkitAppRegion: "no-drag" } as CSSProperties}
          className={`pointer-events-auto relative ${expanded && phase === "active" ? "shadow-2xl" : ""}`}
        >
          <IslandProgressShell
            ringRef={ringRef}
            borderRadius={dims.borderRadius}
            width={dims.width}
            height={dims.height}
            showProgress={showProgress}
            onClick={handleShellClick}
            ariaExpanded={expanded}
            ariaLabel={
              phase === "celebrate"
                ? "Alt navigation learned"
                : expanded
                  ? "Onboarding hint expanded"
                  : holdComplete
                    ? `Click RuForge icon ${compactFollowUp}`
                    : `${compactPurpose} — hold Alt`
            }
            interactive={phase === "active"}
            className="h-full w-full"
          >
            <div className="relative h-full w-full" style={{ minHeight: dims.height - 4 }}>
              <AnimatePresence initial={false}>
                {contentKey === "celebrate" ? (
                  <CelebrateHint key="celebrate" />
                ) : contentKey === "idle" ? (
                  <IdleHint key="idle" />
                ) : contentKey === "expanded" ? (
                  <ExpandedDemo
                    key="expanded"
                    mediaSrc={mediaSrc}
                    mediaAlt={mediaAlt}
                    caption={expandedCaption}
                  />
                ) : (
                  <CompactHint
                    key="compact"
                    purpose={compactPurpose}
                    followUp={compactFollowUp}
                    holdComplete={holdComplete}
                  />
                )}
              </AnimatePresence>
            </div>
          </IslandProgressShell>
        </motion.div>
      </motion.div>
    </>,
    mainWindowPortalRoot(),
  );
}
