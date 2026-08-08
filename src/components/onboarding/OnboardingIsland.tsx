import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import logo from "@/assets/ruforgeAppIcon.png";
import { mainWindowPortalRoot } from "@/lib/mainWindowFrame";
import type {
  OnboardingGuideCompleteWhen,
  OnboardingGuidePhase,
  OnboardingIslandStep,
} from "@/lib/onboardingSteps";
import {
  setOnboardingIslandOccupied,
  subscribeOnboardingModeSwap,
} from "@/lib/onboardingRadialBridge";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { AltKeyIcon } from "./AltKeyIcon";
import { useAltHoldProgress } from "./useAltHoldProgress";

const ISLAND_SPRING = {
  type: "spring" as const,
  stiffness: 350,
  damping: 27,
  mass: 0.8,
};

const SHRINK_EASE = [0.16, 1, 0.3, 1] as const;

const ONBOARDING_ISLAND_DIMENSIONS = {
  compact: { width: 268, height: 36, borderRadius: 18 },
  idle: { width: 120, height: 36, borderRadius: 18 },
  expanded: { width: 350, height: 292, borderRadius: 40 },
  guide: { width: 350, height: 148, borderRadius: 40 },
};

const COMPACT_SLIDE_TRANSITION = {
  duration: 0.32,
  ease: SHRINK_EASE,
} as const;

const CELEBRATE_TEXT_MS = 1000;
const DISMISS_AFTER_IDLE_MS = 120;
const COLLAPSE_BEFORE_CELEBRATE_MS = 360;

type IslandPhase = "active" | "celebrate" | "idle";
type TapStage = "demo" | "guide";

type OnboardingIslandProps = OnboardingIslandStep & {
  onDismiss: () => void;
};

function isGuideConditionMet(
  condition: OnboardingGuideCompleteWhen,
  settingsOpen: boolean,
  settingsTab: string,
  discordOn: boolean,
): boolean {
  if (condition === "on-settings") return settingsOpen;
  if (condition === "on-general") {
    return settingsOpen && settingsTab === "general";
  }
  return discordOn;
}

function nextGuideIndex(
  phases: readonly OnboardingGuidePhase[],
  fromIndex: number,
  settingsOpen: boolean,
  settingsTab: string,
  discordOn: boolean,
): number {
  let i = fromIndex;
  while (i < phases.length) {
    const skip = phases[i]?.skipWhen;
    if (skip && isGuideConditionMet(skip, settingsOpen, settingsTab, discordOn)) {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

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
  variant = "alt-hold",
  guideLabel,
}: {
  purpose: string;
  followUp: string;
  holdComplete: boolean;
  variant?: "alt-hold" | "tap-settings";
  guideLabel?: string | null;
}) {
  const reducedMotion = useReducedMotion();
  const slideClass =
    "absolute inset-0 flex h-full items-center justify-center gap-1.5 px-3";
  const slideTransition = reducedMotion
    ? { duration: 0 }
    : COMPACT_SLIDE_TRANSITION;

  if (variant === "tap-settings") {
    return (
      <CompactPillContent exit>
        <div className="relative h-full w-full overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {guideLabel ? (
              <motion.div
                key={`guide-${guideLabel}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: slideTransition }}
                exit={{ opacity: 0, y: -10, transition: slideTransition }}
                className={slideClass}
              >
                <span className="max-w-[240px] truncate whitespace-nowrap text-[12px] font-semibold tracking-tight text-stone-100">
                  {guideLabel}
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="demo"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: slideTransition }}
                exit={{ opacity: 0, y: -10, transition: slideTransition }}
                className={slideClass}
              >
                <span className="whitespace-nowrap text-[12px] font-semibold tracking-tight text-stone-100">
                  {purpose}
                </span>
                <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-[color:var(--accent)]">
                  click
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CompactPillContent>
    );
  }

  const showSwapHint = holdComplete;

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
      <motion.span
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className="text-[13px] font-semibold tracking-tight text-stone-100"
      >
        nice!
      </motion.span>
    </CompactPillContent>
  );
}

const CELEBRATE_COLORS = ["var(--accent)", "#f5ede4", "#c4a574", "#e8d4a8"] as const;

function CelebrateBurst() {
  const reducedMotion = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2 + (i % 3) * 0.15;
        const dist = 32 + (i % 4) * 14;
        return {
          id: i,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist - 10,
          rot: (i * 51) % 360,
          color: CELEBRATE_COLORS[i % CELEBRATE_COLORS.length],
          w: i % 3 === 0 ? 5 : 3,
          h: i % 3 === 0 ? 3 : 5,
        };
      }),
    [],
  );

  if (reducedMotion) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 overflow-visible"
      aria-hidden
    >
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute left-1/2 top-1/2 rounded-[1px]"
          style={{
            width: p.w,
            height: p.h,
            marginLeft: -p.w / 2,
            marginTop: -p.h / 2,
            background: p.color,
          }}
          initial={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
          animate={{
            opacity: 0,
            x: p.x,
            y: p.y + 18,
            scale: 0.2,
            rotate: p.rot,
          }}
          transition={{
            duration: 0.72,
            ease: SHRINK_EASE,
            delay: (p.id % 5) * 0.025,
          }}
        />
      ))}
    </div>
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

function GuideExpanded({ caption }: { caption: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.25, delay: 0.06 } }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      className="absolute inset-0 flex flex-col items-center justify-center p-5"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-center text-[13px] font-medium leading-relaxed text-stone-300">
        {caption}
      </p>
    </motion.div>
  );
}

function mediaLooksLikeVideo(src: string): boolean {
  return /\.mp4(?:$|\?)/i.test(src);
}

function OnboardingMediaLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const isVideo = mediaLooksLikeVideo(src);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <motion.div
      className="pointer-events-auto fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-8"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.18, ease: SHRINK_EASE } }}
      exit={{ opacity: 0, transition: { duration: 0.14, ease: SHRINK_EASE } }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75"
        aria-label="Close demo"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal
        aria-label={alt}
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.22, ease: SHRINK_EASE } }}
        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14, ease: SHRINK_EASE } }}
        className="relative z-[1] w-[min(96vw,1280px,calc(88vh*1.6))] overflow-hidden rounded-[20px] bg-[#261d18]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aspect-[16/10] w-full bg-[#1c1512]">
          {isVideo ? (
            <video
              src={src}
              className="h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              controls={false}
            />
          ) : (
            <img src={src} alt={alt} className="h-full w-full object-cover" draggable={false} />
          )}
        </div>
      </motion.div>
    </motion.div>,
    mainWindowPortalRoot(),
  );
}

function ExpandedDemo({
  mediaSrc,
  mediaAlt,
  caption,
  objectFit = "cover",
  lightboxSrc,
  mediaPaused = false,
  showClickContinue = false,
  onContinue,
  onOpenLightbox,
}: {
  mediaSrc: string;
  mediaAlt: string;
  caption: string;
  objectFit?: "cover" | "contain";
  lightboxSrc?: string;
  mediaPaused?: boolean;
  showClickContinue?: boolean;
  onContinue?: () => void;
  onOpenLightbox?: () => void;
}) {
  const canLightbox = Boolean(lightboxSrc && onOpenLightbox);

  const openLightbox = (e: MouseEvent) => {
    e.stopPropagation();
    onOpenLightbox?.();
  };

  const islandMedia = mediaPaused ? (
    <div className="h-full w-full bg-[#322620]" aria-hidden />
  ) : (
    <img
      src={mediaSrc}
      alt={mediaAlt}
      className={
        objectFit === "contain"
          ? "max-h-[88%] max-w-[88%] object-contain"
          : "h-full w-full object-cover"
      }
      draggable={false}
    />
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.25, delay: 0.08 } }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      className="absolute inset-0 flex cursor-pointer flex-col items-center justify-between p-4"
      onClick={(e) => {
        e.stopPropagation();
        onContinue?.();
      }}
    >
      {canLightbox ? (
        <button
          type="button"
          onClick={openLightbox}
          className="flex h-[200px] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-2xl bg-[#322620] p-0"
          aria-label={`Enlarge ${mediaAlt}`}
        >
          {islandMedia}
        </button>
      ) : (
        <div className="flex h-[200px] w-full items-center justify-center overflow-hidden rounded-2xl bg-[#322620]">
          {islandMedia}
        </div>
      )}
      <div className="flex flex-col items-center gap-1 px-1">
        <p className="text-center text-[13px] font-medium leading-snug text-stone-300">
          {caption}
        </p>
        {showClickContinue ? (
          <p className="text-center text-[11px] font-medium tracking-wide text-[color:var(--accent)]">
            Click to continue
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}

export function OnboardingIsland({
  compactPurpose,
  compactFollowUp,
  compactVariant = "alt-hold",
  expandedCaption,
  mediaSrc,
  mediaAlt,
  mediaObjectFit = "cover",
  mediaLightboxSrc,
  guidePhases,
  defaultExpanded = false,
  onDismiss,
}: OnboardingIslandProps) {
  const hasGuide = Boolean(guidePhases && guidePhases.length > 0);
  const isTapSettings = compactVariant === "tap-settings";
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [phase, setPhase] = useState<IslandPhase>("active");
  const [tapStage, setTapStage] = useState<TapStage>("demo");
  const [guideIndex, setGuideIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const expandedRef = useRef(false);
  const defaultExpandedRef = useRef(defaultExpanded);
  const tapStageRef = useRef<TapStage>("demo");
  const guideIndexRef = useRef(0);
  const advancingRef = useRef(false);
  expandedRef.current = expanded;
  defaultExpandedRef.current = defaultExpanded;
  tapStageRef.current = tapStage;
  guideIndexRef.current = guideIndex;

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
    setLightboxOpen(false);
    setPhase("celebrate");
  }, []);

  const enterGuideAt = useCallback(
    (fromIndex: number) => {
      if (!guidePhases?.length) {
        beginCelebrate();
        return;
      }
      const state = useRuforgeStore.getState();
      const next = nextGuideIndex(
        guidePhases,
        fromIndex,
        state.settingsOpen,
        state.settingsTab,
        state.settings.discordPresenceEnabled === true,
      );
      if (next >= guidePhases.length) {
        beginCelebrate();
        return;
      }
      advancingRef.current = false;
      setLightboxOpen(false);
      setTapStage("guide");
      setGuideIndex(next);
      setExpanded(true);
    },
    [guidePhases, beginCelebrate],
  );

  const advanceGuide = useCallback(() => {
    if (advancingRef.current) return;
    if (!guidePhases?.length) {
      beginCelebrate();
      return;
    }
    advancingRef.current = true;
    const state = useRuforgeStore.getState();
    const next = nextGuideIndex(
      guidePhases,
      guideIndexRef.current + 1,
      state.settingsOpen,
      state.settingsTab,
      state.settings.discordPresenceEnabled === true,
    );
    if (next >= guidePhases.length) {
      // Morph straight into celebrate. Do not flash compact first.
      beginCelebrate();
      advancingRef.current = false;
      return;
    }
    setGuideIndex(next);
    setExpanded(true);
    window.setTimeout(() => {
      advancingRef.current = false;
    }, 80);
  }, [guidePhases, beginCelebrate]);

  const continueFromDemo = useCallback(() => {
    if (phase !== "active") return;
    if (tapStageRef.current !== "demo") return;
    if (lightboxOpen) {
      setLightboxOpen(false);
      return;
    }
    if (hasGuide) {
      enterGuideAt(0);
      return;
    }
    beginCelebrate();
  }, [phase, lightboxOpen, hasGuide, enterGuideAt, beginCelebrate]);

  useEffect(() => {
    setOnboardingIslandOccupied(phase !== "idle");
    return () => setOnboardingIslandOccupied(false);
  }, [phase]);

  const { holdComplete } = useAltHoldProgress(
    paintProgress,
    undefined,
    isTapSettings ? "tap-settings" : 0,
  );

  useEffect(() => {
    if (phase !== "active") return;
    if (isTapSettings) return;
    return subscribeOnboardingModeSwap(() => {
      if (expandedRef.current && !defaultExpandedRef.current) {
        setExpanded(false);
        window.setTimeout(beginCelebrate, COLLAPSE_BEFORE_CELEBRATE_MS);
        return;
      }
      beginCelebrate();
    });
  }, [phase, beginCelebrate, isTapSettings]);

  const currentGuide =
    tapStage === "guide" && guidePhases ? guidePhases[guideIndex] : null;

  // Rising-edge only: off→on (or not-on-general → on-general). Survives
  // "already enabled, toggle off, toggle on" during the Discord beat.
  useEffect(() => {
    if (phase !== "active") return;
    if (!isTapSettings) return;
    if (tapStage !== "guide" || !currentGuide?.completeWhen) return;

    const condition = currentGuide.completeWhen;
    const phaseIndex = guideIndex;
    const state = useRuforgeStore.getState();
    let prevMet = isGuideConditionMet(
      condition,
      state.settingsOpen,
      state.settingsTab,
      state.settings.discordPresenceEnabled === true,
    );

    return useRuforgeStore.subscribe((s) => {
      if (advancingRef.current) return;
      if (tapStageRef.current !== "guide") return;
      if (guideIndexRef.current !== phaseIndex) return;
      const met = isGuideConditionMet(
        condition,
        s.settingsOpen,
        s.settingsTab,
        s.settings.discordPresenceEnabled === true,
      );
      const rose = met && !prevMet;
      prevMet = met;
      if (rose) advanceGuide();
    });
  }, [
    phase,
    isTapSettings,
    tapStage,
    guideIndex,
    currentGuide?.completeWhen,
    advanceGuide,
  ]);

  const dims =
    phase === "celebrate" || phase === "idle"
      ? ONBOARDING_ISLAND_DIMENSIONS.idle
      : expanded
        ? isTapSettings && tapStage === "guide"
          ? ONBOARDING_ISLAND_DIMENSIONS.guide
          : isTapSettings
            ? ONBOARDING_ISLAND_DIMENSIONS.expanded
            : { ...ONBOARDING_ISLAND_DIMENSIONS.expanded, height: 268 }
        : isTapSettings
          ? { ...ONBOARDING_ISLAND_DIMENSIONS.compact, width: 292 }
          : ONBOARDING_ISLAND_DIMENSIONS.compact;

  const showProgress =
    phase === "active" && !expanded && !holdComplete && !isTapSettings;

  const collapse = useCallback(() => {
    if (phase !== "active") return;
    if (lightboxOpen) {
      setLightboxOpen(false);
      return;
    }
    if (isTapSettings && tapStage === "demo") {
      continueFromDemo();
      return;
    }
    setExpanded(false);
  }, [phase, lightboxOpen, isTapSettings, tapStage, continueFromDemo]);

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
      if (e.key === "Escape") {
        if (isTapSettings && tapStage === "demo") continueFromDemo();
        else setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, phase, isTapSettings, tapStage, continueFromDemo]);

  const handleShellClick = () => {
    if (phase !== "active") return;
    if (lightboxOpen) return;
    if (isTapSettings && tapStage === "demo") {
      continueFromDemo();
      return;
    }
    if (expanded) {
      setExpanded(false);
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
          ? tapStage === "guide"
            ? `guide-${guideIndex}`
            : "expanded"
          : "compact";

  const morphing = phase === "celebrate" || phase === "idle";
  const shellTransition = morphing
    ? { duration: 0.4, ease: SHRINK_EASE }
    : ISLAND_SPRING;

  const lightboxUrl = mediaLightboxSrc ?? undefined;
  const guideLabel =
    tapStage === "guide" && currentGuide ? currentGuide.compact : null;

  // Demo only: click-catcher advances. Guide leaves Settings fully clickable.
  const showDemoContinueBackdrop =
    expanded &&
    phase === "active" &&
    !lightboxOpen &&
    isTapSettings &&
    tapStage === "demo";

  const showAltCollapseBackdrop =
    expanded &&
    phase === "active" &&
    !lightboxOpen &&
    !isTapSettings;

  return createPortal(
    <>
      {showDemoContinueBackdrop ? (
        <button
          type="button"
          className="pointer-events-auto fixed inset-0 z-[109] bg-transparent"
          aria-label="Continue onboarding"
          onClick={continueFromDemo}
        />
      ) : null}
      {showAltCollapseBackdrop ? (
        <button
          type="button"
          className="pointer-events-auto fixed inset-0 z-[109] bg-transparent"
          aria-label="Collapse onboarding hint"
          onClick={collapse}
        />
      ) : null}

      <AnimatePresence>
        {lightboxOpen && lightboxUrl ? (
          <OnboardingMediaLightbox
            key="onboarding-media-lightbox"
            src={lightboxUrl}
            alt={mediaAlt}
            onClose={() => setLightboxOpen(false)}
          />
        ) : null}
      </AnimatePresence>

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
          className={`pointer-events-auto relative overflow-visible ${expanded && phase === "active" ? "shadow-2xl" : ""}`}
        >
          {phase === "celebrate" ? <CelebrateBurst /> : null}
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
                ? "Onboarding step complete"
                : isTapSettings && tapStage === "demo"
                  ? "Discord integration — click to continue"
                  : expanded
                    ? currentGuide?.expandedCaption ?? "Onboarding hint expanded"
                    : guideLabel
                      ? guideLabel
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
                ) : contentKey.startsWith("guide-") && currentGuide ? (
                  <GuideExpanded
                    key={contentKey}
                    caption={currentGuide.expandedCaption}
                  />
                ) : contentKey === "expanded" ? (
                  <ExpandedDemo
                    key="expanded"
                    mediaSrc={mediaSrc}
                    mediaAlt={mediaAlt}
                    caption={expandedCaption}
                    objectFit={mediaObjectFit}
                    lightboxSrc={lightboxUrl}
                    mediaPaused={lightboxOpen}
                    showClickContinue={isTapSettings}
                    onContinue={isTapSettings ? continueFromDemo : undefined}
                    onOpenLightbox={
                      lightboxUrl ? () => setLightboxOpen(true) : undefined
                    }
                  />
                ) : (
                  <CompactHint
                    key="compact"
                    purpose={compactPurpose}
                    followUp={compactFollowUp}
                    holdComplete={holdComplete}
                    guideLabel={guideLabel}
                    variant={compactVariant}
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
