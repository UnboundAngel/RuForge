import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Check, X } from "lucide-react";
import { createPortal } from "react-dom";

import { mainWindowPortalRoot } from "@/lib/mainWindowFrame";
import type {
  OnboardingGuideCompleteWhen,
  OnboardingGuidePhase,
  OnboardingIslandStep,
} from "@/lib/onboardingSteps";
import {
  isOnboardingConditionMet,
  subscribeOnboardingConditions,
} from "@/lib/onboardingConditions";
import {
  endOnboardingMock,
  startOnboardingMock,
} from "@/lib/onboardingMock";
import {
  setOnboardingIslandOccupied,
  subscribeOnboardingModeSwap,
} from "@/lib/onboardingRadialBridge";
import { OVERLAY_EASE } from "@/lib/overlayMotion";
import { CelebrateBurst, CelebrateHint } from "./CelebrateBurst";
import { CompactHint, type CompactGuideInfo } from "./CompactHint";
import { ExpandedDemo, OnboardingMediaLightbox } from "./ExpandedDemo";
import { checklistCardHeight, GuideChecklistCard, GuideExpanded } from "./GuideExpanded";
import { IslandProgressShell } from "./IslandProgressShell";
import { ISLAND_SPRING, SHRINK_EASE } from "./islandShared";
import { useAltHoldProgress } from "./useAltHoldProgress";
import { useConditionLevel } from "./useConditionLevel";
import { useIdleNudge } from "./useIdleNudge";
import { useOutsideCollapse } from "./useOutsideCollapse";

const ONBOARDING_ISLAND_DIMENSIONS = {
  compact: { width: 268, height: 36, borderRadius: 18 },
  idle: { width: 120, height: 36, borderRadius: 18 },
  doneLabel: { width: 196, height: 36, borderRadius: 18 },
  expanded: { width: 350, height: 292, borderRadius: 40 },
  guide: { width: 350, height: 148, borderRadius: 40 },
};

const CELEBRATE_TEXT_MS = 1000;
const CELEBRATE_DONE_LABEL_MS = 1500;
const NICE_MS = 700;
const DISMISS_AFTER_IDLE_MS = 120;
const COLLAPSE_BEFORE_CELEBRATE_MS = 360;

type IslandPhase = "active" | "celebrate" | "idle";
type TapStage = "demo" | "guide";

type OnboardingIslandProps = OnboardingIslandStep & {
  onDismiss: () => void;
  /** Persist the step as done: its `doneWhen` turned true or the user dismissed it. */
  onDone?: () => void;
};

function conditionMet(condition: OnboardingGuideCompleteWhen | undefined): boolean {
  return condition ? isOnboardingConditionMet(condition) : false;
}

function nextGuideIndex(phases: readonly OnboardingGuidePhase[], fromIndex: number): number {
  let i = fromIndex;
  while (i < phases.length && conditionMet(phases[i]?.skipWhen)) i += 1;
  return i;
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
  doneWhen,
  defaultExpanded = false,
  doneLabel,
  mockData,
  onDismiss,
  onDone,
}: OnboardingIslandProps) {
  const reducedMotion = useReducedMotion();
  const hasGuide = Boolean(guidePhases && guidePhases.length > 0);
  const isTapSettings = compactVariant === "tap-settings";
  // Steps that give their beats icons get the checklist card and the progress rewards.
  const richGuide = Boolean(guidePhases?.some((p) => p.icon));
  const introClip = !mediaSrc ? guidePhases?.[0]?.clip : undefined;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [phase, setPhase] = useState<IslandPhase>("active");
  const [tapStage, setTapStage] = useState<TapStage>("demo");
  const [guideIndex, setGuideIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [nice, setNice] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const [celebrateStage, setCelebrateStage] = useState<0 | 1>(0);
  const expandedRef = useRef(false);
  const defaultExpandedRef = useRef(defaultExpanded);
  const tapStageRef = useRef<TapStage>("demo");
  const guideIndexRef = useRef(0);
  const advancingRef = useRef(false);
  const niceTimerRef = useRef<number | null>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const pulse = useAnimationControls();
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

  useEffect(() => {
    if (!mockData) return;
    // The debug preview queues a force before the island mounts; start picks it up by default.
    startOnboardingMock(mockData);
    return () => endOnboardingMock();
  }, [mockData]);

  useEffect(
    () => () => {
      if (niceTimerRef.current) window.clearTimeout(niceTimerRef.current);
    },
    [],
  );

  const beginCelebrate = useCallback(() => {
    setLightboxOpen(false);
    setNice(false);
    endOnboardingMock();
    setPhase("celebrate");
  }, []);

  const enterGuideAt = useCallback(
    (fromIndex: number) => {
      if (!guidePhases?.length) {
        beginCelebrate();
        return;
      }
      const next = nextGuideIndex(guidePhases, fromIndex);
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

  const rewardPhase = useCallback(
    (wasExpanded: boolean) => {
      setBurstKey((k) => k + 1);
      if (!reducedMotion) {
        void pulse.start({
          scale: [1, 1.06, 1],
          transition: { duration: 0.4, ease: OVERLAY_EASE },
        });
      }
      if (wasExpanded) {
        setExpanded(true);
        return;
      }
      // Collapsed: let "Nice" land on the pill before the next beat opens.
      setNice(true);
      niceTimerRef.current = window.setTimeout(() => {
        niceTimerRef.current = null;
        setNice(false);
        setExpanded(true);
      }, NICE_MS);
    },
    [pulse, reducedMotion],
  );

  const advanceGuide = useCallback((from?: number) => {
    if (advancingRef.current) return;
    if (!guidePhases?.length) {
      beginCelebrate();
      return;
    }
    advancingRef.current = true;
    const next = nextGuideIndex(guidePhases, from ?? guideIndexRef.current + 1);
    if (next >= guidePhases.length) {
      // Morph straight into celebrate. Do not flash compact first.
      beginCelebrate();
      advancingRef.current = false;
      return;
    }
    const wasExpanded = expandedRef.current;
    setGuideIndex(next);
    if (richGuide) rewardPhase(wasExpanded);
    else setExpanded(true);
    window.setTimeout(() => {
      advancingRef.current = false;
    }, 80);
  }, [guidePhases, beginCelebrate, richGuide, rewardPhase]);

  const dismissTip = useCallback(() => {
    if (phase !== "active") return;
    setLightboxOpen(false);
    endOnboardingMock();
    onDone?.();
    setPhase("idle");
  }, [phase, onDone]);

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
  // A later phase finishing first (reply pasted without Copy prompt) jumps past it.
  useEffect(() => {
    if (phase !== "active") return;
    if (!isTapSettings) return;
    if (tapStage !== "guide" || !guidePhases?.length) return;

    const phaseIndex = guideIndex;
    const ahead = guidePhases.slice(phaseIndex);
    const prevMet = ahead.map((p) => conditionMet(p.completeWhen));

    return subscribeOnboardingConditions(() => {
      if (advancingRef.current) return;
      if (tapStageRef.current !== "guide") return;
      if (guideIndexRef.current !== phaseIndex) return;
      let furthest = -1;
      ahead.forEach((p, i) => {
        const met = conditionMet(p.completeWhen);
        if (met && !prevMet[i]) furthest = i;
        prevMet[i] = met;
      });
      if (furthest >= 0) advanceGuide(phaseIndex + furthest + 1);
    });
  }, [phase, isTapSettings, tapStage, guideIndex, guidePhases, advanceGuide]);

  useEffect(() => {
    if (phase !== "active" || !doneWhen) return;
    let prevMet = conditionMet(doneWhen);
    return subscribeOnboardingConditions(() => {
      const met = conditionMet(doneWhen);
      const rose = met && !prevMet;
      prevMet = met;
      if (!rose) return;
      onDone?.();
      const guiding = tapStageRef.current === "guide" && guidePhases?.[guideIndexRef.current];
      // The guide's own watcher advances when this phase waits on the same condition.
      if (guiding && guiding.completeWhen === doneWhen) return;
      beginCelebrate();
    });
  }, [phase, doneWhen, onDone, guidePhases, beginCelebrate]);

  const guiding = phase === "active" && tapStage === "guide";
  const progressing = useConditionLevel(currentGuide?.progressWhen, guiding);

  useIdleNudge({
    enabled: guiding && richGuide && !expanded && !nice,
    phaseKey: `guide-${guideIndex}`,
    resetSignal: progressing,
    onPulse: () => {
      if (reducedMotion) return;
      void pulse.start({
        scale: [1, 1.06, 1],
        transition: { duration: 0.5, ease: OVERLAY_EASE },
      });
    },
    onExpand: () => setExpanded(true),
  });

  const guideCardDims =
    richGuide && guidePhases
      ? { ...ONBOARDING_ISLAND_DIMENSIONS.guide, height: checklistCardHeight(guidePhases.some((p) => p.clip)) }
      : ONBOARDING_ISLAND_DIMENSIONS.guide;

  const dims =
    phase === "celebrate" || phase === "idle"
      ? phase === "celebrate" && celebrateStage === 1
        ? ONBOARDING_ISLAND_DIMENSIONS.doneLabel
        : ONBOARDING_ISLAND_DIMENSIONS.idle
      : expanded
        ? isTapSettings && tapStage === "guide"
          ? guideCardDims
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

  // The press still reaches the app, so clicking the target collapses the card and acts at once.
  useOutsideCollapse(expanded && phase === "active" && !lightboxOpen, islandRef, collapse);

  useEffect(() => {
    if (phase !== "celebrate") return;
    const t = window.setTimeout(
      () => {
        if (doneLabel && celebrateStage === 0) setCelebrateStage(1);
        else setPhase("idle");
      },
      celebrateStage === 0 ? CELEBRATE_TEXT_MS : CELEBRATE_DONE_LABEL_MS,
    );
    return () => window.clearTimeout(t);
  }, [phase, celebrateStage, doneLabel]);

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
    if (nice) return;
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
            ? richGuide
              ? "guide-card"
              : `guide-${guideIndex}`
            : "expanded"
          : "compact";

  const morphing = phase === "celebrate" || phase === "idle";
  const shellTransition = morphing
    ? { duration: 0.4, ease: SHRINK_EASE }
    : ISLAND_SPRING;

  const lightboxUrl = mediaLightboxSrc ?? undefined;
  const guideLabel =
    tapStage === "guide" && currentGuide ? currentGuide.compact : null;

  const guideInfo: CompactGuideInfo | null =
    currentGuide && guidePhases
      ? {
          label: nice
            ? "Nice"
            : progressing && currentGuide.progressHint
              ? currentGuide.progressHint
              : currentGuide.compact,
          Icon: nice ? Check : undefined,
          phases: guidePhases,
          index: guideIndex,
        }
      : null;

  return createPortal(
    <>
      <AnimatePresence>
        {lightboxOpen && lightboxUrl ? (
          <OnboardingMediaLightbox
            key="onboarding-media-lightbox"
            src={lightboxUrl}
            alt={mediaAlt ?? ""}
            onClose={() => setLightboxOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <motion.div
        className="pointer-events-none fixed top-0 left-1/2 z-[110] flex w-full max-w-lg -translate-x-1/2 justify-center overflow-visible pt-[3px]"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        initial={false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          ref={islandRef}
          data-onboarding-island=""
          initial={false}
          animate={dims}
          transition={shellTransition}
          style={{ originY: 0, WebkitAppRegion: "no-drag" } as CSSProperties}
          className={`pointer-events-auto relative overflow-visible ${expanded && phase === "active" ? "shadow-2xl" : ""}`}
        >
          {phase === "celebrate" ? <CelebrateBurst /> : null}
          {burstKey > 0 && phase === "active" ? (
            <CelebrateBurst key={burstKey} count={9} spread={0.55} />
          ) : null}
          <motion.div animate={pulse} className="h-full w-full">
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
                    ? `${compactPurpose}, click to continue`
                    : expanded
                      ? currentGuide?.expandedCaption ?? "Onboarding hint expanded"
                      : guideLabel
                        ? guideLabel
                        : holdComplete
                          ? `Click RuForge icon ${compactFollowUp}`
                          : `${compactPurpose}, hold Alt`
              }
              interactive={phase === "active"}
              className="h-full w-full"
            >
              <div className="relative h-full w-full" style={{ minHeight: dims.height - 4 }}>
                <AnimatePresence initial={false}>
                  {contentKey === "celebrate" ? (
                    <CelebrateHint
                      key="celebrate"
                      label={celebrateStage === 1 && doneLabel ? doneLabel : "nice!"}
                    />
                  ) : contentKey === "idle" ? (
                    <IdleHint key="idle" />
                  ) : contentKey === "guide-card" && guidePhases ? (
                    <GuideChecklistCard key="guide-card" phases={guidePhases} index={guideIndex} />
                  ) : contentKey.startsWith("guide-") && currentGuide ? (
                    <GuideExpanded
                      key={contentKey}
                      caption={currentGuide.expandedCaption}
                    />
                  ) : contentKey === "expanded" && (mediaSrc || introClip) ? (
                    <ExpandedDemo
                      key="expanded"
                      mediaSrc={mediaSrc}
                      mediaAlt={mediaAlt ?? ""}
                      caption={expandedCaption}
                      objectFit={mediaObjectFit}
                      lightboxSrc={lightboxUrl}
                      mediaPaused={lightboxOpen}
                      showClickContinue={isTapSettings}
                      clip={introClip}
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
                      guide={guideInfo}
                      demoIcon={guidePhases?.[0]?.icon}
                      variant={compactVariant}
                    />
                  )}
                </AnimatePresence>
              </div>
            </IslandProgressShell>
          </motion.div>
          <AnimatePresence>
            {phase === "active" && !lightboxOpen ? (
              <motion.button
                key="dismiss"
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1, transition: { duration: 0.16, ease: SHRINK_EASE } }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.12, ease: SHRINK_EASE } }}
                onClick={dismissTip}
                data-tooltip="Dismiss tip"
                aria-label={`Dismiss ${compactPurpose} tip`}
                className="absolute top-[6px] -right-[30px] flex h-6 w-6 items-center justify-center rounded-full bg-black text-stone-500 transition-colors hover:text-stone-100 focus-visible:text-stone-100 focus-visible:outline-none"
              >
                <X size={12} strokeWidth={2.5} />
              </motion.button>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </>,
    mainWindowPortalRoot(),
  );
}
